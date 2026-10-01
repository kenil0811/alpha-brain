/**
 * Alpha's browser session worker (the `browser` capability). One JSON job on stdin, one JSON
 * result on stdout, then exit. Two jobs:
 *   signin: open a visible window on a profile Alpha keeps, so the person signs in themselves;
 *           resolves when they close the window. Alpha never reads what they type.
 *   read:   load a page headless (with a profile, or none), let scripts run, and return its
 *           title, readable text and links. Never clicks, types or submits anything.
 *   script: load a page the same way, optionally read it to its end, then run Alpha's own
 *           JavaScript in it and return what the script returns (JSON).
 * Alpha's own code never changes anything on a site: while its script runs, every request other
 * than GET, HEAD and OPTIONS is blocked at the network. Loading and reading a page to its end are
 * done by this driver alone (it only scrolls and presses "Show more" style paging buttons), and
 * the page may use any request it needs for that, because many sites load the next page of a
 * list with a POST that only reads.
 *   status: whether a profile holds cookies for a site.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
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
    return cookies.filter((c) => cookieMatches(c, job.site)).length;
  } finally {
    await context.close();
  }
}

async function signin(job) {
  mkdirSync(job.profile, { recursive: true, mode: 0o700 });
  const context = await chromium.launchPersistentContext(job.profile, launchOptions(job, false));
  const page = context.pages()[0] || (await context.newPage());
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
  const cookies = await cookiesFor(job);
  return { signed_in: cookies > 0, cookies };
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
    let scrolls = 0;
    if (job.scroll_to_end) {
      // Read a long list to its end. Many sites load more rows inside an inner list rather than
      // growing the page, so each round brings the last link into view (which scrolls whatever
      // holds it), wheels over the middle of the window, and presses a "Show more" style button
      // when one is there (paging only; nothing else is ever clicked). It stops when no new links
      // have appeared for a few rounds.
      const more = /^\s*(show|see|load|view) more( results| connections| items| jobs)?\s*$/i;
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
      blockedCount = await readOnly(context);
      const value = await page.evaluate(async (body) => {
        const fn = new Function(`return (async () => { ${body} })();`);
        return await fn();
      }, job.script);
      const finalUrl = page.url();
      const wall = /\/(login|authwall|checkpoint|signin|sign-in|signup|uas\/login)/i;
      return {
        status: response ? response.status() : 0,
        final_url: finalUrl,
        title: await page.title(),
        blocked: wall.test(finalUrl) && !wall.test(job.url),
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
    const wall = /\/(login|authwall|checkpoint|signin|sign-in|signup|uas\/login)/i;
    const blocked = wall.test(finalUrl) && !wall.test(job.url);
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
