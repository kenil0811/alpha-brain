/**
 * Every page's header, one shape so they all line up: on the left the way here (the two places
 * above, small, each opens) and the page's name large, its explanation behind an ⓘ rather than
 * written out; on the right the page's toggles and actions. No page writes a description under
 * its title.
 */
import type { ReactNode } from "react";
import { InfoTip } from "./Tooltip";

export interface Crumb {
  label: string;
  onClick?: () => void;
}

export function PageHeader({ path = [], title, info, meta, icon, right }: { path?: Crumb[]; title: ReactNode; info?: string; meta?: ReactNode; icon?: ReactNode; right?: ReactNode }) {
  const shown = path.slice(-2);
  return (
    <header className="pagehead">
      <div className="pagehead__left">
        {icon}
        <div className="pagehead__names">
          {shown.length ? (
            <nav className="pagehead__path" aria-label="Where this is">
              {shown.map((c, i) => (
                <span key={`${c.label}-${i}`}>
                  {c.onClick ? (
                    <button type="button" className="linkbtn" onClick={c.onClick}>
                      {c.label}
                    </button>
                  ) : (
                    c.label
                  )}
                  <span aria-hidden="true"> › </span>
                </span>
              ))}
            </nav>
          ) : null}
          <div className="pagehead__title">
            <h1>{title}</h1>
            {info ? <InfoTip text={info} /> : null}
          </div>
          {meta ? <div className="pagehead__meta">{meta}</div> : null}
        </div>
      </div>
      {right ? <div className="pagehead__right">{right}</div> : null}
    </header>
  );
}
