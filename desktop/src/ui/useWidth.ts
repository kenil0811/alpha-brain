import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** The pixel width of an element, kept up to date as it is resized (9 Oct, the UI rulebook §6).
 *  A chart draws at this width with a viewBox of the same size, so its text stays at the type
 *  scale instead of growing with the tile. `fallback` is used until the first measure (and where
 *  nothing is laid out, as in tests). */
export function useWidth<T extends HTMLElement>(fallback: number): [(el: T | null) => void, number] {
  const [width, setWidth] = useState(fallback);
  const node = useRef<T | null>(null);
  const ref = useCallback((el: T | null) => {
    node.current = el;
  }, []);
  useLayoutEffect(() => {
    const el = node.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const fit = () => {
      const w = Math.round(el.clientWidth);
      if (w) setWidth(w);
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, []);
  return [ref, width];
}
