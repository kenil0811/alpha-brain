import type { ReactNode } from "react";
import { ChevronRight } from "./icons";

/** The header band every page has, at the one shared height (`--header-h`) and sticky (the UI
 *  rulebook §3 and §5): a left slot (a back link or breadcrumb), a centre slot (a `HeaderSwitch`
 *  for a page with sections, or the page's title in serif when it has only one), and a right slot
 *  (actions, ⋯). Pass `title` for the single-section case. (9 Oct, phase 1.) */
export function PageHeader({ left, centre, title, right }: { left?: ReactNode; centre?: ReactNode; title?: string; right?: ReactNode }) {
  return (
    <header className="pagehead">
      <div className="pagehead__left">{left}</div>
      <div className="pagehead__centre">{centre ?? (title ? <h1 className="pagehead__title serif">{title}</h1> : null)}</div>
      <div className="pagehead__right">{right}</div>
    </header>
  );
}

export interface Crumb {
  label: string;
  onClick?: () => void;
}

/** Where this page sits: each item but the last opens its page; the last is plain text and marks
 *  the current page. The separators are an icon, not a character. */
export function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="breadcrumb" aria-label="Breadcrumb">
      <ol>
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${i}-${c.label}`}>
              {last || !c.onClick ? (
                <span aria-current={last ? "page" : undefined}>{c.label}</span>
              ) : (
                <button type="button" onClick={c.onClick}>
                  {c.label}
                </button>
              )}
              {last ? null : (
                <span className="breadcrumb__sep" aria-hidden="true">
                  <ChevronRight />
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
