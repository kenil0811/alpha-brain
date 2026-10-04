/**
 * The table: Bridge's TableView on the core's records. Every grid mechanic (widths, order,
 * frozen columns, wrapping, grouping, collapsed groups, footer summaries) is view config, so a
 * saved list brings it back. Long pages are windowed; the checkbox column is always there.
 *
 * As on the desktop: a click on a row opens it, a double click (or Enter or F2) on a cell edits
 * it there, Cmd-click and Shift-click select, right-click opens the row's menu, and a double
 * click on a column's edge fits the column to what it holds.
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, MoreHorizontal, Plus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "../../ui/DropdownMenu";
import { useComingSoon } from "../../ui/Soon";
import { CHOICE_KINDS, isNumeric, type FieldInfo } from "../../modules/fields";
import { formatNumber, humanize } from "../../modules/format";
import { AGGREGATE_LABELS, availableAggregates, computeAggregate, filterOpsForKind, groupBy, NO_VALUE, type AggregateKind, type DataRow, type ViewConfig } from "../engine";
import { CellEditor, CellValue, fieldLabel, isOwnClick, useOpenOnClick } from "../cells";
import { KIND_LABELS } from "../controls";
import type { RecordRow } from "../../core/client";
import type { ViewProps } from "../types";

const SELECT_W = 56;
const ROW_H = 36;
const WINDOW_ABOVE = 100;

export function defaultWidth(f: FieldInfo, title: boolean): number {
  if (title) return 240;
  if (f.kind === "long_text") return 280;
  if (f.kind === "bool") return 110;
  if (f.kind === "number") return 160;
  if (f.kind === "date") return 130;
  if (f.kind === "datetime") return 170;
  return 170;
}

type Item = { type: "group"; id: string; label: string; count: number; depth: number; collapsed: boolean } | { type: "row"; row: DataRow };

export function TableView(p: ViewProps) {
  const { view, fields, rows, onViewChange } = p;
  const patch = (next: Partial<ViewConfig>) => onViewChange({ ...view, ...next });
  const [resizing, setResizing] = useState<{ name: string; startX: number; startW: number; w: number } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; field: string } | null>(null);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [rowMenu, setRowMenu] = useState<string | null>(null);
  const [tableEl, setTableEl] = useState<HTMLTableElement | null>(null);
  const clicks = useOpenOnClick();
  // Where a Shift-click selection runs from: the row last clicked or ticked.
  const anchor = useRef<string | null>(null);
  const collapsed = view.collapsedGroups ?? [];
  const byName = useMemo(() => new Map(p.allFields.map((f) => [f.name, f])), [p.allFields]);

  const widthOf = (f: FieldInfo) => (resizing?.name === f.name ? resizing.w : (view.columnWidths?.[f.name] ?? defaultWidth(f, f.name === p.titleField)));
  const frozenAt = view.frozenColumnId ? fields.findIndex((f) => f.name === view.frozenColumnId) : -1;
  const leftOf = (i: number) => SELECT_W + fields.slice(0, i).reduce((s, f) => s + widthOf(f), 0);
  const sticky = (i: number): CSSProperties | undefined => (i <= frozenAt ? { position: "sticky", left: leftOf(i), zIndex: 1 } : undefined);

  useEffect(() => {
    if (!resizing) return;
    const move = (e: PointerEvent) => setResizing((r) => (r ? { ...r, w: Math.max(64, r.startW + e.clientX - r.startX) } : r));
    const up = () =>
      setResizing((r) => {
        if (r) onViewChange({ ...view, columnWidths: { ...(view.columnWidths ?? {}), [r.name]: Math.round(r.w) } });
        return null;
      });
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [resizing, view, onViewChange]);

  function drop(e: DragEvent, target: string) {
    e.preventDefault();
    if (!dragging || dragging === target) return;
    const ids = fields.map((f) => f.name).filter((n) => n !== dragging);
    ids.splice(ids.indexOf(target), 0, dragging);
    const rest = (view.columnOrder ?? []).filter((n) => !ids.includes(n));
    setDragging(null);
    patch({ columnOrder: [...ids, ...rest] });
  }

  // Grouped bodies are not windowed: group headers make row heights uneven.
  // ponytail: unwindowed while grouped; measure rows if a grouped page gets big.
  const items = useMemo((): Item[] => {
    if (!view.groupBy) return rows.map((row) => ({ type: "row", row }));
    const shown = (name: string, key: string) => (key !== NO_VALUE && CHOICE_KINDS.has(byName.get(name)?.kind ?? "") ? humanize(key) : key);
    const out: Item[] = [];
    const order = byName.get(view.groupBy)?.choices ?? undefined;
    for (const [key, group] of groupBy(rows, view.groupBy, order)) {
      const shut = collapsed.includes(key);
      out.push({ type: "group", id: key, label: shown(view.groupBy, key), count: group.length, depth: 0, collapsed: shut });
      if (shut) continue;
      if (!view.subGroupBy) {
        for (const row of group) out.push({ type: "row", row });
        continue;
      }
      for (const [sub, subRows] of groupBy(group, view.subGroupBy, byName.get(view.subGroupBy)?.choices ?? undefined)) {
        const id = `${key} / ${sub}`;
        const subShut = collapsed.includes(id);
        out.push({ type: "group", id, label: shown(view.subGroupBy, sub), count: subRows.length, depth: 1, collapsed: subShut });
        if (!subShut) for (const row of subRows) out.push({ type: "row", row });
      }
    }
    return out;
  }, [rows, view.groupBy, view.subGroupBy, collapsed, byName]);

  const windowed = !view.groupBy && items.length > WINDOW_ABOVE;
  const virtualizer = useVirtualizer({ count: items.length, getScrollElement: () => scrollEl, estimateSize: () => ROW_H, overscan: 12 });
  const virtual = virtualizer.getVirtualItems();
  const shown = windowed ? virtual.map((v) => items[v.index]!) : items;
  const padTop = windowed && virtual.length ? virtual[0]!.start : 0;
  const padBottom = windowed && virtual.length ? virtualizer.getTotalSize() - virtual[virtual.length - 1]!.end : 0;
  const colSpan = fields.length + (p.seen ? 2 : 1);
  const rowIndex = useMemo(() => new Map(rows.map((r, i) => [r.id, i])), [rows]);

  const pageIds = rows.map((r) => r.id);
  const allOn = pageIds.length > 0 && pageIds.every((id) => p.selected.has(id));
  const someOn = pageIds.some((id) => p.selected.has(id));
  const totalWidth = SELECT_W + fields.reduce((s, f) => s + widthOf(f), 0);

  const toggleGroup = (id: string) => patch({ collapsedGroups: collapsed.includes(id) ? collapsed.filter((g) => g !== id) : [...collapsed, id] });
  const aggregateOf = (f: FieldInfo): AggregateKind | "none" => view.aggregates?.[f.name] ?? (isNumeric(f.kind) ? "sum" : "none");

  // Clicking a column's name sorts by it: ascending, then descending, then not at all.
  function cycleSort(f: FieldInfo) {
    const rest = view.sorts.filter((s) => s.id !== f.name);
    const first = view.sorts[0];
    if (first?.id !== f.name) return patch({ sorts: [{ id: f.name, dir: "asc" }, ...rest] });
    patch({ sorts: first.dir === "asc" ? [{ id: f.name, dir: "desc" }, ...rest] : rest });
  }

  // Arrow keys move between cells, as in a spreadsheet; inside an editor they stay the editor's.
  function onKeys(e: KeyboardEvent<HTMLTableElement>) {
    const target = e.target as HTMLElement;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
    const cell = target.closest<HTMLElement>("[data-cell]");
    if (!cell) return;
    let [r, c] = cell.dataset.cell!.split("-").map(Number) as [number, number];
    if (e.key === "ArrowRight") c = Math.min(fields.length - 1, c + 1);
    else if (e.key === "ArrowLeft") c = Math.max(0, c - 1);
    else if (e.key === "ArrowDown") r = Math.min(rows.length - 1, r + 1);
    else if (e.key === "ArrowUp") r = Math.max(0, r - 1);
    else return;
    e.preventDefault();
    const box = e.currentTarget;
    const go = () => (box.querySelector(`[data-cell="${r}-${c}"]`) as HTMLElement | null)?.focus();
    if (box.querySelector(`[data-cell="${r}-${c}"]`)) return go();
    // A windowed row that isn't drawn yet: bring it into view, then focus it.
    if (windowed) virtualizer.scrollToIndex(r);
    requestAnimationFrame(() => requestAnimationFrame(go));
  }

  // Cmd-click adds or takes away one row, Shift-click selects the run from the last one; a plain
  // click opens the row.
  function clickRow(e: MouseEvent, row: DataRow) {
    if ((e.target as Element).closest(".dv-td--check")) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey) {
      if (!isOwnClick(e)) return;
      const from = anchor.current ? rows.findIndex((r) => r.id === anchor.current) : -1;
      const to = rows.findIndex((r) => r.id === row.id);
      if (e.shiftKey && from >= 0) p.onSelect(rows.slice(Math.min(from, to), Math.max(from, to) + 1).map((r) => r.id), true);
      else p.onSelect([row.id], !p.selected.has(row.id));
      anchor.current = row.id;
      return;
    }
    clicks.click(e, () => p.onOpen(row.id));
  }
  function startEdit(row: DataRow, f: FieldInfo) {
    clicks.cancel();
    if (f.kind === "bool") void commit(row, f, !row[f.name]);
    else if (f.kind !== "file") setEditing({ id: row.id, field: f.name });
  }

  // A double click on a column's edge: as wide as its widest drawn value or its name.
  function autoFit(f: FieldInfo, i: number) {
    if (!tableEl) return;
    const range = document.createRange();
    const measure = (el: Element | null, pad: number) => {
      if (!el) return 0;
      range.selectNodeContents(el);
      return range.getBoundingClientRect().width + pad;
    };
    const cells = [...tableEl.querySelectorAll(`[data-cell$="-${i}"]`)].map((td) => measure(td, 24));
    const w = Math.max(measure(tableEl.querySelectorAll(".dv-th__btn")[i] ?? null, 48), ...cells);
    patch({ columnWidths: { ...(view.columnWidths ?? {}), [f.name]: Math.round(Math.min(480, Math.max(64, w))) } });
  }

  async function commit(row: DataRow, f: FieldInfo, value: unknown) {
    setEditing(null);
    if (value === undefined || JSON.stringify(value ?? null) === JSON.stringify(row[f.name] ?? null)) return;
    await p.onEdit(row.id, { [f.name]: value });
  }

  return (
    <div className="dv-tablebox" ref={setScrollEl}>
      <table ref={setTableEl} className={`dv-table${view.wrapCells ? " dv-table--wrap" : ""}`} style={{ width: totalWidth }} onKeyDown={onKeys}>
        <colgroup>
          <col style={{ width: SELECT_W }} />
          {fields.map((f) => (
            <col key={f.name} style={{ width: widthOf(f) }} />
          ))}
          {p.seen ? <col style={{ width: 110 }} /> : null}
        </colgroup>
        <thead>
          <tr>
            <th className="dv-th dv-th--check" style={frozenAt >= 0 ? { position: "sticky", left: 0, zIndex: 3 } : undefined}>
              <input type="checkbox" className="dv-check" aria-label="Select all rows on this page" checked={allOn} ref={(el) => { if (el) el.indeterminate = someOn && !allOn; }} onChange={(e) => p.onSelect(pageIds, e.target.checked)} />
            </th>
            {fields.map((f, i) => {
              const sort = view.sorts.find((s) => s.id === f.name);
              return (
                <th
                  key={f.name}
                  className={`dv-th${isNumeric(f.kind) ? " dv-r" : ""}${dragging === f.name ? " dv-th--drag" : ""}`}
                  style={i <= frozenAt ? { ...sticky(i), zIndex: 3 } : undefined}
                  aria-sort={sort ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                  draggable
                  onDragStart={(e) => {
                    setDragging(f.name);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => drop(e, f.name)}
                  onDragEnd={() => setDragging(null)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setMenuFor(f.name);
                  }}
                >
                  <div className="dv-th__in">
                    <button type="button" className="dv-th__btn" title={`${fieldLabel(f)} · ${KIND_LABELS[f.kind] ?? f.kind}`} onClick={() => cycleSort(f)}>
                      <span className="dv-ellipsis">{fieldLabel(f)}</span>
                      {sort ? sort.dir === "asc" ? <ArrowUp size={12} aria-label="ascending" /> : <ArrowDown size={12} aria-label="descending" /> : null}
                    </button>
                    <DropdownMenu open={menuFor === f.name} onOpenChange={(open) => setMenuFor(open ? f.name : null)}>
                      <DropdownMenuTrigger asChild>
                        <button type="button" className="dv-th__menu" aria-label={`${fieldLabel(f)} column menu`}>
                          <MoreHorizontal size={12} />
                        </button>
                      </DropdownMenuTrigger>
                      <ColumnMenu field={f} p={p} />
                    </DropdownMenu>
                  </div>
                  <span
                    className="dv-grip"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${fieldLabel(f)}`}
                    onPointerDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setResizing({ name: f.name, startX: e.clientX, startW: widthOf(f), w: widthOf(f) });
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      autoFit(f, i);
                    }}
                  />
                </th>
              );
            })}
            {p.seen ? <th className="dv-th">Seen</th> : null}
          </tr>
        </thead>
        <tbody>
          {padTop > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={colSpan} style={{ height: padTop, padding: 0, border: 0 }} />
            </tr>
          ) : null}
          {shown.map((item) =>
            item.type === "group" ? (
              <tr key={`g:${item.id}`} className="dv-grouprow">
                <td colSpan={colSpan}>
                  <button type="button" className="dv-group" style={{ paddingLeft: 8 + item.depth * 20 }} aria-expanded={!item.collapsed} onClick={() => toggleGroup(item.id)}>
                    {item.collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                    <b>{item.label}</b> <span className="dv-faint">{item.count}</span>
                  </button>
                </td>
              </tr>
            ) : (
              <tr
                key={item.row.id}
                className={p.selected.has(item.row.id) ? "dv-row dv-row--on" : "dv-row"}
                onMouseDown={(e) => e.shiftKey && e.preventDefault()}
                onClick={(e) => clickRow(e, item.row)}
                onContextMenu={(e) => {
                  if ((e.target as HTMLElement).closest("input, textarea, select")) return;
                  e.preventDefault();
                  setRowMenu(item.row.id);
                }}
              >
                <td className="dv-td dv-td--check" style={frozenAt >= 0 ? { position: "sticky", left: 0, zIndex: 1 } : undefined}>
                  <input type="checkbox" className="dv-check" aria-label="Select row" checked={p.selected.has(item.row.id)} onChange={(e) => {
                      anchor.current = item.row.id;
                      p.onSelect([item.row.id], e.target.checked);
                    }}
                  />
                  <DropdownMenu open={rowMenu === item.row.id} onOpenChange={(open) => setRowMenu(open ? item.row.id : null)}>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="dv-rowmenu" aria-label="Row menu">
                        <MoreHorizontal size={13} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onSelect={() => p.onOpen(item.row.id)}>Open</DropdownMenuItem>
                      <DropdownMenuItem className="dv-menu--danger" onSelect={() => p.onRemove(item.row.id)}>
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
                {fields.map((f, i) => {
                  const value = item.row[f.name];
                  const isEditing = editing?.id === item.row.id && editing.field === f.name;
                  const isTitle = f.name === p.titleField;
                  return (
                    <td
                      key={f.name}
                      className={`dv-td${isNumeric(f.kind) ? " dv-r dv-num" : ""}${isEditing ? " dv-td--editing" : " dv-td--edit"}`}
                      style={sticky(i)}
                      tabIndex={0}
                      data-cell={`${rowIndex.get(item.row.id)}-${i}`}
                      // A value longer than its column ends in an ellipsis, by design: the column
                      // widens by dragging or double-clicking its edge, or the cells wrap.
                      data-overflow-ok=""
                      onDoubleClick={(e) => !isEditing && isOwnClick(e) && startEdit(item.row, f)}
                      onKeyDown={(e) => {
                        if (isEditing || e.target !== e.currentTarget) return;
                        if (e.key === "Enter" || e.key === "F2") startEdit(item.row, f);
                        else if (e.key === " ") p.onOpen(item.row.id);
                        else return;
                        e.preventDefault();
                      }}
                    >
                      {isEditing ? (
                        <CellEditor field={f} value={value} relations={p.relations} onDone={(v) => void commit(item.row, f, v)} />
                      ) : isTitle ? (
                        <span className="dv-titlecell">
                          <span className="dv-ellipsis">
                            <CellValue field={f} value={value} row={p.record(item.row.id)} relations={p.relations} onOpenLink={p.onOpenLink} />
                          </span>
                        </span>
                      ) : (
                        <CellValue field={f} value={value} row={p.record(item.row.id)} relations={p.relations} onOpenLink={p.onOpenLink} />
                      )}
                    </td>
                  );
                })}
                {p.seen ? <SeenCell row={p.record(item.row.id)} /> : null}
              </tr>
            ),
          )}
          {padBottom > 0 ? (
            <tr aria-hidden="true">
              <td colSpan={colSpan} style={{ height: padBottom, padding: 0, border: 0 }} />
            </tr>
          ) : null}
          {p.empty ? (
            <tr>
              <td colSpan={colSpan} className="dv-emptyrow">
                {p.empty}
              </td>
            </tr>
          ) : null}
          <tr className="dv-newrow">
            <td colSpan={colSpan}>
              <button type="button" className="dv-new" onClick={() => p.onNew()}>
                <Plus size={14} /> New row
              </button>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td className="dv-foot" />
            {fields.map((f, i) => {
              const kind = aggregateOf(f);
              const result = kind === "none" ? null : computeAggregate(p.matching.map((r) => r[f.name]), kind);
              return (
                <td key={f.name} className={`dv-foot${isNumeric(f.kind) ? " dv-r" : ""}`} style={sticky(i)}>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className={`dv-foot__btn${result ? "" : " dv-foot__btn--idle"}`} aria-label={`Summary of ${fieldLabel(f)}`}>
                        {result ? (
                          <>
                            <span className="dv-faint">{AGGREGATE_LABELS[kind as AggregateKind]}</span> <span className="dv-num">{result.value === null ? "—" : formatNumber(result.isCount ? result.value : Math.round(result.value * 100) / 100, result.isCount ? null : f.unit)}</span>
                          </>
                        ) : (
                          "Summarize"
                        )}
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align={isNumeric(f.kind) ? "end" : "start"}>
                      <DropdownMenuItem onSelect={() => patch({ aggregates: { ...(view.aggregates ?? {}), [f.name]: "none" } })}>None</DropdownMenuItem>
                      {availableAggregates(isNumeric(f.kind)).map((a) => (
                        <DropdownMenuItem key={a} onSelect={() => patch({ aggregates: { ...(view.aggregates ?? {}), [f.name]: a } })}>
                          {AGGREGATE_LABELS[a]}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              );
            })}
            {p.seen ? <td className="dv-foot" /> : null}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** Bridge's StandardColumnMenu: what can be done from a column header. */
function ColumnMenu({ field, p }: { field: FieldInfo; p: ViewProps }) {
  const { view, onViewChange } = p;
  // Renaming, retyping and adding columns need the core's field routes (backend-requests.md §5).
  const soon = useComingSoon();
  const set = (next: Partial<ViewConfig>) => onViewChange({ ...view, ...next });
  const sortBy = (dir: "asc" | "desc") => set({ sorts: [{ id: field.name, dir }, ...view.sorts.filter((s) => s.id !== field.name)] });
  const grouped = view.groupBy === field.name;
  const frozen = view.frozenColumnId === field.name;
  const shown = p.fields.map((f) => f.name);
  const at = shown.indexOf(field.name);
  const move = (by: -1 | 1) => {
    const next = [...shown];
    next.splice(at, 1);
    next.splice(at + by, 0, field.name);
    set({ columnOrder: [...next, ...(view.columnOrder ?? []).filter((n) => !next.includes(n))] });
  };
  return (
    <DropdownMenuContent>
      <DropdownMenuItem onSelect={() => sortBy("asc")}>Sort ascending</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => sortBy("desc")}>Sort descending</DropdownMenuItem>
      <DropdownMenuItem
        onSelect={() =>
          !view.rowFilters.some((f) => f.field === field.name) && set({ rowFilters: [...view.rowFilters, { field: field.name, op: filterOpsForKind(field.kind)[0]!, value: "" }] })
        }
      >
        Filter
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => set({ groupBy: grouped ? null : field.name, collapsedGroups: [] })}>{grouped ? "Ungroup" : "Group by this"}</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => set({ hidden: [...(view.hidden ?? []), field.name] })}>Hide column</DropdownMenuItem>
      <DropdownMenuItem disabled={at <= 0} onSelect={() => move(-1)}>
        Move left
      </DropdownMenuItem>
      <DropdownMenuItem disabled={at < 0 || at === shown.length - 1} onSelect={() => move(1)}>
        Move right
      </DropdownMenuItem>
      <DropdownMenuItem onSelect={() => set({ frozenColumnId: frozen ? null : field.name })}>{frozen ? "Unfreeze columns" : "Freeze up to here"}</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => set({ wrapCells: !view.wrapCells })}>{view.wrapCells ? "Stop wrapping cells" : "Wrap cells"}</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => soon("Renaming a column")}>Rename column</DropdownMenuItem>
      {field.kind !== "relation" ? (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Change type</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {Object.entries(KIND_LABELS)
              .filter(([k]) => k !== "relation")
              .map(([k, label]) => (
                <DropdownMenuItem key={k} disabled={k === field.kind} onSelect={() => soon("Changing a column's type")}>
                  {label}
                </DropdownMenuItem>
              ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ) : null}
      <DropdownMenuItem onSelect={() => soon("Adding a column")}>Add column</DropdownMenuItem>
    </DropdownMenuContent>
  );
}

/** When a reader-fed row came and went, in words: "New today", "Since 2 Oct", "Gone 5 Oct". */
function SeenCell({ row }: { row: RecordRow | undefined }) {
  if (!row) return <td className="dv-td" />;
  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  if (row.gone_at) return <td className="dv-td"><span className="dv-pill">Gone {day(row.gone_at)}</span></td>;
  if (new Date(row.created_at).toDateString() === new Date().toDateString()) return <td className="dv-td"><span className="dv-pill dv-pill--good">New today</span></td>;
  return <td className="dv-td dv-faint">Since {day(row.created_at)}</td>;
}
