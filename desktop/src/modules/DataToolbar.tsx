/**
 * The data view's toolbar (9 Oct, the owner's Notion parity pass): one row that never wraps. On
 * the left, the views as tabs (All and each saved list, Notion's view tabs) with "+" to add one,
 * then Filter, Sort and Search (a magnifier that opens a box). On the right: at most one primary
 * action (Upload, when files are what the collection is about) and ⋯, the view's settings. A
 * tab's menu (click the open tab, or right-click any) renames, edits, duplicates, deletes it or
 * makes it the one the collection opens on; tabs drag into order. When the window is narrow the
 * labels become icons.
 */
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { UploadIcon as Upload } from "../ui/icons";
import { Badge, Button, IconButton, Popover, useContextMenu, type ContextItem } from "../ui";
import { BoardIcon, Calendar, ChartIcon, CopyIcon, DashboardIcon, DeleteIcon, EditIcon, FilterIcon, FormIcon, GalleryIcon, ICON_SM, Link2, ListIcon, MoreHorizontal, PlusIcon, RenameIcon, SearchIcon, SortIcon, Star, Table2, TimelineIcon } from "../ui/icons";
import type { FieldInfo } from "./fields";
import { fieldLabel, SortEditor } from "./FilterUI";
import type { Sort } from "./views/engine";

export type PageView = "table" | "list" | "board" | "calendar" | "timeline" | "gallery" | "chart" | "form" | "dashboard";

/** Every view type, in Notion's order, with its icon. */
export const VIEWS: { id: PageView; label: string; icon: ReactNode }[] = [
  { id: "table", label: "Table", icon: <Table2 size={ICON_SM} /> },
  { id: "board", label: "Board", icon: <BoardIcon size={ICON_SM} /> },
  { id: "list", label: "List", icon: <ListIcon size={ICON_SM} /> },
  { id: "gallery", label: "Gallery", icon: <GalleryIcon size={ICON_SM} /> },
  { id: "calendar", label: "Calendar", icon: <Calendar size={ICON_SM} /> },
  { id: "timeline", label: "Timeline", icon: <TimelineIcon size={ICON_SM} /> },
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

/** Adding a field is the core's (no route for it yet); Alpha can do it from the panel. */
export const ADD_COLUMN_REASON = "Needs Alpha's core; ask Alpha in the panel.";

export interface ViewTab {
  id: string;
  title: string;
  view: PageView;
  isDefault: boolean;
}
export interface TabActions {
  onTab: (id: string) => void;
  /** "+": add a view of this type; absent, "+" stays disabled with `listsReason`. */
  onAdd?: (view: PageView) => void;
  listsReason?: string;
  viewReasons: Partial<Record<PageView, string>>;
  rename: (id: string) => void;
  edit: (id: string) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  setDefault: (id: string) => void;
  reorder: (from: string, to: string) => void;
}

/** The Filter button's panel: pick a property to add a rule for it, or open the advanced filter;
 *  Hide done and Show gone. */
export interface FilterState {
  fields: FieldInfo[];
  onAddRule: (field: FieldInfo) => void;
  onAdvanced: () => void;
  hasDone: boolean;
  hideDone: boolean;
  onHideDone: (on: boolean) => void;
  goneCount: number;
  showGone: boolean;
  onShowGone: (on: boolean) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  active: number;
  /** The rule just added, edited in place of the picker (Notion's way). */
  editor?: ReactNode;
}

/** A searchable list of properties, Notion's picker. */
export function PropertyPicker({ fields, onPick, label }: { fields: FieldInfo[]; onPick: (f: FieldInfo) => void; label: string }) {
  const [q, setQ] = useState("");
  const shown = fields.filter((f) => fieldLabel(f).toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div className="ppick" role="group" aria-label={label}>
      {fields.length > 7 ? <input className="ppick__q" autoFocus placeholder="Search properties" aria-label="Search properties" value={q} onChange={(e) => setQ(e.target.value)} /> : null}
      {shown.map((f) => (
        <button key={f.name} type="button" className="menu__item" onClick={() => onPick(f)}>
          {fieldLabel(f)}
        </button>
      ))}
    </div>
  );
}

function ViewTabs({ tabs, active, a }: { tabs: ViewTab[]; active: string; a: TabActions }) {
  const dragging = useRef<string | null>(null);
  const menu = useContextMenu<ViewTab>((t): ContextItem[] => {
    const all = t.id === "all";
    return [
      { label: "Rename", icon: <RenameIcon size={ICON_SM} />, onSelect: () => a.rename(t.id), disabled: all ? "All shows every record; add a view to name one." : a.listsReason },
      { label: "Edit view", icon: <EditIcon size={ICON_SM} />, onSelect: () => a.edit(t.id) },
      { label: "Duplicate view", icon: <CopyIcon size={ICON_SM} />, onSelect: () => a.duplicate(t.id), disabled: a.listsReason },
      { label: "Copy link to view", icon: <Link2 size={ICON_SM} />, onSelect: () => undefined, disabled: "Views have no address of their own yet." },
      { label: "Set as default", icon: <Star size={ICON_SM} />, onSelect: () => a.setDefault(t.id), disabled: all ? "All opens when no view is the default." : t.isDefault ? "It already opens on this view." : a.listsReason },
      { label: "Delete view", icon: <DeleteIcon size={ICON_SM} />, danger: true, separatorBefore: true, onSelect: () => a.remove(t.id), disabled: all ? "All can't be deleted." : a.listsReason },
    ];
  });
  const add = useContextMenu<void>(() => VIEWS.map((v) => ({ label: v.label, icon: v.icon, onSelect: () => a.onAdd?.(v.id), disabled: a.viewReasons[v.id] })));
  return (
    <div className="vtabs" role="tablist" aria-label="Views">
      {tabs.map((t) => {
        const icon = VIEWS.find((v) => v.id === t.view)?.icon;
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            className="vtab"
            aria-selected={t.id === active}
            draggable={t.id !== "all"}
            onDragStart={() => { dragging.current = t.id; }}
            onDragOver={(e) => { if (dragging.current && dragging.current !== t.id && t.id !== "all") e.preventDefault(); }}
            onDrop={() => { if (dragging.current) a.reorder(dragging.current, t.id); dragging.current = null; }}
            onClick={(e) => (t.id === active ? menu.openFrom(t, e.currentTarget) : a.onTab(t.id))}
            {...menu.bind(t)}
          >
            <span className="vtab__ico" aria-hidden="true">{icon}</span>
            <span className="vtab__label">{t.title}</span>
            {t.isDefault ? <Star size={12} aria-label="Opens on this view" /> : null}
          </button>
        );
      })}
      <IconButton size="sm" label="Add a view" icon={<PlusIcon size={ICON_SM} />} disabledReason={a.onAdd ? undefined : a.listsReason} onClick={(e) => add.openFrom(undefined, e.currentTarget)} />
      {menu.menu}
      {add.menu}
    </div>
  );
}

export function DataToolbar({ tabs, activeTab, tabActions, search, onSearch, searchable, tableTitle, filter, fields, sorts, onSorts, sortOpen, onSortOpen, uploadFirst, onUpload, uploadReason, settings, settingsOpen, onSettingsOpen }: {
  tabs: ViewTab[];
  activeTab: string;
  tabActions: TabActions;
  search: string;
  onSearch: (s: string) => void;
  searchable: boolean;
  tableTitle: string;
  filter: FilterState;
  fields: FieldInfo[];
  sorts: Sort[];
  onSorts: (s: Sort[]) => void;
  sortOpen: boolean;
  onSortOpen: (open: boolean) => void;
  /** Files are what this collection is about (it has a file field): Upload is the primary action
   *  beside ⋯ rather than inside it. */
  uploadFirst: boolean;
  onUpload?: () => void;
  uploadReason?: string;
  /** The ⋯ panel's content (the view's settings). */
  settings: ReactNode;
  settingsOpen: boolean;
  onSettingsOpen: (open: boolean) => void;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const icons = useNarrow(bar);
  const [searching, setSearching] = useState(false);
  const f = filter;
  return (
    <div className={`toolbar toolbar--page${icons ? " toolbar--icons" : ""}`} ref={bar}>
      <ViewTabs tabs={tabs} active={activeTab} a={tabActions} />
      <Popover label="Filter" align="start" open={f.open} onOpenChange={f.onOpenChange} trigger={
        <Button size="sm" variant="ghost" icon={<FilterIcon size={ICON_SM} />} aria-label="Filter">
          <span className="tb__label">Filter</span>
          {f.active ? <Badge tone="info">{f.active}</Badge> : null}
        </Button>
      }>
        {f.editor ?? <div className="filterpanel">
          <PropertyPicker label="Filter by" fields={f.fields} onPick={f.onAddRule} />
          <div className="menu__sep" />
          <button type="button" className="menu__item" onClick={f.onAdvanced}>
            <PlusIcon size={ICON_SM} aria-hidden="true" /> Advanced filter
          </button>
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
        </div>}
      </Popover>
      <Popover label="Sort" align="start" open={sortOpen} onOpenChange={onSortOpen} trigger={
        <Button size="sm" variant="ghost" icon={<SortIcon size={ICON_SM} />} aria-label="Sort">
          <span className="tb__label">Sort</span>
          {sorts.length ? <Badge tone="info">{sorts.length}</Badge> : null}
        </Button>
      }>
        {sorts.length ? <SortEditor fields={fields} sorts={sorts} onChange={onSorts} /> : <PropertyPicker label="Sort by" fields={fields} onPick={(x) => onSorts([{ field: x.name, direction: "asc" }])} />}
      </Popover>
      {searchable ? (
        searching || search ? (
          <div className="search search--open">
            <SearchIcon size={ICON_SM} aria-hidden="true" />
            <input
              autoFocus={searching}
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              onBlur={() => setSearching(false)}
              onKeyDown={(e) => { if (e.key === "Escape") { onSearch(""); setSearching(false); } }}
              placeholder={`Search ${tableTitle.toLowerCase()}`}
              aria-label="Search"
            />
          </div>
        ) : (
          <IconButton size="sm" label="Search" icon={<SearchIcon size={ICON_SM} />} onClick={() => setSearching(true)} />
        )
      ) : null}
      <span className="spacer" />
      {uploadFirst ? (
        <Button size="sm" variant="primary" icon={<Upload size={ICON_SM} />} aria-label="Upload" disabledReason={onUpload ? undefined : uploadReason} onClick={onUpload}>
          <span className="tb__label">Upload</span>
        </Button>
      ) : null}
      <Popover label="View settings" open={settingsOpen} onOpenChange={onSettingsOpen} trigger={<IconButton label="More" icon={<MoreHorizontal />} />}>
        {settings}
      </Popover>
    </div>
  );
}
