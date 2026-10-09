import type { ReactNode } from "react";

/** A white bordered card for one section (the UI rulebook §14): a small semibold sans title, a
 *  one-line grey subtitle, actions on the right, then the content. */
export function SectionCard({ title, subtitle, actions, children }: { title: string; subtitle?: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <section className="card scard" aria-label={title}>
      <header className="scard__head">
        <div className="scard__titles">
          <h3 className="scard__title">{title}</h3>
          {subtitle ? <p className="scard__sub">{subtitle}</p> : null}
        </div>
        {actions ? <div className="scard__actions">{actions}</div> : null}
      </header>
      {children ? <div className="scard__body">{children}</div> : null}
    </section>
  );
}

/** The empty state: a dashed card, an icon, "Nothing configured yet" in a few words and one
 *  sentence that says what would fill it. Honest, never "coming soon". */
export function EmptyCard({ icon, title, children, action }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="ecard">
      {icon ? (
        <span className="ecard__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <h3 className="ecard__title">{title}</h3>
      {children ? <p className="ecard__text">{children}</p> : null}
      {action ? <div className="ecard__action">{action}</div> : null}
    </div>
  );
}
