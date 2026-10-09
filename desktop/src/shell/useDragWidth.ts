/**
 * A side panel's width, which the person sets and the window remembers (a per-viewer convenience
 * in localStorage, never world data). Three sizes in all (the UI rulebook §3): folded (the
 * caller's own, a strip), normal, and wide, which is any width from `wide` up, reached by
 * dragging the inner edge, with the arrow keys on the focused handle (Home and End go to the
 * ends), or by double-clicking the handle (normal ↔ wide). `grow` says which way a drag to the
 * right makes the pane bigger: the sidebar grows rightwards, the assistant panel leftwards.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export interface PanelWidth {
  /** The normal width: what Escape steps back to, and the first-time width. */
  initial: number;
  min: number;
  max: number;
  /** From this width up the panel counts as wide. */
  wide: number;
  grow: "right" | "left";
}

const STEP = 16;

export function useDragWidth(key: string, { initial, min, max, wide, grow }: PanelWidth) {
  const clamp = useCallback((n: number) => Math.min(max, Math.max(min, Math.round(n))), [min, max]);
  const [width, setWidthState] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(key);
      const n = raw ? Number(raw) : NaN;
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : initial;
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
      setWidth(start.current.width + (grow === "right" ? delta : -delta));
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
  }, [active, grow, setWidth]);

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
    else if (event.key === "End") setWidth(max);
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
    bounds: { min, max },
  };
}
