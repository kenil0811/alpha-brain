// The layout check, run headless over every page with a seeded world: a scratch ALPHA_HOME, the
// core on a free port without a token, Vite pointed at it, and the installed Chrome driven by
// the browser connector's playwright-core (no new dependency; the same browsers its tests use). At 1100x760 and 1440x900 every
// page must come back [] from layout-check.js; 768x560 is reported, not a target.
// `node tools/layout-run.mjs` from desktop/ (part of `just verify`).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const desktop = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(desktop, "..");
const { chromium } = await import(join(repo, "connectors/browser/node_modules/playwright-core/index.mjs"));
const check = readFileSync(join(desktop, "tools/layout-check.js"), "utf8");
const home = mkdtempSync(join(tmpdir(), "alpha-layout-"));
const env = { ...process.env, ALPHA_HOME: home };
delete env.ALPHA_TOKEN;
delete env.ALPHA_COMPANION_TOKEN;
const children = [];

function start(cmd, args, opts, ready) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, env: opts.env ?? env, stdio: ["ignore", "pipe", "pipe"] });
    children.push(child);
    let seen = "";
    const timer = setTimeout(() => reject(new Error(`${cmd} didn't start:\n${seen}`)), 60_000);
    const on = (chunk) => {
      // Colour codes (CI forces colour) would split a URL like localhost:\x1b[1m5199.
      seen += String(chunk).replace(/\x1b\[[0-9;]*m/g, "");
      const found = ready(seen);
      if (found) {
        clearTimeout(timer);
        resolve(found);
      }
    };
    child.stdout.on("data", on);
    child.stderr.on("data", on);
    child.on("exit", (code) => reject(new Error(`${cmd} stopped (${code}):\n${seen}`)));
  });
}

const BROWSER = [process.env.ALPHA_TEST_BROWSER, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"].find((p) => p && existsSync(p));
// Claude signed in, so pages render instead of "Connect Claude to start" (that screen is
// checked too, on its own).
const CONNECTED = { installed: true, signed_in: true, email: "layout@example.com", plan: "Max" };

// ALPHA_LAYOUT_PORT lets two checkouts run it at once.
const WEB_PORT = process.env.ALPHA_LAYOUT_PORT ?? "5199";
let failed = false;
try {
  const seed = JSON.parse(await start("uv", ["run", "python", join(desktop, "tools/layout-seed.py")], { cwd: join(repo, "core") }, (s) => s.match(/^SEED (.*)\n/m)?.[1]));
  const project = seed.project;
  const port = await start("uv", ["run", "alpha", "serve", "--port", "0", "--no-background"], { cwd: join(repo, "core") }, (s) => s.match(/ALPHA_CORE_READY \{"port": (\d+)/)?.[1]);
  const vite = await start("pnpm", ["exec", "vite", "--port", WEB_PORT, "--strictPort"], { cwd: desktop, env: { ...env, ALPHA_CORE_PROXY: `http://127.0.0.1:${port}`, VITE_ALPHA_CORE_URL: `http://localhost:${WEB_PORT}` } }, (s) => s.match(new RegExp(`(http://localhost:${WEB_PORT})`))?.[1]);
  // "<path>:<table>" is the project page again, on that table's tab (kept in localStorage).
  const pages = ["/", "/activity", "/intelligence/brain", "/intelligence/skills", "/intelligence/automations", "/intelligence/connections", "/intelligence/knowledge", "/settings", "/settings/models", "/settings/claude", "/settings/appearance", "/settings/avatar", "/settings/look", "/settings/builds", "/settings/desktop", "/settings/permissions", "/settings/shortcuts", "/settings/data", "/settings/about", `/m/${project}`, `/m/${project}:openings`,
    // Each kind of Intelligence item's own page.
    "/intelligence/skills/hand%3Afiles", `/intelligence/skills/${seed.reader}`, `/intelligence/automations/${seed.automation}`, `/intelligence/connections/${seed.connection}`,
    `/intelligence/knowledge/${seed.fact}`, `/intelligence/knowledge/${seed.goal}`, `/intelligence/knowledge/${seed.permission}`, `/intelligence/knowledge/${seed.note}`, "/people", `/people/${seed.entity}`];
  const browser = await chromium.launch({ headless: true, executablePath: BROWSER, channel: BROWSER ? undefined : "chrome" });
  for (const [width, height, gate] of [[1100, 760, true], [1440, 900, true], [768, 560, false]]) {
    for (const [path, model] of [...pages.map((p) => [p, true]), ["/", false]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      if (model) await page.route("**/api/claude", (r) => (r.request().method() === "GET" ? r.fulfill({ json: CONNECTED }) : r.fallback()));
      // The window may only call routes the core has: a 404/405 means a page asks for one it lacks.
      const missing = [];
      page.on("response", (r) => r.url().includes("/api/") && [404, 405].includes(r.status()) && missing.push(`${r.request().method()} ${new URL(r.url()).pathname} ${r.status()}`));
      const [route, tab] = path.split(":");
      if (tab) await page.addInitScript(([id, t]) => localStorage.setItem(`alpha.module.${id}.tab`, t), [project, tab]);
      await page.goto(`${vite}/#${route}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(400);
      const offline = (await page.locator("text=Alpha's core isn't running").count()) ? ["the window never reached the core"] : [];
      const found = [...(await page.evaluate(check)), ...missing, ...offline];
      const where = `${width}x${height} #${path}${model ? "" : " (no model)"}`;
      if (found.length) {
        console.log(`${gate ? "FAIL" : "note"} ${where}\n  ${found.join("\n  ")}`);
        failed ||= gate;
      } else console.log(`ok   ${where}`);
      await page.close();
    }
  }
  await browser.close();
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  failed = true;
} finally {
  for (const c of children) c.kill();
  rmSync(home, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
