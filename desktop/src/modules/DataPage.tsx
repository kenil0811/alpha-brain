/**
 * A table's page: Alpha draws one for every table it keeps, so nothing has to be designed. The
 * table comes first with the person's own edits in place; board, list, calendar and chart are a
 * click away; a saved list is a filter plus the columns shown. Edits here are the person's own
 * and are journaled as theirs.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Client, FileInfo, RecordRow, SavedList, TableDesc } from "../core/client";
import { host } from "../core/host";
import { DATE_KINDS, coerce, firstOfKind, titleFieldOf, type FieldInfo } from "./fields";
import { humanize } from "./format";
import { Button, IconButton, Tabs, Popover } from "../ui";
import { ChevronsLeft, ChevronsRight, ArrowLeft, ArrowRight, MoreHorizontal } from "../ui/icons";
import { applyQuery, pageOf, provenanceCounts, type Sort } from "./views/engine";
import { AddRow } from "./views/AddRow";
import { BoardView } from "./views/BoardView";
import { CalendarView } from "./views/CalendarView";
import { ChartView } from "./views/ChartView";
import { ListView } from "./views/ListView";
import { RecordPanel } from "./views/RecordPanel";
import { TableView } from "./views/TableView";

export type PageView = "table" | "board" | "list" | "calendar" | "chart";
const VIEWS: { id: PageView; label: string }[] = [
  { id: "table", label: "Table" },
  { id: "board", label: "Board" },
  { id: "list", label: "List" },
  { id: "calendar", label: "Calendar" },
  { id: "chart", label: "Chart" },
];
/** Rows per page: by default as many as fit the window; the person can pick a fixed size, and
 * that choice becomes their default for every table. */
export type PageSize = "fit" | number;
export const PAGE_SIZES = [25, 50, 100, 250];
export const PAGE_SIZE_KEY = "alpha.rows-per-page";
const FEWEST_ROWS = 5;

/** The shape saved lists had in the window before they lived in the world (before 3 Oct). */
interface OldSavedList {
  id: string;
  title: string;
  filters: Record<string, string>;
  search: string;
  hideDone: boolean;
  hidden: string[];
}

function remembered<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
function remember(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* a page without storage forgets its layout, nothing more */
  }
}

export function DataPage({ client, table, version, onChanged }: { client: Client; table: TableDesc; version: number; onChanged: () => void }) {
  const fields = table.fields as FieldInfo[];
  const byName = useMemo(() => new Map(fields.map((f) => [f.name, f])), [fields]);
  const key = `alpha.page.${table.name}`;
  const titleField = titleFieldOf(fields, table.title_field);
  const statusField = useMemo(() => fields.find((f) => f.kind === "status"), [fields]);
  const groupField = useMemo(() => statusField ?? firstOfKind(fields, new Set(["choice"])), [statusField, fields]);
  const dateField = useMemo(() => firstOfKind(fields, DATE_KINDS), [fields]);
  const numericField = useMemo(() => firstOfKind(fields, new Set(["number"])), [fields]);

  const [view, setView] = useState<PageView>(() => remembered<PageView>(`${key}.view`, "table"));
  const [files, setFiles] = useState<Record<string, FileInfo>>({});
  async function exportAs(format: "csv" | "xlsx") {
    try {
      const out = await client.exportTable(table.name, format);
      if (host.available()) await host.revealPath(out.path);
      setStatus({ ok: true, text: `Exported ${out.rows} rows to ${out.name}${host.available() ? "" : ` (${out.path})`}.` });
    } catch (e) {
      setStatus({ ok: false, text: `Couldn't export: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  async function addFile(row: RecordRow, field: FieldInfo, file: File) {
    try {
      await client.addFiles([file], { table: table.name, record: row.id, field: field.name });
      load();
      onChanged();
    } catch (e) {
      setStatus({ ok: false, text: `Couldn't add ${file.name}: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  // Saved lists live in the world (the person's and Alpha's); the window only shows them.
  const [lists, setLists] = useState<SavedList[]>([]);
  const [listId, setListId] = useState<string>("all");
  const openedOnDefault = useRef(false);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [hideDone, setHideDone] = useState(false);
  const [showGone, setShowGone] = useState(false);
  const [sort, setSort] = useState<Sort | null>(null);
  const [hidden, setHidden] = useState<string[]>(() => remembered<string[]>(`${key}.hidden`, []));
  const [order, setOrder] = useState<string[]>(() => remembered<string[]>(`${key}.order`, []));
  const [widths, setWidths] = useState<Record<string, number>>(() => remembered<Record<string, number>>(`${key}.widths`, {}));
  const columns = useMemo(() => {
    const base = fields.map((f) => f.name).filter((c) => !hidden.includes(c));
    const placed = order.filter((c) => base.includes(c));
    return [...placed, ...base.filter((c) => !placed.includes(c))];
  }, [fields, hidden, order]);
  const [all, setAll] = useState<RecordRow[] | null>(null);
  const [pageAt, setPageAt] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(() => remembered<PageSize>(PAGE_SIZE_KEY, "fit"));
  const [fit, setFit] = useState(20);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });

  useEffect(() => remember(`${key}.view`, view), [key, view]);
  useEffect(() => remember(`${key}.hidden`, hidden), [key, hidden]);
  useEffect(() => remember(`${key}.order`, order), [key, order]);
  useEffect(() => remember(`${key}.widths`, widths), [key, widths]);
  useEffect(() => remember(PAGE_SIZE_KEY, pageSize), [pageSize]);
  const moveColumn = (name: string, by: -1 | 1) =>
    setOrder(() => {
      const current = [...columns];
      const at = current.indexOf(name);
      const to = at + by;
      if (at < 0 || to < 0 || to >= current.length) return current;
      current.splice(at, 1);
      current.splice(to, 0, name);
      return current;
    });

  const searchable = useMemo(() => fields.filter((f) => f.kind === "text" || f.kind === "long_text" || f.kind === "url").map((f) => f.name), [fields]);
  const facets = useMemo(() => fields.filter((f) => (f.kind === "choice" || f.kind === "status") && (f.choices ?? []).length > 0), [fields]);

  const load = useCallback(() => {
    client
      .table(table.name)
      .then(async (result) => {
        setAll(result.records);
        setFiles(result.files ?? {});
        setError(null);
        // Lists the window kept before 3 Oct move into the world once, then the key goes.
        const old = remembered<OldSavedList[]>(`${key}.lists`, []);
        let kept = result.lists;
        if (old.length) {
          for (const l of old) {
            try {
              kept = [...kept, await client.saveList(table.name, l.title, { search: l.search, filters: l.filters, hide_done: l.hideDone, hidden: l.hidden })];
            } catch {
              /* a list the table no longer fits is dropped */
            }
          }
          try {
            localStorage.removeItem(`${key}.lists`);
          } catch {
            /* nothing to clean */
          }
        }
        setLists(kept);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [client, table.name, key]);
  useEffect(load, [load, version]);

  const rows = useMemo(() => (all ? applyQuery(all, { search, searchable, filters, hideDone, statusField, showGone, sort }) : null), [all, search, searchable, filters, hideDone, showGone, statusField, sort]);
  useEffect(() => setPageAt(0), [search, filters, hideDone, showGone, sort]);
  // A table fed by readers: the platform knows when each row was first seen, last seen, gone.
  const tracked = useMemo(() => Boolean(all?.some((r) => r.seen_at || r.gone_at)), [all]);
  const goneCount = useMemo(() => (all ?? []).filter((r) => r.gone_at).length, [all]);

  // The page never scrolls; the rows do, inside their own area under a header that stays put.
  // Fit to window: as many rows as that area holds, less the header and totals. Measured when
  // the page first shows rows and when the window changes size, not as rows come and go.
  const loaded = all !== null;
  const measure = useCallback(() => {
    const body = bodyRef.current;
    const scroller = scrollRef.current;
    if (!body || !scroller) return;
    const first = body.firstElementChild as HTMLElement | null;
    const rowHeight = first?.getBoundingClientRect().height || 34;
    const table = body.closest("table");
    const chrome = (table?.tHead?.offsetHeight ?? 0) + (table?.tFoot?.offsetHeight ?? 0);
    // A narrow window stacks everything and lets the page scroll; fit to what is left on screen.
    const fills = getComputedStyle(scroller).overflowY !== "visible";
    const room = fills ? scroller.clientHeight : window.innerHeight - scroller.getBoundingClientRect().top - 60;
    setFit(Math.max(FEWEST_ROWS, Math.floor((room - chrome - 1) / rowHeight)));
  }, []);
  useLayoutEffect(() => {
    if (loaded) measure();
  }, [loaded, view, table.name, measure]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const paged = view === "table" || view === "list";
  const size = pageSize === "fit" ? fit : pageSize;
  const page = rows ? pageOf(rows, pageAt, size) : null;
  const pages = page?.pages ?? 1;
  const at = page?.at ?? 0;
  const shownRows = page?.rows ?? null;
  function choosePageSize(next: PageSize) {
    const nextSize = next === "fit" ? fit : next;
    setPageAt(Math.floor((at * size) / nextSize));
    setPageSize(next);
  }

  async function run(work: () => Promise<unknown>, words: string): Promise<boolean> {
    setStatus(null);
    try {
      await work();
      load();
      onChanged();
      return true;
    } catch (e) {
      setStatus({ ok: false, text: `${words}: ${e instanceof Error ? e.message : String(e)}` });
      return false;
    }
  }
  function commit(row: RecordRow, field: FieldInfo, text: string) {
    const value = coerce(text, field.kind);
    const current = row.values[field.name] ?? null;
    if (JSON.stringify(value) === JSON.stringify(current)) return;
    void run(() => client.editRecord(table.name, row.id, { [field.name]: value }, row.revision), "Couldn't save the change");
  }
  function remove(row: RecordRow) {
    setOpenId(null);
    void run(() => client.deleteRecord(table.name, row.id, row.revision), "Couldn't remove it");
  }
  function move(row: RecordRow, field: FieldInfo, value: string) {
    if ((row.values[field.name] ?? null) === value) return;
    void run(() => client.editRecord(table.name, row.id, { [field.name]: value }, row.revision), "Couldn't move it");
  }

  const applyList = useCallback(
    (id: string, from: SavedList[] = lists) => {
      setListId(id);
      const c = from.find((l) => l.id === id)?.config;
      setFilters(c?.filters ?? {});
      setSearch(c?.search ?? "");
      setHideDone(c?.hide_done ?? false);
      if (c) {
        setHidden(c.hidden ?? []);
        setSort(c.sort ?? null);
        if (c.view) setView(c.view as PageView);
      }
    },
    [lists],
  );
  // A table opens on its default list, once per visit.
  useEffect(() => {
    if (openedOnDefault.current || !lists.length) return;
    openedOnDefault.current = true;
    const starred = lists.find((l) => l.is_default);
    if (starred) applyList(starred.id, lists);
  }, [lists, applyList]);
  const currentConfig = (): SavedList["config"] => ({ search, filters, hide_done: hideDone, hidden, sort, view });
  async function saveList(title: string) {
    if (!title.trim()) return;
    const ok = await run(async () => {
      const saved = await client.saveList(table.name, title.trim(), currentConfig());
      setLists((existing) => [...existing, saved]);
      setListId(saved.id);
    }, "Couldn't save the list");
    if (ok) setNaming(null);
  }
  function updateList() {
    void run(async () => {
      const changed = await client.updateList(listId, { config: currentConfig() });
      setLists((existing) => existing.map((l) => (l.id === changed.id ? changed : l)));
    }, "Couldn't change the list");
  }
  function starList(id: string) {
    void run(async () => {
      const changed = await client.updateList(id, { default: true });
      setLists((existing) => existing.map((l) => ({ ...l, is_default: l.id === changed.id })));
    }, "Couldn't make it the default");
  }
  function dropList() {
    const id = listId;
    void run(async () => {
      await client.deleteList(id);
      setLists((existing) => existing.filter((l) => l.id !== id));
    }, "Couldn't remove the list");
    applyList("all");
  }

  const shownColumns = columns.filter((c) => byName.has(c));
  const openRow = openId ? (all?.find((r) => r.id === openId) ?? null) : null;
  const filtered = Boolean(search || Object.values(filters).some(Boolean) || hideDone);
  const count = (n: number) => n.toLocaleString();
  const rowsWord = (n: number) => (n === 1 ? "row" : "rows");
  const { estimated: guesses, assumed } = rows ? provenanceCounts(rows) : { estimated: 0, assumed: 0 };
  const resting = !rows || (!guesses && !assumed) ? "" : ` · ${[guesses ? `${count(guesses)} estimated` : "", assumed ? `${count(assumed)} on an assumption` : ""].filter(Boolean).join(", ")}`;
  const counted = !rows
    ? "Loading…"
    : paged && rows.length > size
      ? `${count(at * size + 1)}–${count(Math.min(rows.length, at * size + size))} of ${count(rows.length)} ${filtered ? `matching · ${count(all?.length ?? 0)} in all` : rowsWord(rows.length)}`
      : rows.length === all?.length
        ? `${count(rows.length)} ${rowsWord(rows.length)}`
        : `${count(rows.length)} of ${count(all?.length ?? 0)} rows`;

  return (
    <div className="stack stack--fill" aria-label={table.title}>
      <div className="card card--fill">
        <div className="toolbar toolbar--page">
          {searchable.length ? (
            <div className="search">
              <span aria-hidden="true">⌕</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${table.title.toLowerCase()}`} aria-label="Search" />
            </div>
          ) : null}
          <Tabs className="toggle toggle--views" label="View" value={view} onChange={setView} items={VIEWS.filter((v) => v.id === "table" || v.id === "list" || (v.id === "board" && groupField) || ((v.id === "calendar" || v.id === "chart") && dateField))} />
          {lists.length ? (
            <select className="btn btn--sm" value={listId} onChange={(e) => applyList(e.target.value)} aria-label="Saved list">
              <option value="all">All</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.is_default ? "★ " : ""}{l.title}
                </option>
              ))}
            </select>
          ) : null}
          {facets.map((field) => (
            <select key={field.name} className="btn btn--sm" value={filters[field.name] ?? ""} onChange={(e) => setFilters((p) => ({ ...p, [field.name]: e.target.value }))} aria-label={`Filter by ${humanize(field.name).toLowerCase()}`}>
              <option value="">{humanize(field.name)}: any</option>
              {(field.choices ?? []).map((c) => (
                <option key={c} value={c}>
                  {humanize(c)}
                </option>
              ))}
            </select>
          ))}
          {statusField && (statusField.done_choices ?? []).length ? (
            <label className="check">
              <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Hide done
            </label>
          ) : null}
          {tracked && goneCount ? (
            <label className="check">
              <input type="checkbox" checked={showGone} onChange={(e) => setShowGone(e.target.checked)} /> Show gone ({goneCount})
            </label>
          ) : null}
          <span className="spacer" />
          <Button size="sm" variant="primary" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
            {adding ? "Cancel" : "Add"}
          </Button>
          <Popover label="Table options" trigger={<IconButton label="More" icon={<MoreHorizontal />} />}>
            <div>
                <div className="menu__head">Download</div>
                <button type="button" className="menu__item" onClick={() => void exportAs("csv")}>
                  As CSV
                </button>
                <button type="button" className="menu__item" onClick={() => void exportAs("xlsx")}>
                  As Excel
                </button>
                <div className="menu__head">Columns</div>
                {[...shownColumns, ...fields.map((f) => f.name).filter((n) => !shownColumns.includes(n))].map((name) => {
                  const at = shownColumns.indexOf(name);
                  return (
                    <div key={name} className="menu__item menu__item--col">
                      <label>
                        <input type="checkbox" checked={at >= 0} onChange={(e) => setHidden((h) => (e.target.checked ? h.filter((n) => n !== name) : [...h, name]))} /> {humanize(name)}
                      </label>
                      {at >= 0 ? (
                        <span className="menu__arrows">
                          <IconButton size="sm" label={`Move ${humanize(name)} left`} icon={<ArrowLeft />} disabled={at === 0} onClick={() => moveColumn(name, -1)} />
                          <IconButton size="sm" label={`Move ${humanize(name)} right`} icon={<ArrowRight />} disabled={at === shownColumns.length - 1} onClick={() => moveColumn(name, 1)} />
                        </span>
                      ) : null}
                    </div>
                  );
                })}
                {Object.keys(widths).length ? (
                  <button type="button" className="menu__item" onClick={() => setWidths({})}>
                    Reset column widths
                  </button>
                ) : null}
                <div className="menu__head">Lists</div>
                {naming !== null ? (
                  <form className="menu__item" onSubmit={(e) => { e.preventDefault(); saveList(naming); }}>
                    <input autoFocus value={naming} onChange={(e) => setNaming(e.target.value)} placeholder="Name this list" aria-label="List name" />
                  </form>
                ) : (
                  <button type="button" className="menu__item" onClick={() => setNaming("")} disabled={!filtered}>
                    Save the current filters as a list
                  </button>
                )}
                {listId !== "all" ? (
                  <>
                    <button type="button" className="menu__item" onClick={updateList}>
                      Save the current filters to this list
                    </button>
                    {!lists.find((l) => l.id === listId)?.is_default ? (
                      <button type="button" className="menu__item" onClick={() => starList(listId)}>
                        Open this table on this list
                      </button>
                    ) : null}
                    <button type="button" className="menu__item menu__item--danger" onClick={dropList}>
                      Remove this list
                    </button>
                  </>
                ) : null}
            </div>
          </Popover>
        </div>
        {adding ? <AddRow fields={fields} collection={table.name} onDone={() => setAdding(false)} onAdd={(values) => run(() => client.addRecord(table.name, values), "Couldn't add it")} /> : null}
        {error ? (
          <p className="notice" style={{ padding: 12 }} role="alert">
            {error}{" "}
            <Button size="sm" onClick={load}>
              Try again
            </Button>
          </p>
        ) : null}
        <div className="pagebody" ref={scrollRef}>
          {view === "table" ? (
            <TableView seen={tracked} rows={shownRows ?? []} totalOf={rows ?? []} bodyRef={bodyRef} fields={fields} columns={shownColumns} byName={byName} widths={widths} onWidth={(name, w) => setWidths((existing) => ({ ...existing, [name]: w }))} sort={sort} onSort={setSort} openId={openId} onOpen={(id) => setOpenId((current) => (current === id ? null : id))} onCommit={commit} empty={rows && !rows.length ? (filtered ? "Nothing matches." : "Nothing here yet.") : null} files={files} onFile={(row, field, file) => void addFile(row, field, file)} />
          ) : null}
          {view === "board" && groupField ? <BoardView rows={rows ?? []} field={groupField} titleField={titleField} fields={fields} onOpen={setOpenId} onMove={(row, value) => move(row, groupField, value)} /> : null}
          {view === "list" ? <ListView rows={shownRows ?? []} bodyRef={bodyRef} titleField={titleField} columns={shownColumns} byName={byName} onOpen={setOpenId} /> : null}
          {view === "calendar" && dateField ? <CalendarView rows={rows ?? []} field={dateField} titleField={titleField} month={month} onMonth={setMonth} onOpen={setOpenId} /> : null}
          {view === "chart" && dateField ? <ChartView rows={rows ?? []} dateField={dateField} valueField={numericField ?? null} /> : null}
        </div>
        {openRow ? <RecordPanel row={openRow} fields={fields} titleField={titleField} onClose={() => setOpenId(null)} onCommit={(field, text) => commit(openRow, field, text)} onRemove={() => remove(openRow)} /> : null}
        <div className="pager">
          <span className="num">
            {counted}
            {resting ? (
              <span className="faint" title="Numbers Alpha estimated or assumed something for. Click a cell to correct it.">
                {resting}
              </span>
            ) : null}
          </span>
          {status ? (
            <span className={status.ok ? "notice notice--ok" : "notice"} role="status">
              {status.text}
            </span>
          ) : null}
          <span className="spacer" />
          {paged && rows?.length ? (
            <label className="pager__size">
              Rows per page
              <select className="btn btn--sm" value={String(pageSize)} onChange={(e) => choosePageSize(e.target.value === "fit" ? "fit" : Number(e.target.value))}>
                <option value="fit">Fit to window{pageSize === "fit" ? ` (${fit})` : ""}</option>
                {PAGE_SIZES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {paged && pages > 1 ? (
            <span className="pager__pages">
              <IconButton size="sm" label="First page" icon={<ChevronsLeft />} disabled={at === 0} onClick={() => setPageAt(0)} />
              <Button size="sm" disabled={at === 0} onClick={() => setPageAt(at - 1)}>
                Previous
              </Button>
              <span className="num">
                Page {count(at + 1)} of {count(pages)}
              </span>
              <Button size="sm" disabled={at >= pages - 1} onClick={() => setPageAt(at + 1)}>
                Next
              </Button>
              <IconButton size="sm" label="Last page" icon={<ChevronsRight />} disabled={at >= pages - 1} onClick={() => setPageAt(pages - 1)} />
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
