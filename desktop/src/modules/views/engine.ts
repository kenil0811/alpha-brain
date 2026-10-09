/**
 * What a view does to rows before anything is drawn: search, filters, hiding done and gone
 * rows, sorting, paging, totals. Pure functions over `RecordRow`s, so a view's behaviour is
 * tested without a browser and shared by every kind of view (table, board, list, calendar,
 * chart, and the ones to come).
 */
import type { RecordRow } from "../../core/client";
import { isNumeric, openChoices, type FieldInfo } from "../fields";
import { formatDay, formatNumber, when } from "../format";

export interface Sort {
  field: string;
  direction: "asc" | "desc";
}

export interface ViewQuery {
  /** Words typed in the search box, matched against the searchable fields. */
  search: string;
  searchable: string[];
  /** Field → the one value it must have ("" means any). */
  filters: Record<string, string>;
  hideDone: boolean;
  statusField?: FieldInfo;
  showGone: boolean;
  sort: Sort | null;
  /** Only these records: the Dashboard's "Show these 12" (9 Oct, the UI rulebook §6). Temporary;
   *  the core's saved lists cannot hold ids. */
  ids?: Set<string> | null;
}

/** Empty values sort last; numbers by value; everything else as words, numerically aware. */
export function compare(a: unknown, b: unknown): number {
  if (a === b) return 0;
  if (a === null || a === undefined || a === "") return 1;
  if (b === null || b === undefined || b === "") return -1;
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

export function applyQuery(rows: RecordRow[], q: ViewQuery): RecordRow[] {
  const words = q.search.trim().toLowerCase();
  const open = q.statusField ? new Set(openChoices(q.statusField)) : null;
  let out = rows.filter((r) => {
    if (words && !q.searchable.some((f) => String(r.values[f] ?? "").toLowerCase().includes(words))) return false;
    for (const [field, value] of Object.entries(q.filters)) if (value && String(r.values[field] ?? "") !== value) return false;
    if (q.hideDone && q.statusField && open && !open.has(String(r.values[q.statusField.name] ?? ""))) return false;
    if (!q.showGone && r.gone_at) return false;
    if (q.ids && !q.ids.has(r.id)) return false;
    return true;
  });
  if (q.sort) {
    const { field, direction } = q.sort;
    const empty = (v: unknown) => v === null || v === undefined || v === "";
    // Empty values stay last whichever way the column is sorted (before the 3 Oct split they
    // came first in descending order).
    out = [...out].sort((a, b) => {
      const x = a.values[field];
      const y = b.values[field];
      if (empty(x) || empty(y)) return compare(x, y);
      return (direction === "asc" ? 1 : -1) * compare(x, y);
    });
  }
  return out;
}

/** The next sort when a column header is clicked: ascending, then descending, then none. */
export function nextSort(current: Sort | null, field: string): Sort | null {
  if (current?.field !== field) return { field, direction: "asc" };
  return current.direction === "asc" ? { field, direction: "desc" } : null;
}

export function pageOf<T>(rows: T[], at: number, size: number): { rows: T[]; at: number; pages: number } {
  const pages = Math.max(1, Math.ceil(rows.length / Math.max(1, size)));
  const page = Math.min(Math.max(0, at), pages - 1);
  return { rows: rows.slice(page * size, page * size + size), at: page, pages };
}

/** Rows by the value of one field, in the field's own order of choices, unknown values last. */
export function groupBy(rows: RecordRow[], field: FieldInfo): { key: string; rows: RecordRow[] }[] {
  const order = field.choices ?? [];
  const groups = new Map<string, RecordRow[]>();
  for (const key of order) groups.set(key, []);
  for (const r of rows) {
    const key = String(r.values[field.name] ?? "");
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups.entries()].map(([key, rows]) => ({ key, rows }));
}

/** How many of the rows rest on an estimate or an assumption: the trust line under a table. */
export function provenanceCounts(rows: RecordRow[]): { estimated: number; assumed: number } {
  let estimated = 0;
  let assumed = 0;
  for (const r of rows) {
    if (r.provenance?.estimated) estimated += 1;
    else if (r.provenance?.assumed) assumed += 1;
  }
  return { estimated, assumed };
}

/** Rows by the day of a date field (ISO date prefix), for calendars and charts. */
export function byDay(rows: RecordRow[], field: FieldInfo): Map<string, RecordRow[]> {
  const out = new Map<string, RecordRow[]>();
  for (const row of rows) {
    const raw = row.values[field.name];
    if (typeof raw !== "string") continue;
    const day = raw.slice(0, 10);
    out.set(day, [...(out.get(day) ?? []), row]);
  }
  return out;
}

/** Rows by the month of a date field, newest month first, each month's rows newest first. */
export function byMonth(rows: RecordRow[], field: FieldInfo): { month: string; rows: RecordRow[] }[] {
  const groups = new Map<string, RecordRow[]>();
  for (const row of rows) {
    const raw = row.values[field.name];
    if (typeof raw !== "string" || raw.length < 7) continue;
    const month = raw.slice(0, 7);
    groups.set(month, [...(groups.get(month) ?? []), row]);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([month, rs]) => ({ month, rows: [...rs].sort((x, y) => String(y.values[field.name]).localeCompare(String(x.values[field.name]))) }));
}

/** The fields a view can run on: every one of these kinds, in the table's order. */
export function ofKinds(fields: FieldInfo[], kinds: Set<string>): FieldInfo[] {
  return fields.filter((f) => kinds.has(f.kind));
}

/** Pinned records first, each group keeping the order it had (9 Oct, the UI rulebook §6). */
export function pinnedFirst<T extends { id: string }>(rows: T[], pinned: string[]): T[] {
  if (!pinned.length) return rows;
  const set = new Set(pinned);
  return [...rows.filter((r) => set.has(r.id)), ...rows.filter((r) => !set.has(r.id))];
}

/** What a column's footer can say about the records under it (9 Oct, the UI rulebook §6). */
export type SummaryOp = "none" | "count" | "sum" | "average" | "min" | "max" | "earliest" | "latest" | "filled";
export const SUMMARY_LABEL: Record<SummaryOp, string> = { none: "None", count: "Count", sum: "Sum", average: "Average", min: "Minimum", max: "Maximum", earliest: "Earliest", latest: "Latest", filled: "Percent filled" };

/** The choices for a kind of field: every kind can count and say how much is filled, numbers can
 *  add up, dates have a first and a last. */
export function summaryOpsFor(kind: string): SummaryOp[] {
  if (isNumeric(kind)) return ["none", "count", "sum", "average", "min", "max", "filled"];
  if (kind === "date" || kind === "datetime") return ["none", "count", "earliest", "latest", "filled"];
  return ["none", "count", "filled"];
}

/** A number column adds up until the person says otherwise (as the table always has); the rest say nothing. */
export function defaultSummary(kind: string): SummaryOp {
  return isNumeric(kind) ? "sum" : "none";
}

const present = (v: unknown) => v !== null && v !== undefined && v !== "";

/** The footer's words for one column over the records the view shows (not only the page), or
 *  null for none. Nothing to work out reads "—", never a made-up zero. */
export function summarize(rows: RecordRow[], field: FieldInfo, op: SummaryOp): { label: string; value: string } | null {
  if (op === "none") return null;
  const label = SUMMARY_LABEL[op];
  const values = rows.map((r) => r.values[field.name]).filter(present);
  if (op === "count") return { label, value: values.length.toLocaleString() };
  if (op === "filled") return { label, value: rows.length ? `${Math.round((values.length / rows.length) * 100)}%` : "—" };
  if (op === "earliest" || op === "latest") {
    const days = values.map(String).sort();
    const pick = days.length ? (op === "earliest" ? days[0] : days[days.length - 1]) : "";
    return { label, value: pick ? (field.kind === "datetime" ? when(pick) : formatDay(pick.slice(0, 10))) : "—" };
  }
  const nums = values.filter((v): v is number => typeof v === "number");
  if (!nums.length) return { label, value: "—" };
  const total = nums.reduce((a, b) => a + b, 0);
  const n = op === "sum" ? total : op === "average" ? total / nums.length : op === "min" ? Math.min(...nums) : Math.max(...nums);
  return { label, value: formatNumber(n, field.unit) };
}
