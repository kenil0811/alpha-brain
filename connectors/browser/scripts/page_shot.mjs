// A page the model drew, rendered once and photographed (harness slice 7b, 18 October 2026):
// Alpha looks at what it made before it says it is done. Reads JSON on stdin: {html, out,
// width, theme: {vars, theme}}; writes the PNG at `out`, prints {height}. Headless Chromium,
// no network (every request but the page itself is refused).
import { chromium } from "playwright-core";

const input = JSON.parse(await new Promise((resolve) => {
  let data = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (c) => (data += c));
  process.stdin.on("end", () => resolve(data));
}));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: input.width || 900, height: 600 }, deviceScaleFactor: 2 });
  await page.route("**/*", (route) => route.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  await page.setContent(input.html, { waitUntil: "load" });
  const vars = (input.theme && input.theme.vars) || {};
  await page.evaluate(({ vars, theme }) => {
    const root = document.documentElement;
    Object.keys(vars).forEach((k) => root.style.setProperty(k, vars[k]));
    if (theme) root.setAttribute("data-theme", theme);
    window.dispatchEvent(new MessageEvent("message", { data: { alpha: "theme", vars, theme } }));
  }, { vars, theme: (input.theme && input.theme.theme) || "light" });
  await page.waitForTimeout(150);
  const height = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
  await page.setViewportSize({ width: input.width || 900, height: Math.min(Math.max(height, 200), 4000) });
  await page.screenshot({ path: input.out, fullPage: true });
  console.log(JSON.stringify({ height, errors }));
} finally {
  await browser.close();
}
