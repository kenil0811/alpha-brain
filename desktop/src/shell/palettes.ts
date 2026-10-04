/** Accent colours and the companion themes (pull request #3's), as light and dark values of
 *  app.css's tokens. A companion theme has a primary for each mode and a tint (the animal's own
 *  colour) that the surfaces and borders take a few percent of. Every value keeps body text,
 *  secondary text and a primary button's label at 4.5:1 or better (palettes.test.ts). */
import type { AnimalId } from "../avatar/looks";

/** [light primary, dark primary]. */
export type Pair = [string, string];

/** Steel is app.css's own --primary; the rest replace it in both modes. */
export const ACCENTS: { value: string; label: string; pair: Pair | null }[] = [
  { value: "steel", label: "Steel", pair: null },
  { value: "sage", label: "Sage", pair: ["#5b7556", "#8fa58a"] },
  { value: "forest", label: "Forest", pair: ["#3d6b45", "#7fa084"] },
  { value: "teal", label: "Teal", pair: ["#2a7378", "#6aa3a7"] },
  { value: "indigo", label: "Indigo", pair: ["#4a55a8", "#8f97cc"] },
  { value: "plum", label: "Plum", pair: ["#7a5a9a", "#a48dbd"] },
  { value: "rose", label: "Rose", pair: ["#a95667", "#c98a96"] },
  { value: "terracotta", label: "Terracotta", pair: ["#b14f2b", "#d08a6e"] },
  { value: "amber", label: "Amber", pair: ["#8a6230", "#c28c4a"] },
  { value: "graphite", label: "Graphite", pair: ["#4a5563", "#959ca4"] },
];

/** Per animal (avatar/looks.ts): light primary, dark primary, tint. */
export const COMPANION_PALETTES: Record<AnimalId, [string, string, string]> = {
  panda: ["#4c754f", "#86a588", "#8fb48a"], // bamboo
  cat: ["#a8506a", "#c98d9f", "#e9aeb6"],
  rabbit: ["#5b6aa8", "#949fca", "#edbcc6"],
  fox: ["#a8521d", "#cc8b63", "#d99a66"],
  bear: ["#8a5a2e", "#b69375", "#c99c6e"],
  otter: ["#2f7480", "#6ea1a9", "#b98d64"], // river
  red_panda: ["#a4492b", "#c98e7b", "#c97f5e"],
  koala: ["#4c7566", "#86a599", "#b8bcc4"], // eucalyptus
  hamster: ["#8a6017", "#bd995e", "#d9c4a8"],
  squirrel: ["#9a5222", "#c18e6d", "#c08552"],
};

/** app.css's base surfaces and text, per mode. */
export const BASE = {
  light: { bg: "#fafbfc", surface: "#ffffff", surface2: "#f3f5f7", line: "#f1f3f5", hover: "#eef1f4", border: "#e3e6ea", text: "#1a2b3c", text2: "#4b5a6a", text3: "#5f6b78", ink: "#ffffff" },
  dark: { bg: "#0f151c", surface: "#161e27", surface2: "#1c2530", line: "#202932", hover: "#202a35", border: "#28323d", text: "#e6ebf0", text2: "#b4bec9", text3: "#7c8894", ink: "#0f151c" },
};

/** How much of the tint each surface takes, per mode. */
const TINT = {
  light: { bg: 0.06, surface: 0.025, surface2: 0.08, line: 0.08, hover: 0.11, border: 0.16 },
  dark: { bg: 0.06, surface: 0.06, surface2: 0.07, line: 0.08, hover: 0.1, border: 0.18 },
};

function rgb(hex: string): number[] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

/** `t` of `a` over `b`, as hex. */
export function mix(a: string, b: string, t: number): string {
  const [x, y] = [rgb(a), rgb(b)];
  return `#${x.map((v, i) => Math.round(v * t + y[i] * (1 - t)).toString(16).padStart(2, "0")).join("")}`;
}

/** WCAG 2 contrast ratio of two hex colours. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = rgb(hex).map((v) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export type Mode = "light" | "dark";

/** The tokens a primary (and, for a companion theme, a tint) sets in one mode. */
export function tokensFor(mode: Mode, primary: string | null, tint: string | null): Record<string, string> {
  const base = BASE[mode];
  const out: Record<string, string> = {};
  if (primary) {
    out["--primary"] = primary;
    out["--primary-soft"] = mix(primary, base.surface, mode === "light" ? 0.14 : 0.22);
    out["--chart"] = primary;
  }
  if (tint) {
    const t = TINT[mode];
    out["--bg"] = mix(tint, base.bg, t.bg);
    out["--surface"] = mix(tint, base.surface, t.surface);
    out["--surface-2"] = mix(tint, base.surface2, t.surface2);
    out["--line"] = mix(tint, base.line, t.line);
    out["--hover"] = mix(tint, base.hover, t.hover);
    out["--border"] = mix(tint, base.border, t.border);
    // app.css's faint text is 4.6:1 on its dark card; any tint would take it under 4.5.
    if (mode === "dark") out["--text-3"] = "#8f9aa6";
  }
  return out;
}
