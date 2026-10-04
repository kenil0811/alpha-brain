/**
 * A width the person sets by dragging a border, kept per window (a per-viewer convenience in
 * localStorage, never world data). Returns the width, the drag start handler and whether a
 * drag is on. `grow` says which way a drag to the right makes the pane bigger: the rail grows
 * rightwards, the panel grows leftwards. While a drag is on the whole window keeps the
 * two-sided cursor and selects no text (the pointer leaves the thin handle at once); the arrow
 * keys on the handle step the width too (Vikas's PR #3 behaviour, on main's hook).
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
    const body = document.body.style;
    const before = { cursor: body.cursor, userSelect: body.userSelect };
    body.cursor = "ew-resize";
    body.userSelect = "none";
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
      body.cursor = before.cursor;
      body.userSelect = before.userSelect;
    };
  }, [active, grow, min, max]);

  // The handle as a keyboard control: the arrow pointing the way the pane grows widens it.
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 48 : 16;
      const toward = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
      if (!toward) return;
      event.preventDefault();
      setWidth((w) => Math.min(max, Math.max(min, w + (grow === "right" ? toward : -toward) * step)));
    },
    [grow, min, max],
  );

  useEffect(() => {
    try {
      localStorage.setItem(key, String(width));
    } catch {
      /* per-window convenience only */
    }
  }, [key, width]);

    /** Spread on the border: a focusable vertical separator with its value. */
  const handle = { onPointerDown, onKeyDown, tabIndex: 0, role: "separator", "aria-orientation": "vertical" as const, "aria-valuenow": width, "aria-valuemin": min, "aria-valuemax": max };
  return { width, onPointerDown, onKeyDown, handle, active };
}
