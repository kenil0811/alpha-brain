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
