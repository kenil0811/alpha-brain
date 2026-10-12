/** The bubbles over the page in `<main>`: mounted once; each anchored to its element, following it
 *  on scroll and resize, all gone when the page changes. Hover or Enter/Space opens one; a scrub
 *  across it (3 turns of the pointer within 600 ms) or Delete/Escape pops it. */
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBubbles, type Bubble } from "./bubbles";

const SCRUB_TURNS = 3;
const SCRUB_MS = 600;
const POP_MS = 200;

export function BubbleLayer({ page }: { page: string }) {
  const { bubbles, clear, remove } = useBubbles();
  const [, setTick] = useState(0);
  useEffect(() => clear, [page, clear]);
  useEffect(() => {
    if (!bubbles.length) return;
    const move = () => setTick((n) => n + 1);
    window.addEventListener("scroll", move, true);
    window.addEventListener("resize", move);
    return () => {
      window.removeEventListener("scroll", move, true);
      window.removeEventListener("resize", move);
    };
  }, [bubbles.length]);
  return createPortal(
    <>
      {bubbles.map((b) => (b.el.isConnected ? <BubbleMark key={b.id} b={b} onGone={() => remove(b.id)} /> : null))}
    </>,
    document.body,
  );
}

function BubbleMark({ b, onGone }: { b: Bubble; onGone: () => void }) {
  const [open, setOpen] = useState(false);
  const [popping, setPopping] = useState(false);
  const scrub = useRef({ x: 0, dir: 0, turns: [] as number[] });
  const r = b.el.getBoundingClientRect();
  const pop = () => {
    if (popping) return;
    setPopping(true);
    const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(onGone, still ? 0 : POP_MS);
  };
  const label = b.text ? `Alpha's note: ${b.text}` : "Alpha points here";
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={label}
      aria-expanded={b.text ? open : undefined}
      className={`bubble${open && b.text ? " bubble--open" : ""}${popping ? " bubble--pop" : ""}`}
      style={{ top: r.top, left: r.right }}
      onPointerEnter={() => setOpen(true)}
      onPointerLeave={() => setOpen(false)}
      onPointerMove={(e) => {
        const s = scrub.current;
        const dir = Math.sign(e.clientX - s.x);
        s.x = e.clientX;
        if (!dir) return;
        if (s.dir && dir !== s.dir) {
          const now = Date.now();
          s.turns = [...s.turns.filter((t) => now - t < SCRUB_MS), now];
          if (s.turns.length >= SCRUB_TURNS) pop();
        }
        s.dir = dir;
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen((o) => !o);
        } else if (e.key === "Delete" || e.key === "Backspace" || e.key === "Escape") {
          e.preventDefault();
          pop();
        }
      }}
    >
      {open && b.text ? <span className="bubble__text">{b.text}</span> : null}
    </div>
  );
}
