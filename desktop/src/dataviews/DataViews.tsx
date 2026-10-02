/**
 * <DataViews>: the one shell every table renders through (Bridge's DataViews on the core's
 * records). One toolbar row, always: List, View and Search on the left; Add, "Save as list"
 * (when All is filtered), Filter and ⋮ on the right, as in Alpha. Under it a chip per filter and
 * the inline add row, then the registered view for the active kind, the bar for selected rows,
 * a record drawer or page, and one pagination bar. Search, filters and sorts are applied here,
 * once, with the field kinds; views only draw. Changes made on one of the person's lists save
 * back to it on their own. A star in the List and View pickers marks what the table opens on.
 *
 * Every edit goes through the core, which journals it with who made it.
 */
import { IconButton } from "../ui/IconButton";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, Filter, MoreVertical, Search } from "lucide-react";
import type { Client, RecordRow, TableData, TableDesc } from "../core/client";
import { Button } from "../ui/Button";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "../ui/DropdownMenu";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/Popover";
import { StandardDropdown } from "../ui/StandardDropdown";
import { titleFieldOf, type FieldInfo } from "../modules/fields";
import { applyFilters, applySorts, filterRowsByQuery, isActiveFilter, VIEW_KINDS, type DataRow, type ViewConfig, type ViewKind } from "./engine";
import { computeEligibleKinds, ineligibleReason, migrateViewConfig, viewConfigForKind } from "./eligibility";
import { useRelations, fieldLabel, type Link } from "./cells";
import { FilterBuilder, FilterChips, NameDialog, PaginationBar, SelectionBar, SortEditor, PAGE_SIZES, type PageSize } from "./controls";
import { PAGED, VIEW_COMPONENTS, VIEW_METADATA } from "./registry";
import { EntityPage, NewRecordFrame, RecordPage, type Opened } from "./RecordPage";
import { NewRecordForm } from "./views/FormView";
import { useSavedViews } from "./useSavedViews";
import "./dataviews.css";

export { PAGE_SIZES, type PageSize };
export const PAGE_SIZE_KEY = "alpha.rows-per-page";
const ROW_PX = 36;
const FEWEST = 5;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* a window without storage forgets its layout, nothing more */
  }
}

/** The working view of a table in this window, seeded once from what the older page kept. */
function workingView(table: string): Partial<ViewConfig> {
  const saved = read<Partial<ViewConfig> | null>(`alpha.dv.${table}`, null);
  if (saved) return saved;
  const old = `alpha.page.${table}`;
  return {
    kind: read<ViewKind>(`${old}.view`, "table"),
    hidden: read<string[]>(`${old}.hidden`, []),
    columnOrder: read<string[]>(`${old}.order`, []),
    columnWidths: read<Record<string, number>>(`${old}.widths`, {}),
  };
}

/** What a table opens on: a list (or "all"), and on All rows a kind of view (a list keeps its own).
 * ponytail: per-window storage, like the lists; into the core with them once it has a views API. */
type Defaults = { list?: string; kind?: ViewKind };
const defaultsKey = (table: string) => `alpha.dv.${table}.defaults`;

const flat = (r: RecordRow): DataRow => ({ ...r.values, id: r.id, created_at: r.created_at, updated_at: r.updated_at });
const sameConfig = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
type Status = { text: string; error?: boolean } | null;

export function DataViews({ client, table: initialTable, version, onChanged }: { client: Client; table: TableDesc; version: number; onChanged: () => void }) {
  const name = initialTable.name;
  const [data, setData] = useState<TableData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const table = data?.table ?? initialTable;
  const fields = table.fields as FieldInfo[];
  const shape = useMemo(() => ({ name, fields }), [name, fields]);
  const titleField = titleFieldOf(fields, table.title_field);
  const kinds = useMemo(() => Object.fromEntries([...fields.map((f) => [f.name, f.kind]), ["created_at", "datetime"], ["updated_at", "datetime"]]), [fields]);

  const lists = useSavedViews(name);
  // Seeded once from the list the older "Open on this list" starred.
  const [defaults, setDefaultsState] = useState<Defaults>(() => read<Defaults | null>(defaultsKey(name), null) ?? { list: lists.views.find((v) => v.is_default)?.id });
  const setDefaults = (next: Defaults) => {
    setDefaultsState(next);
    write(defaultsKey(name), next);
  };
  const [config, setConfigState] = useState<ViewConfig>(() => migrateViewConfig(shape, workingView(name)));
  const [listId, setListId] = useState<string>(() => read<string>(`alpha.dv.${name}.list`, "all"));
  const [search, setSearch] = useState(() => config.search ?? "");
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSizeState] = useState<PageSize>(() => read<PageSize>(PAGE_SIZE_KEY, "fit"));
  const [fit, setFit] = useState(20);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [opened, setOpened] = useState<Opened[]>([]);
  const [newInitial, setNewInitial] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<"drawer" | "page">("drawer");
  const [status, setStatus] = useState<Status>(null);
  const [naming, setNaming] = useState<"new" | "rename" | "duplicate" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemoveRows, setConfirmRemoveRows] = useState(false);
  const [adding, setAdding] = useState(false);
  const [relVersion, setRelVersion] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const setConfig = useCallback((next: ViewConfig) => {
    setConfigState(next);
    setOffset(0);
  }, []);
  useEffect(() => write(`alpha.dv.${name}`, config), [name, config]);
  useEffect(() => write(`alpha.dv.${name}.list`, listId), [name, listId]);

  const load = useCallback(() => {
    client
      .table(name)
      .then((d) => {
        setData(d);
        setLoadError(null);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, [client, name]);
  useEffect(load, [load, version]);

  const list = lists.views.find((v) => v.id === listId) ?? null;
  // Each time the table opens: on its starred list (and, on All rows, its starred kind of view),
  // else where it was left.
  const opening = useRef(true);
  useEffect(() => {
    if (!data || !opening.current) return;
    opening.current = false;
    const exists = (id: string | undefined) => id === "all" || lists.views.some((v) => v.id === id);
    const start = exists(defaults.list) ? defaults.list! : exists(listId) ? listId : "all";
    const kind = defaults.kind && computeEligibleKinds(shape).includes(defaults.kind) ? defaults.kind : undefined;
    if (start !== "all") {
      if (start !== listId) choose(start);
    } else if (listId !== "all") choose("all", kind);
    else if (kind && kind !== config.kind) setConfig(viewConfigForKind(shape, kind, config));
  }, [data]);

  function choose(id: string, kind: ViewKind = config.kind) {
    setSelected(new Set());
    if (id === "all") {
      setListId("all");
      setConfig(viewConfigForKind(shape, kind, { kind }));
      setSearch("");
      return;
    }
    const view = lists.views.find((v) => v.id === id);
    if (!view) return;
    setListId(id);
    const next = migrateViewConfig(shape, view.config as Partial<ViewConfig>);
    setConfig(next);
    setSearch(next.search ?? "");
  }

  const relations = useRelations(client, fields, version + relVersion);
  const records = useMemo(() => new Map((data?.records ?? []).map((r) => [r.id, r])), [data]);
  // A table fed by readers knows when each row was first seen and when it stopped appearing;
  // gone rows stay out of the views unless the person asks for them.
  const [showGone, setShowGone] = useState(false);
  const tracked = useMemo(() => (data?.records ?? []).some((r) => r.seen_at || r.gone_at), [data]);
  const goneCount = useMemo(() => (data?.records ?? []).filter((r) => r.gone_at).length, [data]);
  const rows = useMemo(() => (data?.records ?? []).filter((r) => showGone || !r.gone_at).map(flat), [data, showGone]);
  // "Hide done": the status field whose done choices say a row is finished.
  const doneField = fields.find((f) => f.kind === "status" && f.done_choices?.length);
  const matching = useMemo(() => {
    const open = config.hideDone && doneField ? rows.filter((r) => !doneField.done_choices!.includes(String(r[doneField.name] ?? ""))) : rows;
    return applySorts(applyFilters(filterRowsByQuery(open, search, ["id", "created_at", "updated_at"]), config.rowFilters, config.filterMatch, kinds), config.sorts);
  }, [rows, search, config, kinds, doneField]);
  // A grouped table shows every row so each group's count is the whole group, not one page's.
  // ponytail: grouped tables are neither paged nor windowed; fine to a few thousand rows.
  const paged = PAGED.has(config.kind) && !(config.kind === "table" && config.groupBy);
  const size = pageSize === "fit" ? fit : pageSize;
  const at = offset >= matching.length ? 0 : offset;
  const shownRows = paged ? matching.slice(at, at + size) : matching;
  // How many rows rest on an estimate or an assumption, for the footer.
  const guesses = (data?.records ?? []).filter((r) => r.provenance?.estimated).length;
  const assumed = (data?.records ?? []).filter((r) => r.provenance?.assumed && !r.provenance?.estimated).length;
  const resting = [guesses ? `${guesses.toLocaleString()} estimated` : "", assumed ? `${assumed.toLocaleString()} on an assumption` : ""].filter(Boolean).join(", ");

  const visible = useMemo(() => {
    const order = config.columnOrder ?? [];
    const placed = order.filter((n) => fields.some((f) => f.name === n));
    const ordered = [...placed, ...fields.map((f) => f.name).filter((n) => !placed.includes(n))];
    const hidden = new Set(config.hidden ?? []);
    return ordered.filter((n) => !hidden.has(n)).map((n) => fields.find((f) => f.name === n)!);
  }, [fields, config.columnOrder, config.hidden]);

  // "Fit": as many rows as the view's box holds under its header, footer and new-row line.
  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => {
      // The table's own header, footer and new-row line when drawn; three rows' worth before.
      const h = (sel: string) => (box.querySelector(sel) as HTMLElement | null)?.offsetHeight ?? 0;
      const chrome = h(".dv-table thead") + h(".dv-table tfoot") + h(".dv-newrow") || ROW_PX * 3;
      const row = h(".dv-row") || ROW_PX;
      setFit(Math.max(FEWEST, Math.floor((box.clientHeight - chrome - 2) / row)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, [data === null, opened.length, mode]);

  const workingConfig = { ...config, search: search || undefined };
  const dirty = list ? !sameConfig(migrateViewConfig(shape, list.config as Partial<ViewConfig>), migrateViewConfig(shape, workingConfig)) || (list.config.search ?? "") !== search : false;
  const modified = config.rowFilters.length > 0 || config.sorts.length > 0 || Boolean(config.groupBy) || (config.hidden?.length ?? 0) > 0 || search !== "" || Boolean(config.hideDone);
  const filtered = config.rowFilters.some(isActiveFilter) || search !== "" || Boolean(config.hideDone);

  // Changes made while one of the person's lists is open save back to it on their own.
  const working = JSON.stringify(workingConfig);
  useEffect(() => {
    if (!list || !dirty) return;
    const timer = setTimeout(() => void lists.update(list.id, { config: JSON.parse(working) as object }), 600);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `lists` is new each render; the list and what changed decide
  }, [list?.id, dirty, working]);

  // Toolbar "Save as list" on All: saved at once as "List N", renamed from ⋮ if wanted.
  function saveAsList() {
    const taken = new Set(lists.views.map((v) => v.title));
    let n = lists.views.length + 1;
    while (taken.has(`List ${n}`)) n += 1;
    void lists.save(`List ${n}`, workingConfig).then((out) => out && setListId(out.id));
  }
  function moveColumn(field: string, by: -1 | 1) {
    const shown = visible.map((f) => f.name);
    const at = shown.indexOf(field);
    if (at < 0 || at + by < 0 || at + by >= shown.length) return;
    shown.splice(at, 1);
    shown.splice(at + by, 0, field);
    setConfig({ ...config, columnOrder: [...shown, ...fields.map((f) => f.name).filter((n) => !shown.includes(n))] });
  }

  // ---------- writes ----------

  /** `failed`: what didn't happen, said before the core's reason ("Could not save the change: …"). */
  async function run(work: () => Promise<unknown>, done: string, failed = "Could not save the change"): Promise<boolean> {
    setStatus(null);
    try {
      await work();
      load();
      onChanged();
      setStatus({ text: done });
      return true;
    } catch (e) {
      setStatus({ text: `${failed}: ${e instanceof Error ? e.message : String(e)}`, error: true });
      return false;
    }
  }
  const edit = (id: string, values: Record<string, unknown>) => {
    const rec = records.get(id);
    if (!rec) return Promise.resolve(false);
    return run(() => client.editRecord(name, id, values, rec.revision), "Saved");
  };
  const add = (values: Record<string, unknown>) => run(() => client.addRecord(name, values), "Added", "Could not add it");
  const remove = (id: string) => {
    const rec = records.get(id);
    if (!rec) return;
    if (opened.some((o) => o.kind === "record" && o.id === id)) setOpened([]);
    void run(() => client.deleteRecord(name, id, rec.revision), "Removed", "Could not remove it");
  };

  function select(ids: string[], on: boolean) {
    setSelected((s) => {
      const next = new Set(s);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }
  useEffect(() => {
    if (!selected.size) setConfirmRemoveRows(false);
  }, [selected.size]);
  const selectedRows = () => [...selected].map((id) => records.get(id)).filter((r): r is RecordRow => Boolean(r));
  // ponytail: one request per row; a bulk endpoint makes it one change (backend-requests.md).
  const eachSelected = (work: (r: RecordRow) => Promise<unknown>) => async () => {
    for (const r of selectedRows()) await work(r);
  };

  // ---------- opening ----------

  const openRecord = (id: string) => setOpened([{ kind: "record", table: name, id }]);
  const openLink = (link: Link) => setOpened((s) => [...s, link.kind === "entity" ? { kind: "entity", id: link.id, label: link.label } : { kind: "record", table: link.table ?? name, id: link.id }]);
  const closeAll = () => setOpened([]);
  const back = opened.length > 1 ? () => setOpened((s) => s.slice(0, -1)) : undefined;
  const top = opened[opened.length - 1];

  function panel() {
    if (!top) return null;
    const toggle = () => setMode((m) => (m === "drawer" ? "page" : "drawer"));
    if (top.kind === "new")
      return (
        <NewRecordFrame mode={mode} onClose={closeAll}>
          <NewRecordForm
            fields={fields}
            relations={relations}
            initial={newInitial}
            onCancel={closeAll}
            onAdd={async (values) => {
              const ok = await add(values);
              if (ok) closeAll();
              return ok;
            }}
          />
        </NewRecordFrame>
      );
    if (top.kind === "entity") return <EntityPage client={client} id={top.id} label={top.label} mode={mode} onClose={closeAll} onBack={back} />;
    const own = top.table === name;
    const other = own ? undefined : relations.tableOf(top.table);
    const rec = own ? records.get(top.id) : other?.records.find((r) => r.id === top.id);
    if (!rec) return null;
    const otherFields = (other?.fields ?? fields) as FieldInfo[];
    return (
      <RecordPage
        key={`${top.table}:${top.id}`}
        fields={own ? fields : otherFields}
        titleField={own ? titleField : titleFieldOf(otherFields, other?.title_field)}
        record={rec}
        relations={relations}
        mode={mode}
        onClose={closeAll}
        onBack={back}
        onToggle={toggle}
        onOpenLink={openLink}
        onSave={(values) =>
          void (own
            ? edit(rec.id, values)
            : run(async () => {
                await client.editRecord(top.table, rec.id, values, rec.revision);
                setRelVersion((v) => v + 1);
              }, "Saved"))
        }
        onRemove={async () => {
          const ok = await run(() => client.deleteRecord(top.table, rec.id, rec.revision), "Removed", "Could not remove it");
          if (ok) {
            if (!own) setRelVersion((v) => v + 1);
            setOpened((s) => s.slice(0, -1));
          }
        }}
      />
    );
  }

  // ---------- drawing ----------

  const eligible = computeEligibleKinds(shape);
  const Component = VIEW_COMPONENTS[config.kind];
  const activeFilters = config.rowFilters.filter(isActiveFilter).length;
  const empty = !data ? null : matching.length ? null : rows.length ? "Nothing matches" : "Nothing here yet";
  const filterFields = [...fields, { name: "created_at", kind: "datetime", label: "Added" }, { name: "updated_at", kind: "datetime", label: "Last changed" }] as FieldInfo[];
  const page = top && mode === "page";

  return (
    <div
      className="dv"
      aria-label={table.title}
      onKeyDown={(e) => {
        // Delete or Backspace on selected rows asks to remove them, as in a file list.
        if ((e.key !== "Delete" && e.key !== "Backspace") || !selected.size) return;
        if ((e.target as Element).closest("input:not([type=checkbox]), textarea, select, [contenteditable]")) return;
        e.preventDefault();
        setConfirmRemoveRows(true);
      }}
    >
      <div className="dv-toolbar">
        <div className="dv-toolbar__left">
          <span className="dv-list-picker">
            <StandardDropdown
              ariaLabel="List"
              options={[{ value: "all", label: "All rows" }, ...lists.views.map((v) => ({ value: v.id, label: v.title }))]}
              value={listId}
              onChange={choose}
              onAdd={() => setNaming("new")}
              addLabel="Save as a list"
              defaultValue={defaults.list ?? null}
              onDefaultChange={(id) => setDefaults({ ...defaults, list: id ?? undefined })}
            />
          </span>
          <span className="dv-list-picker dv-viewpick">
            <StandardDropdown
              ariaLabel="View"
              searchable={false}
              options={[...VIEW_KINDS.filter((k) => eligible.includes(k)), ...VIEW_KINDS.filter((k) => !eligible.includes(k))].map((k) => ({ value: k, label: VIEW_METADATA[k].label, icon: VIEW_METADATA[k].icon, disabledReason: eligible.includes(k) ? undefined : ineligibleReason(k) }))}
              value={config.kind}
              onChange={(k) => setConfig(viewConfigForKind(shape, k as ViewKind, config))}
              defaultValue={defaults.kind ?? null}
              onDefaultChange={(k) => setDefaults({ ...defaults, kind: (k as ViewKind | null) ?? undefined })}
            />
          </span>
          <label className="dv-search">
            <Search size={14} aria-hidden="true" />
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
              placeholder="Search"
              aria-label={`Search ${table.title}`}
            />
          </label>
        </div>
        <div className="dv-toolbar__right">
          <Button size="sm" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
            {adding ? "Cancel" : "Add"}
          </Button>
          {listId === "all" && filtered ? (
            <Button size="sm" variant="ghost" onClick={saveAsList}>
              Save as list
            </Button>
          ) : null}
          <Popover>
            <PopoverTrigger asChild>
              <Button size="sm" variant={activeFilters || config.sorts.length ? "secondary" : "outline"} aria-label="Filter">
                <Filter size={14} aria-hidden="true" />
                <span className="dv-toolbar__label">Filter{activeFilters ? ` · ${activeFilters}` : ""}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end">
              <div className="dv-pop">
                <h4>Filter</h4>
                <FilterBuilder fields={filterFields} filters={config.rowFilters} match={config.filterMatch} onChange={(rowFilters, filterMatch) => setConfig({ ...config, rowFilters, filterMatch })} />
                <h4>Sort</h4>
                <SortEditor fields={filterFields} sorts={config.sorts} onChange={(sorts) => setConfig({ ...config, sorts })} />
                <h4>Group</h4>
                <select className="dv-select dv-pop__group" aria-label="Group by" value={config.groupBy ?? ""} onChange={(e) => setConfig({ ...config, groupBy: e.target.value || null, collapsedGroups: [] })}>
                  <option value="">Not grouped</option>
                  {fields
                    .filter((f) => f.kind !== "long_text")
                    .map((f) => (
                      <option key={f.name} value={f.name}>
                        {fieldLabel(f)}
                      </option>
                    ))}
                </select>
              </div>
            </PopoverContent>
          </Popover>
          {/* Not modal: a column switched on or moved shows in the table behind the menu. */}
          <DropdownMenu
            modal={false}
            onOpenChange={(open) => {
              if (!open) setConfirmDelete(false);
            }}
          >
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" aria-label="More">
                <MoreVertical size={14} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={load}>Reload</DropdownMenuItem>
              {doneField ? (
                <DropdownMenuCheckboxItem checked={Boolean(config.hideDone)} onSelect={(e) => e.preventDefault()} onCheckedChange={(on) => setConfig({ ...config, hideDone: on === true || undefined })}>
                  <span className="dv-menu__mark">{config.hideDone ? <Check size={12} /> : null}</span>
                  Hide done
                </DropdownMenuCheckboxItem>
              ) : null}
              {tracked && goneCount ? (
                <DropdownMenuCheckboxItem checked={showGone} onSelect={(e) => e.preventDefault()} onCheckedChange={(on) => setShowGone(on === true)}>
                  <span className="dv-menu__mark">{showGone ? <Check size={12} /> : null}</span>
                  Show gone ({goneCount})
                </DropdownMenuCheckboxItem>
              ) : null}
              <DropdownMenuItem
                onSelect={() => {
                  setNewInitial({});
                  setOpened([{ kind: "new" }]);
                }}
              >
                New row
              </DropdownMenuItem>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  Columns <span className="dv-menu__note">{config.hidden?.length ? `${config.hidden.length} hidden` : "All shown"}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {[...visible, ...fields.filter((f) => !visible.includes(f))].map((f) => {
                    const at = visible.indexOf(f);
                    return (
                      <div key={f.name} className="ui-menu__item menu__item--col">
                        <label>
                          <input type="checkbox" className="dv-check" checked={at >= 0} onChange={(e) => setConfig({ ...config, hidden: e.target.checked ? (config.hidden ?? []).filter((h) => h !== f.name) : [...(config.hidden ?? []), f.name] })} />
                          <span className="dv-ellipsis">{fieldLabel(f)}</span>
                        </label>
                        {at >= 0 ? (
                          <span className="menu__arrows">
                            <IconButton size="sm" aria-label={`Move ${fieldLabel(f)} left`} disabled={at === 0} onClick={() => moveColumn(f.name, -1)}>
                              <ArrowUp size={12} />
                            </IconButton>
                            <IconButton size="sm" aria-label={`Move ${fieldLabel(f)} right`} disabled={at === visible.length - 1} onClick={() => moveColumn(f.name, 1)}>
                              <ArrowDown size={12} />
                            </IconButton>
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                  {config.columnWidths && Object.keys(config.columnWidths).length ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => setConfig({ ...config, columnWidths: {} })}>Reset column widths</DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{list ? list.title : "List"}</DropdownMenuLabel>
              {list ? (
                <>
                  <DropdownMenuItem onSelect={() => setNaming("rename")}>Rename list</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setNaming("duplicate")}>Duplicate list</DropdownMenuItem>
                  <DropdownMenuCheckboxItem checked={defaults.list === list.id} onCheckedChange={(on) => setDefaults({ ...defaults, list: on === true ? list.id : undefined })}>
                    <span className="dv-menu__mark">{defaults.list === list.id ? <Check size={12} /> : null}</span>
                    Open on this list
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuItem
                    className="dv-menu--danger"
                    onSelect={(e) => {
                      if (!confirmDelete) {
                        e.preventDefault();
                        setConfirmDelete(true);
                        return;
                      }
                      void lists.remove(list.id).then(() => choose("all"));
                    }}
                  >
                    {confirmDelete ? `Delete ${list.title} for good` : "Delete list"}
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem onSelect={() => setNaming("new")}>Save as a list</DropdownMenuItem>
              )}
              <DropdownMenuItem
                disabled={!modified}
                onSelect={() => {
                  setSearch("");
                  setConfig(viewConfigForKind(shape, config.kind, { kind: config.kind, columnWidths: config.columnWidths, columnOrder: config.columnOrder }));
                }}
              >
                Reset view
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <FilterChips fields={filterFields} filters={config.rowFilters} onRemove={(i) => setConfig({ ...config, rowFilters: config.rowFilters.filter((_, j) => j !== i) })} />
      {adding ? (
        <div className="dv-addrow">
          <NewRecordForm compact fields={fields} relations={relations} onCancel={() => setAdding(false)} onAdd={add} />
        </div>
      ) : null}
      {loadError ? (
        <p className="dv-error" role="alert">
          {loadError}{" "}
          <Button size="sm" variant="link" onClick={load}>
            Try again
          </Button>
        </p>
      ) : null}
      <SelectionBar
        count={selected.size}
        matching={matching.length}
        fields={fields}
        relations={relations}
        onSelectAll={() => setSelected(new Set(matching.map((r) => r.id)))}
        onClear={() => setSelected(new Set())}
        confirming={confirmRemoveRows}
        onConfirming={setConfirmRemoveRows}
        onSet={(f, value) => void run(eachSelected((r) => client.editRecord(name, r.id, { [f.name]: value }, r.revision)), `Set ${fieldLabel(f).toLowerCase()} on ${selected.size} ${selected.size === 1 ? "row" : "rows"}`)}
        onDelete={async () => {
          const n = selected.size;
          const ok = await run(eachSelected((r) => client.deleteRecord(name, r.id, r.revision)), `Removed ${n} ${n === 1 ? "row" : "rows"}`, "Could not remove them");
          if (ok) setSelected(new Set());
        }}
      />
      <div className="dv-body">
        {page ? null : (
          <div className="dv-viewbox" ref={boxRef}>
            {data ? (
              <Component
                table={table}
                fields={visible}
                allFields={fields}
                titleField={titleField}
                view={config}
                rows={shownRows}
                matching={matching}
                record={(id) => records.get(id)}
                seen={tracked}
                relations={relations}
                onViewChange={setConfig}
                onOpen={openRecord}
                onOpenLink={openLink}
                onEdit={edit}
                onAdd={add}
                onNew={(initial) => {
                  setNewInitial(initial ?? {});
                  setOpened([{ kind: "new" }]);
                }}
                selected={selected}
                onSelect={select}
                onRemove={remove}
                empty={empty}
              />
            ) : (
              <p className="dv-empty">Loading…</p>
            )}
          </div>
        )}
        {panel()}
      </div>
      <PaginationBar
        resting={resting}
        total={paged ? matching.length : matching.length}
        all={rows.length}
        offset={paged ? at : 0}
        size={paged ? size : Math.max(1, matching.length)}
        pageSize={paged ? pageSize : undefined}
        fit={fit}
        onOffset={setOffset}
        onPageSize={(next) => {
          setPageSizeState(next);
          write(PAGE_SIZE_KEY, next);
          setOffset(0);
        }}
        status={
          status ? (
            <span className={status.error ? "dv-status dv-status--error dv-ellipsis" : "dv-status dv-ellipsis"} role={status.error ? "alert" : "status"} title={status.text}>
              {status.text}
            </span>
          ) : null
        }
      />
      {naming ? (
        <NameDialog
          title={naming === "rename" ? "Rename list" : naming === "duplicate" ? "Duplicate list" : "Save as a list"}
          initial={naming === "rename" ? list?.title : naming === "duplicate" ? `${list?.title} copy` : ""}
          action={naming === "rename" ? "Rename" : "Save"}
          onCancel={() => setNaming(null)}
          onSave={async (title) => {
            const out = naming === "rename" && list ? await lists.update(list.id, { title }) : await lists.save(title, workingConfig);
            if (out) {
              if (naming !== "rename") setListId(out.id);
              setNaming(null);
            }
            return Boolean(out);
          }}
        />
      ) : null}
    </div>
  );
}

