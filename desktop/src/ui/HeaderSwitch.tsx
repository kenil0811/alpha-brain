import { useId, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Tooltip } from "./Tooltip";

export interface ToggleItem<T extends string> {
  id: T;
  label: string;
  /** Shown before the label; when the room runs short only the icons stay. A segment without one
   *  keeps its label, and the row scrolls instead of wrapping. */
  icon?: ReactNode;
  /** A count after the label ("Allowed 2"), part of the segment's name. */
  count?: number;
  /** A product name's plain subtitle (the UI rulebook §2, `subtitles.ts`): the tab's accessible
   *  description and its tooltip on hover and keyboard focus. */
  hint?: string;
}

/** The one toggle (the UI rulebook §5 and fixed rule 4, 11 Oct): the same pill switch for a page's
 *  sections in the header and for a section's parts in the body (`inBody`: left-aligned, at the
 *  top of what it switches). Small labels with icons, the active segment raised, never wrapping. When the header is too narrow the labels
 *  drop and only the icons show; each label stays as the segment's accessible name and tooltip.
 *  The keyboard path is `Tabs`' (arrow keys, Home, End), drawn here because a tab's tooltip may
 *  say its hint while its name stays its label. (9 Oct, phase 1; hints the same day.) */
export function Toggle<T extends string>({ items, value, onChange, label, inBody = false }: { items: ToggleItem<T>[]; value: T; onChange: (id: T) => void; label: string; inBody?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const fullWidth = useRef(0); // the width with labels, measured while they show
  const [iconsOnly, setIconsOnly] = useState(false);
  const uid = useId();
  const words = items.map((i) => `${i.label}${i.count ?? ""}`).join("|");

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
    <div className={`hswitch__box${inBody ? " hswitch__box--body" : ""}`} ref={box}>
      <div className={`hswitch${iconsOnly ? " hswitch--icons" : ""}`} role="tablist" aria-label={label}>
        {items.map((t, i) => {
          const hintId = t.hint ? `${uid}-${t.id}` : undefined;
          const name = t.count === undefined ? t.label : `${t.label} ${t.count}`;
          const bare = iconsOnly && t.icon; // the label dropped for its icon
          const tip = [bare ? name : null, t.hint].filter(Boolean).join(" — ");
          const tab = (
            <button
              key={t.id}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              aria-label={bare ? name : undefined}
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
              {t.icon ? (
                <span aria-hidden="true" className="hswitch__ico">
                  {t.icon}
                </span>
              ) : null}
              {bare ? null : t.label}
              {t.count === undefined ? null : (
                <>
                  {" "}
                  <span className="hswitch__count">{t.count}</span>
                </>
              )}
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

/** The header's name for the one toggle, kept for the pages that import it. */
export const HeaderSwitch = Toggle;
export type HeaderSwitchItem<T extends string> = ToggleItem<T>;
