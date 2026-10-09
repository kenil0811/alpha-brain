import type { ReactNode } from "react";

/** One number and what it is (the UI rulebook §6 and §14): a tinted icon square, a tiny uppercase
 *  label, the number in serif, a "based on" line (a number is never shown without its basis), and
 *  an optional call to action. `attention` turns the icon red-tinted for what needs the person. */
export function MetricTile({ icon, label, value, basis, attention, cta }: { icon: ReactNode; label: string; value: ReactNode; basis: string; attention?: boolean; cta?: ReactNode }) {
  return (
    <div className={`card mtile${attention ? " mtile--attention" : ""}`}>
      <span className="mtile__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="mtile__body">
        <div className="mtile__lab">{label}</div>
        <div className="mtile__big num">{value}</div>
        <div className="mtile__basis">{basis}</div>
        {cta ? <div className="mtile__cta">{cta}</div> : null}
      </div>
    </div>
  );
}
