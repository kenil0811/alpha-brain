/**
 * Alpha's browser session worker (the `browser` capability). One JSON job on stdin, one JSON
 * result on stdout, then exit. Two jobs:
 *   signin: open a visible window on a profile Alpha keeps, so the person signs in themselves;
 *           resolves when they close the window. Alpha never reads what they type. A sign-in
 *           often passes through other sites (gmail.com signs in at google.com), so the sites
 *           the window visited are written next to the profile: the sign-in covers them all.
 *   read:   load a page headless (with a profile, or none), let scripts run, and return its
 *           title, readable text and links. Never clicks, types or submits anything.
 *   script: load a page the same way, optionally read it to its end, then run Alpha's own
 *           JavaScript in it and return what the script returns (JSON).
 * Alpha's own code never changes anything on a site: while its script runs, every request other
 * than GET, HEAD and OPTIONS is blocked at the network. Loading and reading a page to its end are
 * done by this driver alone (it only scrolls and presses "Show more" style paging buttons), and
 * the page may use any request it needs for that, because many sites load the next page of a
 * list with a POST that only reads.
 *   status: whether a profile holds cookies for a site (or any of `sites`).
 *   download: fetch a file through the person's session: a direct address (the site's
 *           cookies go with the request), or the file a page hands back when a control is
 *           pressed. Saved under `dest_dir`, never run. A read.
 *   act:    the one write operation. Performs an approved action's procedure in the person's
 *           own session: declarative steps (click, click_text, fill, type, press, wait,
 *           expect). Fills and typing take only values of the approved payload. With
 *           `stop_before_last` it is a dry run: every step but the commit, then a screenshot.
 *           It refuses to type into password or payment fields, whatever the step says.
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

/** From the moment this is called, block every request that could change data on a site. */
async function readOnly(context) {
  let blocked = 0;
  await context.route("**/*", (route) => {
    if (SAFE_METHODS.has(route.request().method())) return route.continue();
    blocked += 1;
    return route.abort("blockedbyclient");
  });
  return () => blocked;
}

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
  if (job.profile) {
    context = await chromium.launchPersistentContext(job.profile, launchOptions(job, true));
  } else {
    browser = await chromium.launch(launchOptions(job, true));
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: job.locale || "en-GB", userAgent: USER_AGENT });
  }
  let blockedCount = () => 0;
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
        writes_blocked: 0,
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
      // return something JSON can carry (a list of rows, usually). Writes are blocked first.
      const morePages = job.scroll_to_end ? false : await hasMorePages(page);
      blockedCount = await readOnly(context);
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
        writes_blocked: blockedCount(),
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
      writes_blocked: blockedCount(),
    };
  } finally {
    await context.close().catch(() => {});
    if (browser) await browser.close().catch(() => {});
  }
}

// ---- acting: the one write operation ----

const SENSITIVE_NAME = /passw|passcode|pin\b|cvv|cvc|card.?num|cardnumber|credit|iban|account.?num|ssn|social.?security|passport/i;

/** Why typing into this element is refused, or null. Decided by the field itself, never by what
 *  a step says: a password is a password whatever it is called. */
async function sensitive(locator) {
  return locator
    .evaluate((el) => {
      const type = (el.getAttribute("type") || "").toLowerCase();
      const auto = (el.getAttribute("autocomplete") || "").toLowerCase();
      const words = [el.getAttribute("name"), el.getAttribute("id"), el.getAttribute("aria-label"), el.getAttribute("placeholder")].join(" ");
      if (type === "password") return "a password field";
      if (auto.startsWith("cc-") || auto === "one-time-code" || auto === "new-password" || auto === "current-password") return `a ${auto} field`;
      if (/passw|passcode|cvv|cvc|card.?num|cardnumber|credit|iban|account.?num|ssn|social.?security|passport/i.test(words)) return "a field that looks like a password or payment detail";
      return null;
    })
    .catch(() => null);
}

/** `{field}` in an address, a selector or a text comes from the approved payload (a profile
 *  slug, a subject to find): it steers where the steps go; only fill, type and upload put
 *  payload text into the site. */
function filled(text, values) {
  return String(text).replace(/\{([a-z][a-z0-9_]*)\}/g, (m, name) => (name in (values || {}) && name !== "__files" ? String(values[name]) : m));
}

function target(page, step, values) {
  if (step.click_text !== undefined) {
    const text = filled(step.click_text, values);
    return page
      .locator(`button, [role=button], a, [role=link], [role=menuitem], [role=tab], label, [role=option]`)
      .filter({ hasText: new RegExp(`^\\s*${text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "i") })
      .first();
  }
  const selector = step.click ?? step.fill ?? step.type ?? step.wait ?? step.expect ?? step.upload;
  return page.locator(filled(String(selector), values)).first();
}

let job_files_root = null;

async function performStep(page, step, values, log) {
  const began = Date.now();
  const kind = Object.keys(step).find((k) => ["goto", "click", "click_text", "fill", "type", "press", "wait", "wait_ms", "expect", "expect_text"].includes(k));
  const entry = { step: kind, ok: false, ms: 0 };
  try {
    if (kind === "goto") {
      await page.goto(filled(step.goto, values), { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
    } else if (kind === "click" || kind === "click_text") {
      const el = target(page, step, values);
      await el.waitFor({ state: "visible", timeout: 15000 });
      await el.click({ timeout: 10000 });
      await page.waitForTimeout(600);
    } else if (kind === "fill" || kind === "type") {
      const field = String(step.value).replace(/^\{|\}$/g, "");
      if (!(field in values)) throw new Error(`no value for {${field}}`);
      const el = target(page, step, values);
      await el.waitFor({ state: "visible", timeout: 15000 });
      const why = await sensitive(el);
      if (why) throw new Error(`refused: Alpha never types into ${why}`);
      if (kind === "fill") {
        await el.fill(String(values[field]), { timeout: 10000 });
      } else {
        await el.click({ timeout: 10000 });
        await page.keyboard.type(String(values[field]), { delay: 8 });
      }
      await page.waitForTimeout(300);
    } else if (kind === "upload") {
      const field = String(step.value).replace(/^\{|\}$/g, "");
      const file = (job_files_root && values.__files && values.__files[field]) || null;
      if (!file) throw new Error(`no file for {${field}}`);
      if (!String(file).startsWith(job_files_root)) throw new Error("refused: Alpha uploads only files it keeps itself");
      const el = target(page, { fill: step.upload }, values);
      await el.waitFor({ state: "attached", timeout: 15000 });
      await el.setInputFiles(String(file));
      await page.waitForTimeout(800);
    } else if (kind === "press") {
      await page.keyboard.press(String(step.press));
      await page.waitForTimeout(600);
    } else if (kind === "wait") {
      await target(page, step, values).waitFor({ state: "visible", timeout: 20000 });
    } else if (kind === "wait_ms") {
      await page.waitForTimeout(Number(step.wait_ms));
    } else if (kind === "expect") {
      await target(page, step, values).waitFor({ state: "visible", timeout: 15000 });
    } else if (kind === "expect_text") {
      await page.getByText(filled(step.expect_text, values), { exact: false }).first().waitFor({ state: "visible", timeout: 15000 });
    } else {
      throw new Error(`unknown step ${JSON.stringify(step)}`);
    }
    entry.ok = true;
  } catch (error) {
    entry.error = String((error && error.message) || error).split("\n")[0].slice(0, 300);
  }
  entry.ms = Date.now() - began;
  log.push(entry);
  return entry.ok;
}

async function act(job) {
  job_files_root = job.files_root || null;
  if (!job.profile) throw new Error("acting needs the person's sign-in profile for the site");
  mkdirSync(job.shots_dir, { recursive: true });
  const context = await chromium.launchPersistentContext(job.profile, launchOptions(job, true));
  const shots = {};
  const shoot = async (page, name) => {
    const file = join(job.shots_dir, `${name}.png`);
    await page.screenshot({ path: file, fullPage: false }).catch(() => {});
    shots[name] = file;
  };
  const log = [];
  try {
    const page = context.pages()[0] || (await context.newPage());
    const startUrl = filled(job.url, job.values || {});
    const response = await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
    if (await isBotCheck(page)) {
      await shoot(page, "error");
      return { bot_check: true, blocked: false, done: 0, log, shots, final_url: page.url(), title: await page.title().catch(() => "") };
    }
    if (await isSignIn(page, startUrl)) {
      await shoot(page, "error");
      return { bot_check: false, blocked: true, done: 0, log, shots, final_url: page.url(), title: await page.title().catch(() => "") };
    }
    const steps = job.steps || [];
    const upto = job.stop_before_last ? steps.length - 1 : steps.length;
    let done = 0;
    for (let i = 0; i < upto; i += 1) {
      if (i === steps.length - 1) await shoot(page, "before");
      const ok = await performStep(page, steps[i], job.values || {}, log);
      if (!ok) {
        await shoot(page, "error");
        return { bot_check: false, blocked: false, done, failed_step: i + 1, error: log[log.length - 1].error, log, shots, final_url: page.url(), title: await page.title().catch(() => ""), status: response ? response.status() : 0 };
      }
      done += 1;
    }
    await page.waitForTimeout(800);
    await shoot(page, job.stop_before_last ? "preview" : "after");
    let verified = null;
    if (!job.stop_before_last && job.verify && job.verify.length) {
      verified = true;
      for (const step of job.verify) {
        if (!(await performStep(page, step, job.values || {}, log))) {
          verified = false;
          await shoot(page, "verify");
          break;
        }
      }
    }
    return { bot_check: false, blocked: false, done, stopped_before_last: !!job.stop_before_last, verified, log, shots, final_url: page.url(), title: await page.title().catch(() => ""), status: response ? response.status() : 0 };
  } finally {
    await context.close().catch(() => {});
  }
}

// ---- downloading: a file comes in through the person's session; nothing goes out ----

async function download(job) {
  mkdirSync(job.dest_dir, { recursive: true });
  let browser = null;
  let context;
  if (job.profile) {
    context = await chromium.launchPersistentContext(job.profile, launchOptions(job, true));
  } else {
    browser = await chromium.launch(launchOptions(job, true));
    context = await browser.newContext({ viewport: { width: 1280, height: 900 }, locale: job.locale || "en-GB", userAgent: USER_AGENT });
  }
  try {
    const page = context.pages()[0] || (await context.newPage());
    if (job.click || job.click_text) {
      // The file the page hands back when a control is pressed (an attachment icon, Export).
      await page.goto(job.url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForLoadState("networkidle", { timeout: 6000 }).catch(() => {});
      if (await isBotCheck(page)) return { bot_check: true, blocked: false };
      if (await isSignIn(page, job.url)) return { bot_check: false, blocked: true };
      const el = target(page, job.click ? { click: job.click } : { click_text: job.click_text }, {});
      await el.waitFor({ state: "visible", timeout: 15000 });
      const [dl] = await Promise.all([page.waitForEvent("download", { timeout: 60000 }), el.click({ timeout: 10000 })]);
      const name = dl.suggestedFilename() || "download";
      const file = join(job.dest_dir, name);
      await dl.saveAs(file);
      return { bot_check: false, blocked: false, path: file, name, final_url: page.url() };
    }
    // A direct address: fetched with the session's cookies. A page that comes back instead of a
    // file (a sign-in wall, say) is not a download.
    const response = await context.request.get(job.url, { timeout: 60000, maxRedirects: 10 });
    const type = (response.headers()["content-type"] || "").toLowerCase();
    const body = await response.body();
    if (!response.ok()) return { bot_check: false, blocked: response.status() === 401 || response.status() === 403, status: response.status() };
    if (type.includes("text/html")) {
      const head = body.toString("utf8", 0, 4000).toLowerCase();
      return { bot_check: /challenge|captcha|verify you are human/.test(head), blocked: /password|sign in|log in/.test(head), html: true, status: response.status() };
    }
    const disposition = response.headers()["content-disposition"] || "";
    const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    let name = m ? decodeURIComponent(m[1]) : "";
    if (!name) {
      try { name = decodeURIComponent(new URL(job.url).pathname.split("/").pop() || ""); } catch { name = ""; }
    }
    name = (job.name || name || "download").replace(/[\/\\]/g, "_");
    const file = join(job.dest_dir, name);
    writeFileSync(file, body);
    return { bot_check: false, blocked: false, path: file, name, size: body.length, content_type: type, status: response.status() };
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
    else if (job.op === "act") await out(await act(job));
    else if (job.op === "download") await out(await download(job));
    else await out({ error: `unknown job ${job.op}` });
  } catch (error) {
    await out({ error: String((error && error.message) || error) });
  }
  process.exit(0);
});
