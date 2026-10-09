/**
 * The data view's toolbar (9 Oct, the UI rulebook §6): one row that never wraps. On the left,
 * always: Saved list · View · Search · Filter. On the right: at most one primary action, then
 * ⋯ More. Views the data cannot support stay in the View menu, disabled, with the reason on hover.
 * Filter holds every filtering choice, and what is active shows as small removable pills under
 * the bar. ⋯ More holds Download, Upload (unless files are what the collection is about, when
 * Upload is the primary action), sort, columns, frozen columns, footers, record page sections and
 * the list's own commands. When the window is narrow the labels become icons.
 */
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import type { SavedList } from "../core/client";
import { UploadIcon as Upload } from "../ui/icons";
import { Badge, Button, Dropdown, IconButton, Popover, type DropdownOption } from "../ui";
import { ArrowLeft, ArrowRight, BoardIcon, Calendar, ChartIcon, DashboardIcon, DownloadIcon, FilterIcon, FormIcon, GalleryIcon, ICON_SM, ListIcon, MoreHorizontal, SearchIcon, Star, Table2, TimelineIcon, X } from "../ui/icons";
import type { FieldInfo } from "./fields";
import { humanize } from "./format";
import { summaryOpsFor, SUMMARY_LABEL, type Sort, type SummaryOp } from "./views/engine";

export type PageView = "table" | "list" | "board" | "calendar" | "timeline" | "gallery" | "chart" | "form" | "dashboard";

/** Every view type, in the rulebook's order, with its icon. */
export const VIEWS: { id: PageView; label: string; icon: ReactNode }[] = [
  { id: "table", label: "Table", icon: <Table2 size={ICON_SM} /> },
  { id: "list", label: "List", icon: <ListIcon size={ICON_SM} /> },
  { id: "board", label: "Board", icon: <BoardIcon size={ICON_SM} /> },
  { id: "calendar", label: "Calendar", icon: <Calendar size={ICON_SM} /> },
  { id: "timeline", label: "Timeline", icon: <TimelineIcon size={ICON_SM} /> },
  { id: "gallery", label: "Gallery", icon: <GalleryIcon size={ICON_SM} /> },
  { id: "chart", label: "Chart", icon: <ChartIcon size={ICON_SM} /> },
  { id: "form", label: "Form", icon: <FormIcon size={ICON_SM} /> },
  { id: "dashboard", label: "Dashboard", icon: <DashboardIcon size={ICON_SM} /> },
];

/** Where the toolbar gives up its labels, in the toolbar's own width in px. A calibration, not a
 *  rule: the row has to stay one line. */
const LABELS_BELOW = 860;

function useNarrow(bar: { current: HTMLDivElement | null }): boolean {
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const fit = () => {
      const w = el.clientWidth;
      if (w) setNarrow(w < LABELS_BELOW);
    };
    fit();
    const watch = new ResizeObserver(fit);
    watch.observe(el);
    return () => watch.disconnect();
  }, [bar]);
  return narrow;
}

/** The Filter popover's content: every facet, Hide done, Show gone. */
export interface FilterState {
  facets: FieldInfo[];
  filters: Record<string, string>;
  onFilter: (field: string, value: string) => void;
  hasDone: boolean;
  hideDone: boolean;
  onHideDone: (on: boolean) => void;
  goneCount: number;
  showGone: boolean;
  onShowGone: (on: boolean) => void;
  /** Open from a column's menu. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  active: number;
}

function FilterPanel({ f }: { f: FilterState }) {
  const any = f.facets.length > 0 || f.hasDone || f.goneCount > 0;
  return (
    <div className="filterpanel">
      {f.facets.map((field) => (
        <label key={field.name} className="filterpanel__row">
          <span className="filterpanel__lab">{field.label ?? humanize(field.name)}</span>
          <Dropdown size="sm" label={`Filter by ${humanize(field.name).toLowerCase()}`} value={f.filters[field.name] ?? ""} onChange={(v) => f.onFilter(field.name, v)} options={[{ value: "", label: "Any" }, ...(field.choices ?? []).map((c) => ({ value: c, label: humanize(c) }))]} />
        </label>
      ))}
      {f.hasDone ? (
        <label className="check">
          <input type="checkbox" checked={f.hideDone} onChange={(e) => f.onHideDone(e.target.checked)} /> Hide done
        </label>
      ) : null}
      {f.goneCount ? (
        <label className="check">
          <input type="checkbox" checked={f.showGone} onChange={(e) => f.onShowGone(e.target.checked)} /> Show gone ({f.goneCount})
        </label>
      ) : null}
      {!any ? <p className="faint">Nothing to filter by. A status or choice field adds a filter.</p> : null}
    </div>
  );
}

/** What the ⋮ More menu works on. */
export interface MoreState {
  /** Download as CSV or Excel; absent, the items stay disabled with `downloadReason`. */
  onDownload?: (format: "csv" | "xlsx") => void;
  downloadReason?: string;
  /** Upload in this menu (when it is not the toolbar's primary action). */
  onUpload?: () => void;
  uploadReason?: string;
  /** Why lists can't be kept here, if they can't. */
  listsReason?: string;
  fields: FieldInfo[];
  sort: Sort | null;
  onSort: (s: Sort | null) => void;
  shownColumns: string[];
  onColumn: (name: string, on: boolean) => void;
  onMoveColumn: (name: string, by: -1 | 1) => void;
  widthsSet: boolean;
  onResetWidths: () => void;
  frozen: number;
  onFrozen: (n: number) => void;
  tall: boolean;
  onTall: (on: boolean) => void;
  summaries: Record<string, SummaryOp>;
  onSummary: (field: string, op: SummaryOp) => void;
  sections: string[];
  onSections: (next: string[]) => void;
  listId: string;
  listIsDefault: boolean;
  onSaveToList: () => void;
  onSaveAsList: () => void;
  onStar: () => void;
  onDeleteList: () => void;
  onReset: () => void;
}

/** Adding a field is the core's (no route for it yet); Alpha can do it from the panel. */
export const ADD_COLUMN_REASON = "Adding a column needs Alpha's core; ask Alpha in the panel to add a field.";

const SECTIONS: { id: string; label: string }[] = [
  { id: "notes", label: "Notes" },
  { id: "intelligence", label: "Intelligence" },
  { id: "governance", label: "Governance" },
];

function MoreMenu({ m, uploadHere }: { m: MoreState; uploadHere: boolean }) {
  const hiddenToo = m.fields.map((f) => f.name).filter((n) => !m.shownColumns.includes(n));
  const noList = m.listId === "all";
  return (
    <div className="more">
      <div className="more__stack">
        <Button size="sm" variant="ghost" icon={<DownloadIcon size={ICON_SM} />} disabledReason={m.onDownload ? undefined : m.downloadReason} onClick={() => m.onDownload?.("csv")}>
          Download as CSV
        </Button>
        <Button size="sm" variant="ghost" icon={<DownloadIcon size={ICON_SM} />} disabledReason={m.onDownload ? undefined : m.downloadReason} onClick={() => m.onDownload?.("xlsx")}>
          Download as Excel
        </Button>
        {uploadHere ? (
          <Button size="sm" variant="ghost" icon={<Upload size={ICON_SM} />} disabledReason={m.onUpload ? undefined : m.uploadReason} onClick={m.onUpload}>
            Upload
          </Button>
        ) : null}
      </div>
      <div className="menu__head">Sort</div>
      <div className="more__row">
        <Dropdown size="sm" label="Sort by" value={m.sort?.field ?? ""} onChange={(v) => m.onSort(v ? { field: v, direction: m.sort?.direction ?? "asc" } : null)} options={[{ value: "", label: "No sort" }, ...m.fields.map((f) => ({ value: f.name, label: f.label ?? humanize(f.name) }))]} />
        {m.sort ? <Dropdown size="sm" label="Sort direction" value={m.sort.direction} onChange={(v) => m.onSort({ field: m.sort!.field, direction: v })} options={[{ value: "asc", label: "Ascending" }, { value: "desc", label: "Descending" }]} /> : null}
      </div>
      <div className="menu__head">Columns</div>
      <Button size="sm" disabledReason={ADD_COLUMN_REASON}>
        Add column
      </Button>
      {[...m.shownColumns, ...hiddenToo].map((name) => {
        const at = m.shownColumns.indexOf(name);
        return (
          <div key={name} className="more__col">
            <label className="check">
              <input type="checkbox" checked={at >= 0} disabled={at >= 0 && m.shownColumns.length <= 1} onChange={(e) => m.onColumn(name, e.target.checked)} /> {humanize(name)}
            </label>
            {at >= 0 ? (
              <span className="menu__arrows">
                <IconButton size="sm" label={`Move ${humanize(name)} left`} icon={<ArrowLeft />} disabled={at === 0} onClick={() => m.onMoveColumn(name, -1)} />
                <IconButton size="sm" label={`Move ${humanize(name)} right`} icon={<ArrowRight />} disabled={at === m.shownColumns.length - 1} onClick={() => m.onMoveColumn(name, 1)} />
              </span>
            ) : null}
          </div>
        );
      })}
      {m.widthsSet ? (
        <Button size="sm" variant="ghost" onClick={m.onResetWidths}>
          Reset column widths
        </Button>
      ) : null}
      <div className="menu__head">Frozen columns</div>
      <Dropdown size="sm" label="Frozen columns" value={String(m.frozen)} onChange={(v) => m.onFrozen(Number(v))} options={[...new Set([0, 1, 2, 3, m.frozen])].filter((n) => n <= m.shownColumns.length).map((n) => ({ value: String(n), label: n === 0 ? "None" : n === 1 ? "The first column" : `The first ${n} columns` }))} />
      <div className="menu__head">Row height</div>
      <Dropdown size="sm" label="Row height" value={m.tall ? "tall" : "compact"} onChange={(v) => m.onTall(v === "tall")} options={[{ value: "compact", label: "Compact" }, { value: "tall", label: "Taller" }]} />
      <div className="menu__head">Footer summaries</div>
      {m.shownColumns.map((name) => {
        const field = m.fields.find((f) => f.name === name);
        if (!field) return null;
        return (
          <div key={name} className="more__col">
            <span className="more__name">{humanize(name)}</span>
            <Dropdown size="sm" label={`Footer summary for ${humanize(name)}`} value={m.summaries[name] ?? "none"} onChange={(v) => m.onSummary(name, v)} options={summaryOpsFor(field.kind).map((op): DropdownOption<SummaryOp> => ({ value: op, label: SUMMARY_LABEL[op] }))} />
          </div>
        );
      })}
      <div className="menu__head">Record page sections</div>
      {SECTIONS.map((s) => (
        <label key={s.id} className="check">
          <input type="checkbox" checked={m.sections.includes(s.id)} onChange={(e) => m.onSections(e.target.checked ? SECTIONS.map((x) => x.id).filter((id) => id === s.id || m.sections.includes(id)) : m.sections.filter((id) => id !== s.id))} /> {s.label}
        </label>
      ))}
      <div className="menu__head">This list</div>
      <div className="more__stack">
        <Button size="sm" onClick={m.onSaveToList} disabledReason={m.listsReason ?? (noList ? "Choose a saved list first, or add one." : undefined)}>
          Save filters to this list
        </Button>
        <Button size="sm" onClick={m.onSaveAsList} disabledReason={m.listsReason}>
          Save filters as a new list…
        </Button>
        <Button size="sm" onClick={m.onStar} disabledReason={m.listsReason ?? (noList ? "Choose a saved list first." : m.listIsDefault ? "It already opens on this list." : undefined)}>
          Open on this list
        </Button>
        <Button size="sm" variant="danger" onClick={m.onDeleteList} disabledReason={m.listsReason ?? (noList ? "All is not a list." : undefined)}>
          Delete this list
        </Button>
        <Button size="sm" variant="ghost" onClick={m.onReset}>
          Reset view
        </Button>
      </div>
    </div>
  );
}

export function DataToolbar({ lists, listId, onList, onAddList, view, onView, viewReasons, groupFields, groupBy, onGroup, dateFields, dateBy, onDate, search, onSearch, searchable, tableTitle, filter, uploadFirst, more }: {
  lists: SavedList[];
  listId: string;
  onList: (id: string) => void;
  onAddList: () => void;
  view: PageView;
  onView: (v: PageView) => void;
  /** Why a view cannot be used, per view; absent means it can. */
  viewReasons: Partial<Record<PageView, string>>;
  groupFields: FieldInfo[];
  groupBy: string;
  onGroup: (name: string) => void;
  dateFields: FieldInfo[];
  dateBy: string;
  onDate: (name: string) => void;
  search: string;
  onSearch: (s: string) => void;
  searchable: boolean;
  tableTitle: string;
  filter: FilterState;
  /** Files are what this collection is about (it has a file field): Upload is the primary action
   *  beside ⋯ rather than inside it. */
  uploadFirst: boolean;
  more: MoreState;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const icons = useNarrow(bar);
  const current = VIEWS.find((v) => v.id === view) ?? VIEWS[0];
  return (
    <div className={`toolbar toolbar--page${icons ? " toolbar--icons" : ""}`} ref={bar}>
      <Dropdown size="sm" label="Saved list" value={listId} onChange={onList} onAdd={onAddList} addLabel="Add list" options={[{ value: "all", label: "All" }, ...lists.map((l) => ({ value: l.id, label: l.title, icon: l.is_default ? <Star /> : undefined }))]} />
      <Dropdown size="sm" label="View" icon={current.icon} className="tb__view" value={view} onChange={onView} options={VIEWS.map((v) => ({ value: v.id, label: v.label, icon: v.icon, disabled: viewReasons[v.id] }))} />
      {view === "board" && groupFields.length > 1 ? <Dropdown size="sm" label="Group by" value={groupBy} onChange={onGroup} options={groupFields.map((f) => ({ value: f.name, label: `By ${humanize(f.name).toLowerCase()}` }))} /> : null}
      {(view === "calendar" || view === "timeline" || view === "chart") && dateFields.length > 1 ? <Dropdown size="sm" label="Date field" value={dateBy} onChange={onDate} options={dateFields.map((f) => ({ value: f.name, label: `By ${humanize(f.name).toLowerCase()}` }))} /> : null}
      {searchable ? (
        <div className="search">
          <SearchIcon size={ICON_SM} aria-hidden="true" />
          <input value={search} onChange={(e) => onSearch(e.target.value)} placeholder={`Search ${tableTitle.toLowerCase()}`} aria-label="Search" />
        </div>
      ) : null}
      <Popover label="Filter" align="start" open={filter.open} onOpenChange={filter.onOpenChange} trigger={
        <Button size="sm" icon={<FilterIcon size={ICON_SM} />} aria-label="Filter">
          <span className="tb__label">Filter</span>
          {filter.active ? <Badge tone="info">{filter.active}</Badge> : null}
        </Button>
      }>
        <FilterPanel f={filter} />
      </Popover>
      <span className="spacer" />
      {uploadFirst ? (
        <Button size="sm" variant="primary" icon={<Upload size={ICON_SM} />} aria-label="Upload" disabledReason={more.onUpload ? undefined : more.uploadReason} onClick={more.onUpload}>
          <span className="tb__label">Upload</span>
        </Button>
      ) : null}
      <Popover label="More" trigger={<IconButton label="More" icon={<MoreHorizontal />} />}>
        <MoreMenu m={more} uploadHere={!uploadFirst} />
      </Popover>
    </div>
  );
}

/** What is narrowing the view, as small pills that each remove themselves, with Clear all. */
export function FilterPills({ pills, onClearAll }: { pills: { key: string; text: string; onRemove: () => void }[]; onClearAll: () => void }) {
  if (!pills.length) return null;
  return (
    <div className="fpills" aria-label="Active filters">
      {pills.map((p) => (
        <Badge key={p.key} tone="info" className="fpill">
          {p.text}
          <button type="button" className="fpill__x" aria-label={`Remove filter: ${p.text}`} onClick={p.onRemove}>
            <X size={12} aria-hidden="true" />
          </button>
        </Badge>
      ))}
      <Button size="sm" variant="ghost" onClick={onClearAll}>
        Clear all
      </Button>
    </div>
  );
}
