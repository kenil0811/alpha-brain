/** A chart of the records shown (9 Oct, the owner's parity pass): bars, a line or a donut; along
 *  the x axis a date field per day or any other field per value; up the y axis the count, or the
 *  sum or average of a number field. Notion's chart view, in the app's quiet palette. */
import type { RecordRow } from "../../core/client";
import type { FieldInfo } from "../fields";
import { formatNumber, humanize } from "../format";
import { chartPoints } from "./engine";

const PALETTE = ["var(--chart)", "var(--chart-2)", "var(--chart-3)", "var(--k-automation)", "var(--k-connection)"];

export interface ChartSpec {
  type: "bar" | "line" | "donut";
  agg: "count" | "sum" | "average";
  of?: string;
}

export function ChartView({ rows, x, spec, byName }: { rows: RecordRow[]; x: FieldInfo; spec: ChartSpec; byName: Map<string, FieldInfo> }) {
  const of = spec.of ? byName.get(spec.of) : undefined;
  const points = chartPoints(rows, x, { agg: of ? spec.agg : "count", field: of?.name }).slice(-31);
  const max = Math.max(1, ...points.map((p) => p.value));
  const what = of ? `${spec.agg === "sum" ? "Sum" : "Average"} of ${(of.label ?? humanize(of.name)).toLowerCase()}` : "Records";
  const by = (x.label ?? humanize(x.name)).toLowerCase();
  const show = (v: number) => formatNumber(Math.round(v * 10) / 10, of?.unit);
  if (!points.length) return <p className="empty">Nothing to chart yet.</p>;
  const total = points.reduce((a, p) => a + p.value, 0) || 1;
  let turned = 0;
  return (
    <div className="chart">
      {spec.type === "bar" ? (
        <div className="chart__bars" role="img" aria-label={`${what} by ${by}`}>
          {points.map((p) => (
            <div key={p.key} className="chart__bar" title={`${p.label}: ${show(p.value)}`}>
              <div className="chart__fill" style={{ height: `${Math.round((p.value / max) * 100)}%` }} />
              <span className="chart__label">{p.label}</span>
            </div>
          ))}
        </div>
      ) : spec.type === "line" ? (
        <svg className="chart__svg" viewBox="0 0 100 40" preserveAspectRatio="none" role="img" aria-label={`${what} by ${by}`}>
          <polyline fill="none" stroke="var(--primary)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" points={points.map((p, i) => `${points.length > 1 ? (i / (points.length - 1)) * 100 : 50},${40 - (p.value / max) * 38}`).join(" ")} />
        </svg>
      ) : (
        <div className="chart__donut">
          <svg viewBox="0 0 42 42" role="img" aria-label={`${what} by ${by}`}>
            {points.map((p, i) => {
              const part = (p.value / total) * 100;
              const arc = <circle key={p.key} cx="21" cy="21" r="15.9" fill="none" strokeWidth="6" stroke={PALETTE[i % PALETTE.length]} strokeDasharray={`${part} ${100 - part}`} strokeDashoffset={25 - turned}><title>{`${p.label}: ${show(p.value)}`}</title></circle>;
              turned += part;
              return arc;
            })}
          </svg>
          <ul className="chart__keys">
            {points.map((p, i) => (
              <li key={p.key}>
                <span className="chart__swatch" style={{ background: PALETTE[i % PALETTE.length] }} aria-hidden="true" /> {p.label} · {show(p.value)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {spec.type === "line" ? (
        <div className="chart__axis faint">
          <span>{points[0].label}</span>
          <span>{points[points.length - 1].label}</span>
        </div>
      ) : null}
      <div className="chart__legend">
        <span className="chart__swatch" aria-hidden="true" />
        {what} by {by}
      </div>
    </div>
  );
}
