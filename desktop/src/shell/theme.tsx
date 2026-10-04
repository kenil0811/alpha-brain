/** The appearance setting: follow the Mac (the default, with nothing stored), or force light or
 *  dark. Kept per window. The rest of the appearance (accent, font, density…) is appearance.tsx. */
import { useCallback, useEffect, useState } from "react";
import { Segmented } from "../ui";
import { reapplyAppearance } from "./appearance";

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
  useEffect(reapplyAppearance, []);
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

export function ThemeControl({ theme, onChange }: { theme: Theme; onChange: (next: Theme) => void }) {
  return <Segmented label="Theme" value={theme} options={[{ value: "system", label: "Match Mac" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} onChange={onChange} />;
}
