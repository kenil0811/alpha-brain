/**
 * The table engine: views as data, and the pure filter / sort / group / search / summary logic
 * every view draws from. Ported from Bridge's `@bridge/tables` (engine.ts, types.ts,
 * location.ts) and its dataviews `aggregate.ts` / `rowSearch.ts`, with Bridge's column kinds
 * mapped onto the core's field kinds (text, long_text, number, date, datetime, bool, choice,
 * multichoice, status, url, relation).
 */

/** One row as the views see it: the record's values with `id`, `created_at`, `updated_at`. */
export type DataRow = Record<string, unknown> & { id: string };

export type ViewKind = "table" | "board" | "list" | "timeline" | "chart" | "gallery" | "form" | "calendar" | "map" | "graph" | "tree";
export const VIEW_KINDS: readonly ViewKind[] = ["table", "board", "list", "timeline", "chart", "gallery", "form", "calendar", "map", "graph", "tree"];

export type FilterOp =
  | "contains"
  | "does_not_contain"
  | "is"
  | "is_not"
  | "is_empty"
  | "is_not_empty"
  | "starts_with"
  | "ends_with"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "before"
  | "after"
  | "on_or_before"
  | "on_or_after"
  | "is_any_of"
  | "is_none_of"
  | "is_checked"
  | "is_not_checked";

/** A filter's value: words, or a day relative to today (`{ $today: -7 }` is a week ago), so a
 * saved "this week" list stays current. */
export type FilterValue = string | { $today: number };

export interface RowFilter {
  field: string;
  op: FilterOp;
  value: FilterValue;
}

/** The day `n` days from today, as the date inputs write it (local time). */
export function dayFromToday(n: number, today = new Date()): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A filter value as text, with a relative day filled in. */
export function filterText(value: FilterValue | undefined | null): string {
  if (value && typeof value === "object" && typeof value.$today === "number") return dayFromToday(value.$today);
  return typeof value === "string" ? value : "";
}
export interface SortSpec {
  id: string;
  dir: "asc" | "desc";
}
export type AggregateKind = "average" | "sum" | "min" | "max" | "median" | "range" | "count" | "filled" | "empty" | "unique";

/** A view is data: saved in the core, swappable, never a branch of a component. */
export interface ViewConfig {
  kind: ViewKind;
  sorts: SortSpec[];
  rowFilters: RowFilter[];
  filterMatch: "all" | "any";
  groupBy: string | null;
  subGroupBy?: string | null;
  collapsedGroups?: string[];
  hidden?: string[];
  columnOrder?: string[];
  columnWidths?: Record<string, number>;
  frozenColumnId?: string | null;
  wrapCells?: boolean;
  /** columnId -> the footer summary, or "none". */
  aggregates?: Record<string, AggregateKind | "none">;
  dateBy?: string;
  endDateBy?: string;
  timelineZoom?: "day" | "week" | "month";
  chartShape?: "bar" | "line" | "donut";
  chartAggregate?: AggregateKind;
  chartValueField?: string;
  locationBy?: string;
  relationBy?: string;
  parentBy?: string;
  /** The search box, kept with a saved list. */
  search?: string;
  /** Leave out rows whose status is one of its done choices. */
  hideDone?: boolean;
}

export const defaultViewConfig = (kind: ViewKind = "table"): ViewConfig => ({ kind, sorts: [], rowFilters: [], filterMatch: "all", groupBy: null });

// ---------- filters ----------

export const VALUELESS_FILTER_OPS: readonly FilterOp[] = ["is_empty", "is_not_empty", "is_checked", "is_not_checked"];
const TEXT_OPS: readonly FilterOp[] = ["contains", "does_not_contain", "is", "is_not", "starts_with", "ends_with", "is_empty", "is_not_empty"];
const NUMBER_OPS: readonly FilterOp[] = ["is", "is_not", "gt", "gte", "lt", "lte", "is_empty", "is_not_empty"];
const DATE_OPS: readonly FilterOp[] = ["is", "is_not", "before", "after", "on_or_before", "on_or_after", "is_empty", "is_not_empty"];
const CHOICE_OPS: readonly FilterOp[] = ["is", "is_not", "is_any_of", "is_none_of", "is_empty", "is_not_empty"];
const CHECKBOX_OPS: readonly FilterOp[] = ["is_checked", "is_not_checked"];

/** The operators that make sense for a field kind, so a picker never offers "before" on a number. */
export function filterOpsForKind(kind: string): readonly FilterOp[] {
  if (kind === "number") return NUMBER_OPS;
  if (kind === "date" || kind === "datetime") return DATE_OPS;
  if (kind === "choice" || kind === "status" || kind === "multichoice") return CHOICE_OPS;
  if (kind === "bool") return CHECKBOX_OPS;
  return TEXT_OPS;
}

export const FILTER_OP_LABELS: Record<FilterOp, string> = {
  contains: "contains",
  does_not_contain: "does not contain",
  is: "is",
  is_not: "is not",
  is_empty: "is empty",
  is_not_empty: "is not empty",
  starts_with: "starts with",
  ends_with: "ends with",
  gt: "is more than",
  gte: "is at least",
  lt: "is less than",
  lte: "is at most",
  before: "is before",
  after: "is after",
  on_or_before: "is on or before",
  on_or_after: "is on or after",
  is_any_of: "is any of",
  is_none_of: "is none of",
  is_checked: "is yes",
  is_not_checked: "is no",
};

function optionList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0);
}

function isChecked(raw: unknown): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  const text = String(raw ?? "").trim().toLowerCase();
  return text === "true" || text === "yes" || text === "1";
}

function timestamp(raw: unknown): number {
  const text = String(raw ?? "").trim();
  return text === "" ? Number.NaN : new Date(text).getTime();
}

function passesOne(row: Record<string, unknown>, filter: RowFilter, kind: string | undefined): boolean {
  const f = { ...filter, value: filterText(filter.value) };
  const raw = row[f.field];
  const cell = Array.isArray(raw) ? raw.join(" ") : String(raw ?? "");
  const cellLow = cell.toLowerCase();
  const valLow = f.value.toLowerCase();
  switch (f.op) {
    case "is_empty":
      return cell.trim() === "";
    case "is_not_empty":
      return cell.trim() !== "";
    case "is_checked":
      return isChecked(raw);
    case "is_not_checked":
      return !isChecked(raw);
    case "is_any_of":
    case "is_none_of": {
      const wanted = optionList(f.value);
      if (wanted.length === 0) return true;
      const held = Array.isArray(raw) ? raw.map((v) => String(v).toLowerCase()) : [cellLow];
      const any = held.some((v) => wanted.includes(v));
      return f.op === "is_any_of" ? any : !any;
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      // A number comparison on something that is not a number excludes the row: "> 5"
      // matching "apple" would be a lie.
      if (f.value === "") return true;
      if (raw === null || raw === undefined || raw === "") return false;
      const left = Number(raw);
      const right = Number(f.value);
      if (Number.isNaN(left) || Number.isNaN(right)) return false;
      return f.op === "gt" ? left > right : f.op === "gte" ? left >= right : f.op === "lt" ? left < right : left <= right;
    }
    case "before":
    case "after":
    case "on_or_before":
    case "on_or_after": {
      if (f.value.trim() === "") return true;
      const left = timestamp(raw);
      const right = timestamp(f.value);
      if (Number.isNaN(left) || Number.isNaN(right)) return false;
      return f.op === "before" ? left < right : f.op === "after" ? left > right : f.op === "on_or_before" ? left <= right : left >= right;
    }
    case "is":
    case "is_not": {
      if (!f.value) return true;
      let same: boolean;
      if (kind === "date" || kind === "datetime") {
        // Dates compare as days, so "2026-09-06" matches "2026-09-06T10:00".
        same = cell.slice(0, 10) === f.value.slice(0, 10);
      } else if (kind === "number") {
        same = raw !== null && raw !== undefined && raw !== "" && Number(raw) === Number(f.value);
      } else if (Array.isArray(raw)) {
        same = raw.some((v) => String(v).toLowerCase() === valLow);
      } else {
        same = cellLow === valLow;
      }
      return f.op === "is" ? same : !same;
    }
    case "starts_with":
      return f.value ? cellLow.startsWith(valLow) : true;
    case "ends_with":
      return f.value ? cellLow.endsWith(valLow) : true;
    case "does_not_contain":
      return f.value ? !cellLow.includes(valLow) : true;
    default:
      return f.value ? cellLow.includes(valLow) : true;
  }
}

export function isActiveFilter(f: RowFilter): boolean {
  return VALUELESS_FILTER_OPS.includes(f.op) || filterText(f.value) !== "";
}

/** Apply a view's filters. `kinds` (field -> kind) makes "is" on a date match the same day. */
export function applyFilters<T extends Record<string, unknown>>(rows: T[], filters: RowFilter[], matchMode: "all" | "any" = "all", kinds: Record<string, string> = {}): T[] {
  const active = filters.filter(isActiveFilter);
  if (!active.length) return rows;
  return rows.filter((row) => (matchMode === "any" ? active.some((f) => passesOne(row, f, kinds[f.field])) : active.every((f) => passesOne(row, f, kinds[f.field]))));
}

// ---------- sorts ----------

function empty(v: unknown): boolean {
  return v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
}

function compareOne(a: Record<string, unknown>, b: Record<string, unknown>, s: SortSpec): number {
  const av = a[s.id];
  const bv = b[s.id];
  // Empty cells sink to the bottom whichever way the sort runs.
  if (empty(av) || empty(bv)) return empty(av) === empty(bv) ? 0 : empty(av) ? 1 : -1;
  const dir = s.dir === "asc" ? 1 : -1;
  if (typeof av === "boolean" || typeof bv === "boolean") return (Number(Boolean(av)) - Number(Boolean(bv))) * dir;
  const avn = Number(av);
  const bvn = Number(bv);
  if (!Number.isNaN(avn) && !Number.isNaN(bvn)) return (avn - bvn) * dir;
  return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) * dir;
}

/** Multi-sort: sorts[0] is primary, later entries break ties. */
export function applySorts<T extends Record<string, unknown>>(rows: T[], sorts: SortSpec[]): T[] {
  if (!sorts.length) return rows;
  return [...rows].sort((a, b) => {
    for (const s of sorts) {
      const c = compareOne(a, b, s);
      if (c !== 0) return c;
    }
    return 0;
  });
}

// ---------- grouping ----------

export const NO_VALUE = "No value";

/** Rows bucketed by a field. `order` (a choice field's choices) keeps the field's own order;
 * otherwise groups sort by name, with "No value" last. */
export function groupBy<T extends Record<string, unknown>>(rows: T[], field: string, order?: readonly string[]): Array<[string, T[]]> {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const raw = row[field];
    const key = empty(raw) ? NO_VALUE : Array.isArray(raw) ? raw.join(", ") : typeof raw === "boolean" ? (raw ? "Yes" : "No") : String(raw);
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(row);
  }
  const rank = (k: string) => (k === NO_VALUE ? Number.MAX_SAFE_INTEGER : order ? (order.indexOf(k) < 0 ? order.length : order.indexOf(k)) : 0);
  return [...buckets.entries()].sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, undefined, { numeric: true }));
}

// ---------- search ----------

/** Keeps a row when any of its values contains the query (case-insensitive). */
export function filterRowsByQuery<T extends Record<string, unknown>>(rows: T[], query: string, skip: readonly string[] = ["id"]): T[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) =>
    Object.entries(row).some(([key, value]) => {
      if (skip.includes(key) || value === null || value === undefined) return false;
      if (Array.isArray(value)) return value.some((entry) => String(entry).toLowerCase().includes(q));
      return String(value).toLowerCase().includes(q);
    }),
  );
}

// ---------- footer summaries ----------

export const AGGREGATE_LABELS: Record<AggregateKind, string> = {
  average: "Average",
  sum: "Sum",
  min: "Min",
  max: "Max",
  median: "Median",
  range: "Range",
  count: "Count",
  filled: "Filled",
  empty: "Empty",
  unique: "Unique",
};

export function availableAggregates(numeric: boolean): AggregateKind[] {
  return numeric ? ["sum", "average", "min", "max", "median", "range", "count", "filled", "empty", "unique"] : ["count", "filled", "empty", "unique"];
}

export interface AggregateResult {
  kind: AggregateKind;
  /** null when it cannot be worked out, e.g. the average of nothing. */
  value: number | null;
  /** True when the result is a count of rows rather than a value in the column's unit. */
  isCount: boolean;
}

/** Empty cells count only for count/empty/filled: averaging three of five filled rows averages
 * the three, it does not treat the gaps as zero. */
export function computeAggregate(values: unknown[], kind: AggregateKind): AggregateResult {
  const counted = (value: number): AggregateResult => ({ kind, value, isCount: true });
  if (kind === "count") return counted(values.length);
  if (kind === "empty") return counted(values.filter(empty).length);
  if (kind === "filled") return counted(values.filter((v) => !empty(v)).length);
  if (kind === "unique") return counted(new Set(values.filter((v) => !empty(v)).map((v) => String(v))).size);
  const numbers = values
    .filter((v) => !empty(v))
    .map((v) => (typeof v === "number" ? v : Number(v)))
    .filter((n) => Number.isFinite(n));
  if (numbers.length === 0) return { kind, value: null, isCount: false };
  const sorted = [...numbers].sort((a, b) => a - b);
  const sum = numbers.reduce((total, n) => total + n, 0);
  const value =
    kind === "sum"
      ? sum
      : kind === "average"
        ? sum / numbers.length
        : kind === "min"
          ? sorted[0]!
          : kind === "max"
            ? sorted[sorted.length - 1]!
            : kind === "range"
              ? sorted[sorted.length - 1]! - sorted[0]!
              : sorted.length % 2 === 0
                ? (sorted[sorted.length / 2 - 1]! + sorted[sorted.length / 2]!) / 2
                : sorted[Math.floor(sorted.length / 2)]!;
  return { kind, value, isCount: false };
}

// ---------- places ----------

export interface GeoCoordinate {
  latitude: number;
  longitude: number;
}

function coordinate(latitude: unknown, longitude: unknown): GeoCoordinate | null {
  const lat = typeof latitude === "number" ? latitude : Number(String(latitude ?? "").trim() || Number.NaN);
  const lng = typeof longitude === "number" ? longitude : Number(String(longitude ?? "").trim() || Number.NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { latitude: lat, longitude: lng };
}

/** A place as text: "Lisbon", "38.72, -9.14" or "Lisbon | 38.72, -9.14". Never geocodes. */
export function parseLocationValue(value: unknown): { label: string; coordinate: GeoCoordinate | null } | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  const pair = (s: string) => {
    const m = s.trim().match(/^([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)$/);
    return m ? coordinate(m[1], m[2]) : null;
  };
  const bar = text.lastIndexOf("|");
  if (bar >= 0) {
    const point = pair(text.slice(bar + 1));
    if (point) return { label: text.slice(0, bar).trim() || text.slice(bar + 1).trim(), coordinate: point };
  }
  return { label: text, coordinate: pair(text) };
}
