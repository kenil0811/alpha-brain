/**
 * A table's views (Table, Board, List…) in its toolbar (13 Oct, after Q42 section 9; Kenil: "yes
 * do the view dropdown fix"): the row of tabs while it fits, one "View: Table ▾" menu when the
 * toolbar is too narrow for it (a window of 1100 with the assistant panel open broke the tabs'
 * words in two). The fit is measured, as the list tabs' is: the tabs' own width, out of sight,
 * against the room the rest of the toolbar leaves (the list tabs counted at their smallest, All
 * and +, since they make room for themselves with More).
 */
import { useLayoutEffect, useRef, useState } from "react";
import { Popover, Tabs } from "../../ui";
import { Check, ChevronDown } from "../../ui/icons";

export interface ViewItem<T extends string> {
  id: T;
  label: string;
}

/** The width the list tabs need at their smallest: their first tab (All) and their + button. */
function listTabsLeast(el: HTMLElement): number {
  const all = el.querySelector<HTMLElement>('[role="tab"]');
  const add = el.querySelector<HTMLElement>(".listtabs__add");
  return (all?.getBoundingClientRect().width ?? 0) + (add?.getBoundingClientRect().width ?? 0) + 8;
}

export function ViewPicker<T extends string>({ items, value, onChange }: { items: ViewItem<T>[]; value: T; onChange: (id: T) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const measure = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const [open, setOpen] = useState(false);
  const labels = items.map((i) => i.label).join("|");

  useLayoutEffect(() => {
    const toolbar = box.current?.parentElement;
    if (!toolbar || !measure.current) return;
    const compute = () => {
      // the measuring row has no width of its own (it is out of sight): its tabs, gaps and frame
      const tabs = (Array.from(measure.current!.children) as HTMLElement[]).map((c) => c.getBoundingClientRect().width);
      const natural = tabs.reduce((a, w) => a + w, 0) + Math.max(0, tabs.length - 1) * 2 + 8;
      if (!tabs.some((w) => w > 0)) {
        setCompact(false); // nothing measured (a test's document): the tabs show
        return;
      }
      const cs = getComputedStyle(toolbar);
      const gap = parseFloat(cs.columnGap) || 0;
      let room = toolbar.clientWidth - parseFloat(cs.paddingLeft || "0") - parseFloat(cs.paddingRight || "0");
      for (const el of Array.from(toolbar.children) as HTMLElement[]) {
        if (el === box.current || el === measure.current || el.classList.contains("spacer") || el.classList.contains("listtabs--measure")) continue;
        room -= (el.classList.contains("listtabs") ? listTabsLeast(el) : el.getBoundingClientRect().width) + gap;
      }
      setCompact(natural > room);
    };
    compute();
    if (typeof ResizeObserver === "undefined") return;
    const watch = new ResizeObserver(compute);
    watch.observe(toolbar);
    return () => watch.disconnect();
  }, [labels]);

  const current = items.find((i) => i.id === value) ?? items[0];
  return (
    <>
      <div ref={box} className="viewpick">
        {compact ? (
          <Popover
            open={open}
            onOpenChange={setOpen}
            label="Views"
            align="start"
            trigger={
              <button type="button" className="btn btn--sm viewpick__btn" aria-label={`View: ${current.label}. Pick another`}>
                <span className="faint">View:</span> {current.label} <ChevronDown size={13} aria-hidden="true" />
              </button>
            }
          >
            <div className="colmenu">
              {items.map((i) => (
                <button key={i.id} type="button" className="menu__item" aria-current={i.id === value ? "true" : undefined} onClick={() => { setOpen(false); onChange(i.id); }}>
                  <span className="viewpick__tick">{i.id === value ? <Check size={14} aria-label="shown" /> : null}</span>
                  {i.label}
                </button>
              ))}
            </div>
          </Popover>
        ) : (
          <Tabs className="toggle toggle--views" label="View" value={value} onChange={onChange} items={items} />
        )}
      </div>
      {/* the tabs at their own width, out of sight, so the fit is measured, not guessed */}
      <div ref={measure} className="toggle toggle--views listtabs--measure" aria-hidden="true">
        {items.map((i) => (
          <button key={i.id} type="button" tabIndex={-1}>
            {i.label}
          </button>
        ))}
      </div>
    </>
  );
}
