/** The table: columns the person chose, sized by hand, sorted by a header, totals under the
 *  numeric ones, and a › on each row that opens its record's page (a click on the row opens
 *  nothing; a double-click on a value edits it). */
import type { ReactNode } from "react";
import type { FileInfo, RecordRow, Relations } from "../../core/client";
import { isNumeric, type FieldInfo } from "../fields";
import { humanize } from "../format";
import { Button, IconButton } from "../../ui";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, FilterIcon } from "../../ui/icons";
import { FOOTER_WORDS, footersOf, footerValue, isComplete, ruleFor, sortsAfterClick, withRule, type FooterOp, type GroupItem, type Rules, type Sort } from "./engine";
import { FooterCell, SetOnRows } from "./RulesUI";
import { ColumnMenu, SeenMenu } from "./RulesUI";
import { Cell, SeenCell } from "./cells";

export function TableView({ seen, rows, totalOf, bodyRef, fields, columns, byName, widths, onWidth, sorts, onSorts, rules, onRules, allRows, columnExtras, gone, items, onToggleGroup, grouping, footers, onFooter, onOpen, onCommit, empty, files, onFile, selected, onSelect, onSelectAll, selection, relations, onOpenRelated }: { files?: Record<string, FileInfo>; onFile?: (row: RecordRow, field: FieldInfo, file: File) => void; selected?: Set<string>; onSelect?: (id: string, on: boolean) => void; selection?: { count: number; onRemove?: () => void; onClear: () => void; setFields?: FieldInfo[]; onSet?: (field: FieldInfo, text: string, progress: (done: number) => void) => Promise<{ done: number; problem?: string }> }; onSelectAll?: (on: boolean) => void; relations?: Relations; onOpenRelated?: (collection: string, id: string) => void; seen?: boolean; rows: RecordRow[]; totalOf: RecordRow[]; bodyRef: { current: HTMLElement | null }; fields: FieldInfo[]; columns: string[]; byName: Map<string, FieldInfo>; widths: Record<string, number>; onWidth: (name: string, width: number) => void; sorts: Sort[]; onSorts: (s: Sort[]) => void; rules?: Rules; onRules?: (r: Rules) => void; allRows?: RecordRow[]; columnExtras?: Record<string, ReactNode>; gone?: { showGone: boolean; count: number; onShowGone: (on: boolean) => void }; items?: GroupItem[]; onToggleGroup?: (key: string) => void; grouping?: { by: string | null; onGroup: (field: string | null) => void }; footers?: Record<string, FooterOp>; onFooter?: (field: string, op: FooterOp) => void; onOpen: (id: string) => void; onCommit: (row: RecordRow, field: FieldInfo, text: string) => void; empty: string | null }) {
  const foot = footersOf(columns, byName, footers ?? {});
  // a grouped table's header rows carry each group's totals when any column beyond the first has one
  const groupTotals = columns.slice(1).some((c) => foot[c] !== "none");
  const sortAt = (field: string) => sorts.find((x) => x.field === field);
  const renderRow = (row: RecordRow) => (
            <tr
              key={row.id}
              className={`row--open${selected?.has(row.id) ? " row--selected" : ""}`}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onOpen(row.id);
                }
              }}
              aria-label={String(row.values[fields[0]?.name] ?? row.id)}
            >
              {onSelect ? (
                <td className="sel" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" aria-label={`Select ${String(row.values[fields[0]?.name] ?? row.id)}`} checked={selected?.has(row.id) ?? false} onChange={(e) => onSelect(row.id, e.target.checked)} />
                </td>
              ) : null}
              <td className="open">
                <IconButton size="sm" label={`Open ${String(row.values[fields[0]?.name] ?? row.id)}`} icon={<ChevronRight size={14} />} onClick={(e) => { e.stopPropagation(); onOpen(row.id); }} />
              </td>
              {columns.map((c) => (
                <Cell key={c} row={row} field={byName.get(c)!} onCommit={(text) => onCommit(row, byName.get(c)!, text)} relations={relations} onOpenRelated={onOpenRelated} files={files} onFile={onFile ? (file) => onFile(row, byName.get(c)!, file) : undefined} />
              ))}
              {seen ? <SeenCell row={row} /> : null}
            </tr>
  );
  return (
    <div className="tablewrap">
      <table className="table" aria-label={undefined}>
        <thead>
          {/* rows ticked: the header row itself says how many, with Remove and Clear, so the table
              never moves (12 Oct, Kenil: a bar of its own pushed every row down). The labels keep
              their place, hidden, so no column changes width. */}
          <tr className={selection?.count ? "selecting" : undefined}>
            {onSelect ? (
              <th className="sel">
                <input type="checkbox" aria-label="Select every row on this page" checked={rows.length > 0 && rows.every((r) => selected?.has(r.id))} onChange={(e) => onSelectAll?.(e.target.checked)} />
              </th>
            ) : null}
            <th className="open" aria-label={selection?.count ? undefined : "Open"}>
              {selection?.count ? (
                <div className="selbar" role="status">
                  <b>{selection.count.toLocaleString()} selected</b>
                  {selection.onSet ? <SetOnRows fields={selection.setFields ?? []} count={selection.count} onSet={selection.onSet} /> : null}
                  {selection.onRemove ? (
                    <Button size="sm" variant="danger" onClick={selection.onRemove}>
                      Remove
                    </Button>
                  ) : null}
                  <Button size="sm" variant="ghost" onClick={selection.onClear}>
                    Clear
                  </Button>
                </div>
              ) : null}
            </th>
            {columns.map((c) => {
              const kind = byName.get(c)?.kind ?? "text";
              return (
                <th key={c} className={isNumeric(kind) ? "r th--sizable" : "th--sizable"} style={widths[c] ? { width: widths[c], minWidth: widths[c], maxWidth: widths[c] } : undefined} aria-sort={sortAt(c) ? (sortAt(c)!.direction === "asc" ? "ascending" : "descending") : undefined}>
                  <button type="button" onClick={(e) => onSorts(sortsAfterClick(sorts, c, e.shiftKey))} title="Sort by this column; shift-click to add it as the next level">
                    {byName.get(c)?.label ?? humanize(c)}
                    {sortAt(c) ? (sortAt(c)!.direction === "asc" ? <ArrowUp size={12} aria-label="ascending" /> : <ArrowDown size={12} aria-label="descending" />) : ""}
                    {sorts.length > 1 && sortAt(c) ? <span className="th__level">{sorts.findIndex((x) => x.field === c) + 1}</span> : null}
                    {rules && ruleFor(rules, c) && isComplete(ruleFor(rules, c)!) ? <FilterIcon size={12} className="th__funnel" aria-label="filtered" /> : null}
                  </button>
                  {rules && onRules && byName.get(c) ? <ColumnMenu field={byName.get(c)!} rows={allRows ?? rows} rule={ruleFor(rules, c)} onRule={(rule) => onRules(withRule(rules, c, rule))} extra={columnExtras?.[c]} grouped={grouping ? grouping.by === c : undefined} onGroup={grouping ? (on) => grouping.onGroup(on ? c : null) : undefined} /> : null}
                  <span
                    className="th__grip"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${humanize(c)}`}
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
            {seen ? <th><span>Seen</span>{gone ? <SeenMenu showGone={gone.showGone} goneCount={gone.count} onShowGone={gone.onShowGone} /> : null}</th> : null}
          </tr>
        </thead>
        <tbody ref={(el) => { bodyRef.current = el; }}>
          {items
            ? items.map((item) =>
                item.kind === "row" ? (
                  renderRow(item.row)
                ) : (
                  <tr key={`g:${item.key}${item.continued ? ":cont" : ""}`} className="grouprow">
                    <td colSpan={groupTotals ? 2 + (onSelect ? 1 : 0) : columns.length + 1 + (onSelect ? 1 : 0) + (seen ? 1 : 0)}>
                      <button type="button" className="grouprow__btn" aria-expanded={!item.folded} onClick={() => onToggleGroup?.(item.key)}>
                        {item.folded ? <ChevronRight size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
                        <b>{item.label}</b>{" "}
                        <span className="faint num">· {item.count.toLocaleString()}</span>
                        {item.continued ? <span className="faint"> continued</span> : null}
                      </button>
                    </td>
                    {groupTotals
                      ? columns.slice(1).map((c) => {
                          const v = byName.get(c) ? footerValue(item.rows, byName.get(c)!, foot[c]) : null;
                          return (
                            <td key={c} className={`grouprow__total${isNumeric(byName.get(c)?.kind ?? "") ? " r num" : ""}`}>
                              {v !== null ? <span title={`${FOOTER_WORDS[foot[c]]} in ${item.label}`}>{v}</span> : null}
                            </td>
                          );
                        })
                      : null}
                    {groupTotals && seen ? <td /> : null}
                  </tr>
                ),
              )
            : rows.map(renderRow)}
          {empty ? (
            <tr>
              <td colSpan={columns.length + (seen ? 2 : 1) + (onSelect ? 1 : 0)} className="empty" style={{ whiteSpace: "normal" }}>
                {empty}
              </td>
            </tr>
          ) : null}
        </tbody>
        {totalOf.length > 1 && onFooter ? (
          <tfoot>
            <tr>
              {onSelect ? <td /> : null}
              <td />
              {columns.map((c, i) => (
                <td key={c} className={isNumeric(byName.get(c)?.kind ?? "") ? "r num" : undefined}>
                  {byName.get(c) ? <FooterCell field={byName.get(c)!} op={foot[c]} value={footerValue(totalOf, byName.get(c)!, foot[c])} onOp={(op) => onFooter(c, op)} first={i === 0} /> : null}
                </td>
              ))}
              {seen ? <td /> : null}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

