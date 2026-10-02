/**
 * <DataViews>: the one shell every table renders through (Bridge's DataViews on the core's
 * records). One toolbar row, always: List, View and Search on the left; Add, "Save as list"
 * (when All is filtered), Filter and ⋮ on the right, as in Alpha. Under it a chip per filter and
 * the inline add row, then the registered view for the active kind, the bar for selected rows,
 * a record drawer or page, and one pagination bar. Search, filters and sorts are applied here,
 * once, with the field kinds; views only draw. Changes made on one of the person's lists save
 * back to it on their own.
 *
 * Every edit goes through the core, which journals it with who made it; the last edit to the
 * table can be undone from the pager, the ⋮ menu or ⌘Z.
 */
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
import { FilterBuilder, FilterChips, KIND_LABELS, NameDialog, PaginationBar, SelectionBar, SortEditor, PAGE_SIZES, type PageSize } from "./controls";
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

const flat = (r: RecordRow): DataRow => ({ ...r.values, id: r.id, created_at: r.created_at, updated_at: r.updated_at });
const sameConfig = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const columnName = (label: string, taken: Set<string>) => {
  let base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "field";
  if (!/^[a-z]/.test(base)) base = `f_${base}`;
  let name = base;
  for (let i = 2; taken.has(name); i += 1) name = `${base}_${i}`;
  return name;
};

type Status = { text: string; error?: boolean; undo?: boolean } | null;

export function DataViews({ client, table: initialTable, version, onChanged }: { client: Client; table: TableDesc; version: number; onChanged: () => void }) {
  const name = initialTable.name;
  const [data, setData] = useState<TableData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const table = data?.table ?? initialTable;
  const fields = table.fields as FieldInfo[];
  const shape = useMemo(() => ({ name, fields }), [name, fields]);
  const titleField = titleFieldOf(fields, table.title_field);
  const kinds = useMemo(() => Object.fromEntries([...fields.map((f) => [f.name, f.kind]), ["created_at", "datetime"], ["updated_at", "datetime"]]), [fields]);

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
  const [addingColumn, setAddingColumn] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
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

  const lists = useSavedViews(client, name, fields, data?.views ?? null);
  const list = lists.views.find((v) => v.id === listId) ?? null;
  // Open on the list marked for it, the first time this table opens in this window.
  const opening = useRef(true);
  useEffect(() => {
    if (!data || !opening.current) return;
    opening.current = false;
    const preferred = data.views.find((v) => v.is_default);
    const remembered = data.views.find((v) => v.id === listId);
    if (preferred && !remembered) choose(preferred.id);
    else if (listId !== "all" && !remembered) setListId("all");
  }, [data]);

  function choose(id: string) {
    setSelected(new Set());
    if (id === "all") {
      setListId("all");
      setConfig(viewConfigForKind(shape, config.kind, { kind: config.kind }));
      setSearch("");
      return;
    }
    const view = lists.views.find((v) => v.id === id) ?? data?.views.find((v) => v.id === id);
    if (!view) return;
    setListId(id);
    const next = migrateViewConfig(shape, view.config as Partial<ViewConfig>);
    setConfig(next);
    setSearch(next.search ?? "");
  }

  const relations = useRelations(client, fields, version + relVersion);
  const records = useMemo(() => new Map((data?.records ?? []).map((r) => [r.id, r])), [data]);
  const rows = useMemo(() => (data?.records ?? []).map(flat), [data]);
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
  async function run(work: () => Promise<unknown>, done: string, undo = true, failed = "Could not save the change"): Promise<boolean> {
    setStatus(null);
    try {
      await work();
      load();
      onChanged();
      setStatus({ text: done, undo });
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
  const add = (values: Record<string, unknown>) => run(() => client.addRecord(name, values), "Added", true, "Could not add it");
  const remove = (id: string) => {
    const rec = records.get(id);
    if (!rec) return;
    if (opened.some((o) => o.kind === "record" && o.id === id)) setOpened([]);
    void run(() => client.deleteRecord(name, id, rec.revision), "Removed", true, "Could not remove it");
  };
  const undo = () =>
    run(async () => {
      const out = await client.undo(name);
      setRelVersion((v) => v + 1);
      return out;
    }, "Undone", false);
  const changeField = (field: string, change: { kind?: string; label?: string; choices?: string[] }) =>
    run(async () => {
      const out = await client.changeField(name, field, change);
      return out;
    }, change.kind ? `${fieldLabel(fields.find((f) => f.name === field)!)} is now ${KIND_LABELS[change.kind]?.toLowerCase() ?? change.kind}` : "Renamed");

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (!(e.metaKey || e.ctrlKey) || e.key !== "z" || e.shiftKey) return;
      if (t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName))) return;
      if (!data?.last_edit) return;
      e.preventDefault();
      void undo();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });

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
  const selectedItems = () => [...selected].map((id) => records.get(id)).filter((r): r is RecordRow => Boolean(r)).map((r) => ({ id: r.id, revision: r.revision }));

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
        client={client}
        table={top.table}
        fields={own ? fields : otherFields}
        titleField={own ? titleField : titleFieldOf(otherFields, other?.title_field)}
        record={rec}
        relations={relations}
        mode={mode}
        version={version + relVersion}
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
              }, "Saved", false))
        }
        onRemove={async () => {
          const ok = await run(() => client.deleteRecord(top.table, rec.id, rec.revision), "Removed", true, "Could not remove it");
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
  const ViewIcon = VIEW_METADATA[config.kind].icon;
  const activeFilters = config.rowFilters.filter(isActiveFilter).length;
  const empty = !data ? null : matching.length ? null : rows.length ? "Nothing matches" : "Nothing here yet";
  const filterFields = [...fields, { name: "created_at", kind: "datetime", label: "Added" }, { name: "updated_at", kind: "datetime", label: "Last changed" }] as FieldInfo[];
  const page = top && mode === "page";

  return (
    <div className="dv" aria-label={table.title}>
      <div className="dv-toolbar">
        <div className="dv-toolbar__left">
          <span className="dv-list-picker">
            <StandardDropdown ariaLabel="List" options={[{ value: "all", label: "All rows" }, ...lists.views.map((v) => ({ value: v.id, label: v.title }))]} value={listId} onChange={choose} onAdd={() => setNaming("new")} addLabel="Save as a list" />
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" className="dv-viewpick" aria-label="View">
                <ViewIcon size={14} aria-hidden="true" />
                <span className="dv-ellipsis">{VIEW_METADATA[config.kind].label}</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {VIEW_KINDS.filter((k) => eligible.includes(k)).map((k) => {
                const Icon = VIEW_METADATA[k].icon;
                return (
                  <DropdownMenuItem key={k} onSelect={() => setConfig(viewConfigForKind(shape, k, config))} className={k === config.kind ? "dv-menu--current" : ""}>
                    <Icon size={14} aria-hidden="true" /> {VIEW_METADATA[k].label}
                  </DropdownMenuItem>
                );
              })}
              {VIEW_KINDS.some((k) => !eligible.includes(k)) ? <DropdownMenuSeparator /> : null}
              {VIEW_KINDS.filter((k) => !eligible.includes(k)).map((k) => {
                const Icon = VIEW_METADATA[k].icon;
                return (
                  <DropdownMenuItem key={k} disabled title={ineligibleReason(k)}>
                    <Icon size={14} aria-hidden="true" /> {VIEW_METADATA[k].label}
                    <span className="dv-menu__note">{ineligibleReason(k)}</span>
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
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
              <DropdownMenuItem
                onSelect={() => {
                  setNewInitial({});
                  setOpened([{ kind: "new" }]);
                }}
              >
                New row
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setAddingColumn(true)}>Add column</DropdownMenuItem>
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
                            <button type="button" className="iconbtn" aria-label={`Move ${fieldLabel(f)} left`} disabled={at === 0} onClick={() => moveColumn(f.name, -1)}>
                              <ArrowUp size={12} />
                            </button>
                            <button type="button" className="iconbtn" aria-label={`Move ${fieldLabel(f)} right`} disabled={at === visible.length - 1} onClick={() => moveColumn(f.name, 1)}>
                              <ArrowDown size={12} />
                            </button>
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
              <DropdownMenuItem disabled={!data?.last_edit} onSelect={() => void undo()} title={data?.last_edit?.text}>
                Undo <span className="dv-menu__note dv-ellipsis">{data?.last_edit ? data.last_edit.text : "Nothing to undo"}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>{list ? list.title : "List"}</DropdownMenuLabel>
              {list ? (
                <>
                  <DropdownMenuItem onSelect={() => setNaming("rename")}>Rename list</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setNaming("duplicate")}>Duplicate list</DropdownMenuItem>
                  <DropdownMenuCheckboxItem checked={list.is_default} onCheckedChange={(on) => void lists.update(list.id, { is_default: on === true })}>
                    <span className="dv-menu__mark">{list.is_default ? <Check size={12} /> : null}</span>
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
      {lists.error ? (
        <p className="dv-error" role="alert">
          {lists.error}
        </p>
      ) : null}
      <SelectionBar
        count={selected.size}
        matching={matching.length}
        fields={fields}
        relations={relations}
        onSelectAll={() => setSelected(new Set(matching.map((r) => r.id)))}
        onClear={() => setSelected(new Set())}
        onSet={(f, value) => void run(() => client.bulkRecords(name, "set", selectedItems(), { [f.name]: value }), `Set ${fieldLabel(f).toLowerCase()} on ${selected.size} ${selected.size === 1 ? "row" : "rows"}`)}
        onDelete={async () => {
          const n = selected.size;
          const ok = await run(() => client.bulkRecords(name, "delete", selectedItems()), `Removed ${n} ${n === 1 ? "row" : "rows"}`, true, "Could not remove them");
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
                onChangeField={changeField}
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
              {status.undo && data?.last_edit ? (
                <Button size="sm" variant="link" onClick={() => void undo()}>
                  Undo
                </Button>
              ) : null}
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
      {addingColumn ? <AddColumn fields={fields} onCancel={() => setAddingColumn(false)} onAdd={async (f) => (await run(() => client.addFields(name, [f]), `Added ${f.label}`, false)) && (setAddingColumn(false), true)} /> : null}
    </div>
  );
}

function AddColumn({ fields, onAdd, onCancel }: { fields: FieldInfo[]; onAdd: (f: { name: string; kind: string; label: string; choices?: string[] }) => Promise<boolean>; onCancel: () => void }) {
  const [kind, setKind] = useState("text");
  const [choices, setChoices] = useState("");
  const choice = kind === "choice" || kind === "multichoice" || kind === "status";
  return (
    <NameDialog
      title="Add a column"
      action="Add column"
      onCancel={onCancel}
      onSave={(label) =>
        onAdd({
          name: columnName(label, new Set(fields.map((f) => f.name))),
          kind,
          label,
          ...(choice ? { choices: choices.split(",").map((c) => c.trim()).filter(Boolean) } : {}),
        })
      }
    >
      <select className="dv-select" aria-label="Type" value={kind} onChange={(e) => setKind(e.target.value)}>
        {Object.entries(KIND_LABELS)
          .filter(([k]) => k !== "relation")
          .map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
      </select>
      {choice ? <input className="dv-select dv-input" aria-label="Choices" placeholder="Choices, separated by commas" value={choices} onChange={(e) => setChoices(e.target.value)} /> : null}
    </NameDialog>
  );
}
