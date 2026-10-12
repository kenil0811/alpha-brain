/** The appearance setting: follow the Mac, or force light or dark. Kept per window. */
import { useCallback, useEffect, useState } from "react";
import { Toggle } from "../ui";

export type Theme = "system" | "light" | "dark";
const KEY = "alpha.theme";

function readTheme(): Theme {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === "light" || raw === "dark" ? raw : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else root.dataset.theme = theme;
}

export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => (typeof window === "undefined" ? "system" : readTheme()));
  useEffect(() => applyTheme(theme), [theme]);
  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      if (next === "system") window.localStorage.removeItem(KEY);
      else window.localStorage.setItem(KEY, next);
    } catch {
      /* per-window convenience only */
    }
  }, []);
  return [theme, setTheme];
}

export function ThemeControl({ theme, onChange, compact = false }: { theme: Theme; onChange: (next: Theme) => void; compact?: boolean }) {
  const items: { id: Theme; label: string }[] = [...(compact ? [] : [{ id: "system" as const, label: "Match Mac" }]), { id: "light", label: "Light" }, { id: "dark", label: "Dark" }];
  return <Toggle inBody label="Appearance" items={items} value={compact && theme === "system" ? currentSystem() : theme} onChange={onChange} />;
}

function currentSystem(): Theme {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** The person's own look (11 Oct, the owner): the colour of the header and both panels, the colour
 *  of the centre, and the fonts. Kept per window, like the theme; empty means the theme's own. */
export interface Look { chrome?: string; canvas?: string; fontUi?: string; fontHead?: string }
const LOOK_KEY = "alpha.look";

export const UI_FONTS = [
  { value: "", label: "Geist (Alpha's)" },
  { value: "-apple-system, BlinkMacSystemFont, sans-serif", label: "Mac system" },
  { value: "\"Helvetica Neue\", Helvetica, Arial, sans-serif", label: "Helvetica Neue" },
  { value: "\"Avenir Next\", Avenir, sans-serif", label: "Avenir Next" },
];
export const HEAD_FONTS = [
  { value: "", label: "Source Serif (Alpha's)" },
  { value: "ui-serif, \"New York\", Georgia, serif", label: "New York" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "var(--font-ui)", label: "Same as the text" },
];

function readLook(): Look {
  try {
    const raw = JSON.parse(window.localStorage.getItem(LOOK_KEY) ?? "{}") as Look;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

export function applyLook(look: Look): void {
  const style = document.documentElement.style;
  const set = (name: string, value?: string) => (value ? style.setProperty(name, value) : style.removeProperty(name));
  set("--chrome", look.chrome);
  set("--canvas", look.canvas);
  set("--font-ui", look.fontUi);
  set("--font-ed", look.fontHead);
}

export function useLook(): [Look, (next: Look) => void] {
  const [look, setLookState] = useState<Look>(() => (typeof window === "undefined" ? {} : readLook()));
  useEffect(() => applyLook(look), [look]);
  const setLook = useCallback((next: Look) => {
    setLookState(next);
    try {
      window.localStorage.setItem(LOOK_KEY, JSON.stringify(next));
    } catch {
      /* per-window convenience only */
    }
  }, []);
  return [look, setLook];
}

/** WCAG contrast of two #rrggbb colours. */
export function contrast(a: string, b: string): number {
  const lum = (hex: string) => {
    const [r, g, bl] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}
