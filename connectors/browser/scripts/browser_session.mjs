/**
 * Alpha's browser session worker (the `browser` capability). One JSON job on stdin, one JSON
 * result on stdout, then exit. The jobs:
 *   signin: open a visible window on a profile Alpha keeps, so the person signs in themselves;
 *           resolves when they close the window. Alpha never reads what they type. A sign-in
 *           often passes through other sites (gmail.com signs in at google.com), so the sites
 *           the window visited are written next to the profile: the sign-in covers them all.
 *   read:   load a page headless (with a profile, or none), let scripts run, and return its
 *           title, readable text and links. Never clicks, types or submits anything.
 *   script: load a page the same way, optionally read it to its end, then run Alpha's own
 *           JavaScript in it and return what the script returns (JSON).
 *   status: whether a profile holds cookies for a site (or any of `sites`).
 * A read session never changes anything on a site: from the moment its browser opens, every
 * request other than GET, HEAD and OPTIONS is blocked at the network, for the page's own scripts
 * and the driver's paging alike. A reader that truly needs a POST that only reads (some sites
 * load the next page of a list that way) names it in `job.allow_posts` ({origin, path}, `*` in
 * the path matches anything); Core keeps that list with the reader and journals every use.
 * While Alpha's own script runs, requests may go only to the origins the page used while it
 * loaded (and the hosts of its WebSockets): anything else (a fetch, an image, a navigation to
 * another site) is blocked, so nothing the page holds can be carried off in an address. Typing
 * into a password or card field is refused, whatever the script does. Counts come back as
 * `writes_blocked` and `egress_blocked`; allowed POSTs as `posts_allowed`.
 * A page that stops automated reading with a bot check or a captcha comes back as `bot_check`
 * with nothing read: Alpha says so and never tries to get past it.
 */
import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createInterface } from "node:readline";

// Resolves once the line is handed to the pipe: a large page must be written in full before the
// process exits, or Core reads a truncated line.
function out(value) {
  return new Promise((resolve) => process.stdout.write(JSON.stringify(value) + "\n", resolve));
}

// Headless Chromium announces itself ("HeadlessChrome"), and sites answer with a wall. The
// session reads as the person's own Chrome would: a normal user agent, no automation flag, and
// the installed Chrome when Alpha asks for it (job.channel = "chrome").
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

function launchOptions(job, headless) {
  return {
    headless,
    channel: job.channel || undefined,
    executablePath: job.browser || undefined,
    viewport: { width: 1280, height: 900 },
    locale: job.locale || "en-GB",
    userAgent: USER_AGENT,
    ignoreDefaultArgs: ["--enable-automation"],
    args: ["--disable-dev-shm-usage", "--no-first-run", "--no-default-browser-check", "--disable-blink-features=AutomationControlled"],
  };
}

function cookieMatches(cookie, site) {
  const domain = String(cookie.domain || "").replace(/^\./, "").toLowerCase();
  return domain === site || domain.endsWith("." + site);
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const CHALLENGE_TITLE = /^(just a moment|attention required|access denied|are you a human|verify you are human|security check|please verify|one more step|pardon our interruption)/i;
// Marks only a challenge page carries (Cloudflare, PerimeterX, DataDome).
const CHALLENGE_MARKS = [
  "#challenge-form", "#challenge-running", "[id^='cf-chl']", "#cf-challenge-running",
  "iframe[src*='challenges.cloudflare']", "#px-captcha", "iframe[src*='captcha-delivery']",
];
// A captcha widget is also found on ordinary login and contact forms: it only means a bot check
// when the captcha is all the page is.
const CAPTCHA_WIDGETS = [".g-recaptcha", ".h-captcha", "iframe[src*='recaptcha']", "iframe[src*='hcaptcha']"];

/** Whether the page in front of us is a bot check rather than the page that was asked for. */
async function isBotCheck(page) {
  const title = (await page.title().catch(() => "")) || "";
  if (CHALLENGE_TITLE.test(title.trim())) return true;
  return page
    .evaluate(([marks, widgets]) => {
      if (marks.some((m) => document.querySelector(m))) return true;
      const words = (document.body ? document.body.innerText : "").trim().length;
      const links = document.querySelectorAll("a[href]").length;
      return widgets.some((w) => document.querySelector(w)) && words < 400 && links < 10;
    }, [CHALLENGE_MARKS, CAPTCHA_WIDGETS])
    .catch(() => false);
}

/** Whether the list on this page goes on over more pages (a next link, numbered pages, a load
 *  more button): a reader that returns only what is on screen would read part of the list. */
async function hasMorePages(page) {
  return page
    .evaluate(() => {
      if (document.querySelector("link[rel=next], a[rel=next]")) return true;
      const words = [...document.querySelectorAll("a, button, [role=button]")]
        .map((el) => (el.innerText || el.getAttribute("aria-label") || "").trim());
      if (words.some((t) => /^(next|next page|next ›|›|»|load more|show more|more results|view more)$/i.test(t))) return true;
      return words.filter((t) => /^\d{1,3}$/.test(t)).length >= 3;
    })
    .catch(() => false);
}

/** Whether the page in front of us asks for a sign-in: the address says so, or it shows a
 *  password field. */
async function isSignIn(page, askedFor) {
  // Generic sign-in paths only; a site's own wall addresses are know-how Alpha learns (a
  // visible password field catches the rest).
  const wall = /\/(log-?in|sign-?in|sign-?up|auth)\b/i;
  if (wall.test(page.url()) && !wall.test(askedFor)) return true;
  return page
    .evaluate(() => [...document.querySelectorAll("input[type=password]")]
      .some((el) => el.offsetParent !== null))
    .catch(() => false);
}

function pathPattern(path) {
  const body = String(path).split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${body}$`);
}

function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return "";
  }
}

/** From the moment this is called, block every request that could change data on a site (but
 * the POSTs the reader allows), and once `lock()` is called, every request to an origin the
 * page did not use before. */
async function guard(context, job) {
  const rules = (job.allow_posts || []).map((r) => ({ origin: r.origin, path: pathPattern(r.path) }));
  const state = { writes: 0, egress: 0, allowed: [], origins: new Set(), hosts: new Set(), locked: false };
  await context.route("**/*", (route) => {
    const request = route.request();
    const url = request.url();
    const origin = originOf(url);
    if (!SAFE_METHODS.has(request.method())) {
      const ok = rules.some((r) => r.origin === origin && r.path.test(new URL(url).pathname));
      if (!ok) {
        state.writes += 1;
        return route.abort("blockedbyclient");
      }
      if (state.allowed.length < 50) state.allowed.push({ method: request.method(), url: url.slice(0, 300) });
      return route.continue();
    }
    if (state.locked && !state.origins.has(origin)) {
      state.egress += 1;
      return route.abort("blockedbyclient");
    }
    if (!state.locked) {
      state.origins.add(origin);
      try {
        state.hosts.add(new URL(url).hostname);
      } catch {
        // not a web address
      }
    }
    return route.continue();
  });
  await context.routeWebSocket(/.*/, (ws) => {
    let host = "";
    try {
      host = new URL(ws.url()).hostname;
    } catch {
      // not a web address
    }
    if (state.locked && !state.hosts.has(host)) {
      state.egress += 1;
      return ws.close();
    }
    if (!state.locked) state.hosts.add(host);
    return ws.connectToServer();
  });
  return state;
}

// Run in every frame before Alpha's script: setting a password or card field's value throws.
// ponytail: patches the value setter and setAttribute only; a script that borrows a pristine
// setter from a frame created before the init script runs could get round it (the network
// walls still hold). Upgrade path: CDP Input-domain blocking per element.
const NEVER_TYPE = () => {
  if (window.__alphaNeverType) return;
  window.__alphaNeverType = true;
  const sensitive = (el) =>
    el instanceof HTMLInputElement &&
    (el.type === "password" ||
      /^cc-/.test(el.autocomplete || "") ||
      /card.?number|cardnum|\bcvc\b|\bcvv\b|\bcsc\b|security.?code|\biban\b/i.test(`${el.name} ${el.id} ${el.getAttribute("aria-label") || ""} ${el.placeholder || ""}`));
  const refuse = () => {
    throw new Error("Alpha never types into password or card fields.");
  };
  const value = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
  Object.defineProperty(HTMLInputElement.prototype, "value", {
    ...value,
    set(v) {
      if (sensitive(this)) refuse();
      value.set.call(this, v);
    },
  });
  const setAttribute = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, v) {
    if (String(name).toLowerCase() === "value" && sensitive(this)) refuse();
    return setAttribute.call(this, name, v);
  };
};

async function cookiesFor(job) {
  const context = await chromium.launchPersistentContext(job.profile, launchOptions(job, true));
  try {
    const cookies = await context.cookies();
    const sites = job.sites && job.sites.length ? job.sites : [job.site];
    return cookies.filter((c) => sites.some((site) => cookieMatches(c, site))).length;
  } finally {
    await context.close();
  }
}

async function signin(job) {
  mkdirSync(job.profile, { recursive: true, mode: 0o700 });
  const context = await chromium.launchPersistentContext(job.profile, launchOptions(job, false));
  const page = context.pages()[0] || (await context.newPage());
  const visited = new Set();
  const follow = (p) =>
    p.on("framenavigated", (frame) => {
      if (frame !== p.mainFrame()) return;
      try {
        const url = new URL(frame.url());
        if (url.protocol === "https:" || url.protocol === "http:") visited.add(url.hostname);
      } catch {
        // not a web address
      }
    });
  follow(page);
  context.on("page", follow);
  await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  await new Promise((resolve) => {
    context.on("close", resolve);
    const maybeDone = async () => {
      if (context.pages().length === 0) {
        try {
          await context.close();
        } catch {
          // already closing
        }
        resolve();
      }
    };
    context.on("page", (p) => p.on("close", maybeDone));
    page.on("close", maybeDone);
  });
  writeFileSync(join(job.profile, "alpha-signin.json"), JSON.stringify({ hosts: [...visited], at: new Date().toISOString() }));
  const cookies = await cookiesFor(job);
  return { signed_in: cookies > 0, cookies, hosts: [...visited] };
}

async function status(job) {
  const cookies = await cookiesFor(job);
  return { signed_in: cookies > 0, cookies };
}

async function read(job) {
  const maxChars = job.max_chars || 60000;
  let browser = null;
  let context;
  // A service worker's requests would not pass the guard, and a DNS prefetch or a WebRTC probe
  // would leave by a road the guard does not see: none of them run in a read session.
  const options = launchOptions(job, true);
  options.args = [...options.args, "--dns-prefetch-disable", "--force-webrtc-ip-handling-policy=disable_non_proxied_udp"];
  if (job.profile) {
    context = await chromium.launchPersistentContext(job.profile, { ...options, serviceWorkers: "block" });
  } else {
    browser = await chromium.launch(options);
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: job.locale || "en-GB", userAgent: USER_AGENT, serviceWorkers: "block" });
  }
  const walls = await guard(context, job);
  const counts = () => ({ writes_blocked: walls.writes, egress_blocked: walls.egress, posts_allowed: walls.allowed });
  try {
    const page = context.pages()[0] || (await context.newPage());
    const response = await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: job.timeout_ms || 30000 });
    await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
    if (await isBotCheck(page)) {
      return {
        status: response ? response.status() : 0,
        final_url: page.url(),
        title: await page.title().catch(() => ""),
        bot_check: true,
        blocked: false,
        text: "",
        links: [],
        result: null,
        scrolls: 0,
        ...counts(),
      };
    }
    let scrolls = 0;
    if (job.scroll_to_end) {
      // Read a long list to its end. Many sites load more rows inside an inner list rather than
      // growing the page, so each round brings the last link into view (which scrolls whatever
      // holds it), wheels over the middle of the window, and presses a "Show more" style button
      // when one is there (paging only; nothing else is ever clicked). It stops when no new links
      // have appeared for a few rounds.
      const more = /^\s*(show|see|load|view) more( \w+){0,2}\s*$/i;
      const countLinks = () => page.evaluate(() => document.querySelectorAll("a[href]").length);
      await page.mouse.move(640, 450);
      let still = 0;
      let last = await countLinks();
      for (let i = 0; i < (job.max_scrolls || 400) && still < 4; i += 1) {
        await page.evaluate(() => {
          const links = document.querySelectorAll("a[href]");
          const end = links[links.length - 1];
          if (end) end.scrollIntoView({ block: "end" });
          window.scrollBy(0, 2400);
        });
        await page.mouse.wheel(0, 2400);
        await page.waitForTimeout(800);
        const buttons = await page.locator("button, [role=button]").filter({ hasText: more }).all();
        for (const button of buttons.slice(-1)) {
          const label = ((await button.innerText().catch(() => "")) || "").trim();
          if (more.test(label) && (await button.isVisible().catch(() => false))) {
            await button.scrollIntoViewIfNeeded().catch(() => {});
            await button.click({ timeout: 3000 }).catch(() => {});
            await page.waitForTimeout(1500);
          }
        }
        scrolls += 1;
        const now = await countLinks();
        still = now > last ? 0 : still + 1;
        last = Math.max(last, now);
      }
    } else {
      for (let i = 0; i < (job.scroll || 0); i += 1) {
        await page.mouse.wheel(0, 2400);
        await page.waitForTimeout(500);
      }
    }
    if (job.op === "script") {
      // Alpha's own code, run in the page: a function body that may use `document` and must
      // return something JSON can carry (a list of rows, usually). From here on only the origins
      // the page already used are reachable, and password and card fields refuse input.
      walls.locked = true;
      await context.addInitScript(NEVER_TYPE);
      for (const frame of page.frames()) await frame.evaluate(NEVER_TYPE).catch(() => {});
      const morePages = job.scroll_to_end ? false : await hasMorePages(page);
      const value = await page.evaluate(async (body) => {
        const fn = new Function(`return (async () => { ${body} })();`);
        return await fn();
      }, job.script);
      const finalUrl = page.url();
      return {
        status: response ? response.status() : 0,
        final_url: finalUrl,
        title: await page.title(),
        blocked: await isSignIn(page, job.url),
        more_pages: morePages,
        result: value === undefined ? null : value,
        scrolls,
        ...counts(),
      };
    }
    const data = await page.evaluate((limit) => {
      const links = [];
      const seen = new Set();
      const tidy = (value, max) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
      for (const a of document.querySelectorAll("a[href]")) {
        const href = a.href;
        if (!/^https?:/i.test(href)) continue;
        const url = href.split("#")[0];
        if (seen.has(url) || links.length >= 5000) continue;
        seen.add(url);
        // A link that wraps an image or an icon has no text of its own: fall back to what it
        // labels, and always carry the text of the card it sits in (name, title, company).
        const own = tidy(a.innerText || a.textContent, 200);
        const img = a.querySelector("img");
        const text = own || tidy(a.getAttribute("aria-label") || a.getAttribute("title") || (img && img.getAttribute("alt")), 200);
        // The card: the smallest ancestor with a short text of its own (a row, an item), not
        // the list it belongs to.
        let near = "";
        let node = a.parentElement;
        for (let depth = 0; node && node !== document.body && depth < 6; depth += 1) {
          const words = tidy(node.innerText, 400);
          if (words.length > own.length + 3 && words.length <= 300) {
            near = words.slice(0, 240);
            if (words.length >= 25) break;
          }
          if (words.length > 300) break;
          node = node.parentElement;
        }
        links.push({ text, url, near });
      }
      const text = document.body ? document.body.innerText : "";
      return { title: document.title, text: text.slice(0, limit), truncated: text.length > limit, links };
    }, maxChars);
    const html = job.html ? await page.content() : null;
    const finalUrl = page.url();
    const blocked = await isSignIn(page, job.url);
    return {
      status: response ? response.status() : 0,
      final_url: finalUrl,
      content_type: "text/html",
      title: data.title || null,
      text: data.text,
      truncated: data.truncated,
      links: data.links,
      blocked,
      html: html ? html.slice(0, 3000000) : null,
      scrolls,
      ...counts(),
    };
  } finally {
    await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

const rl = createInterface({ input: process.stdin });
rl.once("line", async (line) => {
  let job;
  try {
    job = JSON.parse(line);
  } catch {
    await out({ error: "the job was not JSON" });
    process.exit(2);
  }
  try {
    if (job.op === "signin") await out(await signin(job));
    else if (job.op === "read" || job.op === "script") await out(await read(job));
    else if (job.op === "status") await out(await status(job));
    else await out({ error: `unknown job ${job.op}` });
  } catch (error) {
    await out({ error: String((error && error.message) || error) });
  }
  process.exit(0);
});
