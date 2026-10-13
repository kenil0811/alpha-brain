/**
 * A table's page: Alpha draws one for every table it keeps, so nothing has to be designed. The
 * table comes first with the person's own edits in place; board, list, calendar and chart are a
 * click away; a saved list is a filter plus the columns shown. Edits here are the person's own
 * and are journaled as theirs.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Client, FileInfo, RecordRow, SavedList, TableDesc, Relations } from "../core/client";
import { host } from "../core/host";
import { DATE_KINDS, coerce, firstOfKind, titleFieldOf, type FieldInfo } from "./fields";
import { humanize } from "./format";
import { Button, Confirm, IconButton, Tabs, Popover } from "../ui";
import { ChevronsLeft, ChevronsRight, ArrowLeft, ArrowRight, MoreHorizontal } from "../ui/icons";
import { activeRules, applyQuery, groupable, groupItems, groupRows, ofKinds, pageOf, pageOfGroups, provenanceCounts, type FooterOp, type Rules, type Sort } from "./views/engine";
import { settable, ViewState } from "./views/RulesUI";
import { parseClipboard, planPaste, type PastePlan } from "./views/paste";
import { ListTabs } from "./views/ListTabs";
import { GalleryView } from "./views/GalleryView";
import { TimelineView } from "./views/TimelineView";
import { AddRow } from "./views/AddRow";
import { QuickEntry } from "./views/QuickEntry";
import { BoardView } from "./views/BoardView";
import { CalendarView } from "./views/CalendarView";
import { ChartView } from "./views/ChartView";
import { ListView } from "./views/ListView";
import { FormView } from "./views/FormView";
import { TableView } from "./views/TableView";

export type PageView = "table" | "board" | "list" | "gallery" | "calendar" | "timeline" | "chart" | "form";
const VIEWS: { id: PageView; label: string }[] = [
  { id: "table", label: "Table" },
  { id: "board", label: "Board" },
  { id: "list", label: "List" },
  { id: "form", label: "Form" },
  { id: "gallery", label: "Gallery" },
  { id: "calendar", label: "Calendar" },
  { id: "timeline", label: "Timeline" },
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

/** What a table page is doing right now (its list, search, filters, sorts, grouping, page, the
 *  groups folded), kept for the session so opening a record and coming back returns to it
 *  (13 Oct, Kenil: "when i open detail page, and then go back, i lose the groouping"). A new
 *  session opens on the table's default list again. */
interface Working {
  listId: string;
  search: string;
  rules: Rules;
  sorts: Sort[];
  groupBy: string | null;
  hideDone: boolean;
  showGone: boolean;
  pageAt: number;
  folded: string[];
  footers?: Record<string, FooterOp>;
}
function readWorking(key: string): Working | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Working) : null;
  } catch {
    return null;
  }
}
function keepWorking(key: string, value: Working) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* a window without storage starts each table afresh, nothing more */
  }
}

/** Whether two lists' configs show the same view: what they leave out is the default. */
function sameView(a: SavedList["config"], b: SavedList["config"]): boolean {
  const norm = (c: SavedList["config"]) => JSON.stringify({
    search: c.search ?? "",
    rules: c.rules?.rules.length ? c.rules : null,
    sorts: c.sorts ?? (c.sort ? [c.sort] : []),
    group_by: c.group_by ?? null,
    hide_done: c.hide_done ?? false,
    show_gone: c.show_gone ?? false,
    hidden: [...(c.hidden ?? [])].sort(),
    view: c.view ?? "table",
    footers: c.footers && Object.keys(c.footers).length ? c.footers : null,
  });
  return norm(a) === norm(b);
}

/** A field's name for the eye: its own label when it has one, else its name in words. */
const labelOf = (f: FieldInfo) => (f.label && f.label !== f.name ? f.label : humanize(f.name));

const NO_RULES: Rules = { match: "all", rules: [] };
const NO_FILTERS: Record<string, string> = {};

/** The old quick dropdowns' field → value, as column ticklists. */
function withQuickFilters(rules: Rules, quick: Record<string, string>): Rules {
  const extra = Object.entries(quick).filter(([field, value]) => value && !rules.rules.some((r) => r.field === field)).map(([field, value]) => ({ field, op: "in" as const, value: "", values: [value] }));
  return extra.length ? { ...rules, rules: [...rules.rules, ...extra] } : rules;
}

/** `onOpenRecord` opens a record's own page (a row of this table, or a related one followed
 *  from a cell); without it a row opens nothing. */
export function DataPage({ client, table, version, onChanged, onSay, onOpenRecord }: { client: Client; table: TableDesc; version: number; onChanged: () => void; onSay?: (sentence: string) => void; onOpenRecord?: (table: string, id: string) => void }) {
  const fields = table.fields as FieldInfo[];
  const byName = useMemo(() => new Map(fields.map((f) => [f.name, f])), [fields]);
  const key = `alpha.page.${table.name}`;
  const [restored] = useState(() => readWorking(`${key}.working`));
  const titleField = titleFieldOf(fields, table.title_field);
  const statusField = useMemo(() => fields.find((f) => f.kind === "status"), [fields]);
  // A board groups by a choice or status field, a calendar, timeline or chart runs on a date
  // field: the first of each by default, the person's pick when there are several.
  const choiceFields = useMemo(() => ofKinds(fields, new Set(["status", "choice"])).sort((a, b) => (a.kind === "status" ? -1 : b.kind === "status" ? 1 : 0)), [fields]);
  const dateFields = useMemo(() => ofKinds(fields, DATE_KINDS), [fields]);
  const [groupBy, setGroupBy] = useState<string | null>(restored?.groupBy ?? null);
  const [dateBy, setDateBy] = useState<string | null>(null);
  const groupField = useMemo(() => choiceFields.find((f) => f.name === groupBy) ?? choiceFields[0], [choiceFields, groupBy]);
  const dateField = useMemo(() => dateFields.find((f) => f.name === dateBy) ?? dateFields[0], [dateFields, dateBy]);
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
  const [listId, setListId] = useState<string>(restored?.listId ?? "all");
  const openedOnDefault = useRef(Boolean(restored)); // coming back keeps what was on, not the default list
  const [search, setSearch] = useState(restored?.search ?? "");
  const [hideDone, setHideDone] = useState(restored?.hideDone ?? false);
  const [showGone, setShowGone] = useState(restored?.showGone ?? false);
  const [sorts, setSorts] = useState<Sort[]>(restored?.sorts ?? []);
  const [rules, setRules] = useState<Rules>(restored?.rules ?? NO_RULES);
  const [footers, setFooters] = useState<Record<string, FooterOp>>(restored?.footers ?? {});
  const [hidden, setHidden] = useState<string[]>(() => remembered<string[]>(`${key}.hidden`, []));
  const [order, setOrder] = useState<string[]>(() => remembered<string[]>(`${key}.order`, []));
  const [widths, setWidths] = useState<Record<string, number>>(() => remembered<Record<string, number>>(`${key}.widths`, {}));
  const columns = useMemo(() => {
    const base = fields.map((f) => f.name).filter((c) => !hidden.includes(c));
    const placed = order.filter((c) => base.includes(c));
    return [...placed, ...base.filter((c) => !placed.includes(c))];
  }, [fields, hidden, order]);
  const [all, setAll] = useState<RecordRow[] | null>(null);
  const [pageAt, setPageAt] = useState(restored?.pageAt ?? 0);
  const [pageSize, setPageSize] = useState<PageSize>(() => remembered<PageSize>(PAGE_SIZE_KEY, "fit"));
  const [fit, setFit] = useState(20);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [relations, setRelations] = useState<Relations>({});
  const [formAt, setFormAt] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [removing, setRemoving] = useState(false);
  const [pasting, setPasting] = useState<PastePlan | null>(null);
  const [adding, setAdding] = useState(false);
  // A program module's own table (Q38) is read from its database: no adding, editing or removing here.
  const readonly = Boolean(table.readonly);
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

  const rows = useMemo(() => (all ? applyQuery(all, { search, searchable, filters: NO_FILTERS, rules, byName, hideDone, statusField, showGone, sorts }) : null), [all, search, searchable, rules, byName, hideDone, showGone, statusField, sorts]);
  // a change of what is shown starts at the first page; coming back to the page is no change
  const narrowing = JSON.stringify([search, rules, hideDone, showGone, sorts]);
  const lastNarrowing = useRef(narrowing);
  useEffect(() => {
    if (lastNarrowing.current === narrowing) return;
    lastNarrowing.current = narrowing;
    setPageAt(0);
  }, [narrowing]);
  // A table with a file field says how files get in: the button above, or a drop on the page.
  const emptyWords = fields.some((f) => f.kind === "file") ? "Nothing here yet. Add files with the button above, or drop them on the page; Alpha keeps each as a row here." : "Nothing here yet.";
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
  // The table grouped by a column (section 3b): its groups' headers and rows, paged together.
  const tableGroupField = groupBy && byName.get(groupBy) && groupable(byName.get(groupBy)!.kind) ? byName.get(groupBy)! : null;
  const [folded, setFolded] = useState<Set<string>>(() => new Set(restored?.folded ?? []));
  const lastGroupBy = useRef(groupBy);
  useEffect(() => {
    if (lastGroupBy.current === groupBy) return;
    lastGroupBy.current = groupBy;
    setFolded(new Set());
  }, [groupBy]);
  useEffect(() => keepWorking(`${key}.working`, { listId, search, rules, sorts, groupBy, hideDone, showGone, pageAt, folded: [...folded], footers }), [key, listId, search, rules, sorts, groupBy, hideDone, showGone, pageAt, folded, footers]);
  const groups = useMemo(() => (rows && tableGroupField && view === "table" ? groupRows(rows, tableGroupField, relations) : null), [rows, tableGroupField, view, relations]);
  const grouped = groups ? pageOfGroups(groupItems(groups, folded), pageAt, size) : null;
  const page = rows && !grouped ? pageOf(rows, pageAt, size) : null;
  const pages = grouped?.pages ?? page?.pages ?? 1;
  const at = grouped?.at ?? page?.at ?? 0;
  const shownRows = grouped ? grouped.items.flatMap((i) => (i.kind === "row" ? [i.row] : [])) : (page?.rows ?? null);
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
    if (readonly) return;
    const value = coerce(text, field.kind);
    const current = row.values[field.name] ?? null;
    if (JSON.stringify(value) === JSON.stringify(current)) return;
    void run(() => client.editRecord(table.name, row.id, { [field.name]: value }, row.revision), "Couldn't save the change");
  }
  /** A paste on a cell (section 4c): a single value is an edit of that cell; a block is planned
   *  against the rows in the order they show, and asks before it is written. */
  function pasteAt(rowId: string, column: string, text: string) {
    if (readonly) return;
    const grid = parseClipboard(text);
    if (!grid.length) return;
    const order = groups ? groups.flatMap((g) => (folded.has(g.key) ? [] : g.rows)) : (rows ?? []);
    const startRow = order.findIndex((r) => r.id === rowId);
    const startCol = shownColumns.indexOf(column);
    if (startRow < 0 || startCol < 0) return;
    const plan = planPaste(grid, order, startRow, shownColumns, startCol, byName, titleField);
    if (grid.length === 1 && grid[0].length === 1) {
      if (plan.updates.length) void run(() => client.editRecord(table.name, rowId, plan.updates[0].values, plan.updates[0].row.revision), "Couldn't paste it");
      else if (plan.skipped.length) setStatus({ ok: false, text: `Not pasted: ${plan.skipped[0]}` });
      return;
    }
    if (!plan.updates.length && !plan.adds.length) {
      setStatus({ ok: false, text: plan.skipped.length ? `Nothing to paste: ${plan.skipped.slice(0, 2).join("; ")}` : "Nothing to paste: every value is already there." });
      return;
    }
    setPasting(plan);
  }
  /** The block written, one write per row (each in its record's History); a refusal stops it. */
  async function writePaste(plan: PastePlan) {
    setPasting(null);
    const total = plan.updates.length + plan.adds.length;
    let done = 0;
    let problem: string | undefined;
    for (const { row, values } of plan.updates) {
      setStatus({ ok: true, text: `Pasting row ${done + 1} of ${total}…` });
      try {
        await client.editRecord(table.name, row.id, values, row.revision);
        done += 1;
      } catch (e) {
        problem = e instanceof Error ? e.message : String(e);
        break;
      }
    }
    if (!problem) {
      for (const values of plan.adds) {
        setStatus({ ok: true, text: `Pasting row ${done + 1} of ${total}…` });
        try {
          await client.addRecord(table.name, values);
          done += 1;
        } catch (e) {
          problem = e instanceof Error ? e.message : String(e);
          break;
        }
      }
    }
    load();
    onChanged();
    setStatus(problem ? { ok: false, text: `Pasted ${done} of ${total}; then: ${problem}` } : { ok: true, text: `Pasted ${done} ${done === 1 ? "row" : "rows"}.` });
  }
  /** Set one field on every ticked row, one edit per row (each in its record's History); a
   *  refusal stops it and says how far it got (section 4b). The ticks stay. */
  async function setOnSelected(field: FieldInfo, text: string, progress: (done: number) => void): Promise<{ done: number; problem?: string }> {
    const value = coerce(text, field.kind);
    const chosen = (all ?? []).filter((r) => selected.has(r.id));
    let done = 0;
    let problem: string | undefined;
    for (const row of chosen) {
      progress(done);
      if (JSON.stringify(row.values[field.name] ?? null) === JSON.stringify(value)) {
        done += 1;
        continue;
      }
      try {
        await client.editRecord(table.name, row.id, { [field.name]: value }, row.revision);
        done += 1;
      } catch (e) {
        problem = e instanceof Error ? e.message : String(e);
        break;
      }
    }
    load();
    onChanged();
    setStatus(problem ? { ok: false, text: `Set on ${done} of ${chosen.length}; then: ${problem}` } : { ok: true, text: `Set ${humanize(field.name)} on ${done} ${done === 1 ? "row" : "rows"}.` });
    return { done, problem };
  }
  /** Remove every selected row, one at a time, and say how many went when any refused. */
  async function removeSelected() {
    setRemoving(false);
    const chosen = (all ?? []).filter((r) => selected.has(r.id));
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
    setStatus(problem ? { ok: false, text: `Removed ${done} of ${chosen.length}; then: ${problem}` } : { ok: true, text: `Removed ${done} ${done === 1 ? "row" : "rows"}.` });
  }
  function move(row: RecordRow, field: FieldInfo, value: string) {
    if ((row.values[field.name] ?? null) === value) return;
    void run(() => client.editRecord(table.name, row.id, { [field.name]: value }, row.revision), "Couldn't move it");
  }

  const applyList = useCallback(
    (id: string, from: SavedList[] = lists) => {
      setListId(id);
      const c = from.find((l) => l.id === id)?.config;
      setSearch(c?.search ?? "");
      setHideDone(c?.hide_done ?? false);
      setShowGone(c?.show_gone ?? false);
      if (!c) setRules(NO_RULES); // All: every row, as the quick dropdowns were reset before
      if (c) {
        setHidden(c.hidden ?? []);
        setSorts(c.sorts ?? (c.sort ? [c.sort] : []));
        // a list saved with the old quick dropdowns: each one becomes its column's ticklist
        setRules(withQuickFilters(c.rules ?? NO_RULES, c.filters ?? {}));
        setFooters((c.footers ?? {}) as Record<string, FooterOp>);
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
  const currentConfig = (): SavedList["config"] => ({ search, rules, sorts, footers, hide_done: hideDone, show_gone: showGone, hidden, view, group_by: groupBy ?? undefined, date_by: dateBy ?? undefined });
  // the current list's view changed since it was saved: its tab shows a dot, Save changes is on
  const listDirty = (() => {
    const kept = lists.find((l) => l.id === listId)?.config;
    return kept ? sameView(kept, currentConfig()) === false : false;
  })();
  async function saveList(title: string): Promise<boolean> {
    if (!title.trim()) return false;
    return run(async () => {
      const saved = await client.saveList(table.name, title.trim(), currentConfig());
      setLists((existing) => [...existing, saved]);
      setListId(saved.id);
    }, "Couldn't save the list");
  }
  async function renameList(id: string, title: string): Promise<boolean> {
    return run(async () => {
      const changed = await client.updateList(id, { title });
      setLists((existing) => existing.map((l) => (l.id === changed.id ? changed : l)));
    }, "Couldn't rename the list");
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
  function dropList(id: string) {
    void run(async () => {
      await client.deleteList(id);
      setLists((existing) => existing.filter((l) => l.id !== id));
    }, "Couldn't remove the list");
    applyList("all");
  }

  const openRow = (id: string) => onOpenRecord?.(table.name, id);
  const shownColumns = columns.filter((c) => byName.has(c));
  const filterCount = activeRules(rules, byName).length + (hideDone ? 1 : 0);
  const filtered = Boolean(search || filterCount);
  const count = (n: number) => n.toLocaleString();
  const rowsWord = (n: number) => (n === 1 ? "row" : "rows");
  const { estimated: guesses, assumed } = rows ? provenanceCounts(rows) : { estimated: 0, assumed: 0 };
  const resting = !rows || (!guesses && !assumed) ? "" : ` · ${[guesses ? `${count(guesses)} estimated` : "", assumed ? `${count(assumed)} on an assumption` : ""].filter(Boolean).join(", ")}`;
  const counted = !rows
    ? "Loading…"
    : groups
      ? `${count(rows.length)} ${rowsWord(rows.length)} in ${count(groups.length)} ${groups.length === 1 ? "group" : "groups"}${filtered ? ` · ${count(all?.length ?? 0)} in all` : ""}`
      : paged && rows.length > size
      ? `${count(at * size + 1)}–${count(Math.min(rows.length, at * size + size))} of ${count(rows.length)} ${filtered ? `matching · ${count(all?.length ?? 0)} in all` : rowsWord(rows.length)}`
      : rows.length === all?.length
        ? `${count(rows.length)} ${rowsWord(rows.length)}`
        : `${count(rows.length)} of ${count(all?.length ?? 0)} rows`;

  return (
    <div className="stack stack--fill" aria-label={table.title}>
      <div className="card card--fill">
        {onSay && !readonly ? <QuickEntry table={table} onSay={onSay} /> : null}
        <div className="toolbar toolbar--page toolbar--table">
          {searchable.length ? (
            <div className="search">
              <span aria-hidden="true">⌕</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${table.title.toLowerCase()}`} aria-label="Search" />
            </div>
          ) : null}
          <Tabs className="toggle toggle--views" label="View" value={view} onChange={setView} items={VIEWS.filter((v) => v.id === "table" || v.id === "list" || v.id === "form" || v.id === "gallery" || (v.id === "board" && groupField) || ((v.id === "calendar" || v.id === "chart" || v.id === "timeline") && dateField))} />
          {(view === "calendar" || view === "timeline" || view === "chart") && dateFields.length > 1 ? (
            <select className="btn btn--sm" value={dateField?.name ?? ""} onChange={(e) => setDateBy(e.target.value)} aria-label="Date field">
              {dateFields.map((f) => (
                <option key={f.name} value={f.name}>
                  By {humanize(f.name).toLowerCase()}
                </option>
              ))}
            </select>
          ) : null}
          <ListTabs
            lists={lists}
            current={listId}
            dirty={listDirty}
            onPick={(id) => applyList(id)}
            onSave={saveList}
            onRename={renameList}
            onUpdate={updateList}
            onDefault={starList}
            onRemove={dropList}
          />
          <ViewState
            board={view === "board"}
            groupedBy={view === "board" ? (groupField ? labelOf(groupField) : null) : view === "table" && tableGroupField ? labelOf(tableGroupField) : null}
            groupValue={view === "board" ? (groupField?.name ?? null) : (tableGroupField?.name ?? null)}
            groupOptions={(view === "board" ? choiceFields : fields.filter((f) => groupable(f.kind))).map((f) => ({ name: f.name, label: labelOf(f) }))}
            count={filterCount}
            match={rules.match}
            onMatch={(match) => setRules((r) => ({ ...r, match }))}
            onClear={() => { setRules(NO_RULES); setHideDone(false); }}
            onGroupBy={setGroupBy}
          />
          <span className="spacer" />
          {readonly ? (
            <span className="faint">Built by the module · read-only</span>
          ) : (
            <Button size="sm" variant="primary" onClick={() => setAdding((a) => !a)} aria-expanded={adding}>
              {adding ? "Cancel" : "Add"}
            </Button>
          )}
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
            </div>
          </Popover>
        </div>
        {adding && !readonly ? <AddRow fields={fields} collection={table.name} onDone={() => setAdding(false)} onAdd={(values) => run(() => client.addRecord(table.name, values), "Couldn't add it")} /> : null}
        <Confirm open={Boolean(pasting)} danger={false} title={pasting ? `Paste ${pasting.lines} ${pasting.lines === 1 ? "row" : "rows"} × ${pasting.width} ${pasting.width === 1 ? "column" : "columns"}?` : ""} action="Paste" onConfirm={() => pasting && void writePaste(pasting)} onCancel={() => setPasting(null)}>
          {pasting ? (
            <>
              <p>
                Into {pasting.columns.map((c) => humanize(c)).join(", ") || "no column"}
                {pasting.updates.length ? `, on ${pasting.updates.length} ${pasting.updates.length === 1 ? "row" : "rows"}` : ""}.
                {pasting.replaced ? ` ${pasting.replaced} ${pasting.replaced === 1 ? "value replaces" : "values replace"} what's there.` : ""}
                {pasting.adds.length ? ` ${pasting.adds.length} new ${pasting.adds.length === 1 ? "row is" : "rows are"} added for the lines past the end.` : ""}
              </p>
              {pasting.skipped.length ? (
                <>
                  <p>Left out:</p>
                  <ul className="paste__skipped">
                    {pasting.skipped.slice(0, 6).map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                    {pasting.skipped.length > 6 ? <li>and {pasting.skipped.length - 6} more</li> : null}
                  </ul>
                </>
              ) : null}
            </>
          ) : null}
        </Confirm>
        <Confirm open={removing} title={`Remove ${count(selected.size)} ${selected.size === 1 ? "row" : "rows"}?`} action={`Remove ${count(selected.size)}`} onConfirm={() => void removeSelected()} onCancel={() => setRemoving(false)}>
          They leave the table; Activity keeps that they were here.
        </Confirm>
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
            <TableView
              seen={tracked}
              rows={shownRows ?? []}
              totalOf={rows ?? []}
              bodyRef={bodyRef}
              fields={fields}
              columns={shownColumns}
              byName={byName}
              widths={widths}
              onWidth={(name, w) => setWidths((existing) => ({ ...existing, [name]: w }))}
              sorts={sorts}
              onSorts={setSorts}
              rules={rules}
              onRules={setRules}
              allRows={(all ?? []).filter((r) => showGone || !r.gone_at)}
              columnExtras={statusField && (statusField.done_choices ?? []).length ? { [statusField.name]: (
                <label className="menu__item">
                  <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Hide done rows
                </label>
              ) } : undefined}
              gone={tracked && goneCount ? { showGone, count: goneCount, onShowGone: setShowGone } : undefined}
              items={grouped?.items}
              onToggleGroup={(key) => setFolded((f) => { const next = new Set(f); if (next.has(key)) next.delete(key); else next.add(key); return next; })}
              grouping={{ by: tableGroupField?.name ?? null, onGroup: setGroupBy }}
              footers={footers}
              onFooter={(field, op) => setFooters((f) => ({ ...f, [field]: op }))}
              onPaste={readonly ? undefined : pasteAt}
              onOpen={openRow}
              onCommit={commit}
              empty={rows && !rows.length ? (filtered ? "Nothing matches." : emptyWords) : null}
              files={files}
              onFile={(row, field, file) => void addFile(row, field, file)}
              selected={selected}
              selection={{ count: selected.size, onRemove: readonly ? undefined : () => setRemoving(true), onClear: () => setSelected(new Set()), setFields: readonly ? undefined : fields.filter((f) => settable(f, titleField)), onSet: readonly ? undefined : setOnSelected }}
              onSelect={(id, on) => setSelected((s) => { const next = new Set(s); if (on) next.add(id); else next.delete(id); return next; })}
              onSelectAll={(on) => setSelected((s) => { const next = new Set(s); for (const r of shownRows ?? []) if (on) next.add(r.id); else next.delete(r.id); return next; })}
              relations={relations}
              onOpenRelated={onOpenRecord}
            />
          ) : null}
          {view === "form" ? <FormView rows={rows ?? []} at={formAt} onAt={setFormAt} fields={fields} titleField={titleField} relations={relations} onCommit={commit} onOpenRelated={onOpenRecord} empty={rows && !rows.length ? (filtered ? "Nothing matches." : emptyWords) : null} /> : null}
          {view === "board" && groupField ? <BoardView rows={rows ?? []} field={groupField} titleField={titleField} fields={fields} onOpen={openRow} onMove={(row, value) => move(row, groupField, value)} /> : null}
          {view === "list" ? <ListView rows={shownRows ?? []} bodyRef={bodyRef} titleField={titleField} columns={shownColumns} byName={byName} onOpen={openRow} /> : null}
          {view === "gallery" ? <GalleryView rows={rows ?? []} fields={fields.filter((f) => shownColumns.includes(f.name))} titleField={titleField} onOpen={openRow} /> : null}
          {view === "timeline" && dateField ? <TimelineView rows={rows ?? []} field={dateField} titleField={titleField} fields={fields} onOpen={openRow} /> : null}
          {view === "calendar" && dateField ? <CalendarView rows={rows ?? []} field={dateField} titleField={titleField} month={month} onMonth={setMonth} onOpen={openRow} /> : null}
          {view === "chart" && dateField ? <ChartView rows={rows ?? []} dateField={dateField} valueField={numericField ?? null} /> : null}
        </div>
        {view !== "form" ? (
        <div className="pager">
          <span className="num">
            {counted}
            {resting ? (
              <span className="faint" title="Numbers Alpha estimated or assumed something for. Double-click a cell to correct it.">
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
        ) : null}
      </div>
    </div>
  );
}
