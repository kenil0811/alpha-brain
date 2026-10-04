/**
 * A width the person sets by dragging a border, kept per window (a per-viewer convenience in
 * localStorage, never world data). Returns the width, the drag start handler and whether a
 * drag is on. `grow` says which way a drag to the right makes the pane bigger: the rail grows
 * rightwards, the panel grows leftwards.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export function useDragWidth(key: string, initial: number, min: number, max: number, grow: "right" | "left") {
  const [width, setWidth] = useState<number>(() => {
    try {
      const raw = localStorage.getItem(key);
      const n = raw ? Number(raw) : NaN;
      return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : initial;
    } catch {
      return initial;
    }
  });
  const [active, setActive] = useState(false);
  const start = useRef<{ x: number; width: number } | null>(null);

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
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
      setWidth(Math.min(max, Math.max(min, Math.round(next))));
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
  }, [active, grow, min, max]);

  useEffect(() => {
    try {
      localStorage.setItem(key, String(width));
    } catch {
      /* per-window convenience only */
    }
  }, [key, width]);

  return { width, onPointerDown, active };
}
