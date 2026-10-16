import { forwardRef, type HTMLAttributes, type ReactNode } from "react";

/** The one frame every card in the conversation and on Home shares (slice 2 of the
 *  conversation proposal, 16 Oct 2026): an eyebrow, a title row with its badge, the body, and
 *  a row of buttons at the foot. A question, an action, a workflow page and a thread all look
 *  like one thing. */
export const Card = forwardRef<
  HTMLElement,
  Omit<HTMLAttributes<HTMLElement>, "title"> & {
    eyebrow?: ReactNode;
    title?: ReactNode;
    badge?: ReactNode;
    foot?: ReactNode;
  }
>(function Card({ eyebrow, title, badge, foot, className, children, ...rest }, ref) {
  return (
    <article ref={ref} className={["frame", className ?? ""].filter(Boolean).join(" ")} {...rest}>
      {eyebrow ? <div className="frame__eyebrow">{eyebrow}</div> : null}
      {title || badge ? (
        <div className="frame__head">
          {title ? <h3 className="frame__title">{title}</h3> : null}
          {badge ? <span className="frame__badge">{badge}</span> : null}
        </div>
      ) : null}
      {children}
      {foot ? <div className="frame__foot">{foot}</div> : null}
    </article>
  );
});
