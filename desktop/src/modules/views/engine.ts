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
  /** Several sorts, the first deciding first; when given, `sort` is ignored. */
  sorts?: Sort[];
  /** Notion's filters: simple rules (all must pass) and an advanced group. */
  rules?: FilterRule[];
  advanced?: FilterGroup | null;
  /** The fields, for the rules' and sorts' kinds. */
  fields?: FieldInfo[];
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
  const byName = new Map((q.fields ?? []).map((f) => [f.name, f]));
  const now = new Date();
  let out = rows.filter((r) => {
    if (words && !q.searchable.some((f) => String(r.values[f] ?? "").toLowerCase().includes(words))) return false;
    for (const [field, value] of Object.entries(q.filters)) if (value && String(r.values[field] ?? "") !== value) return false;
    if (q.hideDone && q.statusField && open && !open.has(String(r.values[q.statusField.name] ?? ""))) return false;
    if (!q.showGone && r.gone_at) return false;
    if (q.ids && !q.ids.has(r.id)) return false;
    if (q.rules?.some((rule) => !matchRule(r, rule, byName.get(rule.field), now))) return false;
    if (q.advanced && !matchGroup(r, q.advanced, byName, now)) return false;
    return true;
  });
  if (q.sorts?.length) return sortRows(out, q.sorts, byName);
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

/* ---------- Notion's filters, sorts, groups and colours (9 Oct, the owner's parity pass) ---------- */

/** What a filter rule asks of a value. The labels are Notion's. */
export type FilterOp =
  | "is" | "is_not" | "contains" | "not_contains" | "starts" | "ends" | "empty" | "not_empty"
  | "eq" | "ne" | "gt" | "lt" | "ge" | "le"
  | "before" | "after" | "on_before" | "on_after" | "within"
  | "checked" | "unchecked";
export interface FilterRule {
  field: string;
  op: FilterOp;
  value?: string;
}
/** Rules joined by And or Or; a rule may itself be a group (one level, as the window offers). */
export interface FilterGroup {
  join: "and" | "or";
  rules: (FilterRule | FilterGroup)[];
}
export const isGroup = (r: FilterRule | FilterGroup): r is FilterGroup => "rules" in r;

export const OP_LABEL: Record<FilterOp, string> = {
  is: "Is", is_not: "Is not", contains: "Contains", not_contains: "Does not contain", starts: "Starts with", ends: "Ends with", empty: "Is empty", not_empty: "Is not empty",
  eq: "=", ne: "≠", gt: ">", lt: "<", ge: "≥", le: "≤",
  before: "Is before", after: "Is after", on_before: "Is on or before", on_after: "Is on or after", within: "Is within",
  checked: "Is checked", unchecked: "Is not checked",
};

/** The operators a kind of field offers, the first being the one a new rule starts with. */
export function opsFor(kind: string): FilterOp[] {
  if (isNumeric(kind)) return ["eq", "ne", "gt", "lt", "ge", "le", "empty", "not_empty"];
  if (kind === "choice" || kind === "status") return ["is", "is_not", "empty", "not_empty"];
  if (kind === "multichoice" || kind === "relation") return ["contains", "not_contains", "empty", "not_empty"];
  if (kind === "date" || kind === "datetime") return ["is", "before", "after", "on_before", "on_after", "within", "empty", "not_empty"];
  if (isCheck(kind)) return ["checked", "unchecked"];
  if (kind === "file") return ["empty", "not_empty"];
  return ["is", "is_not", "contains", "not_contains", "starts", "ends", "empty", "not_empty"];
}
export const needsValue = (op: FilterOp) => !["empty", "not_empty", "checked", "unchecked"].includes(op);

/** A date rule's value: one of these words, or an exact day (YYYY-MM-DD). */
export const RELATIVE_DAYS: Record<string, string> = { today: "Today", tomorrow: "Tomorrow", yesterday: "Yesterday", week_ago: "One week ago", week_ahead: "One week from now", month_ago: "One month ago", month_ahead: "One month from now" };
/** "Is within" takes one of these. */
export const WITHIN: Record<string, string> = { past_week: "The past week", past_month: "The past month", past_year: "The past year", next_week: "The next week", next_month: "The next month", next_year: "The next year" };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const shifted = (now: Date, days: number, months = 0) => {
  const d = new Date(now.getFullYear(), now.getMonth() + months, now.getDate() + days);
  return iso(d);
};
/** The day a date rule's value names, as YYYY-MM-DD. */
export function resolveDay(value: string, now = new Date()): string {
  switch (value) {
    case "today": return iso(now);
    case "tomorrow": return shifted(now, 1);
    case "yesterday": return shifted(now, -1);
    case "week_ago": return shifted(now, -7);
    case "week_ahead": return shifted(now, 7);
    case "month_ago": return shifted(now, 0, -1);
    case "month_ahead": return shifted(now, 0, 1);
    default: return value.slice(0, 10);
  }
}
function withinDays(value: string, now: Date): [string, string] | null {
  const today = iso(now);
  switch (value) {
    case "past_week": return [shifted(now, -7), today];
    case "past_month": return [shifted(now, 0, -1), today];
    case "past_year": return [shifted(now, 0, -12), today];
    case "next_week": return [today, shifted(now, 7)];
    case "next_month": return [today, shifted(now, 0, 1)];
    case "next_year": return [today, shifted(now, 0, 12)];
    default: return null;
  }
}

/** Whether a row passes one rule. A rule still missing its value narrows nothing (Notion's way). */
export function matchRule(row: RecordRow, rule: FilterRule, field: FieldInfo | undefined, now = new Date()): boolean {
  const v = row.values[rule.field];
  const has = present(v);
  switch (rule.op) {
    case "empty": return !has;
    case "not_empty": return has;
    case "checked": return v === true;
    case "unchecked": return v !== true;
  }
  const want = rule.value ?? "";
  if (want === "") return true;
  const kind = field?.kind ?? "text";
  if (isNumeric(kind)) {
    const n = Number(want);
    if (typeof v !== "number" || !Number.isFinite(n)) return rule.op === "ne" && typeof v !== "number";
    switch (rule.op) {
      case "eq": return v === n;
      case "ne": return v !== n;
      case "gt": return v > n;
      case "lt": return v < n;
      case "ge": return v >= n;
      case "le": return v <= n;
    }
    return true;
  }
  if (kind === "date" || kind === "datetime") {
    if (!has) return false;
    const day = String(v).slice(0, 10);
    if (rule.op === "within") {
      const span = withinDays(want, now);
      return span ? day >= span[0] && day <= span[1] : true;
    }
    const target = resolveDay(want, now);
    switch (rule.op) {
      case "is": return day === target;
      case "before": return day < target;
      case "after": return day > target;
      case "on_before": return day <= target;
      case "on_after": return day >= target;
    }
    return true;
  }
  const q = want.toLowerCase();
  const items = Array.isArray(v) ? v.map((x) => String(x).toLowerCase()) : null;
  const s = items ? items.join(", ") : String(v ?? "").toLowerCase();
  const holds = items ? items.includes(q) || items.some((x) => x.includes(q)) : s.includes(q);
  switch (rule.op) {
    case "is": return items ? items.includes(q) : s === q;
    case "is_not": return items ? !items.includes(q) : s !== q;
    case "contains": return holds;
    case "not_contains": return !holds;
    case "starts": return s.startsWith(q);
    case "ends": return s.endsWith(q);
  }
  return true;
}

/** Whether a row passes a group: And needs every rule, Or any; an empty group passes all. */
export function matchGroup(row: RecordRow, group: FilterGroup, byName: Map<string, FieldInfo>, now = new Date()): boolean {
  if (!group.rules.length) return true;
  const one = (r: FilterRule | FilterGroup) => (isGroup(r) ? matchGroup(row, r, byName, now) : matchRule(row, r, byName.get(r.field), now));
  return group.join === "and" ? group.rules.every(one) : group.rules.some(one);
}

/** Rows in the order of several sorts, the first deciding first. A choice or status sorts by its
 *  options' order; empty values stay last either way. */
export function sortRows(rows: RecordRow[], sorts: Sort[], byName: Map<string, FieldInfo>): RecordRow[] {
  if (!sorts.length) return rows;
  const empty = (v: unknown) => !present(v);
  const rank = (field: FieldInfo | undefined, v: unknown) => {
    const at = field?.choices?.indexOf(String(v)) ?? -1;
    return at >= 0 ? at : v;
  };
  return [...rows].sort((a, b) => {
    for (const s of sorts) {
      const f = byName.get(s.field);
      const x = a.values[s.field];
      const y = b.values[s.field];
      if (empty(x) || empty(y)) {
        const c = compare(x, y);
        if (c) return c;
        continue;
      }
      const c = compare(f?.choices ? rank(f, x) : x, f?.choices ? rank(f, y) : y);
      if (c) return s.direction === "asc" ? c : -c;
    }
    return 0;
  });
}

export interface Group {
  key: string;
  label: string;
  rows: RecordRow[];
}
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Rows by any field: a choice or status in its options' order, a checkbox Checked then
 *  Unchecked, a date by month, anything else by its value; "No <field>" last. `order` sorts the
 *  groups by their values; `hideEmpty` drops groups with no rows. */
export function groupRows(rows: RecordRow[], field: FieldInfo, opts: { hideEmpty?: boolean; order?: "manual" | "asc" | "desc" } = {}): Group[] {
  const kind = field.kind;
  const keyOf = (v: unknown): string => {
    if (isCheck(kind)) return v === true ? "true" : "false";
    if (!present(v)) return "";
    if (kind === "date" || kind === "datetime") return String(v).slice(0, 7);
    return Array.isArray(v) ? v.map(String).join(", ") : String(v);
  };
  const labelOf = (key: string): string => {
    if (isCheck(kind)) return key === "true" ? "Checked" : "Unchecked";
    if (key === "") return `No ${(field.label ?? humanize(field.name)).toLowerCase()}`;
    if (kind === "date" || kind === "datetime") return `${MONTHS[Number(key.slice(5, 7)) - 1] ?? key.slice(5, 7)} ${key.slice(0, 4)}`;
    if (isNumeric(kind)) return formatNumber(Number(key), field.unit);
    return kind === "choice" || kind === "status" || kind === "multichoice" ? humanize(key) : key;
  };
  const groups = new Map<string, RecordRow[]>();
  if (isCheck(kind)) for (const k of ["true", "false"]) groups.set(k, []);
  for (const c of field.choices ?? []) if (kind !== "multichoice") groups.set(c, []);
  for (const r of rows) {
    const k = keyOf(r.values[field.name]);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  let keys = [...groups.keys()].filter((k) => k !== "");
  const natural = !(field.choices?.length || isCheck(kind));
  if (opts.order === "asc" || opts.order === "desc" || natural) {
    keys.sort((a, b) => (isNumeric(kind) ? Number(a) - Number(b) : compare(a, b)));
    if (opts.order === "desc") keys.reverse();
  }
  if (groups.has("")) keys = [...keys, ""];
  return keys.map((key) => ({ key, label: labelOf(key), rows: groups.get(key) ?? [] })).filter((g) => !opts.hideEmpty || g.rows.length);
}

/** A conditional colour: the rows (or the one cell) that pass the rule take the tone. */
export type ColorTone = "good" | "warn" | "bad" | "info" | "gray";
export interface ColorRule extends FilterRule {
  tone: ColorTone;
  target: "row" | "cell";
}
/** The colour of a row and of its cells: the first rule that matches wins. */
export function colorsOf(row: RecordRow, rules: ColorRule[], byName: Map<string, FieldInfo>): { row?: ColorTone; cells: Record<string, ColorTone> } {
  const out: { row?: ColorTone; cells: Record<string, ColorTone> } = { cells: {} };
  for (const r of rules) {
    if (!matchRule(row, r, byName.get(r.field))) continue;
    if (needsValue(r.op) && !r.value) continue; // an unfinished rule colours nothing
    if (r.target === "row") out.row ??= r.tone;
    else out.cells[r.field] ??= r.tone;
  }
  return out;
}

/** The points of a chart: one per day of a date field, or per group of any other field; the
 *  count of records, or the sum or average of a number field. */
export function chartPoints(rows: RecordRow[], x: FieldInfo, y: { agg: "count" | "sum" | "average"; field?: string }): { key: string; label: string; value: number }[] {
  const measure = (rs: RecordRow[]) => {
    if (y.agg === "count" || !y.field) return rs.length;
    const nums = rs.map((r) => r.values[y.field!]).filter((v): v is number => typeof v === "number");
    const total = nums.reduce((a, b) => a + b, 0);
    return y.agg === "sum" ? total : nums.length ? total / nums.length : 0;
  };
  if (x.kind === "date" || x.kind === "datetime") {
    const days = byDay(rows, x);
    return [...days.keys()].sort().map((d) => ({ key: d, label: formatDay(d), value: measure(days.get(d)!) }));
  }
  return groupRows(rows, x, { hideEmpty: true }).map((g) => ({ key: g.key, label: g.label, value: measure(g.rows) }));
}
