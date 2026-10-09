import type { ReactNode } from "react";

/** One number and what it is (the UI rulebook §6 and §14): the number in serif with, beside it, a
 *  small label and the "based on" line (a number is never shown without its basis), then an
 *  optional small chart of its trend or split and an optional call to action. A tile is as wide
 *  as what it holds. No icon unless one is given; `attention` marks what needs the person. */
export function MetricTile({ icon, label, value, basis, attention, cta, chart }: { icon?: ReactNode; label: string; value: ReactNode; basis: string; attention?: boolean; cta?: ReactNode; chart?: ReactNode }) {
  return (
    <div className={`card mtile${attention ? " mtile--attention" : ""}${chart ? " mtile--chart" : ""}`}>
      {icon ? (
        <span className="mtile__icon" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      <div className="mtile__big num">{value}</div>
      <div className="mtile__text">
        <div className="mtile__lab">{label}</div>
        <div className="mtile__basis" title={basis}>{basis}</div>
      </div>
      {chart ? <div className="mtile__chart">{chart}</div> : null}
      {cta ? <div className="mtile__cta">{cta}</div> : null}
    </div>
  );
}
