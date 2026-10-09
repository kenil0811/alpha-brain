/**
 * The rulebook's fixed rules about the stylesheet (§1, §17): every colour comes from a named
 * value written once, in the token block at the top of `app.css`; serif is used in four places
 * only; a status chip has exactly five tones; and there is one stylesheet, not two palettes.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..");
const css = readFileSync(join(SRC, "styles", "app.css"), "utf8");
const BODY = css.slice(css.indexOf("* { box-sizing")); // everything after the token block

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
  });
}

describe("the named values", () => {
  it("is one stylesheet: the old tokens.css is gone", () => {
    expect(existsSync(join(SRC, "styles", "tokens.css"))).toBe(false);
    expect(css).not.toContain("tokens.css");
  });

  it("names the spacing, radii, shadows, motion and header height", () => {
    for (const name of ["--space-1", "--space-2", "--radius-control", "--radius-card", "--radius-pill", "--radius-composer", "--shadow-card", "--shadow-float", "--shadow-seam", "--ease-out", "--dur-quick", "--dur-state", "--header-h"]) {
      expect(css).toContain(`${name}:`);
    }
    expect(css).toMatch(/--space-1: 4px/);
  });

  it("writes no colour outside the token block, in the stylesheet", () => {
    const raw = [...BODY.matchAll(/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(/g)].map((m) => m[0]);
    expect(raw).toEqual([]);
  });

  it("writes no colour in a component either (the companion's own artwork palette aside)", () => {
    const offenders: string[] = [];
    for (const path of files(SRC)) {
      if (path.includes(`${join(SRC, "avatar")}`)) continue;
      const text = readFileSync(path, "utf8");
      for (const m of text.matchAll(/["'`]#[0-9a-fA-F]{3,8}["'`]|\brgba?\(/g)) offenders.push(`${path.slice(SRC.length + 1)}: ${m[0]}`);
    }
    expect(offenders).toEqual([]);
  });
});

describe("type and chips", () => {
  it("uses the serif in four places only: titles (h1, .serif) and the three big numbers", () => {
    const selectors = [...css.matchAll(/([^{}]+)\{[^{}]*font-family: var\(--font-ed\)/g)].map((m) => m[1].trim());
    expect(selectors).toEqual(["h1, .serif", ".tile__big", ".metric__big", ".progress__nums", ".mtile__big"]);
  });

  it("has exactly five chip tones, and one chip", () => {
    const tones = [...css.matchAll(/^\.pill--([a-z]+) \{/gm)].map((m) => m[1]);
    expect(tones).toEqual(["good", "warn", "bad", "info", "gray"]);
    expect(css).not.toMatch(/\.badge\b/);
  });

  it("never fades something in from nothing", () => {
    expect(css).not.toMatch(/@keyframes fadein/);
    expect(css).not.toMatch(/animation:\s*fadein/);
  });
});
