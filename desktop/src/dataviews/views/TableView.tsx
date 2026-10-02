/**
 * The table: Bridge's TableView on the core's records. Every grid mechanic (widths, order,
 * frozen columns, wrapping, grouping, collapsed groups, footer summaries) is view config, so a
 * saved list brings it back. Long pages are windowed; a cell edits in place; the checkbox
 * column is always there.
 */
import { useEffect, useMemo, useState, type CSSProperties, type DragEvent } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Maximize2, Plus } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "../../ui/DropdownMenu";
import { CHOICE_KINDS, isNumeric, type FieldInfo } from "../../modules/fields";
import { formatNumber, humanize } from "../../modules/format";
import { AGGREGATE_LABELS, availableAggregates, computeAggregate, filterOpsForKind, groupBy, NO_VALUE, type AggregateKind, type DataRow, type ViewConfig } from "../engine";
import { CellEditor, CellValue, fieldLabel } from "../cells";
import { KIND_LABELS, NameDialog } from "../controls";
import type { ViewProps } from "../types";

const SELECT_W = 36;
const OPEN_W = 36;
const ROW_H = 36;
const WINDOW_ABOVE = 100;
const KINDS = ["text", "long_text", "number", "date", "datetime", "bool", "choice", "multichoice", "status", "url"];

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
  const [renaming, setRenaming] = useState<FieldInfo | null>(null);
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);
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
  const colSpan = fields.length + 2;

  const pageIds = rows.map((r) => r.id);
  const allOn = pageIds.length > 0 && pageIds.every((id) => p.selected.has(id));
  const someOn = pageIds.some((id) => p.selected.has(id));
  const totalWidth = SELECT_W + OPEN_W + fields.reduce((s, f) => s + widthOf(f), 0);

  const toggleGroup = (id: string) => patch({ collapsedGroups: collapsed.includes(id) ? collapsed.filter((g) => g !== id) : [...collapsed, id] });
  const aggregateOf = (f: FieldInfo): AggregateKind | "none" => view.aggregates?.[f.name] ?? (isNumeric(f.kind) ? "sum" : "none");

  async function commit(row: DataRow, f: FieldInfo, value: unknown) {
    setEditing(null);
    if (value === undefined || JSON.stringify(value ?? null) === JSON.stringify(row[f.name] ?? null)) return;
    await p.onEdit(row.id, { [f.name]: value });
  }

  return (
    <div className="dv-tablebox" ref={setScrollEl}>
      <table className={`dv-table${view.wrapCells ? " dv-table--wrap" : ""}`} style={{ width: totalWidth }}>
        <colgroup>
          <col style={{ width: SELECT_W }} />
          {fields.map((f) => (
            <col key={f.name} style={{ width: widthOf(f) }} />
          ))}
          <col style={{ width: OPEN_W }} />
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
                >
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" className="dv-th__btn" title={`${fieldLabel(f)} · ${KIND_LABELS[f.kind] ?? f.kind}`}>
                        <span className="dv-ellipsis">{fieldLabel(f)}</span>
                        {sort ? sort.dir === "asc" ? <ArrowUp size={12} aria-label="ascending" /> : <ArrowDown size={12} aria-label="descending" /> : null}
                      </button>
                    </DropdownMenuTrigger>
                    <ColumnMenu field={f} p={p} onRename={() => setRenaming(f)} />
                  </DropdownMenu>
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
                  />
                </th>
              );
            })}
            <th className="dv-th" aria-label="Open" />
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
              <tr key={item.row.id} className={p.selected.has(item.row.id) ? "dv-row dv-row--on" : "dv-row"}>
                <td className="dv-td dv-td--check" style={frozenAt >= 0 ? { position: "sticky", left: 0, zIndex: 1 } : undefined}>
                  <input type="checkbox" className="dv-check" aria-label="Select row" checked={p.selected.has(item.row.id)} onChange={(e) => p.onSelect([item.row.id], e.target.checked)} />
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
                      onClick={() => (f.kind === "bool" ? void commit(item.row, f, !value) : setEditing({ id: item.row.id, field: f.name }))}
                      onKeyDown={(e) => e.key === "Enter" && !isEditing && setEditing({ id: item.row.id, field: f.name })}
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
                <td className="dv-td dv-td--open">
                  <button type="button" className="dv-open" aria-label="Open record" title="Open" onClick={() => p.onOpen(item.row.id)}>
                    <Maximize2 size={13} />
                  </button>
                </td>
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
            <td className="dv-foot" />
          </tr>
        </tfoot>
      </table>
      {renaming ? (
        <NameDialog
          title={`Rename ${fieldLabel(renaming)}`}
          initial={fieldLabel(renaming)}
          action="Rename"
          onCancel={() => setRenaming(null)}
          onSave={async (label) => {
            const ok = await p.onChangeField(renaming.name, { label });
            if (ok) setRenaming(null);
            return ok;
          }}
        />
      ) : null}
    </div>
  );
}

/** Bridge's StandardColumnMenu: what can be done from a column header. */
function ColumnMenu({ field, p, onRename }: { field: FieldInfo; p: ViewProps; onRename: () => void }) {
  const { view, onViewChange } = p;
  const set = (next: Partial<ViewConfig>) => onViewChange({ ...view, ...next });
  const sortBy = (dir: "asc" | "desc") => set({ sorts: [{ id: field.name, dir }, ...view.sorts.filter((s) => s.id !== field.name)] });
  const grouped = view.groupBy === field.name;
  const frozen = view.frozenColumnId === field.name;
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
      <DropdownMenuItem onSelect={() => set({ frozenColumnId: frozen ? null : field.name })}>{frozen ? "Unfreeze columns" : "Freeze up to here"}</DropdownMenuItem>
      <DropdownMenuItem onSelect={() => set({ wrapCells: !view.wrapCells })}>{view.wrapCells ? "Stop wrapping cells" : "Wrap cells"}</DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onRename}>Rename</DropdownMenuItem>
      {field.kind !== "relation" ? (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Change type</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {KINDS.map((k) => (
              <DropdownMenuItem key={k} disabled={k === field.kind} onSelect={() => void p.onChangeField(field.name, { kind: k })}>
                {KIND_LABELS[k]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ) : null}
    </DropdownMenuContent>
  );
}
