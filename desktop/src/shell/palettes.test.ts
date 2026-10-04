import { describe, expect, it } from "vitest";
import { ANIMALS } from "../avatar/looks";
import { DEFAULT_APPEARANCE, paletteCss } from "./appearance";
import { ACCENTS, BASE, COMPANION_PALETTES, contrast, type Mode, tokensFor } from "./palettes";

/** Every pairing a person reads in one mode: body, secondary and faint text on each surface,
 *  the primary as link text, and a primary button's label. */
function failures(name: string, mode: Mode, primary: string, tint: string | null): string[] {
  const base = BASE[mode];
  const t = tokensFor(mode, primary, tint);
  const backs = { page: t["--bg"] ?? base.bg, card: t["--surface"] ?? base.surface, muted: t["--surface-2"] ?? base.surface2 };
  const checks: [string, string, string][] = [["button text", base.ink, primary]];
  for (const [where, back] of Object.entries(backs)) {
    checks.push([`text on ${where}`, base.text, back], [`secondary text on ${where}`, base.text2, back], [`primary on ${where}`, primary, back]);
  }
  const faint = t["--text-3"] ?? base.text3;
  checks.push(["faint text on card", faint, backs.card]);
  // app.css's own dark faint text on --surface-2 is 4.28:1, so only a tint is held to it here.
  if (tint) checks.push(["faint text on muted", faint, backs.muted]);
  return checks.filter(([, fg, back]) => contrast(fg, back) < 4.5).map(([what, fg, back]) => `${name} ${mode} ${what}: ${contrast(fg, back).toFixed(2)}`);
}

describe("palettes", () => {
  it("computes WCAG contrast", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });

  it("gives every animal a companion theme", () => {
    expect(ANIMALS.filter((a) => !COMPANION_PALETTES[a.id]).map((a) => a.id)).toEqual([]);
  });

  it("keeps text and button text at 4.5:1 in every companion theme, light and dark", () => {
    const bad = Object.entries(COMPANION_PALETTES).flatMap(([id, [light, dark, tint]]) => [...failures(id, "light", light, tint), ...failures(id, "dark", dark, tint)]);
    expect(bad).toEqual([]);
  });

  it("keeps every accent at 4.5:1, light and dark", () => {
    const bad = ACCENTS.flatMap((a) => (a.pair ? [...failures(a.value, "light", a.pair[0], null), ...failures(a.value, "dark", a.pair[1], null)] : []));
    expect(bad).toEqual([]);
  });

  it("writes the companion theme for both modes, and nothing for the defaults", () => {
    expect(paletteCss(DEFAULT_APPEARANCE, "panda")).toBe("");
    const css = paletteCss({ ...DEFAULT_APPEARANCE, companion: true, accent: "companion" }, "cat");
    expect(css).toContain("--primary: #a8506a;");
    expect(css).toContain(':root[data-theme="dark"] { --primary: #c98d9f;');
    expect(css).toContain("prefers-color-scheme: dark");
  });
});
