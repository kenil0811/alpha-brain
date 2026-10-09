import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Tabs } from "./Tabs";

export interface HeaderSwitchItem<T extends string> {
  id: T;
  label: string;
  icon: ReactNode;
}

/** The centred pill switch for a page's sections (the UI rulebook §5): small uppercase labels with
 *  icons, the active segment raised, never wrapping. When the header is too narrow the labels
 *  drop and only the icons show; each label stays as the segment's accessible name and tooltip.
 *  A `Tabs` with a look, so the arrow keys, Home and End already work. (9 Oct, phase 1.) */
export function HeaderSwitch<T extends string>({ items, value, onChange, label }: { items: HeaderSwitchItem<T>[]; value: T; onChange: (id: T) => void; label: string }) {
  const box = useRef<HTMLDivElement>(null);
  const fullWidth = useRef(0); // the width with labels, measured while they show
  const [iconsOnly, setIconsOnly] = useState(false);
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

  return (
    <div className="hswitch__box" ref={box}>
      <Tabs
        className={`hswitch${iconsOnly ? " hswitch--icons" : ""}`}
        label={label}
        value={value}
        onChange={onChange}
        items={items.map((i) => ({
          id: i.id,
          tip: iconsOnly ? i.label : undefined,
          label: (
            <>
              <span aria-hidden="true" className="hswitch__ico">
                {i.icon}
              </span>
              {iconsOnly ? null : i.label}
            </>
          ),
        }))}
      />
    </div>
  );
}
