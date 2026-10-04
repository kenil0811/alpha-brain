/**
 * What the window shows for a control whose core or host side isn't built yet: the control sits
 * where it will live and looks normal, and using it says so instead of doing nothing. Each one is
 * listed in docs/development/backend-requests.md.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { Badge } from "./Badge";

const SoonContext = createContext<((what: string) => void) | null>(null);

/** One short line at the bottom of the window, the same `.toast` Home uses. */
export function SoonProvider({ children }: { children: ReactNode }) {
  const [line, setLine] = useState<{ text: string; at: number } | null>(null);
  useEffect(() => {
    if (!line) return;
    const t = setTimeout(() => setLine(null), 3500);
    return () => clearTimeout(t);
  }, [line]);
  const say = useCallback((what: string) => setLine({ text: `${what} is coming soon.`, at: Date.now() }), []);
  return (
    <SoonContext.Provider value={say}>
      {children}
      {line ? (
        <div key={line.at} className="toast" role="status">
          {line.text}
        </div>
      ) : null}
    </SoonContext.Provider>
  );
}

/** `soon("Undo")` says "Undo is coming soon." (nothing outside a SoonProvider). */
export function useComingSoon(): (what: string) => void {
  return useContext(SoonContext) ?? noop;
}
const noop = () => undefined;

/** A row's marker that it isn't wired yet. */
export function SoonBadge() {
  return <Badge tone="gray">Coming soon</Badge>;
}
