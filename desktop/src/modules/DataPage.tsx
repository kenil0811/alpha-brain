/**
 * A collection's data view: Alpha draws one for every table it keeps, so nothing has to be
 * designed. One toolbar (saved list, view, search, filter, page actions, ⋮ More), the numbers
 * above, the records in any of nine views, an add row that is always there, and a page bar.
 * Everything the person does here is theirs and journaled as theirs: a double-click edits a cell,
 * a click opens the record's page, Duplicate, Pin and Delete are on the row. A saved list is a
 * filter plus the columns shown. Rebuilt by the UI rulebook §6 (9 Oct): the page scrolls and the
 * table never traps the scroll; records open as pages, not in a drawer; Delete confirms in a
 * dialog that says what happens.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Client, FileInfo, RecordRow, SavedList, TableDesc, TableSummaryData, Relations } from "../core/client";
import { host } from "../core/host";
import { PREF, usePreference } from "../core/preferences";
import { DATE_KINDS, coerce, firstOfKind, titleFieldOf, type FieldInfo } from "./fields";
import { humanize } from "./format";
import { Button, Confirm, Dialog, Dropdown, IconButton, Trouble } from "../ui";
import { ChevronsLeft, ChevronsRight } from "../ui/icons";
import { applyQuery, defaultSummary, ofKinds, pageOf, pinnedFirst, provenanceCounts, type Sort, type SummaryOp } from "./views/engine";
import { GalleryView } from "./views/GalleryView";
import { TimelineView } from "./views/TimelineView";
import { AddRecordBar } from "./views/AddRecordBar";
import { BoardView } from "./views/BoardView";
import { CalendarView } from "./views/CalendarView";
import { ChartView } from "./views/ChartView";
import { ListView } from "./views/ListView";
import { FormView } from "./views/FormView";
import { TableView, copyText } from "./views/TableView";
import { DashboardView, dashboardAvailable } from "./views/DashboardView";
import { DataToolbar, FilterPills, type PageView } from "./DataToolbar";
import { MetricsStrip } from "./MetricsStrip";

export type { PageView } from "./DataToolbar";
/** Rows per page: by default as many as fit the first screen; the person can pick a fixed size,
 * and that choice becomes their default for every table. */
export type PageSize = "fit" | number;
export const PAGE_SIZES = [25, 50, 100, 250];
export const PAGE_SIZE_KEY = "alpha.rows-per-page";
const FEWEST_ROWS = 5;
/** What the first screen keeps for the add row, the footer and the page bar, below the rows. */
const BELOW_ROWS = 140;
const ALL_SECTIONS = ["notes", "intelligence", "governance"];

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

/** One recent cell edit, so ⌘Z can put it back (this table, this session). */
interface CellEdit {
  id: string;
  field: FieldInfo;
  before: unknown;
  after: unknown;
  /** The record's revision once the edit was written; a different one later means it changed meanwhile. */
  revision: number | undefined;
}

const word = (n: number) => (n === 1 ? "record" : "records");

export function DataPage({ client, table, version, onChanged, onSay, onAsk, onOpenRecord, onAddFiles, summary }: { client: Client; table: TableDesc; version: number; onChanged: () => void; onSay?: (sentence: string) => void; onAsk?: (sentence: string) => void; onOpenRecord?: (table: string, id: string) => void; onAddFiles?: () => void; summary?: TableSummaryData | null }) {
  const fields = table.fields as FieldInfo[];
  const byName = useMemo(() => new Map(fields.map((f) => [f.name, f])), [fields]);
  const key = `alpha.page.${table.name}`;
  const titleField = titleFieldOf(fields, table.title_field);
  const statusField = useMemo(() => fields.find((f) => f.kind === "status"), [fields]);
  // A board groups by a choice or status field, a calendar, timeline or chart runs on a date
  // field: the first of each by default, the person's pick when there are several.
  const choiceFields = useMemo(() => ofKinds(fields, new Set(["status", "choice"])).sort((a, b) => (a.kind === "status" ? -1 : b.kind === "status" ? 1 : 0)), [fields]);
  const dateFields = useMemo(() => ofKinds(fields, DATE_KINDS), [fields]);
  const [groupBy, setGroupBy] = useState<string | null>(null);
  const [dateBy, setDateBy] = useState<string | null>(null);
  const groupField = useMemo(() => choiceFields.find((f) => f.name === groupBy) ?? choiceFields[0], [choiceFields, groupBy]);
  const dateField = useMemo(() => dateFields.find((f) => f.name === dateBy) ?? dateFields[0], [dateFields, dateBy]);
  const numericField = useMemo(() => firstOfKind(fields, new Set(["number"])), [fields]);

  // Views the data cannot support stay in the menu, disabled, with the reason (§6, §14)
  const viewReasons = useMemo(
    () => ({
      board: groupField ? undefined : "Board needs a status or choice field. Ask Alpha in the panel to add one.",
      calendar: dateField ? undefined : "Calendar needs a date field. Ask Alpha in the panel to add one.",
      timeline: dateField ? undefined : "Timeline needs a date field. Ask Alpha in the panel to add one.",
      chart: dateField ? undefined : "Chart needs a date field. Ask Alpha in the panel to add one.",
      dashboard: dashboardAvailable(fields) ?? undefined,
    }),
    [groupField, dateField, fields],
  );
  const [chosenView, setView] = useState<PageView>(() => remembered<PageView>(`${key}.view`, "table"));
  const view: PageView = (viewReasons as Partial<Record<PageView, string>>)[chosenView] ? "table" : chosenView;

  const [files, setFiles] = useState<Record<string, FileInfo>>({});
  async function exportAs(format: "csv" | "xlsx") {
    try {
      const out = await client.exportTable(table.name, format);
      if (host.available()) await host.revealPath(out.path);
      setStatus({ ok: true, text: `Exported ${out.rows} ${word(out.rows)} to ${out.name}${host.available() ? "" : ` (${out.path})`}.` });
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
  /** "These records": the Dashboard's call to action, temporary (the core's lists cannot hold ids). */
  const [picked, setPicked] = useState<{ ids: string[]; label: string } | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState<Sort | null>(null);
  const [hidden, setHidden] = useState<string[]>(() => remembered<string[]>(`${key}.hidden`, []));
  const [order, setOrder] = useState<string[]>(() => remembered<string[]>(`${key}.order`, []));
  const [widths, setWidths] = useState<Record<string, number>>(() => remembered<Record<string, number>>(`${key}.widths`, {}));
  const [frozen, setFrozen] = useState<number>(() => remembered<number>(`${key}.frozen`, 0));
  const [tall, setTall] = useState<boolean>(() => remembered<boolean>(`${key}.tall`, false));
  const columns = useMemo(() => {
    const base = fields.map((f) => f.name).filter((c) => !hidden.includes(c));
    const placed = order.filter((c) => base.includes(c));
    return [...placed, ...base.filter((c) => !placed.includes(c))];
  }, [fields, hidden, order]);
  const [all, setAll] = useState<RecordRow[] | null>(null);
  const [pageAt, setPageAt] = useState(0);
  const [pageSize, setPageSize] = useState<PageSize>(() => remembered<PageSize>(PAGE_SIZE_KEY, "fit"));
  const [fit, setFit] = useState(20);
  const bodyRef = useRef<HTMLElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [relations, setRelations] = useState<Relations>({});
  const [formAt, setFormAt] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [removing, setRemoving] = useState<RecordRow[] | null>(null);
  const [naming, setNaming] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });

  // What the person chose about their world (the rulebook §6, contract 3): pins, footers, sections
  const [pinPref, setPinPref] = usePreference<Record<string, string[]>>(client, PREF.pinnedRecords, {});
  const [footPref, setFootPref] = usePreference<Record<string, Record<string, SummaryOp>>>(client, PREF.footerSummaries, {});
  const [sectionPref, setSectionPref] = usePreference<Record<string, string[]>>(client, PREF.recordSections, {});
  const pinned = pinPref[table.name] ?? [];
  const summaries = useMemo(() => Object.fromEntries(fields.map((f) => [f.name, footPref[table.name]?.[f.name] ?? defaultSummary(f.kind)])) as Record<string, SummaryOp>, [fields, footPref, table.name]);
  const sections = sectionPref[table.name] ?? ALL_SECTIONS;

  useEffect(() => remember(`${key}.view`, chosenView), [key, chosenView]);
  useEffect(() => remember(`${key}.hidden`, hidden), [key, hidden]);
  useEffect(() => remember(`${key}.order`, order), [key, order]);
  useEffect(() => remember(`${key}.widths`, widths), [key, widths]);
  useEffect(() => remember(`${key}.frozen`, frozen), [key, frozen]);
  useEffect(() => remember(`${key}.tall`, tall), [key, tall]);
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
  const reorderColumn = (from: string, to: string) =>
    setOrder(() => {
      const current = columns.filter((c) => c !== from);
      current.splice(columns.indexOf(to), 0, from);
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
        setRelations(result.relations ?? {});
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

  const rows = useMemo(() => (all ? pinnedFirst(applyQuery(all, { search, searchable, filters, hideDone, statusField, showGone, sort, ids: picked ? new Set(picked.ids) : null }), pinned) : null), [all, search, searchable, filters, hideDone, showGone, statusField, sort, picked, pinned]);
  useEffect(() => setPageAt(0), [search, filters, hideDone, showGone, sort, picked]);
  // A table with a file field says how files get in: the button above, or a drop on the page.
  const emptyWords = fields.some((f) => f.kind === "file") ? "No records yet. Add files with the button above, or drop them on the page; Alpha keeps each as a record here." : "No records yet.";
  // A table fed by readers: the platform knows when each row was first seen, last seen, gone.
  const tracked = useMemo(() => Boolean(all?.some((r) => r.seen_at || r.gone_at)), [all]);
  const goneCount = useMemo(() => (all ?? []).filter((r) => r.gone_at).length, [all]);

  // Fit to window: as many rows as the first screen holds below the table's header, less the
  // add row, the footer and the page bar. The page scrolls; this only decides the first page.
  // Measured when the page first shows rows and when the window changes size.
  const loaded = all !== null;
  const measure = useCallback(() => {
    const body = bodyRef.current;
    if (!body) return;
    const first = body.firstElementChild as HTMLElement | null;
    const rowHeight = first?.getBoundingClientRect().height || (tall ? 44 : 34);
    const room = window.innerHeight - body.getBoundingClientRect().top - BELOW_ROWS;
    setFit(Math.max(FEWEST_ROWS, Math.floor(room / rowHeight)));
  }, [tall]);
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

  // Cell edits, with ⌘Z and ⇧⌘Z over the recent ones made in this table this session. Each undo
  // is an edit back to the previous value with the record's current revision.
  const undoStack = useRef<CellEdit[]>([]);
  const redoStack = useRef<CellEdit[]>([]);
  async function write(row: RecordRow, field: FieldInfo, value: unknown): Promise<number | undefined | false> {
    setStatus(null);
    try {
      const saved = await client.editRecord(table.name, row.id, { [field.name]: value }, row.revision);
      load();
      onChanged();
      return saved?.revision;
    } catch (e) {
      setStatus({ ok: false, text: `Couldn't save the change: ${e instanceof Error ? e.message : String(e)}` });
      return false;
    }
  }
  async function commit(row: RecordRow, field: FieldInfo, text: string) {
    const value = coerce(text, field.kind);
    const before = row.values[field.name] ?? null;
    if (JSON.stringify(value) === JSON.stringify(before)) return;
    const revision = await write(row, field, value);
    if (revision === false) return;
    undoStack.current.push({ id: row.id, field, before, after: value, revision });
    redoStack.current = [];
  }
  async function step(from: CellEdit[], to: CellEdit[], back: boolean) {
    const edit = from.pop();
    if (!edit) return;
    const row = all?.find((r) => r.id === edit.id);
    if (!row || (edit.revision !== undefined && row.revision !== edit.revision)) {
      setStatus({ ok: false, text: `${humanize(edit.field.name)} was changed since, so ${back ? "the undo" : "the redo"} was left out.` });
      return;
    }
    const revision = await write(row, edit.field, back ? edit.before : edit.after);
    if (revision === false) {
      from.push(edit);
      return;
    }
    to.push({ ...edit, revision });
    setStatus({ ok: true, text: back ? "Undone." : "Redone." });
  }
  useEffect(() => {
    const keys = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.key.toLowerCase() !== "z") return;
      if ((e.target as HTMLElement | null)?.closest?.("input, textarea, [contenteditable='true'], [role='combobox']")) return; // a box being typed in has its own undo
      e.preventDefault();
      if (e.shiftKey) void step(redoStack.current, undoStack.current, false);
      else void step(undoStack.current, redoStack.current, true);
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  });

  const open = (id: string) => onOpenRecord?.(table.name, id);
  async function duplicate(chosen: RecordRow[]) {
    let done = 0;
    let problem = "";
    for (const row of chosen) {
      try {
        await client.addRecord(table.name, { ...row.values });
        done += 1;
      } catch (e) {
        problem = e instanceof Error ? e.message : String(e);
        break;
      }
    }
    load();
    onChanged();
    setStatus(problem ? { ok: false, text: `Duplicated ${done} of ${chosen.length}; then: ${problem}` } : { ok: true, text: done === 1 ? "Duplicated." : `Duplicated ${done} ${word(done)}.` });
  }
  /** Delete the chosen records one at a time, and say how many went when any refused. */
  async function removeChosen() {
    const chosen = removing ?? [];
    setRemoving(null);
    let done = 0;
    let problem = "";
    for (const row of chosen) {
      try {
        await client.deleteRecord(table.name, row.id, row.revision);
        done += 1;
      } catch (e) {
        problem = e instanceof Error ? e.message : String(e);
        break;
      }
    }
    setSelected(new Set());
    load();
    onChanged();
    setStatus(problem ? { ok: false, text: `Deleted ${done} of ${chosen.length}; then: ${problem}` } : { ok: true, text: `Deleted ${done} ${word(done)}.` });
  }
  function togglePin(row: RecordRow) {
    const next = pinned.includes(row.id) ? pinned.filter((id) => id !== row.id) : [...pinned, row.id];
    void setPinPref({ ...pinPref, [table.name]: next }).then((problem) => problem && setStatus({ ok: false, text: `Couldn't pin it: ${problem}` }));
  }
  function copy(row: RecordRow, field: FieldInfo) {
    const text = copyText(row, field);
    const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!clip) {
      setStatus({ ok: false, text: "Couldn't copy: this window has no clipboard." });
      return;
    }
    clip.writeText(text).then(
      () => setStatus({ ok: true, text: "Copied." }),
      () => setStatus({ ok: false, text: "Couldn't copy it." }),
    );
  }
  function setSummary(field: string, op: SummaryOp) {
    void setFootPref({ ...footPref, [table.name]: { ...footPref[table.name], [field]: op } });
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
      setPicked(null);
      if (c) {
        setHidden(c.hidden ?? []);
        setSort(c.sort ?? null);
        if (c.view) setView(c.view as PageView);
        setGroupBy(c.group_by ?? null);
        setDateBy(c.date_by ?? null);
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
  const currentConfig = (): SavedList["config"] => ({ search, filters, hide_done: hideDone, hidden, sort, view: chosenView, group_by: groupBy ?? undefined, date_by: dateBy ?? undefined });
  async function saveList(title: string) {
    if (!title.trim()) return;
    const ok = await run(async () => {
      const saved = await client.saveList(table.name, title.trim(), currentConfig());
      setLists((existing) => [...existing, saved]);
      setListId(saved.id);
    }, "Couldn't add the list");
    if (ok) {
      setNaming(null);
      if (picked) setStatus({ ok: true, text: "List added. A list cannot hold a set of picked records, so that part was left out." });
    }
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
    setDropping(false);
    const id = listId;
    void run(async () => {
      await client.deleteList(id);
      setLists((existing) => existing.filter((l) => l.id !== id));
    }, "Couldn't delete the list");
    applyList("all");
  }
  function resetView() {
    setSearch("");
    setFilters({});
    setHideDone(false);
    setShowGone(false);
    setPicked(null);
    setSort(null);
    setHidden([]);
    setOrder([]);
    setWidths({});
    setFrozen(0);
    setTall(false);
    setGroupBy(null);
    setDateBy(null);
    setView("table");
  }

  const filtered = Boolean(search || Object.values(filters).some(Boolean) || hideDone || picked);
  const pills = [
    ...Object.entries(filters).filter(([, v]) => v).map(([f, v]) => ({ key: `f-${f}`, text: `${byName.get(f)?.label ?? humanize(f)}: ${humanize(v)}`, onRemove: () => setFilters((p) => ({ ...p, [f]: "" })) })),
    ...(hideDone ? [{ key: "done", text: "Hide done", onRemove: () => setHideDone(false) }] : []),
    ...(showGone ? [{ key: "gone", text: "Showing gone", onRemove: () => setShowGone(false) }] : []),
    ...(picked ? [{ key: "picked", text: picked.label, onRemove: () => setPicked(null) }] : []),
  ];
  const clearAll = () => {
    setFilters({});
    setHideDone(false);
    setShowGone(false);
    setPicked(null);
  };
  const count = (n: number) => n.toLocaleString();
  const { estimated: guesses, assumed } = rows ? provenanceCounts(rows) : { estimated: 0, assumed: 0 };
  const resting = !rows || (!guesses && !assumed) ? "" : ` · ${[guesses ? `${count(guesses)} estimated` : "", assumed ? `${count(assumed)} on an assumption` : ""].filter(Boolean).join(", ")}`;
  const matching = filtered ? " matching" : "";
  const counted = !rows
    ? `Loading ${table.title}…`
    : !rows.length
      ? filtered ? "Nothing matches." : emptyWords
      : paged
        ? `Showing ${count(at * size + 1)} to ${count(Math.min(rows.length, at * size + size))} of ${count(rows.length)}${matching}${filtered ? ` · ${count(all?.length ?? 0)} in all` : ""}`
        : `${count(rows.length)} ${word(rows.length)}${matching}${filtered ? ` · ${count(all?.length ?? 0)} in all` : ""}`;

  const adder = <AddRecordBar table={table} onSay={onSay} onNew={onOpenRecord ? () => onOpenRecord(table.name, "new") : undefined} />;
  const openRelated = onOpenRecord ? (collection: string, id: string) => onOpenRecord(collection, id) : undefined;
  const none = rows && !rows.length;

  return (
    <div className="datapage" aria-label={table.title}>
      <MetricsStrip table={table} rows={all} summary={summary} />
      <div className="card datacard">
        <DataToolbar
          lists={lists}
          listId={listId}
          onList={applyList}
          onAddList={() => setNaming("")}
          view={view}
          onView={setView}
          viewReasons={viewReasons}
          groupFields={choiceFields}
          groupBy={groupField?.name ?? ""}
          onGroup={setGroupBy}
          dateFields={dateFields}
          dateBy={dateField?.name ?? ""}
          onDate={setDateBy}
          search={search}
          onSearch={setSearch}
          searchable={searchable.length > 0}
          tableTitle={table.title}
          filter={{ facets, filters, onFilter: (f, v) => setFilters((p) => ({ ...p, [f]: v })), hasDone: Boolean(statusField && (statusField.done_choices ?? []).length), hideDone, onHideDone: setHideDone, goneCount: tracked ? goneCount : 0, showGone, onShowGone: setShowGone, open: filterOpen, onOpenChange: setFilterOpen, active: pills.length }}
          onAddFiles={onAddFiles}
          onExport={(f) => void exportAs(f)}
          more={{
            fields,
            sort,
            onSort: setSort,
            shownColumns: columns,
            onColumn: (name, on) => setHidden((h) => (on ? h.filter((n) => n !== name) : [...h, name])),
            onMoveColumn: moveColumn,
            widthsSet: Object.keys(widths).length > 0,
            onResetWidths: () => setWidths({}),
            frozen,
            onFrozen: setFrozen,
            tall,
            onTall: setTall,
            summaries,
            onSummary: setSummary,
            sections,
            onSections: (next) => void setSectionPref({ ...sectionPref, [table.name]: next }),
            listId,
            listIsDefault: Boolean(lists.find((l) => l.id === listId)?.is_default),
            onSaveToList: updateList,
            onSaveAsList: () => setNaming(""),
            onStar: () => starList(listId),
            onDeleteList: () => setDropping(true),
            onReset: resetView,
          }}
        />
        <FilterPills pills={pills} onClearAll={clearAll} />
        {selected.size ? (
          <div className="selectbar" role="status">
            <b>{count(selected.size)} selected</b>
            <Button size="sm" onClick={() => void duplicate((all ?? []).filter((r) => selected.has(r.id)))}>
              Duplicate
            </Button>
            <Button size="sm" variant="danger" onClick={() => setRemoving((all ?? []).filter((r) => selected.has(r.id)))}>
              Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Cancel
            </Button>
          </div>
        ) : null}
        {error ? (
          <div style={{ padding: "var(--space-3)" }}>
            <Trouble onRetry={load}>Couldn't load {table.title}: {error}</Trouble>
          </div>
        ) : null}
        {view === "table" ? (
          <TableView
            seen={tracked}
            rows={shownRows ?? []}
            summaryRows={rows ?? []}
            bodyRef={bodyRef}
            fields={fields}
            columns={columns}
            byName={byName}
            widths={widths}
            onWidth={(name, w) => setWidths((existing) => ({ ...existing, [name]: w }))}
            frozen={frozen}
            sort={sort}
            onSort={setSort}
            tall={tall}
            pinned={pinned}
            onOpen={onOpenRecord ? open : undefined}
            onCommit={(row, field, text) => void commit(row, field, text)}
            files={files}
            onFile={(row, field, file) => void addFile(row, field, file)}
            selected={selected}
            onSelect={(id, on) => setSelected((s) => { const next = new Set(s); if (on) next.add(id); else next.delete(id); return next; })}
            onSelectAll={(on) => setSelected((s) => { const next = new Set(s); for (const r of shownRows ?? []) if (on) next.add(r.id); else next.delete(r.id); return next; })}
            relations={relations}
            onOpenRelated={openRelated}
            summaries={summaries}
            onSummary={setSummary}
            rowActions={{ open: onOpenRecord ? (row) => open(row.id) : undefined, duplicate: (row) => void duplicate([row]), pin: togglePin, remove: (row) => setRemoving([row]), copy, history: onOpenRecord ? (row) => open(row.id) : undefined }}
            columnActions={{
              hide: (c) => setHidden((h) => [...h, c]),
              freeze: (c) => setFrozen(columns.indexOf(c) < frozen ? 0 : columns.indexOf(c) + 1),
              move: moveColumn,
              reorder: reorderColumn,
              filter: () => setFilterOpen(true),
              filterable: new Set(facets.map((f) => f.name)),
            }}
            add={adder}
            blank={Boolean(none)}
          />
        ) : null}
        {view === "form" ? <FormView rows={rows ?? []} at={formAt} onAt={setFormAt} fields={fields} titleField={titleField} relations={relations} onCommit={(row, field, text) => void commit(row, field, text)} onOpenRelated={openRelated} empty={none ? (filtered ? "Nothing matches." : emptyWords) : null} /> : null}
        {view === "board" && groupField ? <BoardView rows={rows ?? []} field={groupField} titleField={titleField} fields={fields} onOpen={open} onMove={(row, value) => move(row, groupField, value)} /> : null}
        {view === "list" ? <ListView rows={shownRows ?? []} bodyRef={bodyRef} titleField={titleField} columns={columns} byName={byName} onOpen={open} /> : null}
        {view === "gallery" ? <GalleryView rows={rows ?? []} fields={fields.filter((f) => columns.includes(f.name))} titleField={titleField} onOpen={open} /> : null}
        {view === "timeline" && dateField ? <TimelineView rows={rows ?? []} field={dateField} titleField={titleField} fields={fields} onOpen={open} /> : null}
        {view === "calendar" && dateField ? <CalendarView rows={rows ?? []} field={dateField} titleField={titleField} month={month} onMonth={setMonth} onOpen={open} /> : null}
        {view === "chart" && dateField ? <ChartView rows={rows ?? []} dateField={dateField} valueField={numericField ?? null} /> : null}
        {view === "dashboard" ? (
          <DashboardView
            client={client}
            table={table}
            fields={fields}
            rows={rows ?? []}
            listKey={`${table.name}:${listId}`}
            onShowRecords={(ids, label) => {
              setPicked({ ids, label });
              setView("table");
            }}
            onOpenRecord={open}
            onAsk={(text) => (onAsk ?? onSay)?.(text)}
          />
        ) : null}
        {view !== "table" && view !== "dashboard" ? <div className="addbar-wrap">{adder}</div> : null}
        <div className="pager">
          <span className="num">
            {counted}
            {resting ? (
              <span className="faint" title="Records Alpha estimated or assumed something for. Double-click a cell to correct it.">
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
              Records per page
              <Dropdown size="sm" label="Records per page" value={String(pageSize)} onChange={(v) => choosePageSize(v === "fit" ? "fit" : Number(v))} options={[{ value: "fit", label: `Fit to window${pageSize === "fit" ? ` (${fit})` : ""}` }, ...PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))]} />
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
      <Confirm
        open={removing !== null}
        title={removing && removing.length === 1 ? `Delete ${String(removing[0].values[titleField ?? ""] || "this record")}?` : `Delete ${count(removing?.length ?? 0)} records?`}
        action={removing && removing.length > 1 ? `Delete ${count(removing.length)}` : "Delete"}
        onConfirm={() => void removeChosen()}
        onCancel={() => setRemoving(null)}
      >
        {removing && removing.length === 1 ? "It leaves the table; Activity keeps that it was here." : "They leave the table; Activity keeps that they were here."}
      </Confirm>
      <Confirm open={dropping} title="Delete this list?" action="Delete list" onConfirm={dropList} onCancel={() => setDropping(false)}>
        The list goes; the records in it stay.
      </Confirm>
      <Dialog open={naming !== null} onOpenChange={(o) => !o && setNaming(null)} title="Add a list">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (naming?.trim()) void saveList(naming);
          }}
        >
          <div className="dialog__body">It keeps the current filters, sort, columns and view under a name, so you can come back to them.</div>
          <input className="textfield" autoFocus aria-label="List name" placeholder="Name this list" value={naming ?? ""} onChange={(e) => setNaming(e.target.value)} />
          <div className="row dialog__actions" style={{ marginTop: "var(--space-4)" }}>
            <Button variant="ghost" onClick={() => setNaming(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabledReason={naming?.trim() ? undefined : "Give it a name first."}>
              Add list
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
