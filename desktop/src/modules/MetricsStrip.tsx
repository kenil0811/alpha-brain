/**
 * A collection's headline numbers in one compact strip above its data (9 Oct, the UI rulebook §6):
 * tiles as wide as what they hold, each a number with its label and basis beside it, and a small
 * chart where there is a trend (records and amounts added per week) or a split (the status). The
 * records resting on an estimate or an assumption get a tile only when there are some, in the
 * attention tone. The strip sits below the toolbar and starts folded so the table is the focus
 * (rulebook §6; the owner, 9 Oct): folded, its show arrow is in the toolbar just left of ⋮; shown,
 * its hide arrow sits at the strip's top-right corner. The page remembers the choice
 * (`useMetricsOpen`). The numbers come
 * from the module's summary (the core works them out) and from the records on the page; nothing
 * is invented. A tile never shows a bare dash (§2): an amount shows today's if there is one, else
 * this week's (its basis saying so), else "Unknown".
 */
import { type ReactNode, useEffect, useState } from "react";
import type { RecordRow, TableDesc, TableSummaryData } from "../core/client";
import { Dialog, MetricTile, IconButton } from "../ui";
import { ChevronUp } from "../ui/icons";
import { dayText, formatNumber, humanize } from "./format";
import { ChartTable, Legend, SplitBar, Sparkline, isTrend, weekLabels, weekly, type Part } from "./minicharts";
import { provenanceCounts } from "./views/engine";

function remembered(key: string): boolean {
  try {
    return localStorage.getItem(key) === "open"; // folded unless the person opened it
  } catch {
    return false;
  }
}

/** Whether a collection's numbers are shown, remembered per collection; folded unless opened. */
export function useMetricsOpen(name: string): [boolean, (open: boolean) => void] {
  const key = `alpha.page.${name}.metrics`;
  const [open, setOpen] = useState(() => remembered(key));
  useEffect(() => {
    try {
      localStorage.setItem(key, open ? "open" : "closed");
    } catch {
      /* the strip forgets whether it was folded, nothing more */
    }
  }, [key, open]);
  return [open, setOpen];
}

/** What a tile's detail dialog shows: a bigger chart and the table under it. */
type Detail = { title: string; basis: string; chart?: ReactNode; legend?: ReactNode; table?: { head: [string, string]; rows: [ReactNode, string][] } };

/** The strip, shown; `onHide` folds it (its arrow at the top-right corner). Every tile opens a
 *  dialog with its details on a click (9 Oct, the owner), and a tile is shown only when it says
 *  something: a trend line needs values in two weeks, a split two categories, and "open" only
 *  when some choices mean done. The strip is four lines high at most: two-line tiles stack two
 *  high, a split's block (its bar and one line of labels) spans both, and more runs sideways. */
export function MetricsStrip({ table, rows, summary, onHide }: { table: Pick<TableDesc, "name" | "title">; rows: RecordRow[] | null; summary?: TableSummaryData | null; onHide: () => void }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  if (!rows) return null;
  const amount = (v: number | null, unit?: string | null) => (v === null ? "none" : formatNumber(v, unit));
  const today = dayText(new Date());
  const headline = (a: NonNullable<TableSummaryData["amounts"]>[number]) =>
    a.today !== null
      ? { value: amount(a.today, a.unit), basis: `${today} · ${amount(a.this_week, a.unit)} this week` }
      : a.this_week !== null
        ? { value: amount(a.this_week, a.unit), basis: "this week · none today" }
        : { value: "Unknown", basis: "nothing recorded today or this week" };
  const { estimated, assumed } = provenanceCounts(rows);
  const check = estimated + assumed;
  const split = summary?.split && Object.keys(summary.split.counts).length > 1 ? summary.split : null;
  const parts: Part[] = split ? Object.entries(split.counts).sort((x, y) => y[1] - x[1]).map(([c, n]) => ({ label: humanize(c), count: n, done: split.done.includes(c) })) : [];
  const hasDone = Boolean(split?.done.length);
  const doneCount = parts.filter((p) => p.done).reduce((a, p) => a + p.count, 0);
  const total = parts.reduce((a, p) => a + p.count, 0);
  const labels = weekLabels();
  const perWeek = weekly(rows);
  const trend = (values: number[], what: string, valueText: (v: number) => string) => ({
    small: isTrend(values) ? <Sparkline values={values} labels={labels} valueText={valueText} label={`${what} per week, the last ${values.length} weeks`} /> : undefined,
    big: <Sparkline values={values} labels={labels} valueText={valueText} label={`${what} per week, the last ${values.length} weeks`} width={480} height={140} />,
    table: { head: ["Week", what] as [string, string], rows: values.map((v, i) => [labels[i], valueText(v)] as [ReactNode, string]).reverse() },
  });
  const records = trend(perWeek, "Records added", (v) => `${v.toLocaleString()} ${v === 1 ? "record" : "records"}`);
  // never the same number twice ("7 records, 7 added this week")
  const recordsBasis = !summary ? `as of ${today}` : summary.added_this_week === rows.length && rows.length ? "all added this week" : `${summary.added_this_week.toLocaleString()} added this week`;
  return (
    <section className="mstrip" aria-label={`${table.title}: the numbers`}>
      <IconButton size="sm" className="mstrip__fold" label="Hide the numbers" icon={<ChevronUp />} onClick={onHide} />
      <MetricTile label="Records" value={rows.length.toLocaleString()} basis={recordsBasis} chart={records.small} onOpen={() => setDetail({ title: "Records", basis: `${rows.length.toLocaleString()} in all · ${recordsBasis}`, chart: records.big, table: records.table })} />
      {(summary?.amounts ?? []).map((a) => {
        const { value, basis } = headline(a);
        const sums = weekly(rows, 8, (r) => (typeof r.values[a.field] === "number" ? (r.values[a.field] as number) : 0));
        const t = trend(sums, `${a.label} added`, (v) => formatNumber(v, a.unit));
        const name = `${a.label}${a.how === "average" ? " · average" : ""}`;
        return <MetricTile key={a.field} label={name} value={value} basis={basis} chart={a.how === "total" ? t.small : undefined} onOpen={() => setDetail({ title: name, basis, ...(a.how === "total" ? { chart: t.big, table: t.table } : {}) })} />;
      })}
      {split ? (
        <MetricTile
          tall
          label={hasDone ? `${humanize(split.label)} · open` : humanize(split.label)}
          value={(hasDone ? total - doneCount : parts.length).toLocaleString()}
          basis={hasDone ? `${doneCount.toLocaleString()} done of ${total.toLocaleString()}` : `kinds across ${total.toLocaleString()} records`}
          chart={
            <div className="mtile__split">
              <SplitBar parts={parts} label={parts.map((p) => `${p.label} ${p.count}`).join(" · ")} width={160} height={14} />
              <Legend parts={parts} inline />
            </div>
          }
          onOpen={() => setDetail({ title: humanize(split.label), basis: hasDone ? `${doneCount.toLocaleString()} done of ${total.toLocaleString()}` : `${total.toLocaleString()} records`, chart: <SplitBar parts={parts} label={parts.map((p) => `${p.label} ${p.count}`).join(" · ")} width={480} height={28} />, legend: <Legend parts={parts} />, table: { head: [humanize(split.label), "Records"], rows: parts.map((p) => [`${p.label}${p.done ? " (done)" : ""}`, `${p.count.toLocaleString()} · ${Math.round((p.count / total) * 100)}%`]) } })}
        />
      ) : null}
      {check ? <MetricTile label="To check" value={check.toLocaleString()} attention basis="rest on an estimate or an assumption" onOpen={() => setDetail({ title: "To check", basis: "Records resting on something Alpha estimated or assumed; double-click a value in the table to correct it.", table: { head: ["Why", "Records"], rows: [["Estimated by Alpha", estimated.toLocaleString()], ["Alpha assumed something", assumed.toLocaleString()]] } })} /> : null}
      <Dialog open={detail !== null} onOpenChange={(o) => { if (!o) setDetail(null); }} title={detail?.title ?? ""} className="dialog--metric">
        {detail ? (
          <div className="mdetail">
            <p className="muted">{detail.basis}</p>
            {detail.chart ? <div className="mdetail__chart">{detail.chart}</div> : null}
            {detail.legend}
            {detail.table ? <ChartTable head={detail.table.head} rows={detail.table.rows} /> : null}
          </div>
        ) : null}
      </Dialog>
    </section>
  );
}
