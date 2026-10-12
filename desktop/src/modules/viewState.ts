/**
 * What one view (a tab of the data view) is: its layout, filters, sorts, groups and colours
 * (9 Oct, the owner's Notion parity pass). The core's saved list keeps the part it knows
 * (`toConfig`); the window keeps the whole in `PREF.viewSettings[`${source}:${list}`]`, with the
 * core config it last saw, so a list Alpha changes since wins for the part the core holds.
 */
import type { SavedList } from "../core/client";
import type { ColorRule, FilterGroup, FilterRule, Sort } from "./views/engine";
import type { PageView } from "./DataToolbar";

/** Views a saved list may still name from before (the owner, 12 Oct: List folded into Table,
 *  Chart into Dashboard). */
const RETIRED_VIEWS: Record<string, PageView> = { list: "table", chart: "dashboard" };

export type RowHeight = "compact" | "medium" | "tall";
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
  /** Records loaded before "Load more"; null pages instead. */
  loadLimit: number | null;
  colors: ColorRule[];
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
  loadLimit: null,
  colors: [],
};

/** What a list is (the rulebook §6): which rows, their order, grouping, which columns and the view
 *  type. Changing these from the toolbar is temporary until "Save to this list" (the owner, 11 Oct);
 *  the rest of a view (row height, lines, colours…) is kept as the person goes. "All" is no saved
 *  list, so its view type is simply remembered. */
const LIST_KEYS = ["rules", "advanced", "hideDone", "sorts", "groupBy", "hidden", "view"] as const;
export type ListKey = (typeof LIST_KEYS)[number];
export const listKeys = (listId: string): ListKey[] => (listId === "all" ? LIST_KEYS.filter((k) => k !== "view") : [...LIST_KEYS]);

/** Whether a view's list part differs from what is saved. */
export function differs(now: ViewState, saved: ViewState, listId: string): boolean {
  return listKeys(listId).some((k) => JSON.stringify(now[k]) !== JSON.stringify(saved[k]));
}

/** A view without its list part: what is kept as the person goes. */
export function withoutList(s: ViewState, listId: string): Partial<ViewState> {
  const out: Partial<ViewState> = { ...s };
  for (const k of listKeys(listId)) delete out[k];
  return out;
}

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
  if (c.view) out.view = RETIRED_VIEWS[c.view] ?? (c.view as PageView);
  return out;
}

/** A view as it opens: the defaults, what the window kept, and the core's list where it changed
 *  since the window last saved it (or where the window kept nothing). `starred` are the person's
 *  ★ defaults from the dropdowns (row height), under what the view keeps. */
export function stateFor(config: SavedList["config"] | undefined, kept: KeptView | undefined, fallbackView: PageView = "table", starred: Partial<ViewState> = {}): ViewState {
  const { core, ...mine } = kept ?? {};
  const base: ViewState = { ...DEFAULT_VIEW, view: fallbackView, ...starred, ...mine };
  base.view = RETIRED_VIEWS[base.view] ?? base.view;
  if (!config) return base;
  if (kept && core === JSON.stringify(config)) return base;
  return { ...base, ...fromConfig(config) };
}
