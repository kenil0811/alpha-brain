/**
 * Which of the eleven views a table can be drawn as, from its fields alone (Bridge's
 * eligibility.ts on the core's field kinds). A view is offered only when the table has the field
 * that drives it: a board needs a choice, a calendar a date, a map a place, a graph a link to
 * another table, a tree a link to its own rows.
 */
import { defaultViewConfig, VIEW_KINDS, type ViewConfig, type ViewKind } from "./engine";
import type { FieldInfo } from "../modules/fields";

export interface TableShape {
  name: string;
  fields: FieldInfo[];
}

/** A chart's axis: grouping free text gives one bar per row, which is a list drawn as a chart.
 * A date axis is a chart over time: one bar per day. */
export const CHART_AXIS = new Set(["choice", "multichoice", "status", "bool", "date", "datetime"]);
const GROUPABLE = CHART_AXIS;
const PLACE = /(^|_)(location|address|city|country|place|where|region|town|coordinates|geo|latlng)($|_)/i;

export function isPlaceField(f: FieldInfo): boolean {
  return f.kind === "text" && (PLACE.test(f.name) || PLACE.test((f.label ?? "").replace(/\s+/g, "_")));
}
export function isParentRelation(table: TableShape, f: FieldInfo): boolean {
  return f.kind === "relation" && f.relation === table.name;
}

export function driverField(table: TableShape, kind: ViewKind): FieldInfo | undefined {
  const f = table.fields;
  if (kind === "board") return f.find((x) => x.kind === "status") ?? f.find((x) => x.kind === "choice");
  if (kind === "calendar" || kind === "timeline") return f.find((x) => x.kind === "date") ?? f.find((x) => x.kind === "datetime");
  if (kind === "chart") return f.find((x) => x.kind === "status") ?? f.find((x) => GROUPABLE.has(x.kind) && x.kind !== "date" && x.kind !== "datetime") ?? f.find((x) => x.kind === "date") ?? f.find((x) => x.kind === "datetime");
  if (kind === "map") return f.find(isPlaceField);
  if (kind === "tree") return f.find((x) => isParentRelation(table, x));
  if (kind === "graph") return f.find((x) => x.kind === "relation" && !isParentRelation(table, x));
  return undefined;
}

const ALWAYS = new Set<ViewKind>(["table", "list", "gallery", "form"]);

export function computeEligibleKinds(table: TableShape): ViewKind[] {
  return VIEW_KINDS.filter((kind) => ALWAYS.has(kind) || driverField(table, kind) !== undefined);
}

/** Why a view isn't offered, in words, for the (i) next to it. */
export function ineligibleReason(kind: ViewKind): string {
  return {
    board: "Needs a choice or status field",
    calendar: "Needs a date field",
    timeline: "Needs a date field",
    chart: "Needs a choice, status, yes/no or date field",
    map: "Needs a place field (location, city, country or address)",
    graph: "Needs a link to another table or to people",
    tree: "Needs a link from this table to itself",
  }[kind as string] ?? "";
}

/** The config for switching to `kind`, keeping what the person set and filling the driver. */
export function viewConfigForKind(table: TableShape, kind: ViewKind, current?: Partial<ViewConfig>): ViewConfig {
  const next: ViewConfig = { ...defaultViewConfig(kind), ...current, kind };
  const names = new Set(table.fields.map((f) => f.name));
  const valid = (name: string | null | undefined) => (name && names.has(name) ? name : undefined);
  if (kind === "board") {
    const g = table.fields.find((f) => f.name === next.groupBy);
    next.groupBy = g && (g.kind === "choice" || g.kind === "status") ? g.name : (driverField(table, kind)?.name ?? null);
  }
  if (kind === "chart") {
    const g = table.fields.find((f) => f.name === next.groupBy);
    next.groupBy = g && GROUPABLE.has(g.kind) ? g.name : (driverField(table, kind)?.name ?? null);
  }
  if (kind === "calendar" || kind === "timeline") next.dateBy = valid(next.dateBy) ?? driverField(table, kind)?.name;
  if (kind === "map") next.locationBy = valid(next.locationBy) ?? driverField(table, kind)?.name;
  if (kind === "graph") next.relationBy = valid(next.relationBy) ?? driverField(table, kind)?.name;
  if (kind === "tree") next.parentBy = valid(next.parentBy) ?? driverField(table, kind)?.name;
  return next;
}

/** A saved config read back: an unknown kind or a field since removed falls back, never crashes. */
export function migrateViewConfig(table: TableShape, view: Partial<ViewConfig> | null | undefined): ViewConfig {
  const kind = VIEW_KINDS.includes(view?.kind as ViewKind) ? (view!.kind as ViewKind) : "table";
  const eligible = computeEligibleKinds(table);
  const names = new Set([...table.fields.map((f) => f.name), "created_at", "updated_at"]);
  const clean: Partial<ViewConfig> = {
    ...view,
    sorts: (view?.sorts ?? []).filter((s) => names.has(s.id)),
    rowFilters: (view?.rowFilters ?? []).filter((f) => names.has(f.field)),
    groupBy: view?.groupBy && names.has(view.groupBy) ? view.groupBy : null,
  };
  return viewConfigForKind(table, eligible.includes(kind) ? kind : "table", clean);
}
