/**
 * A side panel's width, which the person sets and the window remembers (a per-viewer convenience
 * in localStorage, never world data). Three sizes in all (the UI rulebook §3): folded (the
 * caller's own, a strip), normal, and wide, which is any width from `wide` up, reached by
 * dragging the inner edge, with the arrow keys on the focused handle (Home and End go to the
 * ends), or by double-clicking the handle (normal ↔ wide). `grow` says which way a drag to the
 * right makes the pane bigger: the sidebar grows rightwards, the assistant panel leftwards.
 *
 * (9 Oct, the owner) No cap but the window: `max` is asked at the moment (the window less the
 * other panel), so a panel may widen until the middle is gone. Dragged on past `min` (below half
 * of it), the panel folds to its strip through `onFold`, as its fold button does.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface PanelWidth {
  /** The normal width: what Escape steps back to, and the first-time width. */
  initial: number;
  min: number;
  /** The largest width: a number, or asked at the moment (the window less the other panel). */
  max: number | (() => number);
  /** From this width up the panel counts as wide. */
  wide: number;
  grow: "right" | "left";
  /** Called when a drag goes on past `min`: the caller folds the panel to its strip. */
  onFold?: () => void;
}

const STEP = 16;

export function useDragWidth(key: string, { initial, min, max, wide, grow, onFold }: PanelWidth) {
  const maxNow = useRef(max);
  maxNow.current = max;
  const top = useCallback(() => { const m = maxNow.current; return Math.max(min, typeof m === "function" ? m() : m); }, [min]);
  const fold = useRef(onFold);
  fold.current = onFold;
  const clamp = useCallback((n: number) => Math.min(top(), Math.max(min, Math.round(n))), [min, top]);
  const [width, setWidthState] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(key);
      const n = raw ? Number(raw) : NaN;
      return Number.isFinite(n) ? Math.min(top(), Math.max(min, n)) : initial;
    } catch {
      return initial;
    }
  });
  const setWidth = useCallback((n: number) => setWidthState(clamp(n)), [clamp]);
  const [active, setActive] = useState(false);
  const start = useRef<{ x: number; width: number } | null>(null);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      event.preventDefault();
      start.current = { x: event.clientX, width };
      setActive(true);
    },
    [width],
  );

  useEffect(() => {
    if (!active) return;
    const onMove = (event: PointerEvent) => {
      if (!start.current) return;
      const delta = event.clientX - start.current.x;
      const next = start.current.width + (grow === "right" ? delta : -delta);
      if (fold.current && next < min / 2) {
        // dragged all the way in: fold, keeping the width it had for when it opens again
        start.current = null;
        setActive(false);
        fold.current();
        return;
      }
      setWidth(next);
    };
    const onUp = () => {
      setActive(false);
      start.current = null;
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [active, grow, min, setWidth]);

  useEffect(() => {
    try {
      localStorage.setItem(key, String(width));
    } catch {
      /* per-window convenience only */
    }
  }, [key, width]);

  const isWide = width >= wide;
  /** Arrow keys on the focused handle move the edge the way the arrow points. */
  const onKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const by = event.shiftKey ? STEP * 3 : STEP;
    if (event.key === "ArrowRight") setWidth(width + (grow === "right" ? by : -by));
    else if (event.key === "ArrowLeft") setWidth(width + (grow === "right" ? -by : by));
    else if (event.key === "Home") setWidth(min);
    else if (event.key === "End") setWidth(top());
    else return;
    event.preventDefault();
  };
  return {
    width,
    active,
    wide: isWide,
    onPointerDown,
    onKeyDown,
    onDoubleClick: () => setWidth(isWide ? initial : wide),
    /** Back to normal (what Escape does to a wide panel). */
    narrow: () => setWidth(initial),
    bounds: { min, max: top() },
  };
}
