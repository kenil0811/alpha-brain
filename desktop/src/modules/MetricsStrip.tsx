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
import { useEffect, useState } from "react";
import type { RecordRow, TableDesc, TableSummaryData } from "../core/client";
import { MetricTile, IconButton } from "../ui";
import { ChevronUp } from "../ui/icons";
import { dayText, formatNumber, humanize } from "./format";
import { SplitBar, Sparkline, weekly } from "./minicharts";
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

/** The strip, shown; `onHide` folds it (its arrow at the top-right corner). */
export function MetricsStrip({ table, rows, summary, onHide }: { table: Pick<TableDesc, "name" | "title">; rows: RecordRow[] | null; summary?: TableSummaryData | null; onHide: () => void }) {
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
  const split = summary?.split && Object.keys(summary.split.counts).length ? summary.split : null;
  const doneCount = split ? Object.entries(split.counts).filter(([c]) => split.done.includes(c)).reduce((a, [, n]) => a + n, 0) : 0;
  const openCount = split ? Object.values(split.counts).reduce((a, n) => a + n, 0) - doneCount : 0;
  const perWeek = weekly(rows);
  const spark = (values: number[], what: string) => (values.some(Boolean) ? <Sparkline values={values} label={`${what} per week, the last ${values.length} weeks: ${values.join(", ")}`} /> : undefined);
  return (
    <section className="mstrip" aria-label={`${table.title}: the numbers`}>
      <IconButton size="sm" className="mstrip__fold" label="Hide the numbers" icon={<ChevronUp />} onClick={onHide} />
      <MetricTile label="Records" value={rows.length.toLocaleString()} basis={summary ? `${summary.added_this_week.toLocaleString()} added this week` : `as of ${today}`} chart={spark(perWeek, "Records added")} />
      {(summary?.amounts ?? []).map((a) => {
        const { value, basis } = headline(a);
        const sums = weekly(rows, 8, (r) => (typeof r.values[a.field] === "number" ? (r.values[a.field] as number) : 0));
        return <MetricTile key={a.field} label={`${a.label}${a.how === "average" ? " · average" : ""}`} value={value} basis={basis} chart={a.how === "total" ? spark(sums, `${a.label} added`) : undefined} />;
      })}
      {split ? (
        <MetricTile
          label={`${humanize(split.label)} · open`}
          value={openCount.toLocaleString()}
          basis={`${doneCount.toLocaleString()} done of ${(openCount + doneCount).toLocaleString()}`}
          chart={<SplitBar parts={Object.entries(split.counts).map(([c, n]) => ({ label: humanize(c), count: n }))} label={Object.entries(split.counts).map(([c, n]) => `${humanize(c)} ${n}`).join(" · ")} />}
        />
      ) : null}
      {check ? <MetricTile label="To check" value={check.toLocaleString()} attention basis="rest on an estimate or an assumption" /> : null}
    </section>
  );
}
