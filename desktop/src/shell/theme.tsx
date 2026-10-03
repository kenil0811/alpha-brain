/** The appearance setting: follow the Mac, force light or dark, or Ambient (light from 7:00 to
 * 19:00, dark otherwise). Follows the Mac until the person picks another. Kept per window. */
import { useCallback, useEffect, useState } from "react";
import { Segmented } from "../ui/Segmented";
import { useLookChange } from "../avatar/look";
import { reapplyAppearance } from "./appearance";

export type Theme = "system" | "light" | "dark" | "ambient";
const KEY = "alpha.theme";

export function readTheme(): Theme {
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
  useEffect(reapplyAppearance, []);
  // A new companion can bring its own colours, so the palette follows the avatar too.
  useLookChange(reapplyAppearance);
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
      window.localStorage.setItem(KEY, next);
    } catch {
      /* per-window convenience only */
    }
  }, []);
  return [theme, setTheme];
}

export function ThemeControl({ theme, onChange, compact = false }: { theme: Theme; onChange: (next: Theme) => void; compact?: boolean }) {
  const options: { value: Theme; label: string }[] = compact
    ? [{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }]
    : [{ value: "system", label: "Match Mac" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "ambient", label: "Ambient" }];
  // Compact has no "Match Mac", so it marks whichever the Mac is showing.
  return <Segmented label="Appearance" value={compact && theme === "system" ? currentSystem() : theme} options={options} onChange={onChange} />;
}

function currentSystem(): Theme {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
