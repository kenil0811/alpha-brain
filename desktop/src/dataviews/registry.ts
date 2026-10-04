/**
 * The eleven registered views (Bridge's VIEW_COMPONENT_REGISTRY). A saved view's kind can only
 * ever be one of these; there is no path from an arbitrary string to a component.
 */
import type { ComponentType } from "react";
import { BarChart3, CalendarDays, Columns3, GanttChartSquare, Images, List, ListTree, Map, Network, Rows3, TextCursorInput, type LucideIcon } from "lucide-react";
import type { ViewKind } from "./engine";
import type { ViewProps } from "./types";
import { TableView } from "./views/TableView";
import { BoardView, GalleryView, ListView } from "./views/CardViews";
import { CalendarView, TimelineView } from "./views/TimeViews";
import { ChartView } from "./views/ChartView";
import { FormView } from "./views/FormView";
import { MapView } from "./views/MapView";
import { GraphView, TreeView } from "./views/LinkViews";

export const VIEW_COMPONENTS: Record<ViewKind, ComponentType<ViewProps>> = {
  table: TableView,
  board: BoardView,
  list: ListView,
  timeline: TimelineView,
  chart: ChartView,
  gallery: GalleryView,
  form: FormView,
  calendar: CalendarView,
  map: MapView,
  graph: GraphView,
  tree: TreeView,
};

export const VIEW_METADATA: Record<ViewKind, { label: string; icon: LucideIcon }> = {
  table: { label: "Table", icon: Rows3 },
  list: { label: "List", icon: List },
  board: { label: "Board", icon: Columns3 },
  gallery: { label: "Gallery", icon: Images },
  calendar: { label: "Calendar", icon: CalendarDays },
  timeline: { label: "Timeline", icon: GanttChartSquare },
  chart: { label: "Chart", icon: BarChart3 },
  map: { label: "Map", icon: Map },
  graph: { label: "Graph", icon: Network },
  tree: { label: "Tree", icon: ListTree },
  form: { label: "Form", icon: TextCursorInput },
};

/** Views that page their rows; the rest draw every matching row (a chart of one page would lie). */
export const PAGED: ReadonlySet<ViewKind> = new Set(["table", "list", "gallery"]);
