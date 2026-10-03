import { useRef } from "react";
import type { ReactNode } from "react";

export interface TabItem<T extends string> {
  id: T;
  label: ReactNode;
}

/** A row of tabs with a keyboard path: arrow keys move, Home and End jump, the selected tab is
 *  the one in the tab order. `className` picks the look (`subtabs`, `toggle`). */
export function Tabs<T extends string>({ items, value, onChange, label, className = "subtabs", style }: { items: TabItem<T>[]; value: T; onChange: (id: T) => void; label?: string; className?: string; style?: React.CSSProperties }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const move = (from: number, to: number) => {
    const next = ((to % items.length) + items.length) % items.length;
    if (next === from) return;
    onChange(items[next].id);
    refs.current[next]?.focus();
  };
  return (
    <div className={className} role="tablist" aria-label={label} style={style}>
      {items.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          role="tab"
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
          {t.label}
        </button>
      ))}
    </div>
  );
}
