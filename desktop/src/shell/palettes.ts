/** Accent colours and the companion themes, as light and dark token values. Each companion gets
 *  a primary for each mode and a tint (the animal's own colour) that the surfaces and borders
 *  take a few percent of. Every value keeps body text and button text at 4.5:1 or better
 *  (palettes.test.ts checks it). */

/** [light primary, dark primary]. */
export type Pair = [string, string];

/** Steel is tokens.css's own --bridge-steel; the rest replace it in both modes. */
export const ACCENTS: { value: string; label: string; pair: Pair | null }[] = [
  { value: "steel", label: "Steel", pair: null },
  { value: "sage", label: "Sage", pair: ["#5b7556", "#7d9378"] },
  { value: "forest", label: "Forest", pair: ["#3d6b45", "#719276"] },
  { value: "teal", label: "Teal", pair: ["#2a7378", "#5b9397"] },
  { value: "indigo", label: "Indigo", pair: ["#4a55a8", "#8189c2"] },
  { value: "plum", label: "Plum", pair: ["#7a5a9a", "#987fb1"] },
  { value: "rose", label: "Rose", pair: ["#a95667", "#bf7886"] },
  { value: "terracotta", label: "Terracotta", pair: ["#b4532f", "#c57a5e"] },
  { value: "amber", label: "Amber", pair: ["#946834", "#b5803f"] },
  { value: "graphite", label: "Graphite", pair: ["#4a5563", "#878f97"] },
];

/** Per species id (avatar/zazoo/species.ts): light primary, dark primary, tint. */
export const COMPANION_PALETTES: Record<string, [string, string, string]> = {
  zazoo: ["#4c754f", "#7e9d80", "#8fb48a"], // bamboo
  mia: ["#a8506a", "#c28597", "#e9aeb6"],
  clover: ["#5b6aa8", "#8c97c2", "#edbcc6"],
  freya: ["#b0561f", "#c5835b", "#d99a66"],
  bella: ["#8a5a2e", "#ae8b6d", "#c99c6e"],
  pippa: ["#2f7480", "#6699a1", "#b98d64"], // river
  riya: ["#8a6a1f", "#aa915b", "#c9ae84"],
  maple: ["#a4492b", "#c38673", "#c97f5e"],
  willow: ["#3d6b4f", "#789784", "#a8845e"], // pine
  kiki: ["#4c7566", "#7e9d91", "#b8bcc4"], // eucalyptus
  hazel: ["#946619", "#b59156", "#d9c4a8"],
  ruby: ["#a83246", "#cb8490", "#c7cbd6"],
  sasha: ["#5e6b3a", "#8f9775", "#b4a488"],
  nova: ["#1f6f7a", "#639ba2", "#5e8c94"],
  aria: ["#2f6aa3", "#6e97bf", "#b0906a"], // sky
  olive: ["#6b6b2a", "#97976b", "#a89878"],
  pearl: ["#2f6f9a", "#6e9bb9", "#d8dce4"], // ice
  poppy: ["#b03a2e", "#cb7c74", "#b4936a"],
  sage: ["#4f6b3f", "#849779", "#8fa379"],
  coco: ["#7a4f35", "#a78a79", "#9c8672"],
  bree: ["#8a5530", "#ae896e", "#a97c54"],
  suki: ["#9a5222", "#b98665", "#c08552"],
  luna: ["#7050a0", "#a08bc0", "#b7a3c9"],
  stella: ["#aa531c", "#cb855a", "#e0956b"],
  bonnie: ["#7a5a8a", "#a791b2", "#ede6da"], // heather
  greta: ["#4f6680", "#8a9aaa", "#d8cdbb"], // alpine
  daisy: ["#4a7a3a", "#81a275", "#e3d9c8"], // meadow
  bess: ["#7a4a2a", "#a78772", "#7a5c44"],
  rosie: ["#b04a6a", "#c88197", "#e8b4a8"],
  coral: ["#b84a3a", "#ce8175", "#7fa3b8"],
};

/** tokens.css's base surfaces and text, per mode. */
export const BASE = {
  light: { bg: "#fafbfc", surface: "#ffffff", line: "#f1f3f5", hover: "#eef0f0", border: "#e3e6ea", text: "#1a2b3c", text2: "#2e4057", ink: "#ffffff" },
  dark: { bg: "#10151b", surface: "#1a2129", line: "#1e252d", hover: "#161e27", border: "#2a323c", text: "#eceae3", text2: "#c7cbd1", ink: "#10151b" },
};

/** How much of the tint each surface takes, per mode. */
const TINT = {
  light: { bg: 0.06, surface: 0.025, line: 0.08, hover: 0.11, border: 0.16 },
  dark: { bg: 0.07, surface: 0.07, line: 0.09, hover: 0.1, border: 0.18 },
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

/** The --bridge-* values a primary (and, for a companion theme, a tint) sets in one mode. */
export function tokensFor(mode: Mode, primary: string | null, tint: string | null): Record<string, string> {
  const base = BASE[mode];
  const out: Record<string, string> = {};
  if (primary) {
    out["--bridge-steel"] = primary;
    out["--bridge-steel-light"] = mix(primary, mode === "light" ? "#ffffff" : base.surface, 0.65);
    out["--bridge-info"] = primary;
  }
  if (tint) {
    const t = TINT[mode];
    out["--bridge-bg"] = mix(tint, base.bg, t.bg);
    out["--bridge-surface"] = mix(tint, base.surface, t.surface);
    out["--bridge-line-soft"] = mix(tint, base.line, t.line);
    out["--bridge-row-hover"] = mix(tint, base.hover, t.hover);
    out["--bridge-border"] = mix(tint, base.border, t.border);
  }
  return out;
}
