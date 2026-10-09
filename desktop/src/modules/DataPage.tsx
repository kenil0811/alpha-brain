/**
 * A collection's data view: Alpha draws one for every table it keeps, so nothing has to be
 * designed. One toolbar (saved list, view, search, filter; a primary action and ⋯ More on the
 * right), the numbers above, the records in any of nine views, a "+ New" row that is always
 * there, and a page bar when there is more than one page. It draws any `DataSource` (a table the
 * core keeps, or rows the window holds), and what a source can't do stays visible, disabled, with
 * the source's reason.
 * Everything the person does here is theirs and journaled as theirs: a double-click edits a cell,
 * a click opens the record's page, Duplicate, Pin and Delete are on the row. A saved list is a
 * filter plus the columns shown. Rebuilt by the UI rulebook §6 (9 Oct): the page scrolls and the
 * table never traps the scroll; records open as pages, not in a drawer; Delete confirms in a
 * dialog that says what happens.
 * Notion's parity (9 Oct, the owner's pass): the saved lists are the views, as tabs; each view
 * keeps its layout, simple and advanced filters, several sorts, groups, colours, row height,
 * where records open (a side or centre peek over the page, or the page itself) and a load
 * limit with "Load more". What the core's list can't hold the window keeps (`viewState.ts`).
 * Selecting rows offers Edit property, Duplicate, Delete and Download as CSV.
 */
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Client, FileInfo, RecordRow, SavedList, TableDesc, TableSummaryData, Relations } from "../core/client";
import { PREF, usePreference } from "../core/preferences";
import { DATE_KINDS, coerce, inputType, showValue, titleFieldOf, type FieldInfo } from "./fields";
import { reasonFor, tableSource, type DataSource } from "./source";
import { humanize } from "./format";
import { Button, Confirm, Dialog, Dropdown, IconButton, Popover, Trouble } from "../ui";
import { ChevronDown, ChevronsLeft, ChevronsRight, ChevronUp, ICON_SM, Maximize2, PlusIcon, X } from "../ui/icons";
import { applyQuery, colorsOf, defaultSummary, groupRows, ofKinds, pageOf, pinnedFirst, provenanceCounts, type Sort, type SummaryOp } from "./views/engine";
import { DEFAULT_VIEW, stateFor, toConfig, type KeptView, type ViewState } from "./viewState";
import { FilterBar, GroupEditor, RuleEditor, fieldLabel, ruleFor } from "./FilterUI";
import { ViewSettings, type SettingsPage } from "./ViewSettings";
import { downloadText, toCsv } from "./csv";
import { GalleryView } from "./views/GalleryView";
import { TimelineView } from "./views/TimelineView";
import { BoardView } from "./views/BoardView";
import { CalendarView } from "./views/CalendarView";
import { ChartView } from "./views/ChartView";
import { ListView } from "./views/ListView";
import { FormView } from "./views/FormView";
import { TableView, copyText } from "./views/TableView";
import { cellEditable } from "./views/cells";
import { DashboardView, dashboardAvailable } from "./views/DashboardView";
import { DataToolbar, VIEWS, type PageView, type ViewTab } from "./DataToolbar";
import { MetricsStrip } from "./MetricsStrip";

export type { PageView } from "./DataToolbar";
/** Rows per page: by default as many as fit the first screen; the person can pick a fixed size,
 * and that choice becomes their default for every table. */
export type PageSize = "fit" | number;
export const PAGE_SIZES = [25, 50, 100, 250];
export const PAGE_SIZE_KEY = "alpha.rows-per-page";
const FEWEST_ROWS = 5;
/** What the first screen keeps for the "+ New" row, the footer and the page bar, below the rows. */
const BELOW_ROWS = 140;
const ALL_SECTIONS = ["notes", "intelligence", "governance"];

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

/** What a record page shown in a peek asks before the peek closes or moves (RecordPage's guard). */
export type PeekGuard = (proceed: () => void) => boolean;

/** The window address of a record of a module's table, when this page is a module's. */
function recordLink(table: string, id: string): string | null {
  const m = window.location.hash.match(/^#\/m\/([^/]+)/);
  return m ? `${window.location.origin}${window.location.pathname}#/m/${m[1]}/${encodeURIComponent(table)}/${encodeURIComponent(id)}` : null;
}

/** The data view over a table the core keeps (`table`) or over any other `source`. `onOpenRecord`
 *  gets the source's key and the record's id ("new" for a new record's page); `onAddFiles` is
 *  Upload (the module's file picker). */
export function DataPage({ client, table, source, version, onChanged, onSay, onAsk, onOpenRecord, onAddFiles, summary, renderPeek }: { client: Client; table?: TableDesc; source?: DataSource; version: number; onChanged: () => void; onSay?: (sentence: string) => void; onAsk?: (sentence: string) => void; onOpenRecord?: (table: string, id: string) => void; onAddFiles?: () => void; summary?: TableSummaryData | null; /** A record's page for a side or centre peek; `onGuard` takes the page's leave guard. Absent, records open as full pages only. */ renderPeek?: (table: string, id: string, onGuard: (guard: PeekGuard | null) => void) => ReactNode }) {
  const src = useMemo(() => source ?? tableSource(client, table!), [source, client, table]);
  const fields = src.fields;
  const byName = useMemo(() => new Map(fields.map((f) => [f.name, f])), [fields]);
  const key = `alpha.page.${src.key}`;
  const titleField = titleFieldOf(fields, src.titleField);
  const statusField = useMemo(() => fields.find((f) => f.kind === "status"), [fields]);
  // A board groups by a choice or status field, a calendar, timeline or chart runs on a date
  // field: the first of each by default, the person's pick when there are several.
  const choiceFields = useMemo(() => ofKinds(fields, new Set(["status", "choice"])).sort((a, b) => (a.kind === "status" ? -1 : b.kind === "status" ? 1 : 0)), [fields]);
  const dateFields = useMemo(() => ofKinds(fields, DATE_KINDS), [fields]);
  // Saved lists live in the world (the person's and Alpha's) and are the views, as tabs; what a
  // list can't hold the window keeps per view (PREF.viewSettings).
  const [lists, setLists] = useState<SavedList[]>([]);
  const [listId, setListId] = useState<string>("all");
  const openedOnDefault = useRef(false);
  const [kept, setKept] = usePreference<Record<string, KeptView & { tabOrder?: string[] }>>(client, PREF.viewSettings, {});
  const vkey = `${src.key}:${listId}`;
  const list = lists.find((l) => l.id === listId);
  const [edited, setEdited] = useState<Record<string, ViewState>>({});
  const vs: ViewState = edited[vkey] ?? stateFor(list?.config, kept[vkey], listId === "all" ? remembered<PageView>(`${key}.view`, "table") : "table");
  const dirty = useRef(new Set<string>());
  const patch = (p: Partial<ViewState>) => {
    dirty.current.add(vkey);
    setEdited((m) => ({ ...m, [vkey]: { ...(m[vkey] ?? vs), ...p } }));
  };
  const groupField = useMemo(() => (vs.view === "board" ? (byName.get(vs.groupBy ?? "") ?? choiceFields[0]) : vs.groupBy ? byName.get(vs.groupBy) : undefined), [vs.view, vs.groupBy, byName, choiceFields]);
  const dateField = useMemo(() => dateFields.find((f) => f.name === vs.dateBy) ?? dateFields[0], [dateFields, vs.dateBy]);
  const chartX = byName.get(vs.chart.x ?? "") ?? dateField ?? choiceFields[0];

  // Views the data cannot support stay in the menus, disabled, with the reason (§6, §14)
  const viewReasons = useMemo(
    () => ({
      board: choiceFields[0] || vs.groupBy ? undefined : "Board needs a status or choice field. Ask Alpha in the panel to add one.",
      calendar: dateField ? undefined : "Calendar needs a date field. Ask Alpha in the panel to add one.",
      timeline: dateField ? undefined : "Timeline needs a date field. Ask Alpha in the panel to add one.",
      chart: chartX ? undefined : "Chart needs a date, status or choice field. Ask Alpha in the panel to add one.",
      dashboard: dashboardAvailable(fields) ?? undefined,
    }),
    [choiceFields, vs.groupBy, dateField, chartX, fields],
  );
  const view: PageView = (viewReasons as Partial<Record<PageView, string>>)[vs.view] ? "table" : vs.view;
  const setView = (v: PageView) => patch({ view: v });

  const [files, setFiles] = useState<Record<string, FileInfo>>({});
  async function download(format: "csv" | "xlsx") {
    try {
      setStatus({ ok: true, text: await src.exportAs!(format) });
    } catch (e) {
      setStatus({ ok: false, text: `Couldn't download: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  async function addFile(row: RecordRow, field: FieldInfo, file: File) {
    try {
      await src.addFile!(row, field, file);
      load();
      onChanged();
    } catch (e) {
      setStatus({ ok: false, text: `Couldn't add ${file.name}: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  const [search, setSearch] = useState("");
  const [showGone, setShowGone] = useState(false);
  /** "These records": the Dashboard's call to action, temporary (the core's lists cannot hold ids). */
  const [picked, setPicked] = useState<{ ids: string[]; label: string } | null>(null);
  const [filterOpen, setFilterOpenState] = useState(false);
  /** What the Filter panel is editing: the rule just added, or the advanced filter. */
  const [filterEdit, setFilterEdit] = useState<number | "advanced" | null>(null);
  const setFilterOpen = (o: boolean) => {
    setFilterOpenState(o);
    if (!o) setFilterEdit(null);
  };
  const [sortOpen, setSortOpen] = useState(false);
  const [openChip, setOpenChip] = useState<number | "advanced" | "sort" | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPage, setSettingsPage] = useState<SettingsPage>("root");
  const [peek, setPeek] = useState<string | null>(null);
  const peekGuard = useRef<PeekGuard | null>(null);
  const onPeekGuard = useCallback((g: PeekGuard | null) => { peekGuard.current = g; }, []);
  const [loads, setLoads] = useState(1);
  const hidden = vs.hidden;
  const setHidden = (next: string[] | ((h: string[]) => string[])) => patch({ hidden: typeof next === "function" ? next(vs.hidden) : next });
  const sorts = vs.sorts;
  const setSorts = (next: Sort[]) => patch({ sorts: next });
  const setSort = (s1: Sort | null) => setSorts(s1 ? [s1] : []);
  const sort = sorts[0] ?? null;
  const [order, setOrder] = useState<string[]>(() => remembered<string[]>(`${key}.order`, []));
  const [widths, setWidths] = useState<Record<string, number>>(() => remembered<Record<string, number>>(`${key}.widths`, {}));
  const [frozen, setFrozen] = useState<number>(() => remembered<number>(`${key}.frozen`, 0));
  const [wrapped, setWrapped] = useState<string[]>(() => remembered<string[]>(`${key}.wrap`, []));
  const [editRequest, setEditRequest] = useState<{ id: string; field: string } | null>(null);
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
  const [naming, setNaming] = useState<{ id: string; text: string } | null>(null);
  const [dropping, setDropping] = useState<string | null>(null);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() };
  });

  // What the person chose about their world (the rulebook §6, contract 3): pins, footers, sections
  const [pinPref, setPinPref] = usePreference<Record<string, string[]>>(client, PREF.pinnedRecords, {});
  const [footPref, setFootPref] = usePreference<Record<string, Record<string, SummaryOp>>>(client, PREF.footerSummaries, {});
  const [sectionPref, setSectionPref] = usePreference<Record<string, string[]>>(client, PREF.recordSections, {});
  const pinned = pinPref[src.key] ?? [];
  const summaries = useMemo(() => Object.fromEntries(fields.map((f) => [f.name, footPref[src.key]?.[f.name] ?? defaultSummary(f.kind)])) as Record<string, SummaryOp>, [fields, footPref, src.key]);
  const sections = sectionPref[src.key] ?? ALL_SECTIONS;

  useEffect(() => remember(`${key}.order`, order), [key, order]);
  useEffect(() => remember(`${key}.widths`, widths), [key, widths]);
  useEffect(() => remember(`${key}.frozen`, frozen), [key, frozen]);
  useEffect(() => remember(`${key}.wrap`, wrapped), [key, wrapped]);
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

  const load = useCallback(() => {
    src
      .load()
      .then((result) => {
        setAll(result.records);
        setFiles(result.files ?? {});
        setRelations(result.relations ?? {});
        setLists(result.lists ?? []);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [src]);
  useEffect(load, [load, version]);

  const rows = useMemo(() => (all ? pinnedFirst(applyQuery(all, { search, searchable, filters: {}, rules: vs.rules, advanced: vs.advanced, fields, hideDone: vs.hideDone, statusField, showGone, sort: null, sorts: vs.sorts, ids: picked ? new Set(picked.ids) : null }), pinned) : null), [all, search, searchable, vs.rules, vs.advanced, fields, vs.hideDone, showGone, statusField, vs.sorts, picked, pinned]);
  useEffect(() => {
    setPageAt(0);
    setLoads(1);
  }, [search, vs.rules, vs.advanced, vs.hideDone, showGone, vs.sorts, picked, listId]);
  // Files are what a collection with a file field is about: Upload is its primary action.
  const fileFirst = fields.some((f) => f.kind === "file");
  const emptyWords = fileFirst ? "No records yet. Drop files on the page, or Upload." : "No records yet.";
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
    const rowHeight = first?.getBoundingClientRect().height || (vs.rowHeight === "tall" ? 44 : vs.rowHeight === "medium" ? 40 : 34);
    const room = window.innerHeight - body.getBoundingClientRect().top - BELOW_ROWS;
    setFit(Math.max(FEWEST_ROWS, Math.floor(room / rowHeight)));
  }, [vs.rowHeight]);
  useLayoutEffect(() => {
    if (loaded) measure();
  }, [loaded, view, src.key, measure]);
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  // A load limit shows that many, then "Load more"; without one the table and list page.
  const limited = vs.loadLimit !== null && (view === "table" || view === "list" || view === "gallery" || view === "board");
  const paged = !limited && (view === "table" || view === "list");
  const size = pageSize === "fit" ? fit : pageSize;
  const page = rows && paged ? pageOf(rows, pageAt, size) : null;
  const pages = page?.pages ?? 1;
  const at = page?.at ?? 0;
  const shownRows = limited ? (rows?.slice(0, (vs.loadLimit ?? 0) * loads) ?? null) : (page?.rows ?? rows);
  const more = limited && rows ? rows.length - (shownRows?.length ?? 0) : 0;
  const groups = useMemo(() => (groupField && (view === "table" || view === "list") && shownRows ? groupRows(shownRows, groupField, { hideEmpty: vs.hideEmptyGroups, order: vs.groupOrder }) : null), [groupField, view, shownRows, vs.hideEmptyGroups, vs.groupOrder]);
  const toggleGroup = (k: string) => patch({ collapsed: vs.collapsed.includes(k) ? vs.collapsed.filter((x) => x !== k) : [...vs.collapsed, k] });
  const colorOf = vs.colors.length ? (row: RecordRow) => colorsOf(row, vs.colors, byName) : undefined;
  const toneOf = colorOf ? (row: RecordRow) => colorOf(row).row : undefined;
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
      const saved = await src.edit!(row, { [field.name]: value });
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

  /** Open a record where the view says: a peek over the page, or the page itself. */
  const open = (id: string) => {
    if (vs.openIn !== "page" && renderPeek) movePeek(id);
    else onOpenRecord?.(src.key, id);
  };
  /** Change what the peek shows (another record, or nothing), once its page lets go. */
  function movePeek(next: string | null) {
    const go = () => setPeek(next);
    if (!peekGuard.current?.(go)) go();
  }
  /** "+ New": an empty record, its title cell open for typing; where the source won't take an
   *  empty one, the new record's page. */
  async function addNew() {
    setStatus(null);
    try {
      const made = await src.add!({});
      load();
      onChanged();
      setPageAt(Number.MAX_SAFE_INTEGER); // the last page, where a new record lands
      const first = titleField && columns.includes(titleField) ? titleField : columns.find((c) => cellEditable(byName.get(c)!));
      if (made?.id && first) setEditRequest({ id: made.id, field: first });
    } catch (e) {
      if (onOpenRecord) onOpenRecord(src.key, "new");
      else setStatus({ ok: false, text: `Couldn't add one: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  const editReason = src.edit ? undefined : reasonFor(src, "edit");
  const addReason = src.add ? undefined : reasonFor(src, "add");
  const removeReason = src.remove ? undefined : reasonFor(src, "remove");
  const duplicateReason = src.duplicate ? undefined : reasonFor(src, "add");
  const listsReason = src.saveList ? undefined : reasonFor(src, "lists");
  async function duplicate(chosen: RecordRow[]) {
    let done = 0;
    let problem = "";
    for (const row of chosen) {
      try {
        await src.duplicate!(row);
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
        await src.remove!(row);
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
    void setPinPref({ ...pinPref, [src.key]: next }).then((problem) => problem && setStatus({ ok: false, text: `Couldn't pin it: ${problem}` }));
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
    void setFootPref({ ...footPref, [src.key]: { ...footPref[src.key], [field]: op } });
  }
  function move(row: RecordRow, field: FieldInfo, value: string) {
    if ((row.values[field.name] ?? null) === value) return;
    if (!src.edit) return setStatus({ ok: false, text: editReason! });
    void run(() => src.edit!(row, { [field.name]: value }), "Couldn't move it");
  }

  // A table opens on its default view, once per visit.
  useEffect(() => {
    if (openedOnDefault.current || !lists.length) return;
    openedOnDefault.current = true;
    const starred = lists.find((l) => l.is_default);
    if (starred) setListId(starred.id);
  }, [lists]);
  // A view's search, if a list carries one (Alpha's), comes with it; the person's is never saved.
  useEffect(() => setSearch(list?.config.search ?? ""), [listId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (listId === "all") remember(`${key}.view`, vs.view);
  }, [key, listId, vs.view]);

  // What the person changes in a view is kept as they go: the window's part at once (in a
  // moment, so typing is one write), the core's part on its list.
  useEffect(() => {
    if (!dirty.current.size) return;
    const timer = window.setTimeout(() => {
      const keys = [...dirty.current];
      dirty.current.clear();
      const next = { ...kept };
      for (const k of keys) {
        const state = edited[k];
        if (!state) continue;
        const id = k.slice(src.key.length + 1);
        const l = lists.find((x) => x.id === id);
        const config = toConfig(state);
        if (l && src.updateList && JSON.stringify({ ...l.config, ...config }) !== JSON.stringify(l.config)) {
          const merged = { ...l.config, ...config };
          src.updateList(id, { config: merged }).catch((e: unknown) => setStatus({ ok: false, text: `Couldn't keep the view: ${e instanceof Error ? e.message : String(e)}` }));
          setLists((now) => now.map((x) => (x.id === id ? { ...x, config: merged } : x)));
          next[k] = { ...state, core: JSON.stringify(merged) };
        } else next[k] = { ...state, core: l ? JSON.stringify(l.config) : undefined };
      }
      void setKept(next);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [edited]); // eslint-disable-line react-hooks/exhaustive-deps

  const tabOrder = kept[`${src.key}:tabs`]?.tabOrder ?? [];
  const tabs: ViewTab[] = [
    { id: "all", title: "All", view: listId === "all" ? vs.view : (edited[`${src.key}:all`] ?? stateFor(undefined, kept[`${src.key}:all`], remembered<PageView>(`${key}.view`, "table"))).view, isDefault: false },
    ...[...lists]
      .sort((a, b) => (tabOrder.indexOf(a.id) + 1 || 1e9) - (tabOrder.indexOf(b.id) + 1 || 1e9))
      .map((l) => ({ id: l.id, title: l.title, view: (edited[`${src.key}:${l.id}`] ?? stateFor(l.config, kept[`${src.key}:${l.id}`])).view, isDefault: l.is_default })),
  ];
  const stateOf = (id: string) => edited[`${src.key}:${id}`] ?? stateFor(lists.find((l) => l.id === id)?.config, kept[`${src.key}:${id}`]);
  function switchTab(id: string) {
    setListId(id);
    setPicked(null);
    setSelected(new Set());
    setOpenChip(null);
  }
  async function addView(title: string, state: ViewState) {
    await run(async () => {
      const saved = await src.saveList!(title, toConfig(state));
      setLists((existing) => [...existing, saved]);
      setEdited((m) => ({ ...m, [`${src.key}:${saved.id}`]: state }));
      dirty.current.add(`${src.key}:${saved.id}`);
      setListId(saved.id);
    }, "Couldn't add the view");
  }
  async function renameList(id: string, title: string) {
    const ok = await run(async () => {
      await src.updateList!(id, { title });
      setLists((existing) => existing.map((l) => (l.id === id ? { ...l, title } : l)));
    }, "Couldn't rename the view");
    if (ok) setNaming(null);
  }
  function starList(id: string) {
    void run(async () => {
      await src.updateList!(id, { default: true });
      setLists((existing) => existing.map((l) => ({ ...l, is_default: l.id === id })));
    }, "Couldn't make it the default");
  }
  function dropList() {
    const id = dropping;
    setDropping(null);
    if (!id) return;
    void run(async () => {
      await src.deleteList!(id);
      setLists((existing) => existing.filter((l) => l.id !== id));
    }, "Couldn't delete the view");
    if (id === listId) switchTab("all");
  }
  function reorderTabs(from: string, to: string) {
    const ids = tabs.map((t) => t.id).filter((id) => id !== "all" && id !== from);
    ids.splice(ids.indexOf(to), 0, from);
    void setKept({ ...kept, [`${src.key}:tabs`]: { tabOrder: ids } });
  }
  function resetView() {
    setSearch("");
    setShowGone(false);
    setPicked(null);
    patch({ ...DEFAULT_VIEW, view: vs.view });
    setOrder([]);
    setWidths({});
    setFrozen(0);
    setWrapped([]);
  }
  function addRule(f: FieldInfo) {
    const at = vs.rules.length;
    patch({ rules: [...vs.rules, ruleFor(f)] });
    setFilterOpenState(true);
    setFilterEdit(at);
  }
  function addAdvanced() {
    if (!vs.advanced && fields[0]) patch({ advanced: { join: "and", rules: [ruleFor(fields[0])] } });
    setFilterEdit("advanced");
  }
  const editingRule = typeof filterEdit === "number" ? vs.rules[filterEdit] : undefined;
  const filterEditor =
    filterEdit === "advanced" && vs.advanced ? (
      <GroupEditor fields={fields} group={vs.advanced} onChange={(g) => patch({ advanced: g })} />
    ) : editingRule ? (
      <RuleEditor fields={fields} rule={editingRule} onChange={(x) => patch({ rules: vs.rules.map((y, j) => (j === filterEdit ? x : y)) })} onRemove={() => { setFilterOpen(false); patch({ rules: vs.rules.filter((_, j) => j !== filterEdit) }); }} />
    ) : undefined;

  const filtered = Boolean(search || vs.rules.length || vs.advanced || vs.hideDone || picked);
  const pills = [
    ...(vs.hideDone ? [{ key: "done", text: "Hide done", onRemove: () => patch({ hideDone: false }) }] : []),
    ...(showGone ? [{ key: "gone", text: "Showing gone", onRemove: () => setShowGone(false) }] : []),
    ...(picked ? [{ key: "picked", text: picked.label, onRemove: () => setPicked(null) }] : []),
  ];
  const clearAll = () => {
    patch({ rules: [], advanced: null, hideDone: false, sorts: [] });
    setShowGone(false);
    setPicked(null);
  };
  const count = (n: number) => n.toLocaleString();
  const { estimated: guesses, assumed } = rows ? provenanceCounts(rows) : { estimated: 0, assumed: 0 };
  const resting = !rows || (!guesses && !assumed) ? "" : ` · ${[guesses ? `${count(guesses)} estimated` : "", assumed ? `${count(assumed)} on an assumption` : ""].filter(Boolean).join(", ")}`;
  const matching = filtered ? " matching" : "";
  // With one page there is nothing to page through, so no "Showing…" and no page size (9 Oct).
  const several = paged && pages > 1;
  const counted = !rows
    ? `Loading ${src.title}…`
    : !rows.length
      ? filtered ? "Nothing matches." : emptyWords
      : several
        ? `Showing ${count(at * size + 1)} to ${count(Math.min(rows.length, at * size + size))} of ${count(rows.length)}${matching}${filtered ? ` · ${count(all?.length ?? 0)} in all` : ""}`
        : "";

  // Selection: Escape lets go of it (when nothing else is taking the key).
  useEffect(() => {
    if (!selected.size) return;
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || (e.target as HTMLElement | null)?.closest?.("input, textarea, [role='dialog'], [role='menu'], [role='listbox']")) return;
      setSelected(new Set());
    };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [selected.size]);
  const chosen = () => (all ?? []).filter((r) => selected.has(r.id));
  const [bulk, setBulk] = useState<{ field: string; text: string }>({ field: "", text: "" });
  const bulkFields = fields.filter((f) => cellEditable(f));
  async function editChosen() {
    const field = byName.get(bulk.field);
    if (!field) return;
    const value = coerce(bulk.text, field.kind);
    const rowsNow = chosen();
    let done = 0;
    let problem = "";
    for (const row of rowsNow) {
      const locked = src.editable?.(row, field);
      if (locked) {
        problem = locked;
        continue;
      }
      try {
        await src.edit!(row, { [field.name]: value });
        done += 1;
      } catch (e) {
        problem = e instanceof Error ? e.message : String(e);
        break;
      }
    }
    load();
    onChanged();
    setStatus(problem ? { ok: false, text: `Changed ${done} of ${rowsNow.length}; then: ${problem}` } : { ok: true, text: `Changed ${fieldLabel(field)} on ${done} ${word(done)}.` });
  }
  function downloadChosen() {
    const shownFields = columns.map((c) => byName.get(c)!).filter(Boolean);
    const rowsNow = chosen();
    downloadText(`${src.title}.csv`, toCsv([shownFields.map((f) => fieldLabel(f)), ...rowsNow.map((r) => shownFields.map((f) => showValue(r.values[f.name], f.kind, f.unit)))]));
    setStatus({ ok: true, text: `Downloaded ${rowsNow.length} ${word(rowsNow.length)} as ${src.title}.csv.` });
  }
  function copyLink(row: RecordRow) {
    const link = recordLink(src.key, row.id);
    const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
    if (!link || !clip) return setStatus({ ok: false, text: "Couldn't copy the link." });
    clip.writeText(link).then(() => setStatus({ ok: true, text: "Link copied." }), () => setStatus({ ok: false, text: "Couldn't copy the link." }));
  }
  const bulkField = byName.get(bulk.field);

  const adder = (
    <div className="addrow-wrap">
      <Button size="sm" variant="ghost" className="addrow" icon={<PlusIcon size={ICON_SM} />} disabledReason={addReason} onClick={() => void addNew()}>
        New
      </Button>
    </div>
  );
  const openRelated = onOpenRecord ? (collection: string, id: string) => onOpenRecord(collection, id) : undefined;
  const none = rows && !rows.length;
  const rowIcon = src.rowIcon ? (row: RecordRow) => src.rowIcon!(row) : undefined;
  const peekAt = peek && rows ? rows.findIndex((r) => r.id === peek) : -1;
  const peekReason = renderPeek ? undefined : "Records open as pages here.";

  return (
    <div className="datapage" aria-label={src.title}>
      <MetricsStrip table={{ name: src.key, title: src.title }} rows={all} summary={summary} />
      <div className="card datacard">
        <DataToolbar
          tabs={tabs}
          activeTab={listId}
          tabActions={{
            onTab: switchTab,
            onAdd: src.saveList ? (v) => void addView(VIEWS.find((x) => x.id === v)?.label ?? "View", { ...DEFAULT_VIEW, view: v }) : undefined,
            listsReason,
            viewReasons,
            rename: (id) => setNaming({ id, text: lists.find((l) => l.id === id)?.title ?? "" }),
            edit: (id) => {
              switchTab(id);
              setSettingsPage("layout");
              setSettingsOpen(true);
            },
            duplicate: (id) => void addView(`${tabs.find((t) => t.id === id)?.title ?? "View"} copy`, stateOf(id)),
            remove: (id) => setDropping(id),
            setDefault: starList,
            reorder: reorderTabs,
          }}
          search={search}
          onSearch={setSearch}
          searchable={searchable.length > 0}
          tableTitle={src.title}
          filter={{ fields, onAddRule: addRule, onAdvanced: addAdvanced, hasDone: Boolean(statusField && (statusField.done_choices ?? []).length), hideDone: vs.hideDone, onHideDone: (on) => patch({ hideDone: on }), goneCount: tracked ? goneCount : 0, showGone, onShowGone: setShowGone, open: filterOpen, onOpenChange: setFilterOpen, editor: filterEditor, active: vs.rules.length + (vs.advanced ? 1 : 0) + pills.length }}
          fields={fields}
          sorts={sorts}
          onSorts={setSorts}
          sortOpen={sortOpen}
          onSortOpen={setSortOpen}
          uploadFirst={fileFirst}
          onUpload={onAddFiles}
          uploadReason={reasonFor(src, "upload")}
          settingsOpen={settingsOpen}
          onSettingsOpen={(o) => {
            setSettingsOpen(o);
            if (!o) setSettingsPage("root");
          }}
          settings={
            <ViewSettings
              page={settingsPage}
              onPage={setSettingsPage}
              state={{ ...vs, view }}
              patch={patch}
              fields={fields}
              viewReasons={viewReasons}
              order={[...columns, ...fields.map((f) => f.name).filter((n) => !columns.includes(n))]}
              shown={columns}
              onShow={(name, on) => setHidden((h) => (on ? h.filter((n) => n !== name) : [...h, name]))}
              onShowAll={(on) => setHidden(on ? [] : fields.map((f) => f.name).filter((n) => n !== (titleField ?? fields[0]?.name)))}
              onReorder={reorderColumn}
              frozen={frozen}
              onFrozen={setFrozen}
              widthsSet={Object.keys(widths).length > 0}
              onResetWidths={() => setWidths({})}
              dateFields={dateFields}
              boardField={choiceFields[0]?.name}
              peekReason={peekReason}
              sections={sections}
              onSections={(next) => void setSectionPref({ ...sectionPref, [src.key]: next })}
              onDownload={src.exportAs ? (f) => void download(f) : undefined}
              downloadReason={reasonFor(src, "download")}
              uploadHere={!fileFirst}
              onUpload={onAddFiles}
              uploadReason={reasonFor(src, "upload")}
              onReset={resetView}
            />
          }
        />
        <FilterBar fields={fields} rules={vs.rules} onRules={(r) => patch({ rules: r })} advanced={vs.advanced} onAdvanced={(g) => patch({ advanced: g })} sorts={sorts} onSorts={setSorts} openChip={openChip} onOpenChip={setOpenChip} extra={pills} onClearAll={clearAll} />
        {selected.size ? (
          <div className="selectbar" role="status">
            <b>{count(selected.size)} selected</b>
            <Popover label="Edit property" align="start" trigger={<Button size="sm" disabledReason={editReason}>Edit property</Button>}>
              <form className="bulkedit" onSubmit={(e) => { e.preventDefault(); void editChosen(); }}>
                <Dropdown size="sm" label="Property to change" placeholder="Property…" value={bulk.field} onChange={(f) => setBulk({ field: f, text: "" })} options={bulkFields.map((f) => ({ value: f.name, label: fieldLabel(f) }))} />
                {bulkField ? (
                  bulkField.choices?.length || bulkField.kind === "bool" ? (
                    <Dropdown size="sm" label="New value" value={bulk.text} onChange={(t) => setBulk({ ...bulk, text: t })} options={bulkField.kind === "bool" ? [{ value: "true", label: "Yes" }, { value: "false", label: "No" }] : [{ value: "", label: "—" }, ...(bulkField.choices ?? []).map((c) => ({ value: c, label: humanize(c) }))]} />
                  ) : (
                    <input className="frule__input" aria-label="New value" type={inputType(bulkField.kind)} value={bulk.text} onChange={(e) => setBulk({ ...bulk, text: e.target.value })} />
                  )
                ) : null}
                <Button size="sm" variant="primary" type="submit" disabledReason={bulkField ? undefined : "Choose a property first."}>
                  Apply to {count(selected.size)}
                </Button>
              </form>
            </Popover>
            <Button size="sm" disabledReason={duplicateReason} onClick={() => void duplicate(chosen())}>
              Duplicate
            </Button>
            <Button size="sm" onClick={downloadChosen}>
              Download as CSV
            </Button>
            <Button size="sm" variant="danger" disabledReason={removeReason} onClick={() => setRemoving(chosen())}>
              Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              Cancel
            </Button>
          </div>
        ) : null}
        {error ? (
          <div style={{ padding: "var(--space-3)" }}>
            <Trouble onRetry={load}>Couldn't load {src.title}: {error}</Trouble>
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
            tall={false}
            rowHeight={vs.rowHeight}
            lines={vs.lines}
            wrapAll={vs.wrapAll}
            groups={groups}
            collapsed={vs.collapsed}
            onCollapse={toggleGroup}
            colorOf={colorOf}
            rowIcon={rowIcon}
            titleField={titleField}
            lockedFor={src.editable ? (row, field) => src.editable!(row, field) : undefined}
            onSay={(text, ok) => setStatus({ ok, text })}
            pinned={pinned}
            onOpen={onOpenRecord || (renderPeek && vs.openIn !== "page") ? open : undefined}
            onCommit={(row, field, text) => void commit(row, field, text)}
            editReason={editReason}
            files={files}
            onFile={src.addFile ? (row, field, file) => void addFile(row, field, file) : undefined}
            selected={selected}
            onSelect={(id, on) => setSelected((s) => { const next = new Set(s); if (on) next.add(id); else next.delete(id); return next; })}
            onSelectAll={(on) => setSelected((s) => { const next = new Set(s); for (const r of shownRows ?? []) if (on) next.add(r.id); else next.delete(r.id); return next; })}
            relations={relations}
            onOpenRelated={openRelated}
            summaries={summaries}
            onSummary={setSummary}
            rowActions={{ open: onOpenRecord ? (row) => open(row.id) : undefined, duplicate: (row) => void duplicate([row]), duplicateReason, pin: togglePin, remove: (row) => setRemoving([row]), removeReason, copy, history: onOpenRecord ? (row) => onOpenRecord(src.key, row.id) : undefined, copyLink: recordLink(src.key, "x") ? copyLink : undefined }}
            columnActions={{
              hide: (c) => setHidden((h) => [...h, c]),
              freeze: (c) => setFrozen(columns.indexOf(c) < frozen ? 0 : columns.indexOf(c) + 1),
              move: moveColumn,
              reorder: reorderColumn,
              filter: (c) => addRule(byName.get(c)!),
              group: (c) => patch({ groupBy: c, collapsed: [] }),
              wrapped,
              wrap: (c) => setWrapped((w) => (w.includes(c) ? w.filter((n) => n !== c) : [...w, c])),
            }}
            onAdd={src.add ? () => void addNew() : undefined}
            addReason={addReason}
            editRequest={editRequest}
            blank={Boolean(none)}
          />
        ) : null}
        {view === "form" ? <FormView rows={rows ?? []} at={formAt} onAt={setFormAt} fields={fields} titleField={titleField} relations={relations} onCommit={(row, field, text) => void commit(row, field, text)} onOpenRelated={openRelated} empty={none ? (filtered ? "Nothing matches." : emptyWords) : null} /> : null}
        {view === "board" && groupField ? <BoardView rows={shownRows ?? []} field={groupField} subField={vs.subGroupBy ? byName.get(vs.subGroupBy) : null} hideEmpty={vs.hideEmptyGroups} order={vs.groupOrder} toneOf={toneOf} rowIcon={rowIcon} titleField={titleField} fields={fields} onOpen={open} onMove={(row, value) => move(row, groupField, value)} /> : null}
        {view === "list" ? <ListView rows={shownRows ?? []} bodyRef={bodyRef} titleField={titleField} columns={columns} byName={byName} onOpen={open} groups={groups} collapsed={vs.collapsed} onCollapse={toggleGroup} toneOf={toneOf} rowIcon={rowIcon} /> : null}
        {view === "gallery" ? <GalleryView rows={shownRows ?? []} fields={fields.filter((f) => columns.includes(f.name))} titleField={titleField} onOpen={open} toneOf={toneOf} rowIcon={rowIcon} /> : null}
        {view === "timeline" && dateField ? <TimelineView rows={rows ?? []} field={dateField} titleField={titleField} fields={fields} onOpen={open} /> : null}
        {view === "calendar" && dateField ? <CalendarView rows={rows ?? []} field={dateField} titleField={titleField} month={month} onMonth={setMonth} onOpen={open} /> : null}
        {view === "chart" && chartX ? <ChartView rows={rows ?? []} x={chartX} spec={vs.chart} byName={byName} /> : null}
        {view === "dashboard" ? (
          <DashboardView
            client={client}
            table={{ title: src.title, title_field: src.titleField ?? null }}
            fields={fields}
            rows={rows ?? []}
            listKey={`${src.key}:${listId}`}
            onShowRecords={(ids, label) => {
              setPicked({ ids, label });
              setView("table");
            }}
            onOpenRecord={open}
            onAsk={(text) => (onAsk ?? onSay)?.(text)}
          />
        ) : null}
        {more > 0 ? (
          <div className="loadmore">
            <Button size="sm" variant="ghost" onClick={() => setLoads((n) => n + 1)}>
              Load more
            </Button>
            <span className="faint num">{count(more)} more</span>
          </div>
        ) : null}
        {view !== "table" && view !== "dashboard" ? adder : null}
        {counted || resting || status || several ? (
        <div className="pager">
          <span className="num">
            {counted}
            {resting ? (
              <span className="faint" title="Double-click a cell to correct it.">
                {counted ? resting : resting.replace(/^ · /, "")}
              </span>
            ) : null}
          </span>
          {status ? (
            <span className={status.ok ? "notice notice--ok" : "notice"} role="status">
              {status.text}
            </span>
          ) : null}
          <span className="spacer" />
          {several ? (
            <label className="pager__size">
              Records per page
              <Dropdown size="sm" label="Records per page" value={String(pageSize)} onChange={(v) => choosePageSize(v === "fit" ? "fit" : Number(v))} options={[{ value: "fit", label: `Fit to window${pageSize === "fit" ? ` (${fit})` : ""}` }, ...PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))]} />
            </label>
          ) : null}
          {several ? (
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
        ) : null}
      </div>
      {renderPeek ? (
        <Dialog open={peek !== null} onOpenChange={(o) => !o && movePeek(null)} title="Record" hideTitle className={vs.openIn === "center" ? "peek peek--center" : "peek peek--side"}>
          <div className="peek__bar">
            <IconButton size="sm" label="Previous record" icon={<ChevronUp size={ICON_SM} />} disabled={peekAt <= 0} onClick={() => rows && movePeek(rows[peekAt - 1].id)} />
            <IconButton size="sm" label="Next record" icon={<ChevronDown size={ICON_SM} />} disabled={!rows || peekAt < 0 || peekAt >= rows.length - 1} onClick={() => rows && movePeek(rows[peekAt + 1].id)} />
            <span className="spacer" />
            <IconButton size="sm" label="Open as full page" icon={<Maximize2 size={ICON_SM} />} disabled={!onOpenRecord} onClick={() => { const id = peek!; const go = () => { setPeek(null); onOpenRecord?.(src.key, id); }; if (!peekGuard.current?.(go)) go(); }} />
            <IconButton size="sm" label="Close" icon={<X size={ICON_SM} />} onClick={() => movePeek(null)} />
          </div>
          <div className="peek__body">{peek ? renderPeek(src.key, peek, onPeekGuard) : null}</div>
        </Dialog>
      ) : null}
      <Confirm
        open={removing !== null}
        title={removing && removing.length === 1 ? `Delete ${String(removing[0].values[titleField ?? ""] || "this record")}?` : `Delete ${count(removing?.length ?? 0)} records?`}
        action={removing && removing.length > 1 ? `Delete ${count(removing.length)}` : "Delete"}
        onConfirm={() => void removeChosen()}
        onCancel={() => setRemoving(null)}
      >
        {removing && removing.length === 1 ? "It leaves the table; Activity keeps that it was here." : "They leave the table; Activity keeps that they were here."}
      </Confirm>
      <Confirm open={dropping !== null} title="Delete this view?" action="Delete view" onConfirm={dropList} onCancel={() => setDropping(null)}>
        The view goes; its records stay.
      </Confirm>
      <Dialog open={naming !== null} onOpenChange={(o) => !o && setNaming(null)} title="Rename view">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (naming?.text.trim()) void renameList(naming.id, naming.text.trim());
          }}
        >
          <input className="textfield" autoFocus aria-label="View name" value={naming?.text ?? ""} onChange={(e) => setNaming((n) => (n ? { ...n, text: e.target.value } : n))} />
          <div className="row dialog__actions" style={{ marginTop: "var(--space-4)" }}>
            <Button variant="ghost" onClick={() => setNaming(null)}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" disabledReason={listsReason ?? (naming?.text.trim() ? undefined : "Give it a name first.")}>
              Rename
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
