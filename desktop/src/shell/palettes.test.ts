import { describe, expect, it } from "vitest";
import { SPECIES } from "../avatar/zazoo/species";
import { DEFAULT_LOOK } from "../avatar/look";
import { paletteCss, readAppearance } from "./appearance";
import { ACCENTS, BASE, COMPANION_PALETTES, contrast, type Mode, tokensFor } from "./palettes";

const MODES: Mode[] = ["light", "dark"];

/** Every pairing a person reads: body text and secondary text on each surface, the primary as
 *  link text, and a primary button's label. */
function failures(name: string, primary: string, tint: string | null): string[] {
  const out: string[] = [];
  for (const mode of MODES) {
    const base = BASE[mode];
    const t = tokensFor(mode, primary, tint);
    const bg = t["--bridge-bg"] ?? base.bg;
    const surface = t["--bridge-surface"] ?? base.surface;
    const line = t["--bridge-line-soft"] ?? base.line;
    const p = primary;
    const checks: [string, string, string][] = [
      ["text on page", base.text, bg],
      ["text on card", base.text, surface],
      ["text on muted", base.text, line],
      ["secondary text on card", base.text2, surface],
      ["secondary text on page", base.text2, bg],
      ["primary on card", p, surface],
      ["primary on page", p, bg],
      ["button text", base.ink, p],
    ];
    for (const [what, fg, back] of checks) {
      const ratio = contrast(fg, back);
      if (ratio < 4.5) out.push(`${name} ${mode} ${what}: ${ratio.toFixed(2)}`);
    }
  }
  return out;
}

describe("palettes", () => {
  it("computes WCAG contrast", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("gives every species a companion theme", () => {
    expect(SPECIES.filter((s) => !COMPANION_PALETTES[s.id]).map((s) => s.id)).toEqual([]);
  });

  it("keeps text and button text at 4.5:1 in every companion theme, light and dark", () => {
    const bad = Object.entries(COMPANION_PALETTES).flatMap(([id, [light, dark, tint]]) => [
      ...failures(id, light, tint).filter((f) => f.includes(" light ")),
      ...failures(id, dark, tint).filter((f) => f.includes(" dark ")),
    ]);
    expect(bad).toEqual([]);
  });

  it("keeps every accent at 4.5:1, light and dark", () => {
    const bad = ACCENTS.flatMap((a) => (a.pair ? [...failures(a.value, a.pair[0], null).filter((f) => f.includes(" light ")), ...failures(a.value, a.pair[1], null).filter((f) => f.includes(" dark "))] : []));
    expect(bad).toEqual([]);
  });

  it("writes the companion theme for both modes, and nothing for the defaults", () => {
    const a = readAppearance();
    expect(paletteCss(a, DEFAULT_LOOK)).toBe("");
    const css = paletteCss({ ...a, companion: true, accent: "companion" }, { ...DEFAULT_LOOK, species: "mia" });
    expect(css).toContain("--bridge-steel: #a8506a;");
    expect(css).toContain(':root[data-theme="dark"] { --bridge-steel: #c28597;');
    expect(css).toContain("prefers-color-scheme: dark");
  });
});
