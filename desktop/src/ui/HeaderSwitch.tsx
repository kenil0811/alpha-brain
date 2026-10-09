import { useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Tooltip } from "./Tooltip";

export interface HeaderSwitchItem<T extends string> {
  id: T;
  label: string;
  icon: ReactNode;
  /** A product name's plain subtitle (the UI rulebook §2, `subtitles.ts`): the tab's accessible
   *  description and its tooltip on hover and keyboard focus. */
  hint?: string;
}

/** The centred pill switch for a page's sections (the UI rulebook §5): small uppercase labels with
 *  icons, the active segment raised, never wrapping. When the header is too narrow the labels
 *  drop and only the icons show; each label stays as the segment's accessible name and tooltip.
 *  The keyboard path is `Tabs`' (arrow keys, Home, End), drawn here because a tab's tooltip may
 *  say its hint while its name stays its label. (9 Oct, phase 1; hints the same day.) */
export function HeaderSwitch<T extends string>({ items, value, onChange, label }: { items: HeaderSwitchItem<T>[]; value: T; onChange: (id: T) => void; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const fullWidth = useRef(0); // the width with labels, measured while they show
  const [iconsOnly, setIconsOnly] = useState(false);
  const uid = useId();
  const words = items.map((i) => i.label).join("|");

  // new labels: forget the width and show them again, so the next pass measures them
  useLayoutEffect(() => {
    fullWidth.current = 0;
    setIconsOnly(false);
  }, [words]);

  useLayoutEffect(() => {
    const outer = box.current;
    const inner = outer?.firstElementChild as HTMLElement | null;
    if (!outer || !inner) return;
    const fit = () => {
      if (!iconsOnly) fullWidth.current = inner.offsetWidth;
      setIconsOnly(fullWidth.current > outer.clientWidth);
    };
    fit();
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(fit);
    watch.observe(outer);
    return () => watch.disconnect();
  }, [iconsOnly, words]);

  const move = (from: number, to: number) => {
    const next = ((to % items.length) + items.length) % items.length;
    if (next === from) return;
    onChange(items[next].id);
    refs.current[next]?.focus();
  };

  return (
    <div className="hswitch__box" ref={box}>
      <div className={`hswitch${iconsOnly ? " hswitch--icons" : ""}`} role="tablist" aria-label={label}>
        {items.map((t, i) => {
          const hintId = t.hint ? `${uid}-${t.id}` : undefined;
          const tip = [iconsOnly ? t.label : null, t.hint].filter(Boolean).join(" — ");
          const tab = (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              aria-label={iconsOnly ? t.label : undefined}
              aria-describedby={hintId}
              aria-selected={value === t.id}
              tabIndex={value === t.id ? 0 : -1}
              onClick={() => onChange(t.id)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowDown") move(i, i + 1);
                else if (e.key === "ArrowLeft" || e.key === "ArrowUp") move(i, i - 1);
                else if (e.key === "Home") move(i, 0);
                else if (e.key === "End") move(i, items.length - 1);
                else return;
                e.preventDefault();
              }}
            >
              <span aria-hidden="true" className="hswitch__ico">
                {t.icon}
              </span>
              {iconsOnly ? null : t.label}
            </button>
          );
          return tip ? (
            <Tooltip key={t.id} text={tip}>
              {tab}
            </Tooltip>
          ) : (
            tab
          );
        })}
      </div>
      {items.map((t) =>
        t.hint ? (
          <span key={t.id} id={`${uid}-${t.id}`} hidden>
            {t.hint}
          </span>
        ) : null,
      )}
    </div>
  );
}
