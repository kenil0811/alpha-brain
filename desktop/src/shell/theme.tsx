/** The appearance setting: follow the Mac, force light or dark, or Ambient (light from 7:00 to
 * 19:00, dark otherwise). Kept per window. */
import { useCallback, useEffect, useState } from "react";
import { applyAppearance, readAppearance } from "./appearance";

export type Theme = "system" | "light" | "dark" | "ambient";
const KEY = "alpha.theme";

function readTheme(): Theme {
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw === "light" || raw === "dark" || raw === "ambient" ? raw : "system";
  } catch {
    return "system";
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "system") delete root.dataset.theme;
  else if (theme === "ambient") {
    const hour = new Date().getHours();
    root.dataset.theme = hour >= 7 && hour < 19 ? "light" : "dark";
  } else root.dataset.theme = theme;
}

export function useTheme(): [Theme, (next: Theme) => void] {
  useEffect(() => applyAppearance(readAppearance()), []);
  const [theme, setThemeState] = useState<Theme>(() => (typeof window === "undefined" ? "system" : readTheme()));
  useEffect(() => {
    applyTheme(theme);
    if (theme !== "ambient") return;
    const timer = window.setInterval(() => applyTheme(theme), 60_000);
    return () => window.clearInterval(timer);
  }, [theme]);
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
  const options: [Theme, string][] = compact ? [["light", "Light"], ["dark", "Dark"]] : [["system", "Match Mac"], ["light", "Light"], ["dark", "Dark"], ["ambient", "Ambient"]];
  return (
    <div className="theme" role="group" aria-label="Appearance">
      {options.map(([value, label]) => (
        <button key={value} type="button" aria-pressed={theme === value || (compact && theme === "system" && value === currentSystem())} onClick={() => onChange(value)}>
          {label}
        </button>
      ))}
    </div>
  );
}

function currentSystem(): Theme {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
