/**
 * What a view does to rows before anything is drawn: search, filters, hiding done and gone
 * rows, sorting, paging, totals. Pure functions over `RecordRow`s, so a view's behaviour is
 * tested without a browser and shared by every kind of view (table, board, list, calendar,
 * chart, and the ones to come).
 */
import type { RecordRow } from "../../core/client";
import { isNumeric, openChoices, type FieldInfo } from "../fields";
import { formatDay, formatNumber, humanize, when } from "../format";

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

/** What a column's footer can say about the records under it: Notion's calculations (9 Oct, the
 *  UI rulebook §6). "count" (count values) and "filled" (percent not empty) keep the ids they had
 *  before the full set, so choices already saved keep their meaning. */
export type SummaryOp =
  | "none" | "count_all" | "count" | "unique" | "empty" | "not_empty" | "percent_empty" | "filled"
  | "sum" | "average" | "median" | "min" | "max" | "range"
  | "earliest" | "latest" | "date_range"
  | "checked" | "unchecked" | "percent_checked" | "percent_unchecked"
  | "per_group";
export const SUMMARY_LABEL: Record<SummaryOp, string> = {
  none: "None", count_all: "Count all", count: "Count values", unique: "Count unique values", empty: "Count empty", not_empty: "Count not empty", percent_empty: "Percent empty", filled: "Percent not empty",
  sum: "Sum", average: "Average", median: "Median", min: "Min", max: "Max", range: "Range",
  earliest: "Earliest date", latest: "Latest date", date_range: "Date range",
  checked: "Checked", unchecked: "Unchecked", percent_checked: "Percent checked", percent_unchecked: "Percent unchecked",
  per_group: "Count per group",
};

const EVERY_KIND: SummaryOp[] = ["none", "count_all", "count", "unique", "empty", "not_empty", "percent_empty", "filled"];
const isCheck = (kind: string) => kind === "bool" || kind === "checkbox";

/** The choices for a kind of field: every kind counts, numbers add up, dates have a first and a
 *  last, checkboxes count ticks, a choice or status counts each of its options. */
export function summaryOpsFor(kind: string): SummaryOp[] {
  if (isNumeric(kind)) return [...EVERY_KIND, "sum", "average", "median", "min", "max", "range"];
  if (kind === "date" || kind === "datetime") return [...EVERY_KIND, "earliest", "latest", "date_range"];
  if (isCheck(kind)) return [...EVERY_KIND, "checked", "unchecked", "percent_checked", "percent_unchecked"];
  if (kind === "choice" || kind === "status") return [...EVERY_KIND, "per_group"];
  return EVERY_KIND;
}

/** A number column adds up until the person says otherwise (as the table always has); the rest say nothing. */
export function defaultSummary(kind: string): SummaryOp {
  return isNumeric(kind) ? "sum" : "none";
}

const present = (v: unknown) => v !== null && v !== undefined && v !== "" && !(Array.isArray(v) && !v.length);
const DAY_MS = 86_400_000;

/** The footer's words for one column over the records the view shows (not only the page), or
 *  null for none. Nothing to work out reads "—", never a made-up zero. */
export function summarize(rows: RecordRow[], field: FieldInfo, op: SummaryOp): { label: string; value: string } | null {
  if (op === "none") return null;
  const label = SUMMARY_LABEL[op];
  const out = (value: string) => ({ label, value });
  const all = rows.map((r) => r.values[field.name]);
  const values = all.filter(present);
  const n = rows.length;
  const pct = (part: number) => (n ? `${Math.round((part / n) * 100)}%` : "—");
  switch (op) {
    case "count_all": return out(n.toLocaleString());
    case "count": return out(values.length.toLocaleString());
    case "unique": return out(new Set(values.map((v) => JSON.stringify(v))).size.toLocaleString());
    case "empty": return out((n - values.length).toLocaleString());
    case "not_empty": return out(values.length.toLocaleString());
    case "percent_empty": return out(pct(n - values.length));
    case "filled": return out(pct(values.length));
    case "checked": return out(all.filter((v) => v === true).length.toLocaleString());
    case "unchecked": return out(all.filter((v) => v !== true).length.toLocaleString());
    case "percent_checked": return out(pct(all.filter((v) => v === true).length));
    case "percent_unchecked": return out(pct(all.filter((v) => v !== true).length));
    case "per_group": {
      const counts = new Map<string, number>((field.choices ?? []).map((c) => [c, 0]));
      for (const v of values) counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
      const parts = [...counts].filter(([, c]) => c).map(([k, c]) => `${humanize(k)} ${c.toLocaleString()}`);
      return out(parts.length ? parts.join(" · ") : "—");
    }
    case "earliest":
    case "latest":
    case "date_range": {
      const days = values.map(String).sort();
      if (!days.length) return out("—");
      const show = (d: string) => (field.kind === "datetime" ? when(d) : formatDay(d.slice(0, 10)));
      if (op === "earliest") return out(show(days[0]));
      if (op === "latest") return out(show(days[days.length - 1]));
      const span = Math.round((Date.parse(days[days.length - 1].slice(0, 10)) - Date.parse(days[0].slice(0, 10))) / DAY_MS);
      return out(`${span.toLocaleString()} ${span === 1 ? "day" : "days"}`);
    }
  }
  const nums = values.filter((v): v is number => typeof v === "number").sort((a, b) => a - b);
  if (!nums.length) return out("—");
  const total = nums.reduce((a, b) => a + b, 0);
  const mid = nums.length >> 1;
  const result =
    op === "sum" ? total
    : op === "average" ? total / nums.length
    : op === "median" ? (nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2)
    : op === "min" ? nums[0]
    : op === "max" ? nums[nums.length - 1]
    : nums[nums.length - 1] - nums[0];
  return out(formatNumber(result, field.unit));
}
