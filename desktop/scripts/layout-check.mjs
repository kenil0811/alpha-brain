/**
 * The layout check (`just check-layout`): the window at its real sizes (minimum 1100x560,
 * default 1240x820), light and dark, with `/api/browser` mocked to installed and left real,
 * opened in a real browser and judged for what jsdom can't see (UX audit, ux-audit-pr5 §5, §7.8):
 *
 *   ELLIPSIS     text cut with an ellipsis (unless inside [data-truncate-ok] or a table cell: rows are one line)
 *   WRAP         text in a button, tab or chip on more than one line
 *   SQUEEZED     text squeezed to under 3 characters a line (one letter per line)
 *   OVERFLOW     an element past the edge of `main` or the window, outside a scroller made for it
 *   MAIN-HSCROLL `main` (or a page scroller in it) scrolling sideways
 *   COVERED      a control whose centre is under something else (another column)
 *   HEADERS      the sidebar top row, page header and assistant header not ending on one line
 *
 * Usage (from desktop/, Node 24):
 *   ALPHA_WINDOW_URL=http://127.0.0.1:1430 node scripts/layout-check.mjs   # a window already running
 *   node scripts/layout-check.mjs [--world <path>]                        # starts its own core + Vite
 * Without ALPHA_WINDOW_URL it starts `uv run alpha serve --port 0 --no-background` on a scratch
 * ALPHA_HOME (an empty world, or a SQLite backup of --world, never cp) and a Vite dev server on a
 * free port whose /api proxies to that core; both are stopped afterwards.
 * Writes screenshots, report.json and report.md to desktop/test-results/layout/; exits 1 when
 * anything is flagged, 2 when it could not run.
 */
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer as netServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const DESKTOP = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO = resolve(DESKTOP, "..");
const OUT = join(DESKTOP, "test-results", "layout");
const SIZES = [[1100, 560], [1240, 820]];
const SCHEMES = ["light", "dark"];
const BROWSER_MODES = ["mocked", "real"]; // GET /api/browser -> {installed:true}, or the core's answer

const arg = (name) => { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : undefined; };

// ---- what's on the page that is wrong -------------------------------------------------------

/** Runs in the page; returns [{k, d, ...}]. */
function detect() {
  const out = [];
  const vw = innerWidth, vh = innerHeight;
  const OVER = "[role=dialog],[role=alertdialog],[role=menu],[role=listbox],[data-radix-popper-content-wrapper],[role=tooltip]";
  const main = document.querySelector("main");
  const mr = main?.getBoundingClientRect();
  const vis = (e) => {
    const r = e.getBoundingClientRect(); if (r.width < 1 || r.height < 1) return false;
    if (getComputedStyle(e).visibility === "hidden") return false;
    for (let a = e; a; a = a.parentElement) if (+getComputedStyle(a).opacity === 0) return false; // shown on hover only
    return true;
  };
  const ownText = (e) => [...e.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").trim();
  const desc = (e) => {
    const t = (e.innerText || e.value || e.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ").slice(0, 40);
    const c = (typeof e.className === "string" ? e.className : "").split(" ").filter(Boolean).slice(0, 2).join(".");
    return `${e.tagName.toLowerCase()}${c ? "." + c : ""} "${t}"`;
  };
  const R = (r) => [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
  const scrollsX = (e) => { const s = getComputedStyle(e).overflowX; return s === "auto" || s === "scroll"; };
  const inScrollerX = (e, stop) => { for (let a = e.parentElement; a && a !== stop && a !== document.body; a = a.parentElement) if (scrollsX(a) && a.scrollWidth > a.clientWidth + 1) return true; return false; };
  // a point outside an ancestor that clips (a table scrolled sideways) is hidden, not covered
  const clippedAt = (e, x, y) => { for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) { if (getComputedStyle(a).overflowX === "visible" && getComputedStyle(a).overflowY === "visible") continue; const b = a.getBoundingClientRect(); if (x < b.left || x > b.right || y < b.top || y > b.bottom) return true; } return false; };
  const lineCount = (n) => {
    const rg = document.createRange(); rg.selectNodeContents(n);
    const tops = [];
    for (const x of rg.getClientRects()) if (x.width > 0 && !tops.some((t) => Math.abs(t - x.top) < 4)) tops.push(x.top);
    return tops.length;
  };
  const CTRL = "button,[role=button],[role=tab],[role=menuitem],[role=option],[role=combobox],.chip,.badge,.pill";
  const all = [...document.querySelectorAll("body *")].filter((e) => !(e instanceof SVGElement) && !["SCRIPT", "STYLE", "BR", "OPTION"].includes(e.tagName));
  for (const e of all) {
    if (!vis(e) || e.closest(".sr-only")) continue;
    const r = e.getBoundingClientRect();
    if (r.bottom < 0 || r.top > vh) continue; // only what is on screen
    const cs = getComputedStyle(e);
    const txt = ownText(e);
    if (txt && cs.textOverflow === "ellipsis" && e.scrollWidth > e.clientWidth + 1 && !e.closest("[data-truncate-ok], td"))
      out.push({ k: "ELLIPSIS", d: desc(e), full: txt.slice(0, 80), r: R(r) });
    if (e.matches(CTRL)) {
      const tw = document.createTreeWalker(e, NodeFilter.SHOW_TEXT);
      for (let n; (n = tw.nextNode());) {
        if (!n.textContent.trim() || !vis(n.parentElement)) continue;
        const lines = lineCount(n);
        if (lines > 1) { out.push({ k: "WRAP", d: desc(e), text: n.textContent.trim().slice(0, 50), lines, r: R(r) }); break; }
      }
    }
    if ((txt || e.matches(CTRL)) && !e.closest(OVER)) {
      const pastViewport = r.right > vw + 1 || r.left < -1;
      const pastMain = main && main.contains(e) && (r.right > mr.right + 1 || r.left < mr.left - 1);
      if ((pastViewport || pastMain) && !inScrollerX(e, pastMain ? main : null))
        out.push({ k: "OVERFLOW", d: desc(e), r: R(r), edge: pastMain ? "main" : "window" });
    }
    if (e.matches("button,[role=button],[role=tab],a,input,select,textarea,[role=combobox]") && r.top >= 0 && r.bottom <= vh && r.left >= 0 && r.right <= vw) {
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      const hit = clippedAt(e, cx, cy) ? null : document.elementFromPoint(cx, cy);
      if (hit && hit !== e && !e.contains(hit) && !hit.contains(e)) {
        // scrolled up under the sticky page header: hidden by scrolling, not covered
        if (hit.closest(".pagehead") && !e.closest(".pagehead")) continue;
        const hitOver = hit.closest(OVER);
        if (!(hitOver && hitOver !== e.closest(OVER))) out.push({ k: "COVERED", d: desc(e), by: desc(hit), r: R(r) });
      }
    }
  }
  // One letter a line: a text node on 2+ lines averaging under 3 characters a line.
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n; (n = tw.nextNode());) {
    const t = n.textContent.replace(/\s+/g, "");
    if (t.length < 3) continue;
    const pe = n.parentElement;
    if (!pe || pe.closest(".sr-only") || !vis(pe)) continue;
    const pr = pe.getBoundingClientRect(); if (pr.bottom < 0 || pr.top > vh) continue;
    const lines = lineCount(n);
    if (lines >= 2 && t.length / lines < 3) out.push({ k: "SQUEEZED", d: desc(pe), text: n.textContent.trim().slice(0, 50), lines, r: R(pr) });
  }
  // Sideways scroll: main itself, or a page scroller in it that isn't a table/grid/canvas made to scroll.
  if (main) for (const e of [main, ...main.querySelectorAll("*")]) {
    if (e !== main && !scrollsX(e)) continue;
    if (e !== main && e.querySelector("table,[role=grid],canvas,svg.map,.board,.timeline,.calendar")) continue;
    if (e.scrollWidth > e.clientWidth + 1 && vis(e)) out.push({ k: "MAIN-HSCROLL", d: desc(e).slice(0, 60), sw: e.scrollWidth, cw: e.clientWidth });
  }
  if (document.documentElement.scrollWidth > vw + 1) out.push({ k: "MAIN-HSCROLL", d: "the page", sw: document.documentElement.scrollWidth, cw: vw });
  // The three headers end on one line (not on Home, which has no page header by design).
  if (!/^#\/home/.test(location.hash)) {
    const b = {};
    for (const [n, sel] of [["sidebar", ".rail__top"], ["page", "main .pagehead"], ["assistant", ".assist .pagehead"]]) {
      const el = document.querySelector(sel); if (el && vis(el)) b[n] = Math.round(el.getBoundingClientRect().bottom * 10) / 10;
    }
    const v = Object.values(b);
    if (v.length > 1 && Math.max(...v) - Math.min(...v) > 1) out.push({ k: "HEADERS", d: Object.entries(b).map(([n, y]) => `${n} ${y}`).join(", ") });
  }
  return out;
}

// ---- the window to check ---------------------------------------------------------------------

const freePort = () => new Promise((ok, no) => { const s = netServer(); s.once("error", no); s.listen(0, "127.0.0.1", () => { const { port } = s.address(); s.close(() => ok(port)); }); });

async function startCore(home, world, token) {
  const env = { ...process.env, ALPHA_HOME: home, ALPHA_WORLD: world, ALPHA_TOKEN: token };
  const proc = spawn("uv", ["run", "alpha", "serve", "--port", "0", "--no-background"], { cwd: REPO, env, stdio: ["ignore", "pipe", "pipe"] });
  let err = "";
  proc.stderr.on("data", (d) => { err = (err + d).slice(-2000); });
  const port = await new Promise((ok, no) => {
    let buf = "";
    const t = setTimeout(() => no(new Error(`core did not start in 90 s:\n${err}`)), 90_000);
    proc.stdout.on("data", (d) => {
      buf += d;
      const m = buf.match(/ALPHA_CORE_READY (\{.*\})/);
      if (m) { clearTimeout(t); ok(JSON.parse(m[1]).port); }
    });
    proc.once("exit", (c) => { clearTimeout(t); no(new Error(`core exited (${c}):\n${err}`)); });
  });
  return { url: `http://127.0.0.1:${port}`, stop: () => proc.kill("SIGTERM") };
}

async function startWindow() {
  if (process.env.ALPHA_WINDOW_URL) return { url: process.env.ALPHA_WINDOW_URL.replace(/\/$/, ""), stop: async () => {} };
  const home = mkdtempSync(join(tmpdir(), "alpha-layout-"));
  let world = join(home, "world.sqlite");
  const source = arg("--world");
  if (source) {
    // The repo's own copy (SQLite backup + browser profiles), never cp.
    const py = "import sys; from pathlib import Path; from alpha.journeys.suite import copy_home; print(copy_home(Path(sys.argv[1]), Path(sys.argv[2])))";
    const r = spawnSync("uv", ["run", "python", "-c", py, resolve(REPO, source), home], { cwd: REPO, encoding: "utf8" });
    if (r.status !== 0) throw new Error(`could not copy the world: ${r.stderr}`);
    world = r.stdout.trim().split("\n").pop();
  }
  const token = Array.from({ length: 32 }, () => "0123456789abcdef"[Math.floor(Math.random() * 16)]).join("");
  const core = await startCore(home, world, token);
  const port = await freePort();
  const url = `http://127.0.0.1:${port}`;
  // Same origin as the window, proxied to the core: no CORS (the core only allows :1430).
  process.env.VITE_ALPHA_CORE_URL = url;
  process.env.VITE_ALPHA_CORE_TOKEN = token;
  const { createServer } = await import("vite");
  const vite = await createServer({
    root: DESKTOP, configFile: join(DESKTOP, "vite.config.ts"), logLevel: "error", clearScreen: false,
    server: { host: "127.0.0.1", port, strictPort: true, hmr: false, watch: null, proxy: { "/api": { target: core.url, ws: true } } },
  });
  await vite.listen();
  console.error(`core ${core.url} on ${source ? `a copy of ${source}` : "an empty world"}, window ${url}`);
  return { url, stop: async () => { await vite.close(); core.stop(); rmSync(home, { recursive: true, force: true }); } };
}

async function launch() {
  for (const [label, opts] of [["Edge", { channel: "msedge" }], ["Chrome", { channel: "chrome" }], ["bundled Chromium", {}]]) {
    try { const b = await chromium.launch({ ...opts, headless: true }); console.error(`browser: ${label}`); return b; } catch { /* next */ }
  }
  throw new Error("no browser: install Edge or Chrome, or `npx playwright-core install chromium`");
}

// ---- the states --------------------------------------------------------------------------

async function ready(p) {
  await p.waitForFunction(() => { const m = document.querySelector("main"); return document.querySelector(".rail") && m && !/Loading/i.test(m.innerText); }, null, { timeout: 20_000 }).catch(() => {});
  await p.waitForTimeout(500);
}

// Tabs by position (names carry counts and newlines); the name only labels the state.
const tabNames = (p) => p.evaluate(() => [...document.querySelectorAll("main [role=tab]")].map((t, i) => (t.getAttribute("aria-label") || t.innerText).trim().split("\n")[0] || `tab${i}`));
const clickTab = (p, i) => p.locator("main [role=tab]").nth(i).click({ timeout: 4000 });
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** The project's table view (a saved view may be Calendar, Board…). Saves the view in the world it
 *  runs on: a scratch copy unless ALPHA_WINDOW_URL points at a window on a real one. */
async function toTable(p) {
  const combo = p.locator("main [role=combobox]").filter({ hasText: /^\s*(Board|List|Gallery|Calendar|Timeline|Dashboard|Chart|Form)\s*$/ }).first();
  if (!(await combo.count())) return;
  await combo.click({ timeout: 4000 });
  await p.getByRole("option", { name: /^Table/ }).first().click({ timeout: 4000 });
  await p.waitForTimeout(400);
}

async function openFirstRow(p) {
  await toTable(p);
  const before = await p.evaluate(() => location.hash);
  await p.locator("main tbody tr").first().locator("td").nth(1).click({ timeout: 4000 });
  await p.waitForFunction((h) => location.hash !== h, before, { timeout: 4000 });
}

/** The states, given what this world holds (found from the rail, so any window URL works). */
async function plan(browser, base) {
  const ctx = await browser.newContext({ viewport: { width: 1240, height: 820 } });
  const p = await ctx.newPage();
  await p.goto(`${base}/#/home`); await ready(p);
  // Projects are the rail rows whose address is #/m/…; the first, and the one called Deals if any.
  const mods = await p.evaluate(async () => {
    const out = [];
    for (const b of document.querySelectorAll(".rail .navrow .navbtn:not(.navbtn--new)")) {
      b.click(); await new Promise((r) => setTimeout(r, 300));
      if (/^#\/m\/[^/]+$/.test(location.hash)) out.push({ h: location.hash, name: b.innerText });
    }
    return out;
  });
  const ids = [mods[0]?.h, (mods.find((m) => /deals/i.test(m.name)) || mods[0])?.h];
  const [first, deals] = ids;
  const tabs = {};
  for (const [n, h] of [["network", "#/network"], ["intelligence", "#/intelligence/second-brain"], ["settings", "#/settings"]]) {
    for (let tries = 0; tries < 3 && !tabs[n]?.length; tries++) { await p.goto(`${base}/${h}`); await p.reload(); await ready(p); tabs[n] = await tabNames(p); }
  }
  // Intelligence header tabs change the address; the second-brain view tabs live under one.
  await ctx.close();
  const states = [{ n: "home", h: "#/home" }];
  for (const [n, h] of [["network", "#/network"], ["intelligence", "#/intelligence/second-brain"], ["settings", "#/settings"]]) {
    states.push({ n, h });
    tabs[n].forEach((t, i) => states.push({ n: `${n}-${slug(t)}`, h, a: (pg) => clickTab(pg, i) }));
  }
  const skipped = [];
  if (first) {
    states.push({ n: "project", h: first, a: toTable }, { n: "record", h: first, a: openFirstRow });
  } else skipped.push("project, record: no project in this world");
  if (deals) states.push({ n: "deals-panelwide-railfolded", h: deals, ls: { "alpha.panel.width": "560", "alpha.rail.collapsed": "true" }, a: toTable });
  else skipped.push("deals with the panel wide and the sidebar folded: no project in this world");
  states.push({ n: "new-project", h: "#/new-project" });
  return { states, skipped };
}

// ---- run ---------------------------------------------------------------------------------

async function main() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(OUT, { recursive: true });
  const win = await startWindow();
  const browser = await launch();
  const results = [];
  let planned;
  try {
    planned = await plan(browser, win.url);
    for (const mode of BROWSER_MODES) for (const [w, h] of SIZES) for (const scheme of SCHEMES) {
      for (const st of planned.states) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, reducedMotion: "reduce" });
        await ctx.addInitScript((ls) => { if (!sessionStorage.getItem("lc")) { sessionStorage.setItem("lc", "1"); for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v); } }, { "alpha.panel": "true", ...(st.ls || {}) });
        if (mode === "mocked") await ctx.route(/\/api\/browser(\?|$)/, (r) => r.request().method() === "GET" ? r.fulfill({ json: { installed: true } }) : r.fallback());
        const p = await ctx.newPage();
        let error = null, flags = [];
        try {
          await p.goto(`${win.url}/${st.h}`); await ready(p);
          if (st.a) { await st.a(p); await p.waitForTimeout(700); }
          await p.mouse.move(4, Math.round(h * 0.6)); // the sidebar's empty middle: no hover state
          flags = await p.evaluate(detect);
        } catch (e) { error = String(e.message).split("\n")[0]; }
        const shot = `${st.n}-${w}x${h}-${scheme}-${mode}.png`;
        await p.screenshot({ path: join(OUT, shot) }).catch(() => {});
        results.push({ state: st.n, width: w, height: h, scheme, browser: mode, url: p.url(), shot, error, flags });
        await ctx.close();
        process.stderr.write(`${flags.length || error ? "x" : "."}`);
      }
    }
  } finally {
    await browser.close();
    await win.stop();
  }
  process.stderr.write("\n");
  return { results, skipped: planned.skipped };
}

function report({ results, skipped }) {
  const bad = results.filter((r) => r.error || r.flags.length);
  const byKind = {};
  for (const r of results) for (const f of r.flags) byKind[f.k] = (byKind[f.k] || 0) + 1;
  writeFileSync(join(OUT, "report.json"), JSON.stringify({ when: new Date().toISOString(), byKind, skipped, results }, null, 1));
  const lines = ["# Layout check", "", `${results.length} states, ${bad.length} with problems.`, ""];
  if (Object.keys(byKind).length) lines.push("| Kind | Count |", "|---|---|", ...Object.entries(byKind).sort((a, b) => b[1] - a[1]).map(([k, n]) => `| ${k} | ${n} |`), "");
  for (const s of skipped) lines.push(`- skipped ${s}`);
  for (const r of bad) {
    lines.push("", `## ${r.state} ${r.width}x${r.height} ${r.scheme} (browser ${r.browser}) — ${r.shot}`);
    if (r.error) lines.push(`- **ERROR** ${r.error}`);
    // One line per distinct finding: the same element flagged twice reads once.
    const seen = new Set();
    for (const f of r.flags) {
      const { k, d, r: _r, ...rest } = f;
      const line = `- **${k}** ${d ?? ""} ${Object.entries(rest).map(([a, b]) => `${a}=${JSON.stringify(b)}`).join(" ")}`.trim();
      if (!seen.has(line)) { seen.add(line); lines.push(line); }
    }
  }
  const md = lines.join("\n") + "\n";
  writeFileSync(join(OUT, "report.md"), md);
  return { md, bad: bad.length };
}

try {
  const run = await main();
  const { md, bad } = report(run);
  if (bad) { console.log(md.split("\n").slice(0, 120).join("\n")); console.log(`\n${bad} state(s) flagged; full report: ${join(OUT, "report.md")}`); process.exit(1); }
  console.log(`layout check: ${run.results.length} states clean. Report: ${join(OUT, "report.md")}`);
  process.exit(0);
} catch (e) {
  console.error(`layout check could not run: ${e.stack || e}`);
  process.exit(2);
}
