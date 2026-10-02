/** Settings -> Appearance beyond light/dark: accent colour, the companion's theme, interface
 *  font, text size, density (Alpha's look.density: Compact fits more on screen), corners,
 *  contrast and motion. Kept per window like the theme, applied on the document root (ported
 *  from Alpha). Text size zooms the window, since most of the shell is sized in px. Colours go
 *  into one <style> as --bridge-* values for light and dark, so tokens.css's modes keep working. */
import { useState } from "react";
import { LOOK_EVENT, readLook, type AvatarLook } from "../avatar/look";
import { ACCENTS, COMPANION_PALETTES, tokensFor, type Mode } from "./palettes";

export { ACCENTS } from "./palettes";

export interface Appearance {
  /** An ACCENTS value, or "companion" for the companion's own primary. */
  accent: string;
  /** Surfaces and borders take the companion's tint. */
  companion: boolean;
  font: string;
  size: string;
  density: string;
  corners: string;
  contrast: string;
  motion: string;
}

const KEY = "alpha.appearance";
const DEFAULTS: Appearance = { accent: "steel", companion: false, font: "geist", size: "default", density: "compact", corners: "default", contrast: "standard", motion: "system" };

export const DENSITIES: { value: string; label: string }[] = [
  { value: "compact", label: "Compact" },
  { value: "comfortable", label: "Comfortable" },
];

/** Geist and Source Serif ship with the app; the rest are the Mac's own. */
export const FONTS: { value: string; label: string; stack: string | null }[] = [
  { value: "geist", label: "Geist", stack: null }, // app.css default
  { value: "system", label: "San Francisco", stack: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' },
  { value: "rounded", label: "SF Rounded", stack: 'ui-rounded, "SF Pro Rounded", -apple-system, sans-serif' },
  { value: "avenir", label: "Avenir Next", stack: '"Avenir Next", Avenir, -apple-system, sans-serif' },
  { value: "helvetica", label: "Helvetica Neue", stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { value: "newyork", label: "New York", stack: 'ui-serif, "New York", Georgia, serif' },
  { value: "serif", label: "Source Serif", stack: '"Source Serif 4 Variable", "Source Serif 4", Georgia, serif' },
];

export const SIZES: { value: string; label: string; zoom: number }[] = [
  { value: "small", label: "Small", zoom: 0.93 },
  { value: "default", label: "Default", zoom: 1 },
  { value: "large", label: "Large", zoom: 1.07 },
];

export const CORNERS: { value: string; label: string }[] = [
  { value: "sharp", label: "Sharp" },
  { value: "default", label: "Default" },
  { value: "round", label: "Round" },
];

export function readAppearance(): Appearance {
  try {
    return { ...DEFAULTS, ...(JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Partial<Appearance>) };
  } catch {
    return DEFAULTS;
  }
}

/** The palette CSS for an appearance and a companion, light and dark. */
export function paletteCss(a: Appearance, look: AvatarLook): string {
  const palette = COMPANION_PALETTES[look.species] ?? null;
  const pair = a.accent === "companion" ? (palette ? [palette[0], palette[1]] : null) : (ACCENTS.find((x) => x.value === a.accent)?.pair ?? null);
  const block = (mode: Mode) =>
    Object.entries(tokensFor(mode, pair ? pair[mode === "light" ? 0 : 1] : null, a.companion && palette ? palette[2] : null))
      .map(([k, v]) => `${k}: ${v};`)
      .join(" ");
  const light = block("light");
  const dark = block("dark");
  if (!light && !dark) return "";
  return `:root { ${light} }\n:root[data-theme="dark"] { ${dark} }\n@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]):not([data-theme="dark"]) { ${dark} } }`;
}

export function applyAppearance(a: Appearance, look: AvatarLook = readLook()): void {
  const root = document.documentElement;
  const font = FONTS.find((x) => x.value === a.font)?.stack;
  const zoom = SIZES.find((x) => x.value === a.size)?.zoom ?? 1;
  root.style.removeProperty("--primary"); // an older build set the accent inline
  if (font) root.style.setProperty("--font-ui", font);
  else root.style.removeProperty("--font-ui");
  root.style.setProperty("zoom", zoom === 1 ? "" : String(zoom));
  root.dataset.density = a.density === "comfortable" ? "comfortable" : "compact";
  root.dataset.corners = a.corners;
  root.dataset.contrast = a.contrast;
  root.dataset.motion = a.motion;
  let style = document.getElementById("alpha-palette");
  if (!style) {
    style = document.createElement("style");
    style.id = "alpha-palette";
    document.head.appendChild(style);
  }
  style.textContent = paletteCss(a, look);
}

/** Re-reads both and applies them: after a change in this or another window. */
export function reapplyAppearance(): void {
  applyAppearance(readAppearance(), readLook());
}

function store(a: Appearance) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(a));
  } catch {
    /* per-window convenience only */
  }
}

export function useAppearance(): [Appearance, (change: Partial<Appearance>) => void] {
  const [appearance, setAppearance] = useState(readAppearance);
  function update(change: Partial<Appearance>) {
    const next = { ...appearance, ...change };
    setAppearance(next);
    store(next);
    applyAppearance(next);
    window.dispatchEvent(new Event(LOOK_EVENT)); // the avatar's still pose listens

  }
  return [appearance, update];
}
