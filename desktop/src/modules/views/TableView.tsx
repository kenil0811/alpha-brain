/**
 * The table (9 Oct, the UI rulebook §6): a rounded bordered container, a quiet header, columns
 * the person can size, drag into order, freeze and sort, a checkbox column, a row that opens its
 * record page, cells edited in place, right-click menus on the heading, the cell and the row
 * (each also reached by the keyboard, and the row's by its ⋯), an add row that is always there,
 * and a footer where each column picks its own summary. An empty table keeps its whole
 * structure. The page scrolls; the table never traps the scroll.
 */
import { type MouseEvent as ReactMouseEvent, type ReactNode, useLayoutEffect, useRef, useState } from "react";
import type { FileInfo, RecordRow, Relations } from "../../core/client";
import { isNumeric, showValue, type FieldInfo } from "../fields";
import { humanize } from "../format";
import { Check, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ChevronDown, ClearIcon, CopyIcon, DeleteIcon, EditIcon, FilterIcon, FreezeIcon, HideIcon, HistoryIcon, ICON_SM, MoreHorizontal, OpenIcon, PinIcon, SortAscIcon, SortDescIcon, UnpinIcon } from "../../ui/icons";
import { IconButton, useContextMenu, type ContextItem } from "../../ui";
import { nextSort, summarize, summaryOpsFor, SUMMARY_LABEL, type Sort, type SummaryOp } from "./engine";
import { Cell, SeenCell, cellEditable } from "./cells";

/** How long a click waits to see whether it is the first half of a double-click (which edits a
 *  cell) before it opens the record. */
const OPEN_DELAY_MS = 220;
const BLANK_ROWS = 3;

/** What the table asks of the page around it, one thing each. */
export interface RowActions {
  open?: (row: RecordRow) => void;
  duplicate: (row: RecordRow) => void;
  pin: (row: RecordRow) => void;
  remove: (row: RecordRow) => void;
  copy: (row: RecordRow, field: FieldInfo) => void;
  history?: (row: RecordRow) => void;
}
export interface ColumnActions {
  hide: (column: string) => void;
  freeze: (column: string) => void;
  move: (column: string, by: -1 | 1) => void;
  reorder: (from: string, to: string) => void;
  filter: (column: string) => void;
  /** Which columns have a filter to open (status and choice fields). */
  filterable: Set<string>;
}

export function TableView({ rows, summaryRows, fields, columns, byName, widths, onWidth, frozen, sort, onSort, tall, pinned, seen, bodyRef, files, onFile, relations, onOpenRelated, selected, onSelect, onSelectAll, summaries, onSummary, onOpen, onCommit, rowActions, columnActions, add, blank }: {
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
  onOpen?: (id: string) => void;
  onCommit: (row: RecordRow, field: FieldInfo, text: string) => void;
  rowActions: RowActions;
  columnActions: ColumnActions;
  /** The add row, always at the bottom. */
  add: ReactNode;
  /** Draw a few blank rows (an empty table keeps its structure). */
  blank: boolean;
}) {
  const [editing, setEditing] = useState<{ id: string; field: string } | null>(null);
  const openTimer = useRef<number | undefined>(undefined);
  const pinnedSet = new Set(pinned);
  const titleOf = (row: RecordRow) => String(row.values[fields[0]?.name] ?? row.id);
  const wide = columns.length + (seen ? 1 : 0) + 2;

  // The columns that stay put while the rest scroll sideways: where each sticks is the width of
  // the ones before it, so it is measured after the table is drawn.
  const heads = useRef<Record<string, HTMLTableCellElement | null>>({});
  const selHead = useRef<HTMLTableCellElement | null>(null);
  const [lefts, setLefts] = useState<Record<string, number>>({});
  useLayoutEffect(() => {
    const next: Record<string, number> = {};
    let x = selHead.current?.offsetWidth ?? 0;
    for (const c of columns.slice(0, frozen)) {
      next[c] = x;
      x += heads.current[c]?.offsetWidth ?? 0;
    }
    setLefts((now) => (JSON.stringify(now) === JSON.stringify(next) ? now : next));
  });
  const frozenAt = (c: string) => (columns.indexOf(c) < frozen ? { className: "col--frozen", style: { left: lefts[c] ?? 0 } } : {});

  // the three menus
  const columnMenu = useContextMenu<string>((c) => {
    const field = byName.get(c);
    const at = columns.indexOf(c);
    const kind = field?.kind ?? "text";
    const current = summaries[c] ?? "none";
    const items: ContextItem[] = [
      { label: "Sort ascending", icon: <SortAscIcon size={ICON_SM} />, onSelect: () => onSort({ field: c, direction: "asc" }) },
      { label: "Sort descending", icon: <SortDescIcon size={ICON_SM} />, onSelect: () => onSort({ field: c, direction: "desc" }) },
      ...(sort?.field === c ? [{ label: "Clear sort", onSelect: () => onSort(null) }] : []),
      { label: "Filter by this column", icon: <FilterIcon size={ICON_SM} />, separatorBefore: true, onSelect: () => columnActions.filter(c), disabled: columnActions.filterable.has(c) ? undefined : "Only status and choice fields have a filter. Use Search to narrow by words." },
      { label: "Hide", icon: <HideIcon size={ICON_SM} />, onSelect: () => columnActions.hide(c), disabled: columns.length <= 1 ? "A table keeps at least one column." : undefined },
      { label: at < frozen ? "Unfreeze columns" : "Freeze up to here", icon: <FreezeIcon size={ICON_SM} />, onSelect: () => columnActions.freeze(c) },
      { label: "Move left", icon: <ArrowLeft size={ICON_SM} />, onSelect: () => columnActions.move(c, -1), disabled: at <= 0 ? "It is already the first column." : undefined },
      { label: "Move right", icon: <ArrowRight size={ICON_SM} />, onSelect: () => columnActions.move(c, 1), disabled: at >= columns.length - 1 ? "It is already the last column." : undefined },
      ...summaryOpsFor(kind).map((op, i) => ({ label: `Footer summary: ${SUMMARY_LABEL[op].toLowerCase()}`, icon: op === current ? <Check size={ICON_SM} /> : undefined, separatorBefore: i === 0, onSelect: () => onSummary(c, op) })),
      { label: "Rename field…", icon: <EditIcon size={ICON_SM} />, separatorBefore: true, onSelect: () => undefined, disabled: "Ask Alpha in the panel to rename a field." },
    ];
    return items;
  });
  const cellMenu = useContextMenu<{ row: RecordRow; field: FieldInfo }>(({ row, field }) => {
    const value = row.values[field.name];
    const empty = value === null || value === undefined || value === "";
    return [
      { label: "Edit", icon: <EditIcon size={ICON_SM} />, onSelect: () => setEditing({ id: row.id, field: field.name }), disabled: cellEditable(field) ? undefined : "Ask Alpha in the panel to change this one." },
      { label: "Copy", icon: <CopyIcon size={ICON_SM} />, onSelect: () => rowActions.copy(row, field), disabled: empty ? "There is nothing in it to copy." : undefined },
      { label: "Clear", icon: <ClearIcon size={ICON_SM} />, onSelect: () => onCommit(row, field, ""), disabled: !cellEditable(field) ? "Ask Alpha in the panel to change this one." : empty ? "It is already empty." : field.required ? "This field is required." : undefined },
      { label: "Show history", icon: <HistoryIcon size={ICON_SM} />, separatorBefore: true, onSelect: () => rowActions.history?.(row), disabled: rowActions.history ? undefined : "Record pages are not open from here." },
    ];
  });
  const rowMenu = useContextMenu<RecordRow>((row) => [
    { label: "Open", icon: <OpenIcon size={ICON_SM} />, onSelect: () => rowActions.open?.(row), disabled: rowActions.open ? undefined : "Record pages are not open from here." },
    { label: "Edit", icon: <EditIcon size={ICON_SM} />, onSelect: () => { const first = columns.map((c) => byName.get(c)).find((f) => f && cellEditable(f)); if (first) setEditing({ id: row.id, field: first.name }); }, disabled: columns.some((c) => { const f = byName.get(c); return f && cellEditable(f); }) ? undefined : "No column here can be edited in place." },
    { label: "Duplicate", icon: <CopyIcon size={ICON_SM} />, onSelect: () => rowActions.duplicate(row) },
    { label: pinnedSet.has(row.id) ? "Unpin" : "Pin", icon: pinnedSet.has(row.id) ? <UnpinIcon size={ICON_SM} /> : <PinIcon size={ICON_SM} />, onSelect: () => rowActions.pin(row) },
    { label: "Delete", icon: <DeleteIcon size={ICON_SM} />, danger: true, separatorBefore: true, onSelect: () => rowActions.remove(row) },
  ]);

  function clickRow(e: ReactMouseEvent, id: string) {
    if (!onOpen || e.detail > 1) return;
    window.clearTimeout(openTimer.current);
    openTimer.current = window.setTimeout(() => onOpen(id), OPEN_DELAY_MS);
  }

  const dragging = useRef<string | null>(null);
  return (
    <div className={`tablewrap${tall ? " tablewrap--tall" : ""}`}>
      <table className="table" aria-label={undefined}>
        <thead>
          <tr>
            <th className={`sel${frozen ? " col--frozen" : ""}`} ref={selHead} style={{ left: 0 }}>
              <input type="checkbox" aria-label="Select every record on this page" checked={rows.length > 0 && rows.every((r) => selected.has(r.id))} disabled={!rows.length} onChange={(e) => onSelectAll(e.target.checked)} />
            </th>
            {columns.map((c) => {
              const field = byName.get(c);
              const kind = field?.kind ?? "text";
              const label = field?.label ?? humanize(c);
              return (
                <th
                  key={c}
                  ref={(el) => { heads.current[c] = el; }}
                  className={[isNumeric(kind) ? "r" : "", "th--sizable", columns.indexOf(c) < frozen ? "col--frozen" : ""].filter(Boolean).join(" ")}
                  style={{ ...(widths[c] ? { width: widths[c], minWidth: widths[c], maxWidth: widths[c] } : {}), ...(columns.indexOf(c) < frozen ? { left: lefts[c] ?? 0 } : {}) }}
                  aria-sort={sort?.field === c ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}
                  draggable
                  onDragStart={(e) => { dragging.current = c; e.dataTransfer.setData("text/plain", c); e.dataTransfer.effectAllowed = "move"; }}
                  onDragOver={(e) => { if (dragging.current && dragging.current !== c) e.preventDefault(); }}
                  onDrop={(e) => { e.preventDefault(); const from = dragging.current; dragging.current = null; if (from && from !== c) columnActions.reorder(from, c); }}
                  onDragEnd={() => { dragging.current = null; }}
                  {...columnMenu.bind(c)}
                >
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
            <th aria-label="Record actions" className="th--end" />
          </tr>
        </thead>
        <tbody ref={(el) => { bodyRef.current = el; }}>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={`${onOpen ? "row--open" : ""}${selected.has(row.id) ? " row--selected" : ""}`.trim()}
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
              <td className={`sel${frozen ? " col--frozen" : ""}`} style={{ left: 0 }} onClick={(e) => e.stopPropagation()}>
                <input type="checkbox" aria-label={`Select ${titleOf(row)}`} checked={selected.has(row.id)} onChange={(e) => onSelect(row.id, e.target.checked)} />
              </td>
              {columns.map((c, i) => {
                const field = byName.get(c)!;
                return (
                  <Cell
                    key={c}
                    row={row}
                    field={field}
                    onCommit={(text) => onCommit(row, field, text)}
                    editing={editing?.id === row.id && editing.field === c}
                    onEditing={(on) => setEditing(on ? { id: row.id, field: c } : null)}
                    relations={relations}
                    onOpenRelated={onOpenRelated}
                    files={files}
                    onFile={onFile ? (file) => onFile(row, field, file) : undefined}
                    tdProps={{ ...frozenAt(c), ...cellMenu.bind({ row, field }) }}
                    adornment={i === 0 && pinnedSet.has(row.id) ? <PinIcon className="pinmark" size={ICON_SM} aria-label="Pinned" /> : undefined}
                  />
                );
              })}
              {seen ? <SeenCell row={row} /> : null}
              <td className="r td--end" onClick={(e) => e.stopPropagation()}>
                <IconButton size="sm" className="rowbtn" label={`Actions for ${titleOf(row)}`} icon={<MoreHorizontal size={ICON_SM} />} onClick={(e) => rowMenu.openFrom(row, e.currentTarget)} />
              </td>
            </tr>
          ))}
          {blank
            ? Array.from({ length: BLANK_ROWS }, (_, i) => (
                <tr key={`blank-${i}`} className="row--blank" aria-hidden="true">
                  <td className="sel" />
                  {columns.map((c) => <td key={c} />)}
                  {seen ? <td /> : null}
                  <td />
                </tr>
              ))
            : null}
          <tr className="row--add">
            <td colSpan={wide} className="addcell">
              {add}
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td className={`sel${frozen ? " col--frozen" : ""}`} style={{ left: 0 }} />
            {columns.map((c) => {
              const field = byName.get(c);
              const out = field ? summarize(summaryRows, field, summaries[c] ?? "none") : null;
              return (
                <td key={c} className={`${isNumeric(field?.kind ?? "") ? "r num" : "num"}${columns.indexOf(c) < frozen ? " col--frozen" : ""}`} style={columns.indexOf(c) < frozen ? { left: lefts[c] ?? 0 } : undefined}>
                  {out ? (
                    <span title={`${out.label} of ${field?.label ?? humanize(c)}`}>
                      <span className="foot__lab">{out.label}</span> {out.value}
                    </span>
                  ) : null}
                </td>
              );
            })}
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
