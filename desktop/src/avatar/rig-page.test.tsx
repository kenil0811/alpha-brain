/**
 * Not a test of anything: with `RIG_PAGE_OUT=<file>.html` set, writes the rig at every mood to a
 * page to look at in Safari (the app's engine, WebKit; the browser pane is Chromium). Skipped
 * otherwise. `RIG_PAGE_OUT=/tmp/rig.html pnpm vitest run src/avatar/rig-page.test.tsx`.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { DEFAULT_LOOK } from "./looks";
import { POSES, Rig, type Mood } from "./Rig";

it.skipIf(!process.env.RIG_PAGE_OUT)("writes the rig's moods to a page", () => {
  const css = readFileSync("src/styles/app.css", "utf8");
  const moods = Object.keys(POSES) as Mood[];
  const look = { ...DEFAULT_LOOK, fur: "#c97f5e", neckwear: "bow" as const };
  const figures = moods.map((m) => `<figure style="display:inline-block;margin:8px;text-align:center"><div>${renderToStaticMarkup(<Rig look={look} mood={m} size={200} />)}</div><figcaption>${m}</figcaption></figure>`).join("");
  const html = `<!doctype html><meta charset="utf-8"><title>rig moods</title><style>${css}</style><body style="background:#fff;padding:12px">${figures}</body>`;
  writeFileSync(process.env.RIG_PAGE_OUT!, html.replace(/\/src\/avatar\/art\/panda\//g, `file://${process.cwd()}/src/avatar/art/panda/`));
});
