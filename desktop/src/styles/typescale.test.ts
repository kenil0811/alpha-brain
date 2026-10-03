/**
 * The rule in CONTRIBUTING §3.8: every type size in the window is one of the seven steps of
 * the scale in `app.css` (`--text-xs` … `--text-2xl`). A raw pixel size, in the stylesheet or
 * in a component's inline style, fails here, so the scale cannot drift one size at a time.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");
const STEPS = ["xs", "sm", "md", "base", "lg", "xl", "2xl"];

function files(dir: string, ext: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path, ext);
    return ext.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
  });
}

describe("the type scale", () => {
  const css = readFileSync(join(SRC, "styles", "app.css"), "utf8");

  it("defines the seven steps once, in order", () => {
    const defined = [...css.matchAll(/--text-([a-z0-9]+): (\d+)px/g)].map((m) => [m[1], Number(m[2])] as const);
    expect(defined.map(([name]) => name)).toEqual(STEPS);
    const sizes = defined.map(([, px]) => px);
    expect([...sizes].sort((a, b) => a - b)).toEqual(sizes);
  });

  it("is the only source of a font size in the stylesheet", () => {
    const raw = [...css.matchAll(/font-size:\s*([^;}]+)/g)].map((m) => m[1].trim()).filter((v) => !/^var\(--text-(xs|sm|md|base|lg|xl|2xl)\)$/.test(v) && v !== "inherit");
    expect(raw).toEqual([]);
  });

  it("is the only source of a font size in a component", () => {
    const offenders: string[] = [];
    for (const path of files(SRC, /\.tsx?$/)) {
      const text = readFileSync(path, "utf8");
      for (const m of text.matchAll(/fontSize:\s*([^,}]+)/g)) {
        if (!/^"var\(--text-(xs|sm|md|base|lg|xl|2xl)\)"$/.test(m[1].trim())) offenders.push(`${path.slice(SRC.length + 1)}: ${m[1].trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
