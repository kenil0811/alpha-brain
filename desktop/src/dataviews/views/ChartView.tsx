/**
 * The one view that summarises instead of listing: bar, line or donut over a grouping field,
 * reducing a number field with the same reductions as the table's footer (one implementation,
 * so the chart and the footer under it never disagree). Plain SVG.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { formatNumber, humanize } from "../../modules/format";
import { AGGREGATE_LABELS, computeAggregate, groupBy, type AggregateKind, type ViewConfig } from "../engine";
import { fieldLabel } from "../cells";
import { CHART_AXIS } from "../eligibility";
import type { ViewProps } from "../types";

const DAYS = 31;
const REDUCE: AggregateKind[] = ["count", "sum", "average", "min", "max"];
const PAD = { top: 16, right: 12, bottom: 36, left: 52 };
// --good and --warn repeat --chart-3 and --chart-2, so they are not in the palette.
const PALETTE = ["var(--chart)", "var(--chart-2)", "var(--chart-3)", "var(--bad)", "var(--navy)", "var(--text-3)"];

export function ChartView(p: ViewProps) {
  const { view } = p;
  const set = (next: Partial<ViewConfig>) => p.onViewChange({ ...view, ...next });
  const shape = view.chartShape ?? "bar";
  const numbers = p.allFields.filter((f) => f.kind === "number");
  const valueField = numbers.find((f) => f.name === view.chartValueField) ?? numbers[0];
  const reduce: AggregateKind = view.chartAggregate && (view.chartAggregate === "count" || valueField) ? view.chartAggregate : "count";
  const axis = p.allFields.find((f) => f.name === view.groupBy);
  // Over time: one bar per day the shown rows fall on, the last 31 of them, in date order.
  const overTime = axis?.kind === "date" || axis?.kind === "datetime";
  const buckets = useMemo(() => {
    if (!axis) return [];
    const reduceRows = (rows: typeof p.rows) => computeAggregate(reduce === "count" ? rows : rows.map((row) => row[valueField!.name]), reduce).value ?? 0;
    if (overTime) {
      const byDay = new Map<string, typeof p.rows>();
      for (const row of p.rows) {
        const raw = row[axis.name];
        if (typeof raw !== "string" || raw.length < 10) continue;
        const day = raw.slice(0, 10);
        byDay.set(day, [...(byDay.get(day) ?? []), row]);
      }
      return [...byDay.keys()].sort().slice(-DAYS).map((day) => ({ key: day, label: day.slice(8), value: reduceRows(byDay.get(day)!) }));
    }
    return groupBy(p.rows, axis.name, axis.choices ?? undefined).map(([key, rows]) => ({ key, label: humanize(key), value: reduceRows(rows) }));
  }, [p.rows, axis, overTime, reduce, valueField]);
  // Drawn at the size it is shown, so its text is the same size as the rest of the page.
  const plot = useRef<HTMLDivElement>(null);
  const [{ W, H }, setSize] = useState({ W: 640, H: 320 });
  useEffect(() => {
    const el = plot.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setSize({ W: Math.max(240, el.clientWidth), H: Math.max(200, Math.min(480, el.clientHeight)) }));
    observer.observe(el);
    return () => observer.disconnect();
  }, [buckets.length > 0]);
  const max = Math.max(1, ...buckets.map((b) => b.value));
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const band = buckets.length ? plotW / buckets.length : plotW;
  const y = (v: number) => PAD.top + plotH - (v / max) * plotH;
  const unit = reduce === "count" ? null : valueField?.unit;
  const total = buckets.reduce((s, b) => s + b.value, 0) || 1;
  let angle = -Math.PI / 2;
  return (
    <div className="dv-chart">
      <div className="dv-viewbar">
        <div className="dv-seg" role="group" aria-label="Shape">
          {(["bar", "line", "donut"] as const).map((s) => (
            <button key={s} type="button" aria-pressed={shape === s} onClick={() => set({ chartShape: s })}>
              {humanize(s)}
            </button>
          ))}
        </div>
        {overTime ? <span className="dv-faint dv-ellipsis">Per day, over the entries shown</span> : null}
        <span className="dv-spacer" />
        <label className="dv-inline">
          <span className="dv-faint">By</span>
          <select className="dv-select" value={axis?.name ?? ""} onChange={(e) => set({ groupBy: e.target.value })}>
            {p.allFields
              .filter((f) => CHART_AXIS.has(f.kind))
              .map((f) => (
                <option key={f.name} value={f.name}>
                  {fieldLabel(f)}
                </option>
              ))}
          </select>
        </label>
        <label className="dv-inline">
          <span className="dv-faint">Show</span>
          <select className="dv-select" value={reduce} onChange={(e) => set({ chartAggregate: e.target.value as AggregateKind })}>
            {REDUCE.filter((r) => r === "count" || valueField).map((r) => (
              <option key={r} value={r}>
                {AGGREGATE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        {reduce !== "count" && numbers.length > 1 ? (
          <label className="dv-inline">
            <span className="dv-faint">Of</span>
            <select className="dv-select" value={valueField?.name} onChange={(e) => set({ chartValueField: e.target.value })}>
              {numbers.map((f) => (
                <option key={f.name} value={f.name}>
                  {fieldLabel(f)}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {!buckets.length ? (
        <p className="dv-empty">Nothing to chart yet.</p>
      ) : (
        <div className={overTime ? "dv-chart__body dv-chart__body--time" : "dv-chart__body"}>
          <div ref={plot} className="dv-chart__plot">
          <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="dv-chart__svg" role="img" aria-label={`${AGGREGATE_LABELS[reduce]} by ${axis ? fieldLabel(axis) : ""}`}>
            {shape !== "donut" ? (
              <>
                {[0, 0.5, 1].map((t) => (
                  <g key={t}>
                    <line x1={PAD.left} x2={W - PAD.right} y1={y(max * t)} y2={y(max * t)} className="dv-chart__grid" />
                    <text x={PAD.left - 6} y={y(max * t) + 4} className="dv-chart__tick" textAnchor="end">
                      {formatNumber(Math.round(max * t * 10) / 10)}
                    </text>
                  </g>
                ))}
                {buckets.map((b, i) => (i % Math.max(1, Math.ceil(22 / band)) ? null : (
                  <text key={b.key} x={PAD.left + band * i + band / 2} y={H - 14} className="dv-chart__tick" textAnchor="middle">
                    {b.label.slice(0, Math.max(overTime ? 2 : 4, Math.floor(band / 7)))}
                  </text>
                )))}
              </>
            ) : null}
            {shape === "bar"
              ? buckets.map((b, i) => (
                  <rect key={b.key} x={PAD.left + band * i + band * 0.18} width={band * 0.64} y={y(b.value)} height={Math.max(0, PAD.top + plotH - y(b.value))} rx={3} fill={PALETTE[0]}>
                    <title>{`${overTime ? b.key : humanize(b.key)}: ${formatNumber(Math.round(b.value * 100) / 100, unit)}`}</title>
                  </rect>
                ))
              : null}
            {shape === "line" ? (
              <>
                <polyline fill="none" stroke={PALETTE[0]} strokeWidth={2} points={buckets.map((b, i) => `${PAD.left + band * i + band / 2},${y(b.value)}`).join(" ")} />
                {buckets.map((b, i) => (
                  <circle key={b.key} cx={PAD.left + band * i + band / 2} cy={y(b.value)} r={4} fill={PALETTE[0]}>
                    <title>{`${overTime ? b.key : humanize(b.key)}: ${formatNumber(Math.round(b.value * 100) / 100, unit)}`}</title>
                  </circle>
                ))}
              </>
            ) : null}
            {shape === "donut"
              ? buckets.map((b, i) => {
                  const a0 = angle;
                  const a1 = angle + (b.value / total) * Math.PI * 2;
                  angle = a1;
                  const ring = Math.max(20, Math.min(W, H) / 8);
                  const r = Math.min(W, H) / 2 - ring / 2 - 4;
                  const cx = W / 2;
                  const cy = H / 2;
                  const large = a1 - a0 > Math.PI ? 1 : 0;
                  const path = b.value >= total ? `M ${cx} ${cy - r} A ${r} ${r} 0 1 1 ${cx - 0.01} ${cy - r} Z` : `M ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}`;
                  return (
                    <path key={b.key} d={path} fill="none" stroke={PALETTE[i % PALETTE.length]} strokeWidth={ring}>
                      <title>{`${overTime ? b.key : humanize(b.key)}: ${formatNumber(Math.round(b.value * 100) / 100, unit)}`}</title>
                    </path>
                  );
                })
              : null}
          </svg>
          </div>
          {overTime ? null : (
          <ul className="dv-legend">
            {buckets.map((b, i) => (
              <li key={b.key}>
                <span className="dv-legend__dot" style={{ background: shape === "donut" ? PALETTE[i % PALETTE.length] : PALETTE[0] }} />
                <span className="dv-ellipsis">{overTime ? b.key : humanize(b.key)}</span>
                <b className="dv-num">{formatNumber(Math.round(b.value * 100) / 100, unit)}</b>
              </li>
            ))}
          </ul>
          )}
        </div>
      )}
    </div>
  );
}
