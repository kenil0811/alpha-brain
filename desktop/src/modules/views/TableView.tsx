/**
 * The table (9 Oct, the UI rulebook §6): as wide as the page's section, a quiet header, columns
 * the person can size, drag into order, freeze, wrap and sort, a row that opens its record page,
 * cells edited in place (a double-click, Enter or F2, or the pencil a cell shows on hover),
 * right-click menus on the heading, the cell and the row (each also reached by the keyboard). As in Notion, a row's handle (⋮⋮, its menu) and checkbox appear over its left
 * edge on hover, and stay for every row once one is selected, so no column is kept empty for
 * them; the header's select-all does the same. A "+ New" row at the bottom adds a record, a "+"
 * after the last heading would add a column (the core's, so disabled with the reason), and the
 * footer has a calculation under every column, "Calculate" showing on hover where none is set.
 * An empty table keeps its whole structure. The page scrolls; the table never traps the scroll.
 * Notion's parity (9 Oct): rows in collapsible groups, each with its count and its own footer;
 * vertical lines, wrap-all and three row heights; conditional colours on rows or cells; and the
 * keyboard of a grid: arrows move between cells, Tab moves right, Enter edits, Escape cancels,
 * ⇧↑/⇧↓ or ⇧-click select a range down a column, ⌘C and ⌘V copy and paste (a pasted grid fills
 * across and down), ⌘D fills the range down from its top cell, Delete clears.
 */
import { type MouseEvent as ReactMouseEvent, type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { GripIcon as GripVertical, WrapIcon as WrapText } from "../../ui/icons";
import type { FileInfo, RecordRow, Relations } from "../../core/client";
import { editText, isNumeric, showValue, type FieldInfo } from "../fields";
import { humanize } from "../format";
import { Link2, ChevronRight, GroupIcon, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ClearIcon, CopyIcon, DeleteIcon, EditIcon, FilterIcon, FreezeIcon, HideIcon, HistoryIcon, ICON_SM, OpenIcon, PinIcon, PlusIcon, SortAscIcon, SortDescIcon, TotalIcon, UnpinIcon } from "../../ui/icons";
import { Badge, Button, Dropdown, IconButton, useContextMenu, type ContextItem } from "../../ui";
import { ADD_COLUMN_REASON } from "../DataToolbar";
import { nextSort, summarize, summaryOpsFor, SUMMARY_LABEL, type ColorTone, type Group, type Sort, type SummaryOp } from "./engine";
import { Cell, SeenCell, cellEditable } from "./cells";

/** How long a click waits to see whether it is the first half of a double-click (which edits a
 *  cell) before it opens the record. */
const OPEN_DELAY_MS = 220;
const BLANK_ROWS = 3;

/** What the table asks of the page around it, one thing each. */
export interface RowActions {
  open?: (row: RecordRow) => void;
  duplicate: (row: RecordRow) => void;
  /** Why rows can't be duplicated or deleted here, if they can't. */
  duplicateReason?: string;
  pin: (row: RecordRow) => void;
  remove: (row: RecordRow) => void;
  removeReason?: string;
  copy: (row: RecordRow, field: FieldInfo) => void;
  history?: (row: RecordRow) => void;
  /** Copy the record's window address; absent, the item stays disabled with `copyLinkReason`. */
  copyLink?: (row: RecordRow) => void;
  copyLinkReason?: string;
}
export interface ColumnActions {
  hide: (column: string) => void;
  freeze: (column: string) => void;
  move: (column: string, by: -1 | 1) => void;
  reorder: (from: string, to: string) => void;
  filter: (column: string) => void;
  /** Which columns have a filter to open; absent, every column has. */
  filterable?: Set<string>;
  /** Group the view by this column. */
  group?: (column: string) => void;
  /** Which columns wrap their text, and the switch. */
  wrapped: string[];
  wrap: (column: string) => void;
}

export function TableView({ rows, summaryRows, fields, columns, byName, widths, onWidth, frozen, sort, onSort, tall, pinned, seen, bodyRef, files, onFile, relations, onOpenRelated, selected, onSelect, onSelectAll, summaries, onSummary, calcDefaults, onCalcDefault, onOpen, onCommit, editReason, rowActions, columnActions, onAdd, addReason, editRequest, blank, groups, collapsed = [], onCollapse, lines, wrapAll, rowHeight, colorOf, rowIcon, titleField, lockedFor, onSay }: {
  rows: RecordRow[];
  /** The records the footer works over: everything the view shows, not only this page. */
  summaryRows: RecordRow[];
  fields: FieldInfo[];
  columns: string[];
  byName: Map<string, FieldInfo>;
  widths: Record<string, number>;
  onWidth: (name: string, width: number) => void;
  frozen: number;
  sort: Sort | null;
  onSort: (s: Sort | null) => void;
  tall: boolean;
  pinned: string[];
  seen?: boolean;
  bodyRef: { current: HTMLElement | null };
  files?: Record<string, FileInfo>;
  onFile?: (row: RecordRow, field: FieldInfo, file: File) => void;
  relations?: Relations;
  onOpenRelated?: (collection: string, id: string) => void;
  selected: Set<string>;
  onSelect: (id: string, on: boolean) => void;
  onSelectAll: (on: boolean) => void;
  summaries: Record<string, SummaryOp>;
  onSummary: (field: string, op: SummaryOp) => void;
  /** The calculation each type of column starts on (the footer dropdown's ★), and setting it. */
  calcDefaults?: Partial<Record<string, SummaryOp>>;
  onCalcDefault?: (kind: string, op: SummaryOp) => void;
  onOpen?: (id: string) => void;
  onCommit: (row: RecordRow, field: FieldInfo, text: string) => void;
  /** Why cells can't be edited here, if they can't. */
  editReason?: string;
  rowActions: RowActions;
  columnActions: ColumnActions;
  /** The "+ New" row; without it the row stays, disabled, with `addReason`. */
  onAdd?: () => void;
  addReason?: string;
  /** Start editing this cell when it is drawn (a row just added: its title). */
  editRequest?: { id: string; field: string } | null;
  /** Draw a few blank rows (an empty table keeps its structure). */
  blank: boolean;
  /** The rows in groups (each with a header, its count and its own footer); absent, ungrouped. */
  groups?: Group[] | null;
  collapsed?: string[];
  onCollapse?: (key: string) => void;
  lines?: boolean;
  wrapAll?: boolean;
  rowHeight?: "compact" | "medium" | "tall";
  /** A row's conditional colours. */
  colorOf?: (row: RecordRow) => { row?: ColorTone; cells: Record<string, ColorTone> };
  /** A mark at the start of the title cell (an agent's avatar). */
  rowIcon?: (row: RecordRow) => ReactNode;
  titleField?: string;
  /** Why one cell can't change, or null. */
  lockedFor?: (row: RecordRow, field: FieldInfo) => string | null;
  /** A line for the page bar (what the keyboard did). */
  onSay?: (text: string, ok: boolean) => void;
}) {
  const [editing, setEditing] = useState<{ id: string; field: string } | null>(null);
  useEffect(() => {
    if (editRequest) setEditing(editRequest);
  }, [editRequest]);
  const openTimer = useRef<number | undefined>(undefined);
  const pinnedSet = new Set(pinned);
  const titleOf = (row: RecordRow) => String(row.values[titleField ?? fields[0]?.name] ?? row.id);
  const wide = columns.length + (seen ? 1 : 0) + 1;
  const canEdit = (f: FieldInfo) => !editReason && cellEditable(f);
  const canEditCell = (row: RecordRow, f: FieldInfo) => canEdit(f) && !lockedFor?.(row, f);
  const wrapped = new Set(wrapAll ? columns : columnActions.wrapped);
  const flat = groups ? groups.filter((g) => !collapsed.includes(g.key)).flatMap((g) => g.rows) : rows;
  const tableRef = useRef<HTMLTableElement | null>(null);
  /** A range down one column: the anchor row, the far row (indexes into `flat`). */
  const [range, setRange] = useState<{ c: number; a: number; b: number } | null>(null);
  const focused = useRef<{ r: number; c: number } | null>(null);
  const inRange = (r: number, c: number) => Boolean(range && range.c === c && r >= Math.min(range.a, range.b) && r <= Math.max(range.a, range.b));
  const focusCell = (r: number, c: number) => (tableRef.current?.querySelector(`td[data-r="${r}"][data-c="${c}"]`) as HTMLElement | null)?.focus();

  // The columns that stay put while the rest scroll sideways: where each sticks is the width of
  // the ones before it, so it is measured after the table is drawn.
  const heads = useRef<Record<string, HTMLTableCellElement | null>>({});
  const feet = useRef<Record<string, HTMLTableCellElement | null>>({});
  const [lefts, setLefts] = useState<Record<string, number>>({});
  useLayoutEffect(() => {
    const next: Record<string, number> = {};
    let x = 0;
    for (const c of columns.slice(0, frozen)) {
      next[c] = x;
      x += heads.current[c]?.offsetWidth ?? 0;
    }
    setLefts((now) => (JSON.stringify(now) === JSON.stringify(next) ? now : next));
  });
  const place = (c: string, extra = "") => {
    const frozenHere = columns.indexOf(c) < frozen;
    return { className: [extra, frozenHere ? "col--frozen" : "", wrapped.has(c) ? "col--wrap" : ""].filter(Boolean).join(" ") || undefined, style: frozenHere ? { left: lefts[c] ?? 0 } : undefined };
  };

  // the footer's calculation dropdown, also opened from a heading's Calculate…: once the heading's
  // menu has closed and handed the focus back to the heading (sooner, the hand-back would close it)
  const calcNext = useRef<string | null>(null);
  const calcAfterFocus = (c: string) => {
    if (calcNext.current !== c) return;
    calcNext.current = null;
    window.setTimeout(() => feet.current[c]?.querySelector("button")?.click());
  };
  const columnMenu = useContextMenu<string>((c) => {
    const at = columns.indexOf(c);
    const cannot = "Needs Alpha's core; ask Alpha in the panel.";
    const items: ContextItem[] = [
      { label: "Edit property", icon: <EditIcon size={ICON_SM} />, onSelect: () => undefined, disabled: cannot },
      { label: "Change type", icon: <EditIcon size={ICON_SM} />, onSelect: () => undefined, disabled: cannot },
      { label: "Filter", icon: <FilterIcon size={ICON_SM} />, separatorBefore: true, onSelect: () => columnActions.filter(c), disabled: !columnActions.filterable || columnActions.filterable.has(c) ? undefined : "This column has no filter." },
      { label: "Sort ascending", icon: <SortAscIcon size={ICON_SM} />, onSelect: () => onSort({ field: c, direction: "asc" }) },
      { label: "Sort descending", icon: <SortDescIcon size={ICON_SM} />, onSelect: () => onSort({ field: c, direction: "desc" }) },
      ...(sort?.field === c ? [{ label: "Clear sort", onSelect: () => onSort(null) }] : []),
      { label: "Group by this", icon: <GroupIcon size={ICON_SM} />, onSelect: () => columnActions.group?.(c), disabled: columnActions.group ? undefined : "This view can't be grouped." },
      { label: "Calculate…", icon: <TotalIcon size={ICON_SM} />, onSelect: () => { calcNext.current = c; } },
      { label: "Hide", icon: <HideIcon size={ICON_SM} />, separatorBefore: true, onSelect: () => columnActions.hide(c), disabled: columns.length <= 1 ? "A table keeps at least one column." : undefined },
      { label: at < frozen ? "Unfreeze columns" : "Freeze up to here", icon: <FreezeIcon size={ICON_SM} />, onSelect: () => columnActions.freeze(c) },
      { label: "Wrap text", icon: <WrapText size={ICON_SM} />, on: wrapped.has(c), onSelect: () => columnActions.wrap(c), disabled: wrapAll ? "Wrap all columns is on in Layout." : undefined },
      { label: "Move left", icon: <ArrowLeft size={ICON_SM} />, onSelect: () => columnActions.move(c, -1), disabled: at <= 0 ? "It is already the first column." : undefined },
      { label: "Move right", icon: <ArrowRight size={ICON_SM} />, onSelect: () => columnActions.move(c, 1), disabled: at >= columns.length - 1 ? "It is already the last column." : undefined },
      { label: "Insert left", icon: <ArrowLeft size={ICON_SM} />, separatorBefore: true, onSelect: () => undefined, disabled: ADD_COLUMN_REASON },
      { label: "Insert right", icon: <ArrowRight size={ICON_SM} />, onSelect: () => undefined, disabled: ADD_COLUMN_REASON },
      { label: "Rename field…", icon: <EditIcon size={ICON_SM} />, onSelect: () => undefined, disabled: "Ask Alpha in the panel to rename a field." },
      { label: "Duplicate property", icon: <CopyIcon size={ICON_SM} />, onSelect: () => undefined, disabled: cannot },
      { label: "Delete property", icon: <DeleteIcon size={ICON_SM} />, danger: true, onSelect: () => undefined, disabled: cannot },
    ];
    return items;
  });
  const cellMenu = useContextMenu<{ row: RecordRow; field: FieldInfo }>(({ row, field }) => {
    const value = row.values[field.name];
    const empty = value === null || value === undefined || value === "";
    const cannot = editReason ?? (cellEditable(field) ? lockedFor?.(row, field) ?? undefined : "Ask Alpha in the panel to change this one.");
    return [
      { label: "Edit", icon: <EditIcon size={ICON_SM} />, onSelect: () => setEditing({ id: row.id, field: field.name }), disabled: cannot },
      { label: "Copy", icon: <CopyIcon size={ICON_SM} />, onSelect: () => rowActions.copy(row, field), disabled: empty ? "There is nothing in it to copy." : undefined },
      { label: "Clear", icon: <ClearIcon size={ICON_SM} />, onSelect: () => onCommit(row, field, ""), disabled: cannot ?? (empty ? "It is already empty." : field.required ? "This field is required." : undefined) },
      { label: "Show history", icon: <HistoryIcon size={ICON_SM} />, separatorBefore: true, onSelect: () => rowActions.history?.(row), disabled: rowActions.history ? undefined : "Record pages are not open from here." },
    ];
  });
  const rowMenu = useContextMenu<RecordRow>((row) => [
    { label: "Open", icon: <OpenIcon size={ICON_SM} />, onSelect: () => rowActions.open?.(row), disabled: rowActions.open ? undefined : "Record pages are not open from here." },
    { label: "Edit", icon: <EditIcon size={ICON_SM} />, onSelect: () => { const first = columns.map((c) => byName.get(c)).find((f) => f && canEdit(f)); if (first) setEditing({ id: row.id, field: first.name }); }, disabled: editReason ?? (columns.some((c) => { const f = byName.get(c); return f && cellEditable(f); }) ? undefined : "No column here can be edited in place.") },
    { label: "Duplicate", icon: <CopyIcon size={ICON_SM} />, onSelect: () => rowActions.duplicate(row), disabled: rowActions.duplicateReason },
    { label: "Copy link", icon: <Link2 size={ICON_SM} />, onSelect: () => rowActions.copyLink?.(row), disabled: rowActions.copyLink ? undefined : (rowActions.copyLinkReason ?? "These records have no address.") },
    { label: pinnedSet.has(row.id) ? "Unpin" : "Pin", icon: pinnedSet.has(row.id) ? <UnpinIcon size={ICON_SM} /> : <PinIcon size={ICON_SM} />, onSelect: () => rowActions.pin(row) },
    { label: "Delete", icon: <DeleteIcon size={ICON_SM} />, danger: true, separatorBefore: true, onSelect: () => rowActions.remove(row), disabled: rowActions.removeReason },
  ]);

  function clickRow(e: ReactMouseEvent, id: string) {
    if (e.shiftKey) {
      // ⇧-click extends a range down the column of the focused cell
      const td = (e.target as HTMLElement).closest?.("td[data-r]") as HTMLElement | null;
      const from = focused.current;
      if (td && from && Number(td.dataset.c) === from.c) setRange({ c: from.c, a: from.r, b: Number(td.dataset.r) });
      return;
    }
    if (!onOpen || e.detail > 1) return;
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => onOpen(id), OPEN_DELAY_MS);
  }
  // The row's handle and checkbox, over the left edge of its first cell; a click on them is theirs
  const stop = (e: { stopPropagation: () => void }) => e.stopPropagation();
  const handle = (row: RecordRow): ReactNode => (
    <span className="rowctl" onClick={stop} onDoubleClick={stop}>
      <IconButton size="sm" className="rowctl__grip" label={`Actions for ${titleOf(row)}`} icon={<GripVertical size={ICON_SM} />} onClick={(e) => rowMenu.openFrom(row, e.currentTarget)} />
      <input type="checkbox" aria-label={`Select ${titleOf(row)}`} checked={selected.has(row.id)} onChange={(e) => onSelect(row.id, e.target.checked)} />
    </span>
  );

  // The grid's keyboard, on a focused cell (not while one is being edited: its box keeps its keys).
  const clip = typeof navigator !== "undefined" ? navigator.clipboard : undefined;
  function writeCells(r: number, c: number, grid: string[][]) {
    let n = 0;
    grid.forEach((line, i) =>
      line.forEach((text, j) => {
        const row = flat[r + i];
        const field = byName.get(columns[c + j]);
        if (row && field && canEditCell(row, field)) {
          onCommit(row, field, text);
          n += 1;
        }
      }),
    );
    return n;
  }
  function onGridKey(e: React.KeyboardEvent<HTMLTableElement>) {
    const td = e.target as HTMLElement;
    if (td.tagName !== "TD" || td.dataset.r === undefined) return;
    const r = Number(td.dataset.r);
    const c = Number(td.dataset.c);
    const row = flat[r];
    const field = byName.get(columns[c]);
    if (!row || !field) return;
    const mod = e.metaKey || e.ctrlKey;
    const key = e.key;
    const lo = range ? Math.min(range.a, range.b) : r;
    const hi = range ? Math.max(range.a, range.b) : r;
    const go = (nr: number, nc: number) => {
      e.preventDefault();
      if (nr < 0 || nr >= flat.length || nc < 0 || nc >= columns.length) return;
      focusCell(nr, nc);
    };
    if (key === "ArrowUp" || key === "ArrowDown") {
      const nr = r + (key === "ArrowUp" ? -1 : 1);
      if (e.shiftKey && nr >= 0 && nr < flat.length) setRange({ c, a: range?.c === c ? range.a : r, b: nr });
      else if (!e.shiftKey) setRange(null);
      go(nr, c);
    } else if (key === "ArrowLeft" || key === "ArrowRight") {
      setRange(null);
      go(r, c + (key === "ArrowLeft" ? -1 : 1));
    } else if (key === "Tab") {
      setRange(null);
      const step = e.shiftKey ? -1 : 1;
      const nc = c + step;
      if (nc >= 0 && nc < columns.length) go(r, nc);
      else if (r + step >= 0 && r + step < flat.length) go(r + step, e.shiftKey ? columns.length - 1 : 0);
    } else if (key === "Escape") {
      setRange(null);
    } else if ((key === "Delete" || key === "Backspace") && !mod) {
      e.preventDefault();
      writeCells(lo, c, Array.from({ length: hi - lo + 1 }, () => [""]));
    } else if (mod && key.toLowerCase() === "c") {
      if (window.getSelection?.()?.toString()) return; // words the person selected copy as usual
      e.preventDefault();
      const text = flat.slice(lo, hi + 1).map((x) => editText(x.values[field.name], field.kind)).join("\n");
      clip?.writeText(text).then(() => onSay?.("Copied.", true), () => onSay?.("Couldn't copy it.", false));
    } else if (mod && key.toLowerCase() === "v") {
      e.preventDefault();
      if (!clip) return onSay?.("Couldn't paste: this window has no clipboard.", false);
      void clip.readText().then((text) => {
        const grid = text.replace(/\r?\n$/, "").split(/\r?\n/).map((l) => l.split("\t"));
        const n = writeCells(r, c, grid);
        if (!n) onSay?.(editReason ?? "Nothing there can be changed here.", false);
      }, () => onSay?.("Couldn't read the clipboard.", false));
    } else if (mod && key.toLowerCase() === "d") {
      e.preventDefault();
      if (hi === lo) return onSay?.("Select cells down a column first (⇧↓), then ⌘D.", false);
      const top = editText(flat[lo].values[field.name], field.kind);
      writeCells(lo + 1, c, Array.from({ length: hi - lo }, () => [top]));
    }
  }

  const dragging = useRef<string | null>(null);
  const at0 = new Map(flat.map((r, i) => [r.id, i]));
  const renderRow = (row: RecordRow) => {
    const r = at0.get(row.id) ?? 0;
    const tones = colorOf?.(row);
    return (
      <tr
        key={row.id}
        className={[onOpen ? "row--open" : "", selected.has(row.id) ? "row--selected" : "", tones?.row ? `tone--${tones.row}` : ""].filter(Boolean).join(" ") || undefined}
        onClick={(e) => clickRow(e, row.id)}
        onDoubleClickCapture={() => window.clearTimeout(openTimer.current)}
        tabIndex={0}
        onKeyDownCapture={(e) => {
          // Enter on the row itself opens it; Enter in a cell is the cell's own
          if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ") && onOpen) {
            e.preventDefault();
            onOpen(row.id);
          }
        }}
        aria-label={onOpen ? `Open ${titleOf(row)}` : titleOf(row)}
        {...rowMenu.bind(row)}
      >
        {columns.map((c, i) => {
          const field = byName.get(c)!;
          const extra = [i === 0 ? "col--first" : "", inRange(r, i) ? "cell--range" : "", tones?.cells[c] ? `tone--${tones.cells[c]}` : ""].filter(Boolean).join(" ");
          const at = place(c, extra);
          const icon = c === (titleField ?? columns[0]) ? rowIcon?.(row) : null;
          return (
            <Cell
              key={c}
              row={row}
              field={field}
              onCommit={(text) => onCommit(row, field, text)}
              editing={editing?.id === row.id && editing.field === c}
              onEditing={(on) => {
                setEditing(on && canEditCell(row, field) ? { id: row.id, field: c } : null);
                if (!on) window.setTimeout(() => focusCell(r, i)); // back to the cell, for the keyboard
              }}
              locked={editReason ? null : lockedFor?.(row, field)}
              relations={relations}
              onOpenRelated={onOpenRelated}
              files={files}
              onFile={onFile ? (file) => onFile(row, field, file) : undefined}
              tdProps={{ ...at, tabIndex: -1, ...({ "data-r": r, "data-c": i } as object), ...cellMenu.bind({ row, field }) }}
              adornment={i === 0 || icon ? (
                <>
                  {i === 0 ? handle(row) : null}
                  {i === 0 && pinnedSet.has(row.id) ? <PinIcon className="pinmark" size={ICON_SM} aria-label="Pinned" /> : null}
                  {icon ? <span className="rowicon">{icon}</span> : null}
                </>
              ) : undefined}
            />
          );
        })}
        {seen ? <SeenCell row={row} /> : null}
        <td className="td--add" />
      </tr>
    );
  };
  const footCells = (over: RecordRow[], group?: string) =>
    columns.map((c) => {
      const field = byName.get(c);
      const op = summaries[c] ?? "none";
      const out = field ? summarize(over, field, op) : null;
      const at = place(c, isNumeric(field?.kind ?? "") ? "r num" : "num");
      const name = field?.label ?? humanize(c);
      const kind = field?.kind ?? "text";
      return (
        <td key={c} className={at.className} style={at.style} ref={group ? undefined : (el) => { feet.current[c] = el; }}>
          {group ? (
            out ? <span className="foot__calc" title={`${out.label} of ${name} in ${group}`}><span className="foot__lab">{out.label}</span> {out.value}</span> : null
          ) : (
            <Dropdown
              label={`Calculate ${name}`}
              className={`foot__calc${out ? "" : " foot__calc--none"}`}
              display={out ? <><span className="foot__lab">{out.label}</span> {out.value}</> : "Calculate"}
              value={op}
              onChange={(next) => onSummary(c, next)}
              options={summaryOpsFor(kind).map((o) => ({ value: o, label: SUMMARY_LABEL[o] }))}
              defaultValue={calcDefaults?.[kind]}
              onSetDefault={onCalcDefault ? (o) => onCalcDefault(kind, o) : undefined}
              defaultKey={`calculate.${kind}`}
            />
          )}
        </td>
      );
    });
  const body = groups
    ? groups.map((g) => {
        const shut = collapsed.includes(g.key);
        return [
          <tr key={`g-${g.key}`} className="row--group">
            <td colSpan={wide}>
              <button type="button" className="grouphead" aria-expanded={!shut} onClick={() => onCollapse?.(g.key)}>
                <ChevronRight size={ICON_SM} className={shut ? "grouphead__chev" : "grouphead__chev grouphead__chev--open"} aria-hidden="true" />
                <Badge tone="gray">{g.label}</Badge>
                <span className="faint num">{g.rows.length}</span>
              </button>
            </td>
          </tr>,
          ...(shut ? [] : g.rows.map(renderRow)),
          ...(shut || !g.rows.length || !columns.some((c) => (summaries[c] ?? "none") !== "none")
            ? []
            : [
                <tr key={`gf-${g.key}`} className="row--groupfoot">
                  {footCells(g.rows, g.label)}
                  {seen ? <td /> : null}
                  <td />
                </tr>,
              ]),
        ];
      })
    : rows.map(renderRow);

  return (
    <div className={`tablewrap${tall || rowHeight === "tall" ? " tablewrap--tall" : rowHeight === "medium" ? " tablewrap--medium" : ""}${selected.size ? " tablewrap--selecting" : ""}${lines ? " tablewrap--lines" : ""}`}>
      <table className="table" ref={tableRef} onKeyDown={onGridKey} onFocus={(e) => { const t = e.target as HTMLElement; if (t.tagName === "TD" && t.dataset.r !== undefined) focused.current = { r: Number(t.dataset.r), c: Number(t.dataset.c) }; }}>
        <thead>
          <tr>
            {columns.map((c, i) => {
              const field = byName.get(c);
              const kind = field?.kind ?? "text";
              const label = field?.label ?? humanize(c);
              const at = place(c, [isNumeric(kind) ? "r" : "", "th--sizable", i === 0 ? "col--first" : ""].filter(Boolean).join(" "));
              return (
                <th
                  key={c}
                  ref={(el) => { heads.current[c] = el; }}
                  className={at.className}
                  style={{ ...(widths[c] ? { width: widths[c], minWidth: widths[c], maxWidth: widths[c] } : {}), ...at.style }}
                  aria-sort={sort?.field === c ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
                  draggable
                  onDragStart={(e) => { dragging.current = c; e.dataTransfer.setData("text/plain", c); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={(e) => { if (dragging.current && dragging.current !== c) e.preventDefault(); }}
                  onDrop={(e) => { e.preventDefault(); const from = dragging.current; dragging.current = null; if (from && from !== c) columnActions.reorder(from, c); }}
                  onDragEnd={() => { dragging.current = null; }}
                  {...columnMenu.bind(c)}
                  onFocus={() => calcAfterFocus(c)}
                >
                  {i === 0 ? (
                    <span className="rowctl rowctl--head">
                      <input type="checkbox" aria-label="Select every record on this page" checked={rows.length > 0 && rows.every((r) => selected.has(r.id))} disabled={!rows.length} onChange={(e) => onSelectAll(e.target.checked)} />
                    </span>
                  ) : null}
                  <button type="button" className="th__label" title="Sort by this column; drag to move it" onClick={() => onSort(nextSort(sort, c))}>
                    {label}
                    {sort?.field === c ? (sort.direction === "asc" ? <ArrowUp size={12} aria-label="ascending" /> : <ArrowDown size={12} aria-label="descending" />) : null}
                  </button>
                  <IconButton size="sm" className="th__menu" label={`Options for ${label}`} icon={<ChevronDown size={ICON_SM} />} onClick={(e) => columnMenu.openFrom(c, e.currentTarget)} />
                  <span
                    className="th__grip"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${humanize(c)}`}
                    draggable={false}
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      const th = (e.currentTarget as HTMLElement).parentElement as HTMLElement;
                      const startX = e.clientX;
                      const startW = th.getBoundingClientRect().width;
                      const onMove = (ev: PointerEvent) => onWidth(c, Math.max(64, Math.round(startW + ev.clientX - startX)));
                      const onUp = () => {
                        window.removeEventListener("pointermove", onMove);
                        window.removeEventListener("pointerup", onUp);
                      };
                      window.addEventListener("pointermove", onMove);
                      window.addEventListener("pointerup", onUp);
                    }}
                  />
                </th>
              );
            })}
            {seen ? <th>Seen</th> : null}
            <th className="th--add">
              <IconButton size="sm" label="Add a column" icon={<PlusIcon size={ICON_SM} />} disabledReason={ADD_COLUMN_REASON} />
            </th>
          </tr>
        </thead>
        <tbody ref={(el) => { bodyRef.current = el; }}>
          {body}
          {blank
            ? Array.from({ length: BLANK_ROWS }, (_, i) => (
                <tr key={`blank-${i}`} className="row--blank" aria-hidden="true">
                  {columns.map((c) => <td key={c} />)}
                  {seen ? <td /> : null}
                  <td />
                </tr>
              ))
            : null}
          <tr className="row--add">
            <td colSpan={wide} className="addcell">
              <Button size="sm" variant="ghost" className="addrow" icon={<PlusIcon size={ICON_SM} />} disabledReason={onAdd ? undefined : addReason} onClick={onAdd}>
                New
              </Button>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            {footCells(summaryRows)}
            {seen ? <td /> : null}
            <td />
          </tr>
        </tfoot>
      </table>
      {columnMenu.menu}
      {cellMenu.menu}
      {rowMenu.menu}
    </div>
  );
}

/** Words for a value on its way to the clipboard. */
export function copyText(row: RecordRow, field: FieldInfo): string {
  return showValue(row.values[field.name], field.kind, field.unit);
}
