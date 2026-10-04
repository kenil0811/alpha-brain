/** Settings → Appearance beyond light and dark (pull request #3's): the accent colour, the
 *  companion's colours, the font, text size, density, corners, contrast and motion. Kept per
 *  window like the theme and applied on the document root. Contrast and motion follow the Mac
 *  unless the person asks for more. Text size zooms the window, since the shell is sized in px.
 *  Colours go into one <style> as app.css's tokens for light and dark, so its modes keep
 *  working. */
import { useState } from "react";
import type { Client } from "../core/client";
import { ANIMALS, normaliseLook, type AnimalId } from "../avatar/looks";
import { ACCENTS, COMPANION_PALETTES, tokensFor, type Mode } from "./palettes";

export interface Appearance {
  /** An ACCENTS value, or "companion" for the companion's own primary. */
  accent: string;
  /** Surfaces and borders take the companion's tint. */
  companion: boolean;
  font: string;
  size: "small" | "default" | "large";
  density: "compact" | "comfortable";
  corners: "sharp" | "default" | "round";
  contrast: "system" | "high";
  motion: "system" | "reduce";
}

const KEY = "alpha.appearance";
// The animal the companion is, as last read from the world, so the window opens in its colours.
const ANIMAL_KEY = "alpha.appearance.animal";
export const DEFAULT_APPEARANCE: Appearance = { accent: "steel", companion: false, font: "geist", size: "default", density: "compact", corners: "default", contrast: "system", motion: "system" };

/** Geist and Source Serif ship with the app; the rest are the Mac's own. */
export const FONTS: { value: string; label: string; stack: string | null }[] = [
  { value: "geist", label: "Geist", stack: null }, // app.css's --font-ui
  { value: "system", label: "San Francisco", stack: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' },
  { value: "rounded", label: "SF Rounded", stack: 'ui-rounded, "SF Pro Rounded", -apple-system, sans-serif' },
  { value: "avenir", label: "Avenir Next", stack: '"Avenir Next", Avenir, -apple-system, sans-serif' },
  { value: "helvetica", label: "Helvetica Neue", stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { value: "newyork", label: "New York", stack: 'ui-serif, "New York", Georgia, serif' },
  { value: "serif", label: "Source Serif", stack: '"Source Serif 4 Variable", Georgia, serif' },
];
const ZOOM = { small: 0.93, default: 1, large: 1.07 };

export function readAppearance(): Appearance {
  try {
    return { ...DEFAULT_APPEARANCE, ...(JSON.parse(localStorage.getItem(KEY) ?? "{}") as Partial<Appearance>) };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function readAnimal(): AnimalId {
  try {
    const raw = localStorage.getItem(ANIMAL_KEY);
    return ANIMALS.some((a) => a.id === raw) ? (raw as AnimalId) : "panda";
  } catch {
    return "panda";
  }
}

/** The palette CSS for an appearance and an animal, light and dark; "" for app.css's own. */
export function paletteCss(a: Appearance, animal: AnimalId): string {
  const palette = COMPANION_PALETTES[animal];
  const pair = a.accent === "companion" ? [palette[0], palette[1]] : (ACCENTS.find((x) => x.value === a.accent)?.pair ?? null);
  const block = (mode: Mode) =>
    Object.entries(tokensFor(mode, pair ? pair[mode === "light" ? 0 : 1] : null, a.companion ? palette[2] : null))
      .map(([k, v]) => `${k}: ${v};`)
      .join(" ");
  const [light, dark] = [block("light"), block("dark")];
  if (!light) return "";
  return `:root { ${light} }\n:root[data-theme="dark"] { ${dark} }\n@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${dark} } }`;
}

export function applyAppearance(a: Appearance, animal: AnimalId = readAnimal()): void {
  const root = document.documentElement;
  const font = FONTS.find((x) => x.value === a.font)?.stack;
  if (font) root.style.setProperty("--font-ui", font);
  else root.style.removeProperty("--font-ui");
  root.style.setProperty("zoom", a.size === "default" ? "" : String(ZOOM[a.size] ?? 1));
  // Default values leave the root as app.css expects it.
  for (const [name, value, plain] of [["density", a.density, "compact"], ["corners", a.corners, "default"], ["contrast", a.contrast, "system"], ["motion", a.motion, "system"]] as const) {
    if (value === plain) delete root.dataset[name];
    else root.dataset[name] = value;
  }
  let style = document.getElementById("alpha-palette");
  if (!style) {
    style = document.createElement("style");
    style.id = "alpha-palette";
    document.head.appendChild(style);
  }
  style.textContent = paletteCss(a, animal);
}

export function reapplyAppearance(): void {
  applyAppearance(readAppearance());
}

/** Read which animal the companion is now (the world's `companion_look`) and take its colours. */
export function followCompanion(client: Client): void {
  client
    .preference("companion_look")
    .then((p) => {
      const animal = normaliseLook(p.value).animal;
      try {
        localStorage.setItem(ANIMAL_KEY, animal);
      } catch {
        /* this window only */
      }
      applyAppearance(readAppearance(), animal);
    })
    .catch(() => undefined); // the colours stay as they were
}

export function useAppearance(): [Appearance, (change: Partial<Appearance>) => void] {
  const [appearance, setAppearance] = useState(readAppearance);
  function update(change: Partial<Appearance>) {
    const next = { ...appearance, ...change };
    setAppearance(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {
      /* per-window convenience only */
    }
    applyAppearance(next);
  }
  return [appearance, update];
}
