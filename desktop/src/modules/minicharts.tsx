/**
 * Charts small enough to sit inside a metric tile (9 Oct): a sparkline for a trend and one
 * stacked bar for a split. Plain SVG in the `--chart` colours; each says what it shows in its
 * accessible name and on hover, so colour never stands alone.
 */
import type { RecordRow } from "../core/client";

const PALETTE = ["var(--chart)", "var(--chart-2)", "var(--chart-3)"];
const W = 72;
const H = 24;

/** A line over the values, oldest first, with a dot on the latest. */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? W / (values.length - 1) : 0;
  const pts = values.map((v, i) => [i * step, H - 2 - (v / max) * (H - 4)] as const);
  const last = pts[pts.length - 1];
  return (
    <svg className="spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <title>{label}</title>
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="var(--chart)" strokeWidth={1.5} strokeLinejoin="round" />
      {last ? <circle cx={last[0]} cy={last[1]} r={2} fill="var(--chart)" /> : null}
    </svg>
  );
}

/** One bar split by count, each part in its own colour (past the third, the same three paler). */
export function SplitBar({ parts, label }: { parts: { label: string; count: number }[]; label: string }) {
  const total = parts.reduce((a, p) => a + p.count, 0);
  let at = 0;
  return (
    <svg className="spark" width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <title>{label}</title>
      {total
        ? parts.map((p, i) => {
            const w = (p.count / total) * W;
            const x = at;
            at += w;
            return w ? <rect key={p.label} x={x} y={H / 2 - 4} width={w} height={8} fill={PALETTE[i % 3]} opacity={i < 3 ? 1 : 0.55} stroke="var(--surface)" strokeWidth={1} /> : null;
          })
        : null}
    </svg>
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
