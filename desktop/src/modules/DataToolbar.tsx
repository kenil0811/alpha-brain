/**
 * The data view's toolbar (9 Oct, the owner's decisions): one row that never wraps. On the left,
 * the list picker (All and each saved list, a standard dropdown with ★ for the list the collection
 * opens on and Add list at the bottom), the View button (the view type's icon and name, which
 * opens the view types), then Search (a magnifier that opens a box). Right-aligned: Filter, the
 * frequent actions (Upload when the collection has a file field; the numbers' show arrow when they
 * are folded), and ⋮ at the far right, which holds Sort, the view's settings, the list's own
 * actions and Download. A right-click on the list picker gives the list's actions too. When the
 * window is narrow the labels become icons.
 */
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { UploadIcon as Upload } from "../ui/icons";
import { Badge, Button, Dropdown, IconButton, Popover, useContextMenu, type ContextItem } from "../ui";
import { BoardIcon, Calendar, ChartIcon, ChevronDown, CopyIcon, DashboardIcon, DeleteIcon, FilterIcon, FormIcon, GalleryIcon, ICON_SM, Link2, ListIcon, MoreVertical, PlusIcon, RenameIcon, SearchIcon, Star, Table2, TimelineIcon } from "../ui/icons";
import type { FieldInfo } from "./fields";
import { fieldLabel } from "./FilterUI";

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
  /** "Add list"; absent, the dropdown's "Add new…" asks Alpha (`listsReason` says why). */
  onAddList?: () => void;
  listsReason?: string;
  /** The open list's view type, and changing it. */
  view: PageView;
  onView: (view: PageView) => void;
  viewReasons: Partial<Record<PageView, string>>;
  rename: (id: string) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  setDefault: (id: string) => void;
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

/** A list's own actions: in ⋮ for the open list, and on a right-click of the list picker. */
export function listActions(t: ViewTab, a: TabActions): ContextItem[] {
  const all = t.id === "all";
  return [
    { label: "Rename list", icon: <RenameIcon size={ICON_SM} />, onSelect: () => a.rename(t.id), disabled: all ? "All shows every record; add a list to name one." : a.listsReason },
    { label: "Duplicate list", icon: <CopyIcon size={ICON_SM} />, onSelect: () => a.duplicate(t.id), disabled: a.listsReason },
    { label: "Copy link to list", icon: <Link2 size={ICON_SM} />, onSelect: () => undefined, disabled: "Lists have no address of their own yet." },
    { label: "Open on this list", icon: <Star size={ICON_SM} />, onSelect: () => a.setDefault(t.id), disabled: all ? "All opens when no list is the default." : t.isDefault ? "It already opens on this list." : a.listsReason },
    { label: "Delete list", icon: <DeleteIcon size={ICON_SM} />, danger: true, separatorBefore: true, onSelect: () => a.remove(t.id), disabled: all ? "All can't be deleted." : a.listsReason },
  ];
}

/** The list picker (the standard dropdown: search, ★ the list it opens on, Add list) and the View
 *  button beside it (the current view type's icon and name, which opens the view types). */
function ListAndView({ tabs, active, a }: { tabs: ViewTab[]; active: string; a: TabActions }) {
  const menu = useContextMenu<ViewTab>((t) => listActions(t, a));
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  const view = VIEWS.find((v) => v.id === a.view) ?? VIEWS[0];
  return (
    <>
      <span className="tb__lists" {...menu.bind(current)}>
        <Dropdown
          size="sm"
          label="List"
          value={active}
          onChange={a.onTab}
          options={tabs.map((t) => ({ value: t.id, label: t.title }))}
          defaultValue={tabs.find((t) => t.isDefault)?.id ?? "all"}
          onSetDefault={(id) => (id === "all" ? undefined : a.setDefault(id))}
          onAdd={a.onAddList}
          addLabel="Add list"
        />
      </span>
      <Dropdown size="sm" label="View" defaultKey="data.view" icon={view.icon} value={view.id} onChange={a.onView} options={VIEWS.map((v) => ({ value: v.id, label: v.label, icon: v.icon, disabled: a.viewReasons[v.id] }))} />
      {menu.menu}
    </>
  );
}

export function DataToolbar({ tabs, activeTab, tabActions, search, onSearch, searchable, tableTitle, filter, uploadFirst, onUpload, uploadReason, onShowNumbers, settings, settingsOpen, onSettingsOpen }: {
  tabs: ViewTab[];
  activeTab: string;
  tabActions: TabActions;
  search: string;
  onSearch: (s: string) => void;
  searchable: boolean;
  tableTitle: string;
  filter: FilterState;
  /** Files are what this collection is about (it has a file field): Upload is an action in the
   *  right group rather than inside ⋮. */
  uploadFirst: boolean;
  onUpload?: () => void;
  uploadReason?: string;
  /** The numbers are folded: their show arrow sits here, just left of ⋮. */
  onShowNumbers?: () => void;
  /** The ⋮ panel's content (the view's settings). */
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
      <ListAndView tabs={tabs} active={activeTab} a={tabActions} />
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
      <Popover label="Filter" align="end" open={f.open} onOpenChange={f.onOpenChange} trigger={
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
      {uploadFirst ? (
        <Button size="sm" variant="primary" icon={<Upload size={ICON_SM} />} aria-label="Upload" disabledReason={onUpload ? undefined : uploadReason} onClick={onUpload}>
          <span className="tb__label">Upload</span>
        </Button>
      ) : null}
      {onShowNumbers ? <IconButton size="sm" label="Show the numbers" icon={<ChevronDown size={ICON_SM} />} onClick={onShowNumbers} /> : null}
      <Popover label="View settings" open={settingsOpen} onOpenChange={onSettingsOpen} trigger={<IconButton label="More" icon={<MoreVertical />} />}>
        {settings}
      </Popover>
    </div>
  );
}
