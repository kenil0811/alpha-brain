import type { ReactNode } from "react";

/** One row of a list, the same wherever lists of things appear (the UI rulebook §12: Automations,
 *  Skills, Connections, and Settings' rows): an icon, a title, a one-line description, and
 *  controls aligned to the right. `onOpen` makes the title a link to the thing's own page;
 *  `children` is anything that belongs under the description (a live run, a problem).
 *  (9 Oct, the pages phase.) */
export function ListRow({ icon, title, description, controls, onOpen, children }: { icon?: ReactNode; title: ReactNode; description?: ReactNode; controls?: ReactNode; onOpen?: () => void; children?: ReactNode }) {
  return (
    <div className="lrow">
      {icon ? (
        <span className="lrow__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div className="lrow__body">
        <div className="lrow__title">
          {onOpen ? (
            <button type="button" className="lrow__open" onClick={onOpen}>
              {title}
            </button>
          ) : (
            title
          )}
        </div>
        {description ? <div className="lrow__desc">{description}</div> : null}
        {children}
      </div>
      {controls ? <div className="lrow__controls">{controls}</div> : null}
    </div>
  );
}
