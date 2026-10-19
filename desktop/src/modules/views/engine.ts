/**
 * What a view does to rows before anything is drawn: search, filters, hiding done and gone
 * rows, sorting, paging, totals. Pure functions over `RecordRow`s, so a view's behaviour is
 * tested without a browser and shared by every kind of view (table, board, list, calendar,
 * chart, and the ones to come).
 */
import type { RecordRow, Relations } from "../../core/client";
import { isNumeric, openChoices, type FieldInfo } from "../fields";
import { formatDay, formatNumber, humanize, monthText } from "../format";

export interface Sort {
  field: string;
  direction: "asc" | "desc";
}

/** A condition on one field (13 Oct, Q42 section 3a, the feature from pull request #5): set
 *  from a column's menu, one per column; which ones a field offers depends on its kind
 *  (`opsFor`). `in` is a choice column's ticklist. */
export type FilterOp =
  | "is" | "is_not" | "contains" | "not_contains" | "starts" | "ends"
  | "eq" | "ne" | "gt" | "lt" | "gte" | "lte" | "between"
  | "before" | "after" | "on_before" | "on_after" | "within"
  /** Days that move with the clock (P1, 18 Oct 2026): a saved "Today" stays today tomorrow. */
  | "today" | "this_week" | "before_today" | "next_days"
  | "in" | "checked" | "unchecked" | "empty" | "not_empty";

export interface FilterRule {
  field: string;
  op: FilterOp;
  /** What the field is compared with, as typed; a date as YYYY-MM-DD, "within" as a number of days. */
  value: string;
  /** The upper end of "between" (either end may be left open). */
  value2?: string;
  /** The values a ticklist (`in`) keeps; "" stands for an empty value. */
  values?: string[];
}

/** The filter rules of a view: every rule must hold ("all") or any one ("any"). */
export interface Rules {
  match: "all" | "any";
  rules: FilterRule[];
}

export const OP_WORDS: Record<FilterOp, string> = {
  is: "is", is_not: "is not", contains: "contains", not_contains: "doesn't contain", starts: "starts with", ends: "ends with",
  eq: "=", ne: "≠", gt: "more than", lt: "less than", gte: "at least", lte: "at most", between: "between", in: "is one of",
  before: "before", after: "after", on_before: "on or before", on_after: "on or after", within: "in the last (days)",
  today: "is today", this_week: "is this week", before_today: "is before today", next_days: "in the next (days)",
  checked: "is ticked", unchecked: "isn't ticked", empty: "is empty", not_empty: "isn't empty",
};

/** The conditions a kind of field offers, the first being the one a new rule starts with. */
export function opsFor(kind: string): FilterOp[] {
  if (kind === "bool") return ["checked", "unchecked"];
  if (isNumeric(kind)) return ["eq", "ne", "gt", "lt", "between", "empty", "not_empty"];
  if (kind === "date" || kind === "datetime") return ["before", "after", "between", "today", "this_week", "before_today", "within", "next_days", "empty", "not_empty"];
  if (kind === "choice" || kind === "status") return ["in"];
  if (kind === "multichoice") return ["contains", "not_contains", "empty", "not_empty"];
  if (kind === "relation" || kind === "file") return ["empty", "not_empty"];
  return ["is", "is_not", "contains", "not_contains", "starts", "ends", "empty", "not_empty"];
}

export const needsValue = (op: FilterOp) => !["empty", "not_empty", "checked", "unchecked", "today", "this_week", "before_today"].includes(op);

/** Whether a rule does anything: a condition without a value, or a ticklist with nothing taken
 *  out, narrows nothing. */
export function isComplete(rule: FilterRule): boolean {
  if (rule.op === "in") return Array.isArray(rule.values);
  if (rule.op === "between") return Boolean(rule.value.trim() || (rule.value2 ?? "").trim());
  return !needsValue(rule.op) || rule.value.trim() !== "";
}

const isEmpty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
/** A local day as YYYY-MM-DD. */
const dayOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Whether a row meets one rule. A rule still missing its value holds for every row. */
export function matchRule(row: RecordRow, rule: FilterRule, field: FieldInfo | undefined, now = new Date()): boolean {
  const v = row.values[rule.field];
  if (rule.op === "empty") return isEmpty(v);
  if (rule.op === "not_empty") return !isEmpty(v);
  if (rule.op === "checked") return v === true;
  if (rule.op === "unchecked") return v !== true;
  if (rule.op === "in") return !Array.isArray(rule.values) || rule.values.includes(isEmpty(v) ? "" : String(v));
  const kind = field?.kind ?? "text";
  if (rule.op === "today" || rule.op === "this_week" || rule.op === "before_today") {
    if (isEmpty(v)) return false;
    const day = String(v).slice(0, 10);
    const today = dayOf(now);
    if (rule.op === "today") return day === today;
    if (rule.op === "before_today") return day < today;
    // this week: Monday to Sunday, the Mac's own week
    const monday = new Date(now);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);
    return day >= dayOf(monday) && day <= dayOf(sunday);
  }
  if (rule.op === "between") {
    const lo = rule.value.trim();
    const hi = (rule.value2 ?? "").trim();
    if (!lo && !hi) return true;
    if (isEmpty(v)) return false;
    if (isNumeric(kind)) {
      const n = Number(v);
      return (!lo || n >= Number(lo)) && (!hi || n <= Number(hi));
    }
    const day = String(v).slice(0, 10);
    return (!lo || day >= lo) && (!hi || day <= hi);
  }
  const q = rule.value.trim();
  if (!q) return true;
  if (isNumeric(kind)) {
    const t = Number(q);
    if (Number.isNaN(t)) return true;
    if (isEmpty(v)) return rule.op === "ne";
    const n = Number(v);
    switch (rule.op) {
      case "eq": return n === t;
      case "ne": return n !== t;
      case "gt": return n > t;
      case "lt": return n < t;
      case "gte": return n >= t;
      case "lte": return n <= t;
      default: return true;
    }
  }
  if (kind === "date" || kind === "datetime") {
    if (isEmpty(v)) return false;
    const day = String(v).slice(0, 10);
    if (rule.op === "within") {
      const days = Number(q);
      if (Number.isNaN(days)) return true;
      const from = new Date(now);
      from.setDate(from.getDate() - days);
      return day >= dayOf(from) && day <= dayOf(now);
    }
    if (rule.op === "next_days") {
      const days = Number(q);
      if (Number.isNaN(days)) return true;
      const until = new Date(now);
      until.setDate(until.getDate() + days);
      return day >= dayOf(now) && day <= dayOf(until);
    }
    switch (rule.op) {
      case "before": return day < q;
      case "after": return day > q;
      case "on_before": return day <= q;
      case "on_after": return day >= q;
      default: return true;
    }
  }
  if (Array.isArray(v)) {
    const holds = v.map(String).includes(q);
    return rule.op === "not_contains" ? !holds : holds;
  }
  const s = String(v ?? "").toLowerCase();
  const t = q.toLowerCase();
  switch (rule.op) {
    case "is": return s === t;
    case "is_not": return s !== t;
    case "contains": return s.includes(t);
    case "not_contains": return !s.includes(t);
    case "starts": return s.startsWith(t);
    case "ends": return s.endsWith(t);
    default: return true;
  }
}

/** Whether a row meets a view's rules; with no complete rule, every row does. */
export function matchRules(row: RecordRow, rules: Rules, byName: Map<string, FieldInfo>, now = new Date()): boolean {
  const live = rules.rules.filter(isComplete);
  if (!live.length) return true;
  const one = (r: FilterRule) => matchRule(row, r, byName.get(r.field), now);
  return rules.match === "any" ? live.some(one) : live.every(one);
}

/** The rules that do something: complete ones, on fields the table has. */
export function activeRules(rules: Rules, byName: Map<string, FieldInfo>): FilterRule[] {
  return rules.rules.filter((r) => byName.has(r.field) && isComplete(r));
}

/** Rows in the order of several sorts, the first deciding first; empty values stay last
 *  whichever way a field is sorted. */
export function sortRows(rows: RecordRow[], sorts: Sort[]): RecordRow[] {
  if (!sorts.length) return rows;
  return [...rows].sort((a, b) => {
    for (const { field, direction } of sorts) {
      const x = a.values[field];
      const y = b.values[field];
      const c = isEmpty(x) || isEmpty(y) ? (isEmpty(x) && isEmpty(y) ? 0 : compare(x, y)) : (direction === "asc" ? 1 : -1) * compare(x, y);
      if (c !== 0) return c;
    }
    return 0;
  });
}

export interface ViewQuery {
  /** Words typed in the search box, matched against the searchable fields. */
  search: string;
  searchable: string[];
  /** Field → the one value it must have ("" means any): the toolbar's quick dropdowns. */
  filters: Record<string, string>;
  /** The Filter button's rules, on any field. */
  rules?: Rules;
  /** The fields a rule names, for its kind. */
  byName?: Map<string, FieldInfo>;
  hideDone: boolean;
  statusField?: FieldInfo;
  showGone: boolean;
  /** Several sorts, the first deciding first; a header click sets one. */
  sorts: Sort[];
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
  const out = rows.filter((r) => {
    if (words && !q.searchable.some((f) => String(r.values[f] ?? "").toLowerCase().includes(words))) return false;
    for (const [field, value] of Object.entries(q.filters)) if (value && String(r.values[field] ?? "") !== value) return false;
    if (q.hideDone && q.statusField && open && !open.has(String(r.values[q.statusField.name] ?? ""))) return false;
    if (!q.showGone && r.gone_at) return false;
    if (q.rules && !matchRules(r, q.rules, q.byName ?? new Map())) return false;
    return true;
  });
  return sortRows(out, q.sorts);
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

/** What a column's footer says (13 Oct, Q42 section 4a; the feature from pull request #5): chosen
 *  per column from the footer cell, over every row the view shows (not only the page), and per
 *  group in a grouped table's header rows. */
export type FooterOp = "none" | "sum" | "avg" | "min" | "max" | "count" | "empty" | "filled" | "unique" | "earliest" | "latest";

export const FOOTER_WORDS: Record<FooterOp, string> = {
  none: "None", sum: "Sum", avg: "Average", min: "Lowest", max: "Highest", count: "Count", empty: "Empty", filled: "Filled", unique: "Unique", earliest: "Earliest", latest: "Latest",
};

/** The footers a kind of column offers. */
export function footerOpsFor(kind: string): FooterOp[] {
  if (isNumeric(kind)) return ["sum", "avg", "min", "max", "count", "empty", "filled", "none"];
  if (kind === "date" || kind === "datetime") return ["count", "empty", "filled", "unique", "earliest", "latest", "none"];
  return ["count", "empty", "filled", "unique", "none"];
}

/** A column's footer until the person chooses: a sum under numbers (as before), nothing else. */
export const defaultFooter = (kind: string): FooterOp => (isNumeric(kind) ? "sum" : "none");

/** The footer each shown column has: the person's choice, else its default. */
export function footersOf(columns: string[], byName: Map<string, FieldInfo>, chosen: Record<string, FooterOp>): Record<string, FooterOp> {
  return Object.fromEntries(columns.map((c) => [c, chosen[c] ?? defaultFooter(byName.get(c)?.kind ?? "text")]));
}

/** A footer's figure over some rows, in words, or null for "none". */
export function footerValue(rows: RecordRow[], field: FieldInfo, op: FooterOp): string | null {
  if (op === "none") return null;
  const values = rows.map((r) => r.values[field.name]);
  const filled = values.filter((v) => !isEmpty(v));
  const unit = field.unit;
  const nums = filled.filter((v): v is number => typeof v === "number");
  switch (op) {
    case "count": return rows.length.toLocaleString();
    case "empty": return (values.length - filled.length).toLocaleString();
    case "filled": return filled.length.toLocaleString();
    case "unique": return new Set(filled.map((v) => JSON.stringify(v))).size.toLocaleString();
    case "sum": return formatNumber(nums.reduce((a, b) => a + b, 0), unit);
    case "avg": return nums.length ? formatNumber(Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100, unit) : "—";
    case "min": return nums.length ? formatNumber(Math.min(...nums), unit) : "—";
    case "max": return nums.length ? formatNumber(Math.max(...nums), unit) : "—";
    case "earliest":
    case "latest": {
      const days = filled.map((v) => String(v).slice(0, 10)).sort();
      if (!days.length) return "—";
      return formatDay(op === "earliest" ? days[0] : days[days.length - 1]);
    }
  }
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
export function provenanceCounts(rows: RecordRow[]): { estimated: number; assumed: number; checked: number } {
  let estimated = 0;
  let assumed = 0;
  let checked = 0;
  for (const r of rows) {
    if (r.provenance?.estimated) estimated += 1;
    else if (r.provenance?.assumed) assumed += 1;
    // Columbo's mark (Q47): the row's worked-out values, or a value a part filled
    if (r.provenance?.checked || Object.values(r.provenance?.fields ?? {}).some((f) => f.checked)) checked += 1;
  }
  return { estimated, assumed, checked };
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

/** One column's filter: the rule on that field, or none. */
export const ruleFor = (rules: Rules, field: string): FilterRule | undefined => rules.rules.find((r) => r.field === field);

/** Rules with one column's filter set (or taken off with `null`). */
export function withRule(rules: Rules, field: string, rule: FilterRule | null): Rules {
  const others = rules.rules.filter((r) => r.field !== field);
  return { ...rules, rules: rule ? [...others, rule] : others };
}

/** The sorts after a header click: that column alone; with shift, that column added as the
 *  next level (or turned around when it is already one). */
export function sortsAfterClick(sorts: Sort[], field: string, adding: boolean): Sort[] {
  const at = sorts.findIndex((s) => s.field === field);
  if (!adding) {
    const next = nextSort(sorts.length === 1 ? sorts[0] : null, field);
    return next ? [next] : [];
  }
  if (at < 0) return [...sorts, { field, direction: "asc" }];
  return sorts.map((s, i) => (i === at ? { ...s, direction: s.direction === "asc" ? "desc" : "asc" } : s));
}

/** The kinds a table can be grouped by (13 Oct, Q42 section 3b): one group per value, never one
 *  per row (long text, web links, files and plain numbers are left out). */
export function groupable(kind: string): boolean {
  return ["choice", "status", "bool", "relation", "text", "date", "datetime"].includes(kind);
}

export interface RowGroup {
  key: string;
  label: string;
  rows: RecordRow[];
}

const MONTH = (key: string) => {
  const [y, m] = key.split("-").map(Number);
  return y && m ? monthText(y, m - 1) : key;
};

/** The rows in groups by one field, in the field's own order: a choice or status keeps its
 *  choices' order, a tick is Ticked then Not ticked, a date groups by month, the rest A to Z;
 *  Empty is last. Rows keep their order inside a group. */
export function groupRows(rows: RecordRow[], field: FieldInfo, relations: Relations = {}): RowGroup[] {
  const kind = field.kind;
  const keyOf = (r: RecordRow): string => {
    const v = r.values[field.name];
    if (kind === "bool") return v === true ? "true" : "false";
    if (isEmpty(v)) return "";
    if (kind === "date" || kind === "datetime") return String(v).slice(0, 7);
    if (Array.isArray(v)) return String(v[0] ?? "");
    return String(v);
  };
  const labelOf = (key: string): string => {
    if (kind === "bool") return key === "true" ? "Ticked" : "Not ticked";
    if (key === "") return "Empty";
    // what the rows say the value is in words (a task's place, its owner, P1)
    const said = byKey.get(key)?.[0]?.words?.[field.name];
    if (typeof said === "string" && said) return said;
    if (kind === "date" || kind === "datetime") return MONTH(key);
    if (kind === "relation") return relations[field.name]?.[key] ?? key;
    if (kind === "choice" || kind === "status") return humanize(key);
    return key;
  };
  const byKey = new Map<string, RecordRow[]>();
  for (const r of rows) {
    const k = keyOf(r);
    const list = byKey.get(k);
    if (list) list.push(r);
    else byKey.set(k, [r]);
  }
  let keys = [...byKey.keys()];
  if (kind === "choice" || kind === "status") {
    const order = field.choices ?? [];
    keys.sort((a, b) => (a === "" ? 1 : b === "" ? -1 : (order.indexOf(a) < 0 ? 1e9 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 1e9 : order.indexOf(b)) || a.localeCompare(b)));
  } else if (kind === "bool") {
    keys = ["true", "false"].filter((k) => byKey.has(k));
  } else if (kind === "date" || kind === "datetime") {
    keys.sort((a, b) => (a === "" ? 1 : b === "" ? -1 : a.localeCompare(b))); // months in time order
  } else {
    keys.sort((a, b) => (a === "" ? 1 : b === "" ? -1 : labelOf(a).localeCompare(labelOf(b), undefined, { numeric: true })));
  }
  return keys.map((key) => ({ key, label: labelOf(key), rows: byKey.get(key)! }));
}

/** One line of a grouped table: a group's header, or a row. */
export type GroupItem = { kind: "group"; key: string; label: string; count: number; folded: boolean; continued?: boolean; rows: RecordRow[] } | { kind: "row"; row: RecordRow; group: string };

/** A grouped table as lines: each group's header, then its rows unless folded. */
export function groupItems(groups: RowGroup[], folded: Set<string>): GroupItem[] {
  return groups.flatMap((g): GroupItem[] => [
    { kind: "group", key: g.key, label: g.label, count: g.rows.length, folded: folded.has(g.key), rows: g.rows },
    ...(folded.has(g.key) ? [] : g.rows.map((row): GroupItem => ({ kind: "row", row, group: g.key }))),
  ]);
}

/** A page of a grouped table: a page that starts inside a group repeats its header, marked continued. */
export function pageOfGroups(items: GroupItem[], at: number, size: number): { items: GroupItem[]; at: number; pages: number } {
  const page = pageOf(items, at, size);
  const first = page.rows[0];
  if (first?.kind === "row") {
    const header = items.find((i): i is Extract<GroupItem, { kind: "group" }> => i.kind === "group" && i.key === first.group);
    if (header) return { items: [{ ...header, continued: true }, ...page.rows], at: page.at, pages: page.pages };
  }
  return { items: page.rows, at: page.at, pages: page.pages };
}

/** Main's five tones (the pills'), the only colours a table's values take (13 Oct, Q42 section 4d). */
export type Tone = "good" | "warn" | "bad" | "info" | "gray";
export const TONE_WORDS: Record<Tone, string> = { good: "Green", warn: "Amber", bad: "Red", info: "Blue", gray: "Grey" };

/** A table's colours, kept for the table (not a list): a tone per value of a choice column, one
 *  condition and its tone for a number, date or text column, and the column whose values tint rows. */
export interface Colours {
  tint: string | null;
  values: Record<string, Record<string, Tone>>;
  rules: Record<string, { op: FilterOp; value: string; value2?: string; tone: Tone }>;
}
export const NO_COLOURS: Colours = { tint: null, values: {}, rules: {} };

/** The tone a value takes in its cell, or none. */
export function toneOf(row: RecordRow, field: FieldInfo, colours: Colours, now = new Date()): Tone | null {
  const byValue = colours.values[field.name];
  const v = row.values[field.name];
  if (byValue && !isEmpty(v)) return byValue[String(v)] ?? null;
  const rule = colours.rules[field.name];
  if (!rule) return null;
  const asRule: FilterRule = { field: field.name, op: rule.op, value: rule.value, value2: rule.value2 };
  // "is empty" colours what is empty; any other condition colours only a value that is there
  if (!isComplete(asRule) || (isEmpty(v) && rule.op !== "empty")) return null;
  return matchRule(row, asRule, field, now) ? rule.tone : null;
}

/** The tone a row is tinted with, from the tinting column's value, or none. */
export function tintOf(row: RecordRow, colours: Colours): Tone | null {
  if (!colours.tint) return null;
  const v = row.values[colours.tint];
  return isEmpty(v) ? null : (colours.values[colours.tint]?.[String(v)] ?? null);
}
