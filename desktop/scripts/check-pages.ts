/**
 * The desktop acceptance check, the window's half (`just check-desktop` runs it through
 * `alpha check-desktop`, which copies the world, starts a check core and serves a build of
 * the window). Every page the window has, at every size it is used at, opened in headless
 * Chromium against that core, and judged by what a person would call broken:
 *
 *   - a request the window made that came back 4xx/5xx, or never came back;
 *   - a console error or an uncaught exception;
 *   - the "core isn't running" state, or a problem notice on the page;
 *   - nothing rendered;
 *   - the page wider than the window, or an element past the window's right edge, outside a
 *     scroll area made for it;
 *   - text clipped by its box without an ellipsis, or spilling past its box.
 *
 * It never clicks, types or changes the world: a read of every page, with a screenshot each.
 * Run with Node 24 (`node scripts/check-pages.ts`, types stripped at load). One JSON job on
 * stdin, progress on stderr, one JSON result on stdout:
 *   in:  { app, core, token, out, sizes: [{ width, height, scheme }], only?: [prefix] }
 *   out: { began, ended, pages: [{ path, title, width, height, scheme, ms, shot, problems }] }
 * (An idea from pull request #3's acceptance script, rebuilt: it judged two sizes for
 * overflow and 404s; this reads the sizes from the window's own configuration and judges
 * clipped text too.)
 */
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium, type ConsoleMessage, type Page, type Request, type Response } from "playwright-core";

export interface Size {
  width: number;
  height: number;
  scheme: "light" | "dark";
}

export interface Job {
  app: string;
  core: string;
  token: string;
  out: string;
  sizes: Size[];
  only?: string[];
}

export interface Problem {
  kind: string;
  detail: string;
  count: number;
}

export interface PageResult {
  path: string;
  title: string;
  width: number;
  height: number;
  scheme: string;
  ms: number;
  shot: string;
  problems: Problem[];
}

export interface PageAddress {
  path: string;
  title: string;
}

/** The window's intelligence tabs (shell/Intelligence.tsx), each an address. */
const INTEL_TABS = ["skills", "automations", "connections", "knowledge"];

interface WorldPages {
  modules: { id: string; name?: string }[];
  skills: { name: string }[];
  automations: { id: string; title?: string }[];
  people: { id: string; name?: string }[];
}

/** Every address the window answers to (shell/address.ts), for the things this world holds. */
export function pagesFor(world: WorldPages): PageAddress[] {
  const enc = encodeURIComponent;
  return [
    { path: "/home", title: "Home" },
    { path: "/activity", title: "Activity" },
    { path: "/people", title: "People" },
    ...world.people.map((e) => ({ path: `/people/${enc(e.id)}`, title: `Person: ${e.name ?? e.id}` })),
    ...world.modules.map((m) => ({ path: `/m/${enc(m.id)}`, title: `Module: ${m.name ?? m.id}` })),
    { path: "/intelligence", title: "Intelligence" },
    ...INTEL_TABS.map((t) => ({ path: `/intelligence/${t}`, title: `Intelligence: ${t}` })),
    ...world.skills.map((s) => ({ path: `/intelligence/skills/${enc(s.name)}`, title: `Skill: ${s.name}` })),
    ...world.automations.map((a) => ({ path: `/intelligence/automations/${enc(a.id)}`, title: `Automation: ${a.title ?? a.id}` })),
    { path: "/settings", title: "Settings" },
  ];
}

/** The pages a `only` list keeps: those whose path starts with one of the prefixes. */
export function keep(pages: PageAddress[], only: string[] | undefined): PageAddress[] {
  if (!only || only.length === 0) return pages;
  const prefixes = only.map((p) => (p.startsWith("/") ? p : `/${p}`));
  return pages.filter((page) => prefixes.some((p) => page.path === p || page.path.startsWith(`${p}/`) || page.path.startsWith(p)));
}

/** The file name of a page's screenshot at a size. */
export function shotName(path: string, size: Size): string {
  const slug = path.replace(/^\//, "").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-|-$/g, "") || "root";
  return `${slug}@${size.width}x${size.height}-${size.scheme}.png`;
}

/** Problems of one kind about one element fold into one line with a count. */
export function fold(found: { kind: string; detail: string }[]): Problem[] {
  const out = new Map<string, Problem>();
  for (const f of found) {
    const key = `${f.kind}\u0000${f.detail}`;
    const seen = out.get(key);
    if (seen) seen.count += 1;
    else out.set(key, { ...f, count: 1 });
  }
  return [...out.values()];
}

async function worldPages(job: Job): Promise<WorldPages> {
  const get = async <T>(path: string): Promise<T> => {
    const response = await fetch(`${job.core}${path}`, { headers: { Authorization: `Bearer ${job.token}` } });
    if (!response.ok) throw new Error(`the core answered ${response.status} to ${path}`);
    return (await response.json()) as T;
  };
  const [modules, intel, people] = await Promise.all([
    get<WorldPages["modules"]>("/api/modules"),
    get<{ skills: WorldPages["skills"]; automations: WorldPages["automations"] }>("/api/intelligence"),
    get<WorldPages["people"]>("/api/people"),
  ]);
  return { modules, skills: intel.skills, automations: intel.automations, people };
}

/**
 * What the page looks like to a person, judged inside the page. Self-contained: Playwright
 * serialises this function and runs it in the document.
 */
function inspect(): { text: number; problems: { kind: string; detail: string }[] } {
  const W = window.innerWidth;
  const problems: { kind: string; detail: string }[] = [];
  const root = document.documentElement;
  if (root.scrollWidth > W + 1) problems.push({ kind: "page overflows", detail: `${root.scrollWidth}px wide in a ${W}px window` });
  const main = document.querySelector("main, .page, [role=main]") ?? document.body;
  const text = ((main as HTMLElement).innerText || "").trim().length;
  const h1 = document.querySelector("h1");
  if (h1 && /isn't running|Starting Alpha/.test(h1.textContent ?? "")) problems.push({ kind: "core unreachable", detail: (h1.textContent ?? "").trim() });
  for (const el of document.querySelectorAll('[role="alert"]')) problems.push({ kind: "problem shown", detail: (el.textContent ?? "").trim().slice(0, 160) });

  const label = (el: Element): string => {
    const classes = [...el.classList].slice(0, 2).map((c) => `.${c}`).join("");
    const words = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40);
    return `${el.tagName.toLowerCase()}${classes}${words ? ` “${words}”` : ""}`;
  };
  // A scroll area made for sideways content (a wide table in its wrapper) excuses what is
  // inside it; the page's own scroller does not: a page that scrolls sideways is broken.
  const scrollsSideways = (node: Element): boolean => {
    for (let p = node.parentElement; p && p !== main && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1) return true;
    }
    return false;
  };
  // The nearest ancestor that clips the element on an axis without scrolling it, if the
  // element reaches past that ancestor's box: the element is cut off.
  const cutOffBy = (node: Element, r: DOMRect): string | null => {
    for (let p = node.parentElement; p && p !== document.body; p = p.parentElement) {
      const s = getComputedStyle(p);
      const box = p.getBoundingClientRect();
      if (/(auto|scroll)/.test(s.overflowY) && r.bottom > box.bottom + 1) return null;
      if (/(auto|scroll)/.test(s.overflowX) && r.right > box.right + 1) return null;
      if (/(hidden|clip)/.test(s.overflowY) && r.bottom > box.bottom + 1 && s.webkitLineClamp === "none") return `${label(p)} (below its bottom)`;
      if (/(hidden|clip)/.test(s.overflowX) && r.right > box.right + 1 && s.textOverflow !== "ellipsis") return `${label(p)} (past its right edge)`;
    }
    return null;
  };
  const isControl = (el: Element) => /^(BUTTON|A|INPUT|TEXTAREA|SELECT|IMG)$/.test(el.tagName);
  // The page's own area scrolling sideways is broken; name what reaches past its edge.
  if (main.scrollWidth > main.clientWidth + 1) {
    const edge = main.getBoundingClientRect().right;
    const past: string[] = [];
    for (const el of main.querySelectorAll("*")) {
      if (past.length === 3 || el.closest("svg")) continue;
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.right > edge + 1 && !scrollsSideways(el) && !past.some((p) => p.startsWith(label(el)))) past.push(`${label(el)} to ${Math.round(r.right - edge)}px past it`);
    }
    problems.push({ kind: "page overflows", detail: `the page is ${main.scrollWidth}px wide in a ${main.clientWidth}px area: ${past.join("; ") || "nothing named reaches past the edge"}` });
  }
  for (const el of document.body.querySelectorAll("*")) {
    if (el.closest("script, style, svg, [data-radix-popper-content-wrapper]")) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > W + 1 && !scrollsSideways(el)) {
      problems.push({ kind: "past the right edge", detail: `${label(el)} ends at ${Math.round(r.right)}px in a ${W}px window` });
    }
    const ownText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim());
    if (ownText || isControl(el)) {
      const by = cutOffBy(el, r);
      if (by) problems.push({ kind: "cut off", detail: `${label(el)} by ${by}` });
    }
    // Text that is in view (inside the window and inside every ancestor that clips or scrolls,
    // so not scrolled away) must be what is at its own point: otherwise something covers it.
    if (ownText && r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= W) {
      const node = [...el.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim());
      const range = document.createRange();
      if (node) range.selectNodeContents(node);
      const t = node ? range.getBoundingClientRect() : r;
      const x = t.left + Math.min(t.width / 2, 20);
      const y = t.top + t.height / 2;
      let inView = t.width > 0 && t.height > 0;
      for (let p = el.parentElement; inView && p && p !== document.body; p = p.parentElement) {
        const s = getComputedStyle(p);
        if (s.overflowX === "visible" && s.overflowY === "visible") continue;
        const box = p.getBoundingClientRect();
        if (x < box.left || x > box.right || y < box.top || y > box.bottom) inView = false;
      }
      const hit = inView ? document.elementFromPoint(x, y) : null;
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) problems.push({ kind: "covered", detail: `${label(el)} by ${label(hit)}` });
    }
    if (!ownText || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) || el.clientWidth === 0) continue;
    const ellipsis = cs.textOverflow === "ellipsis" || (cs as unknown as { webkitLineClamp?: string }).webkitLineClamp !== "none";
    const clipsX = /(hidden|clip)/.test(cs.overflowX);
    const clipsY = /(hidden|clip)/.test(cs.overflowY);
    const scrolls = /(auto|scroll)/.test(cs.overflowX) || /(auto|scroll)/.test(cs.overflowY);
    if (scrolls || ellipsis) continue;
    if (el.scrollWidth > el.clientWidth + 1) {
      problems.push({ kind: clipsX ? "text clipped" : "text spills", detail: `${label(el)} needs ${el.scrollWidth}px, has ${el.clientWidth}px` });
    } else if (clipsY && el.scrollHeight > el.clientHeight + 2) {
      problems.push({ kind: "text clipped", detail: `${label(el)} needs ${el.scrollHeight}px tall, has ${el.clientHeight}px` });
    }
  }
  return { text, problems };
}

/** The page has loaded, its requests have gone quiet, its fonts are in and it has painted. */
async function settle(page: Page, problems: { kind: string; detail: string }[]): Promise<void> {
  try {
    await page.waitForLoadState("networkidle", { timeout: 20_000 });
  } catch {
    problems.push({ kind: "did not settle", detail: "requests were still going after 20 s" });
  }
  await page.evaluate(() => document.fonts.ready);
  try {
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), null, { timeout: 10_000 });
  } catch {
    problems.push({ kind: "did not settle", detail: "something was still busy after 10 s" });
  }
  await page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));
}

async function visit(page: Page, job: Job, address: PageAddress, size: Size): Promise<PageResult> {
  const found: { kind: string; detail: string }[] = [];
  const onConsole = (m: ConsoleMessage) => {
    if (m.type() === "error" && !/favicon/.test(m.text())) found.push({ kind: "console error", detail: m.text().slice(0, 200) });
  };
  const onError = (e: Error) => found.push({ kind: "exception", detail: `${e.name}: ${e.message}`.slice(0, 200) });
  const onResponse = (r: Response) => {
    if (r.status() >= 400 && !/favicon/.test(r.url())) found.push({ kind: `request ${r.status()}`, detail: r.url().replace(job.core, "core").replace(job.app, "app") });
  };
  const onFailed = (r: Request) => {
    if (!/favicon/.test(r.url())) found.push({ kind: "request failed", detail: `${r.url().replace(job.core, "core").replace(job.app, "app")}: ${r.failure()?.errorText ?? "no answer"}` });
  };
  page.on("console", onConsole);
  page.on("pageerror", onError);
  page.on("response", onResponse);
  page.on("requestfailed", onFailed);
  const began = Date.now();
  const shot = shotName(address.path, size);
  try {
    await page.goto("about:blank");
    await page.goto(`${job.app}/#${address.path}`, { waitUntil: "load", timeout: 30_000 });
    await settle(page, found);
    const seen = await page.evaluate(inspect);
    found.push(...seen.problems);
    if (seen.text < 20) found.push({ kind: "nothing rendered", detail: `${seen.text} characters of text on the page` });
    await page.screenshot({ path: join(job.out, shot) });
  } catch (e) {
    found.push({ kind: "did not load", detail: (e instanceof Error ? e.message : String(e)).slice(0, 200) });
  } finally {
    page.off("console", onConsole);
    page.off("pageerror", onError);
    page.off("response", onResponse);
    page.off("requestfailed", onFailed);
  }
  return { ...address, ...size, ms: Date.now() - began, shot, problems: fold(found) };
}

async function main(): Promise<void> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  const job = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Job;
  mkdirSync(job.out, { recursive: true });
  const began = new Date().toISOString();
  const pages = keep(pagesFor(await worldPages(job)), job.only);
  const results: PageResult[] = [];
  const browser = await chromium.launch({ headless: true });
  try {
    for (const size of job.sizes) {
      const context = await browser.newContext({ viewport: { width: size.width, height: size.height }, colorScheme: size.scheme, locale: "en-GB", deviceScaleFactor: 1 });
      const page = await context.newPage();
      for (const address of pages) {
        const result = await visit(page, job, address, size);
        results.push(result);
        const verdict = result.problems.length ? `${result.problems.length} problem(s)` : "clean";
        process.stderr.write(`${address.path} ${size.width}×${size.height} ${size.scheme}: ${verdict}, ${(result.ms / 1000).toFixed(1)} s\n`);
      }
      await context.close();
    }
  } finally {
    await browser.close();
  }
  process.stdout.write(`${JSON.stringify({ began, ended: new Date().toISOString(), pages: results })}\n`);
}

if (process.argv[1] && /check-pages\.ts$/.test(process.argv[1])) {
  main().catch((e) => {
    process.stderr.write(`${e instanceof Error ? e.stack ?? e.message : String(e)}\n`);
    process.exit(2);
  });
}
