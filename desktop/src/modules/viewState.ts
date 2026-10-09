/**
 * What one view (a tab of the data view) is: its layout, filters, sorts, groups and colours
 * (9 Oct, the owner's Notion parity pass). The core's saved list keeps the part it knows
 * (`toConfig`); the window keeps the whole in `PREF.viewSettings[`${source}:${list}`]`, with the
 * core config it last saw, so a list Alpha changes since wins for the part the core holds.
 */
import type { SavedList } from "../core/client";
import type { ColorRule, FilterGroup, FilterRule, Sort } from "./views/engine";
import type { PageView } from "./DataToolbar";

export type RowHeight = "compact" | "medium" | "tall";
export type OpenIn = "page" | "side" | "center";
export interface ChartSettings {
  type: "bar" | "line" | "donut";
  /** The field along the x axis (a date per day, anything else per group); the date field by default. */
  x?: string;
  agg: "count" | "sum" | "average";
  of?: string;
}

export interface ViewState {
  view: PageView;
  rules: FilterRule[];
  advanced: FilterGroup | null;
  hideDone: boolean;
  hidden: string[];
  sorts: Sort[];
  groupBy: string | null;
  dateBy: string | null;
  subGroupBy: string | null;
  hideEmptyGroups: boolean;
  groupOrder: "manual" | "asc" | "desc";
  collapsed: string[];
  lines: boolean;
  wrapAll: boolean;
  rowHeight: RowHeight;
  openIn: OpenIn;
  /** Records loaded before "Load more"; null pages instead. */
  loadLimit: number | null;
  colors: ColorRule[];
  chart: ChartSettings;
}

/** What the window keeps per view: the state, and the core config it was saved against. */
export type KeptView = Partial<ViewState> & { core?: string };

export const DEFAULT_VIEW: ViewState = {
  view: "table",
  rules: [],
  advanced: null,
  hideDone: false,
  hidden: [],
  sorts: [],
  groupBy: null,
  dateBy: null,
  subGroupBy: null,
  hideEmptyGroups: false,
  groupOrder: "manual",
  collapsed: [],
  lines: false,
  wrapAll: false,
  rowHeight: "medium",
  openIn: "page",
  loadLimit: null,
  colors: [],
  chart: { type: "bar", agg: "count" },
};

/** The part of a view the core's list holds. */
export function toConfig(s: ViewState): SavedList["config"] {
  const filters: Record<string, string> = {};
  for (const r of s.rules) if (r.op === "is" && r.value) filters[r.field] = r.value;
  return { filters, hide_done: s.hideDone, hidden: s.hidden, sort: s.sorts[0] ?? null, view: s.view, group_by: s.groupBy ?? undefined, date_by: s.dateBy ?? undefined };
}

function fromConfig(c: SavedList["config"]): Partial<ViewState> {
  const out: Partial<ViewState> = {
    rules: Object.entries(c.filters ?? {})
      .filter(([, v]) => v)
      .map(([field, value]) => ({ field, op: "is" as const, value })),
    hideDone: c.hide_done ?? false,
    hidden: c.hidden ?? [],
    sorts: c.sort ? [c.sort] : [],
    groupBy: c.group_by ?? null,
    dateBy: c.date_by ?? null,
  };
  if (c.view) out.view = c.view as PageView;
  return out;
}

/** A view as it opens: the defaults, what the window kept, and the core's list where it changed
 *  since the window last saved it (or where the window kept nothing). `starred` are the person's
 *  ★ defaults from the dropdowns (row height, where records open), under what the view keeps. */
export function stateFor(config: SavedList["config"] | undefined, kept: KeptView | undefined, fallbackView: PageView = "table", starred: Partial<ViewState> = {}): ViewState {
  const { core, ...mine } = kept ?? {};
  const base: ViewState = { ...DEFAULT_VIEW, view: fallbackView, ...starred, ...mine };
  if (!config) return base;
  if (kept && core === JSON.stringify(config)) return base;
  return { ...base, ...fromConfig(config) };
}
