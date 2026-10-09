/**
 * A collection's headline numbers in one compact strip above its table (9 Oct, the UI rulebook
 * §6): what the Summary tab used to hold (the amounts, the status split), as small tiles, each
 * saying what it is based on. A tile that needs the person gets the attention tone: here, the
 * records resting on an estimate or an assumption. A small chevron hides the strip, and the page
 * remembers it. The numbers come from the module's summary (the core works them out) and from
 * the records on the page; nothing is invented, and a collection with nothing yet says "0".
 */
import { useEffect, useState } from "react";
import type { RecordRow, TableDesc, TableSummaryData } from "../core/client";
import { MetricTile, IconButton } from "../ui";
import { AlertIcon, ChevronDown, ChevronRight, CountIcon, ICON, ChecklistIcon, TotalIcon } from "../ui/icons";
import { dayText, formatNumber, humanize } from "./format";
import { provenanceCounts } from "./views/engine";

function remembered(key: string): boolean {
  try {
    return localStorage.getItem(key) !== "closed";
  } catch {
    return true;
  }
}

export function MetricsStrip({ table, rows, summary }: { table: Pick<TableDesc, "name" | "title">; rows: RecordRow[] | null; summary?: TableSummaryData | null }) {
  const key = `alpha.page.${table.name}.metrics`;
  const [open, setOpen] = useState(() => remembered(key));
  useEffect(() => {
    try {
      localStorage.setItem(key, open ? "open" : "closed");
    } catch {
      /* the strip forgets whether it was folded, nothing more */
    }
  }, [key, open]);
  if (!rows) return null;
  const amount = (v: number | null, unit?: string | null) => (v === null ? "—" : formatNumber(v, unit));
  const today = dayText(new Date());
  const { estimated, assumed } = provenanceCounts(rows);
  const check = estimated + assumed;
  const split = summary?.split && Object.keys(summary.split.counts).length ? summary.split : null;
  const doneCount = split ? Object.entries(split.counts).filter(([c]) => split.done.includes(c)).reduce((a, [, n]) => a + n, 0) : 0;
  const openCount = split ? Object.values(split.counts).reduce((a, n) => a + n, 0) - doneCount : 0;
  return (
    <section className="mstrip" aria-label={`${table.title}: the numbers`}>
      <div className="mstrip__bar">
        <IconButton size="sm" label={open ? "Hide the numbers" : "Show the numbers"} aria-expanded={open} icon={open ? <ChevronDown /> : <ChevronRight />} onClick={() => setOpen((o) => !o)} />
        <span className="mstrip__title">At a glance</span>
      </div>
      {open ? (
        <div className="mstrip__tiles">
          <MetricTile icon={<CountIcon size={ICON} />} label="Records" value={rows.length.toLocaleString()} basis={summary ? `${summary.added_this_week.toLocaleString()} added this week; ${table.title.toLowerCase()} in all` : `${table.title.toLowerCase()}, as of ${today}`} />
          {(summary?.amounts ?? []).map((a) => (
            <MetricTile key={a.field} icon={<TotalIcon size={ICON} />} label={`${a.label}${a.how === "average" ? " · average" : ""}`} value={amount(a.today, a.unit)} basis={`${today} · ${amount(a.this_week, a.unit)} this week`} />
          ))}
          {split ? <MetricTile icon={<ChecklistIcon size={ICON} />} label={`${humanize(split.label)} · open`} value={openCount.toLocaleString()} basis={`${doneCount.toLocaleString()} done of ${(openCount + doneCount).toLocaleString()} records`} /> : null}
          <MetricTile icon={<AlertIcon size={ICON} />} label="To check" value={check.toLocaleString()} attention={check > 0} basis={check ? "records resting on an estimate or an assumption" : "no record rests on an estimate or an assumption"} />
        </div>
      ) : null}
    </section>
  );
}
