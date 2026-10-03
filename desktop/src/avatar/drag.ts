/**
 * Drag or click, told apart by movement: a press that moves more than a few pixels becomes a
 * drag of the companion's window (the host moves it); one that does not is a click. Pure, so
 * the window can test the decision without a window.
 */
export const DRAG_SLOP_PX = 5;

export interface Press {
  x: number;
  y: number;
  dragging: boolean;
}

export function press(x: number, y: number): Press {
  return { x, y, dragging: false };
}

/** The press after the pointer moved to (x, y): a drag once it has gone past the slop. */
export function moved(p: Press, x: number, y: number): Press {
  if (p.dragging) return p;
  return Math.hypot(x - p.x, y - p.y) > DRAG_SLOP_PX ? { ...p, dragging: true } : p;
}

/** What a release means: a click when the press never became a drag. */
export function released(p: Press | null): "click" | "drag" | "nothing" {
  if (!p) return "nothing";
  return p.dragging ? "drag" : "click";
}
