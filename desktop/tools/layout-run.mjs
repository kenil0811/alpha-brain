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
      seen += chunk;
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
// A connected model, so pages render instead of "Connect a model to start" (that screen is
// checked too, on its own). Saving a real key would touch the Keychain.
const CONNECTED = { providers: [{ id: "claude", label: "Claude", kind: "sign_in", state: "connected", dot: { color: "green", tooltip: "Connected." }, error: null, key_last4: null, installing: false, who: "layout@example.com", default: true }] };

let failed = false;
try {
  const project = (await start("uv", ["run", "python", join(desktop, "tools/layout-seed.py")], { cwd: join(repo, "core") }, (s) => s.match(/^(m_\w+)$/m)?.[1]));
  const port = await start("uv", ["run", "alpha", "serve", "--port", "0"], { cwd: join(repo, "core") }, (s) => s.match(/ALPHA_CORE_READY \{"port": (\d+)/)?.[1]);
  const vite = await start("pnpm", ["exec", "vite", "--port", "5199", "--strictPort"], { cwd: desktop, env: { ...env, VITE_ALPHA_CORE_URL: `http://127.0.0.1:${port}` } }, (s) => s.match(/(http:\/\/localhost:5199)/)?.[1]);
  const pages = ["/", "/activity", "/intelligence/brain", "/intelligence/skills", "/intelligence/automations", "/intelligence/connections", "/intelligence/knowledge", "/settings", `/m/${project}`];
  const browser = await chromium.launch({ headless: true, executablePath: BROWSER, channel: BROWSER ? undefined : "chrome" });
  for (const [width, height, gate] of [[1100, 760, true], [1440, 900, true], [768, 560, false]]) {
    for (const [path, model] of [...pages.map((p) => [p, true]), ["/", false]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      if (model) await page.route("**/api/models", (r) => (r.request().method() === "GET" ? r.fulfill({ json: CONNECTED }) : r.fallback()));
      await page.goto(`${vite}/#${path}`);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(400);
      const found = await page.evaluate(check);
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
