/**
 * The data view's toolbar (9 Oct, the owner's decisions; 11 Oct for lists and narrow windows): one
 * row that never wraps. On the left, the list picker (All and each saved list, a standard dropdown
 * with ★ for the list the collection opens on and Add list at the bottom), the View button (the
 * view type's icon and name), then Search (a bordered box, typed into once clicked). Right-aligned:
 * Filter, the frequent actions (Upload when the collection has a file field; the numbers' show
 * arrow when they are folded), and ⋮ at the far right. Filter and ⋮ are the kit's menu (arrow keys,
 * Escape back to the button). A right-click on the list picker gives the list's actions too.
 * When the row would not fit it gives way in steps: the labels become icons (named on hover), then
 * Filter and the frequent actions move inside ⋮. It never runs under the assistant panel.
 */
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { Badge, Button, Dropdown, IconButton, useContextMenu, type ContextItem } from "../ui";
import { BoardIcon, Calendar, ChartIcon, ChevronDown, CopyIcon, DashboardIcon, DeleteIcon, EditIcon, FilterIcon, FormIcon, GalleryIcon, ICON_SM, Link2, ListIcon, MoreVertical, PlusIcon, SearchIcon, Star, Table2, TimelineIcon, UploadIcon } from "../ui/icons";
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

/** How far the row has given way: 0 everything with words, 1 icons only, 2 Filter and the
 *  frequent actions inside ⋮. Measured, not guessed: a step is taken while the row overflows,
 *  and a wider row or new `words` (a list's name, the filter count…) start again from 0 (before
 *  paint, so nothing flickers). */
function useFit(bar: { current: HTMLDivElement | null }, words: string): number {
  const [level, setLevel] = useState(0);
  const measured = useRef(words);
  useLayoutEffect(() => {
    if (measured.current !== words) {
      measured.current = words;
      if (level) return setLevel(0);
    }
    const el = bar.current;
    if (el && level < 2 && el.scrollWidth > el.clientWidth + 1) setLevel(level + 1);
  });
  useLayoutEffect(() => {
    const el = bar.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let last = el.clientWidth;
    const watch = new ResizeObserver(() => {
      const w = el.clientWidth;
      if (w > last) setLevel(0);
      else if (el.scrollWidth > w + 1) setLevel((l) => Math.min(2, l + 1));
      last = w;
    });
    watch.observe(el);
    return () => watch.disconnect();
  }, [bar]);
  return level;
}

/** Adding a field is the core's (no route for it yet); Alpha can do it from the panel. */
export const ADD_COLUMN_REASON = "Adding a column can't be done from here yet. Ask Alpha in the panel.";

export interface ViewTab {
  id: string;
  title: string;
  view: PageView;
  isDefault: boolean;
}
export interface TabActions {
  onTab: (id: string) => void;
  /** "Add list" (its page); absent, the dropdown's "Add new…" asks Alpha (`listsReason` says why). */
  onAddList?: () => void;
  listsReason?: string;
  /** The open list's view type, and changing it. */
  view: PageView;
  onView: (view: PageView) => void;
  viewReasons: Partial<Record<PageView, string>>;
  /** The list's page: its name, filters, sorts, columns, grouping and view. */
  edit: (id: string) => void;
  duplicate: (id: string) => void;
  remove: (id: string) => void;
  setDefault: (id: string) => void;
}

/** Filter's choices: a property to add a rule for, the advanced filter, Hide done and Show gone. */
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
  active: number;
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

/** Filter as menu items: each property, then the advanced filter and the two switches. */
function filterItems(f: FilterState): ContextItem[] {
  return [
    ...f.fields.map((field) => ({ label: fieldLabel(field), onSelect: () => f.onAddRule(field) })),
    { label: "Advanced filter", icon: <PlusIcon size={ICON_SM} />, separatorBefore: true, onSelect: f.onAdvanced },
    ...(f.hasDone ? [{ label: "Hide done", on: f.hideDone, onSelect: () => f.onHideDone(!f.hideDone) }] : []),
    ...(f.goneCount ? [{ label: `Show gone (${f.goneCount})`, on: f.showGone, onSelect: () => f.onShowGone(!f.showGone) }] : []),
  ];
}

/** A list's own actions: in ⋮ for the open list, and on a right-click of the list picker. */
export function listActions(t: ViewTab, a: TabActions): ContextItem[] {
  const all = t.id === "all";
  return [
    { label: "Edit list", icon: <EditIcon size={ICON_SM} />, onSelect: () => a.edit(t.id), disabled: all ? "All shows every record; add a list to shape one." : a.listsReason },
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
      <Dropdown size="sm" className="tb__view" label="View" defaultKey="data.view" icon={view.icon} value={view.id} onChange={a.onView} options={VIEWS.map((v) => ({ value: v.id, label: v.label, icon: v.icon, disabled: a.viewReasons[v.id] }))} />
      {menu.menu}
    </>
  );
}

export function DataToolbar({ tabs, activeTab, tabActions, search, onSearch, searchable, tableTitle, filter, uploadFirst, onUpload, uploadReason, onShowNumbers, more }: {
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
  /** What ⋮ holds (the view's settings, the list's actions, Download, Reset view). */
  more: ContextItem[];
}) {
  const bar = useRef<HTMLDivElement>(null);
  const [searching, setSearching] = useState(false);
  const f = filter;
  // what the row's words are: when any changes, the row is measured again from the start
  const words = [tabs.find((t) => t.id === activeTab)?.title, tabActions.view, f.active, uploadFirst, Boolean(onShowNumbers), searching].join("|");
  const level = useFit(bar, words);
  const icons = level >= 1;
  const folded = level >= 2;
  const filterMenu = useContextMenu(filterItems(f));
  const inMore: ContextItem[] = folded
    ? [
        { label: f.active ? `Filter (${f.active})` : "Filter", icon: <FilterIcon size={ICON_SM} />, children: filterItems(f) },
        ...(uploadFirst ? [{ label: "Upload", icon: <UploadIcon size={ICON_SM} />, onSelect: onUpload, disabled: onUpload ? undefined : uploadReason }] : []),
        ...(onShowNumbers ? [{ label: "Show the numbers", icon: <ChevronDown size={ICON_SM} />, onSelect: onShowNumbers }] : []),
        ...more.map((m, i) => (i === 0 ? { ...m, separatorBefore: true } : m)),
      ]
    : more;
  const moreMenu = useContextMenu(inMore);
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
          // closed, it is still a bordered search box (the owner, 9 Oct: a bare magnifier had no boundary)
          <button type="button" className="search search--closed" aria-label="Search" title={icons ? "Search" : undefined} onClick={() => setSearching(true)}>
            <SearchIcon size={ICON_SM} aria-hidden="true" />
            <span className="tb__label">Search</span>
          </button>
        )
      ) : null}
      <span className="spacer" />
      {folded ? null : (
        <>
          <Button size="sm" variant="ghost" icon={<FilterIcon size={ICON_SM} />} aria-label="Filter" aria-haspopup="menu" title={icons ? "Filter" : undefined} onClick={(e) => filterMenu.openFrom(undefined, e.currentTarget)}>
            <span className="tb__label">Filter</span>
            {f.active ? <Badge tone="info">{f.active}</Badge> : null}
          </Button>
          {uploadFirst ? (
            <Button size="sm" variant="primary" icon={<UploadIcon size={ICON_SM} />} aria-label="Upload" title={icons ? "Upload" : undefined} disabledReason={onUpload ? undefined : uploadReason} onClick={onUpload}>
              <span className="tb__label">Upload</span>
            </Button>
          ) : null}
          {onShowNumbers ? <IconButton size="sm" label="Show the numbers" icon={<ChevronDown size={ICON_SM} />} onClick={onShowNumbers} /> : null}
        </>
      )}
      <IconButton label="More" icon={<MoreVertical />} aria-haspopup="menu" onClick={(e) => moreMenu.openFrom(undefined, e.currentTarget)} />
      {filterMenu.menu}
      {moreMenu.menu}
    </div>
  );
}
