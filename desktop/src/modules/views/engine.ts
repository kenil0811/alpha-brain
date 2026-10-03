/**
 * What a view does to rows before anything is drawn: search, filters, hiding done and gone
 * rows, sorting, paging, totals. Pure functions over `RecordRow`s, so a view's behaviour is
 * tested without a browser and shared by every kind of view (table, board, list, calendar,
 * chart, and the ones to come).
 */
import type { RecordRow } from "../../core/client";
import { isNumeric, openChoices, type FieldInfo } from "../fields";

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

/** Column totals for the numeric columns, over every row the view shows (not only the page). */
export function totalsFor(rows: RecordRow[], columns: string[], byName: Map<string, FieldInfo>): { field: string; value: number }[] {
  return columns
    .filter((c) => isNumeric(byName.get(c)?.kind ?? ""))
    .map((c) => ({ field: c, value: rows.reduce((sum, r) => sum + (typeof r.values[c] === "number" ? (r.values[c] as number) : 0), 0) }));
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
