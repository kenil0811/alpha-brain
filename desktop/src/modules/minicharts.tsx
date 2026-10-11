/**
 * Charts for the metric tiles and their detail dialogs (9 Oct; interactive since the owner's
 * review the same day): a trend line and one stacked bar for a split. Plain SVG; every mark
 * answers the pointer with its own x and y in a tooltip (a week and its value, a category and its
 * count and share), and a split always comes with its legend, so colour never stands alone. The
 * series colours are `--series-1…8` (app.css), checked for colour-blind separation in both themes.
 */
import { useState, type ReactNode } from "react";
import type { RecordRow } from "../core/client";

/** The colour of the `i`th category, in fixed order; past the eighth they fold to grey. */
export const seriesColor = (i: number) => (i < 8 ? `var(--series-${i + 1})` : "var(--text-3)");

type Tip = { x: number; y: number; text: string } | null;

/** The tooltip, at the pointer, above everything (a strip that scrolls never clips it). */
function TipBox({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return (
    <span className="charttip" role="tooltip" style={{ left: tip.x + 12, top: tip.y - 30 }}>
      {tip.text}
    </span>
  );
}

/** A line over the values, oldest first, with a dot on the latest. Hovering a point shows its
 *  label and value (`labels[i]`: "Week of 6 Oct"; `valueText(v)`: "3 records"). */
export function Sparkline({ values, labels, valueText = String, label, width = 72, height = 24 }: { values: number[]; labels?: string[]; valueText?: (v: number) => string; label: string; width?: number; height?: number }) {
  const [at, setAt] = useState<number | null>(null);
  const [tip, setTip] = useState<Tip>(null);
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const pts = values.map((v, i) => [i * step, height - 2 - (v / max) * (height - 4)] as const);
  const last = pts[pts.length - 1];
  const hover = (i: number, e: { clientX: number; clientY: number }) => {
    setAt(i);
    setTip({ x: e.clientX, y: e.clientY, text: `${labels?.[i] ?? `Point ${i + 1}`}: ${valueText(values[i])}` });
  };
  const leave = () => {
    setAt(null);
    setTip(null);
  };
  return (
    <>
      <svg className="spark spark--live" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} onPointerLeave={leave} onPointerDown={leave}>
        <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {at !== null ? <line x1={pts[at][0]} x2={pts[at][0]} y1={0} y2={height} stroke="var(--text-3)" strokeWidth={1} strokeDasharray="2 2" /> : null}
        {at !== null ? <circle cx={pts[at][0]} cy={pts[at][1]} r={4} fill="var(--series-1)" stroke="var(--surface)" strokeWidth={2} /> : last ? <circle cx={last[0]} cy={last[1]} r={2.5} fill="var(--series-1)" /> : null}
        {/* hit areas wider than the marks: one column per point */}
        {pts.map((p, i) => (
          <rect key={i} x={p[0] - step / 2} y={0} width={Math.max(step, 8)} height={height} fill="transparent" onPointerMove={(e) => hover(i, e)} />
        ))}
      </svg>
      <TipBox tip={tip} />
    </>
  );
}

export interface Part {
  label: string;
  count: number;
  /** A choice that means finished. */
  done?: boolean;
}

/** One bar split by count, each part in its own colour with a 2px gap; hovering a part shows its
 *  label, count and share. */
export function SplitBar({ parts, label, width = 72, height = 24 }: { parts: Part[]; label: string; width?: number; height?: number }) {
  const [tip, setTip] = useState<Tip>(null);
  const total = parts.reduce((a, p) => a + p.count, 0);
  let x = 0;
  const bar = Math.min(10, height);
  return (
    <>
      <svg className="spark spark--live" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} onPointerLeave={() => setTip(null)} onPointerDown={() => setTip(null)}>
        {total
          ? parts.map((p, i) => {
              const w = (p.count / total) * width;
              const at = x;
              x += w;
              return w ? (
                <rect key={p.label} x={at} y={(height - bar) / 2} width={w} height={bar} rx={2} fill={seriesColor(i)} stroke="var(--surface)" strokeWidth={2} onPointerMove={(e) => setTip({ x: e.clientX, y: e.clientY, text: `${p.label}${p.done ? " (done)" : ""}: ${p.count.toLocaleString()} · ${Math.round((p.count / total) * 100)}%` })} />
              ) : null;
            })
          : null}
      </svg>
      <TipBox tip={tip} />
    </>
  );
}

/** The split's legend: a swatch, the label and the count per part (the first `max`, then "+n more"). */
export function Legend({ parts, max, inline }: { parts: Part[]; max?: number; /** One small line under a bar (the strip's block): labels only, counts on hover. */ inline?: boolean }) {
  const shown = max ? parts.slice(0, max) : parts;
  const more = parts.length - shown.length;
  if (inline) {
    return (
      <ul className="legend legend--inline">
        {parts.map((p, i) => (
          <li key={p.label} title={`${p.label}: ${p.count.toLocaleString()}`}>
            <span className="legend__dot" style={{ background: seriesColor(i) }} aria-hidden="true" />
            <span className="legend__lab">{p.label}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="legend">
      {shown.map((p, i) => (
        <li key={p.label}>
          <span className="legend__dot" style={{ background: seriesColor(i) }} aria-hidden="true" />
          <span className="legend__lab">{p.label}</span>
          <span className="legend__n num">{p.count.toLocaleString()}</span>
        </li>
      ))}
      {more > 0 ? <li className="faint">+{more} more</li> : null}
    </ul>
  );
}

/** A small table of what a chart shows, for its detail dialog (the chart's table view). */
export function ChartTable({ head, rows }: { head: [string, string]; rows: [ReactNode, string][] }) {
  return (
    <table className="table charttable">
      <thead>
        <tr>
          <th>{head[0]}</th>
          <th className="r">{head[1]}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([a, b], i) => (
          <tr key={i}>
            <td>{a}</td>
            <td className="r num">{b}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const WEEK_MS = 7 * 86_400_000;

/** Per week for the last `weeks` weeks, oldest first, by when each record was added: how many, or
 *  the sum of `valueOf`. */
export function weekly(rows: RecordRow[], weeks = 8, valueOf: (r: RecordRow) => number = () => 1, now = Date.now()): number[] {
  const out = new Array<number>(weeks).fill(0);
  for (const r of rows) {
    const back = Math.floor((now - Date.parse(r.created_at)) / WEEK_MS);
    if (back >= 0 && back < weeks) out[weeks - 1 - back] += valueOf(r);
  }
  return out;
}

/** The names of `weekly`'s weeks, oldest first: "This week", then "Week of 29 Sep" back. */
export function weekLabels(weeks = 8, now = Date.now()): string[] {
  return Array.from({ length: weeks }, (_, i) => {
    const back = weeks - 1 - i;
    if (back === 0) return "This week";
    const start = new Date(now - (back + 1) * WEEK_MS + 86_400_000);
    return `Week of ${start.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
  });
}

/** A trend worth drawing: values in at least two different weeks (one week alone is a number, not a trend). */
export const isTrend = (values: number[]) => values.filter(Boolean).length >= 2;
