/** The table: columns the person chose, sized by hand, sorted by a header, totals under the
 *  numeric ones, and a › on each row that opens its record's page (a click on the row opens
 *  nothing; a double-click on a value edits it). */
import type { FileInfo, RecordRow, Relations } from "../../core/client";
import { isNumeric, type FieldInfo } from "../fields";
import { formatNumber, humanize } from "../format";
import { Button, IconButton } from "../../ui";
import { ArrowDown, ArrowUp, ChevronRight } from "../../ui/icons";
import { nextSort, totalsFor, type Sort } from "./engine";
import { Cell, SeenCell } from "./cells";

export function TableView({ seen, rows, totalOf, bodyRef, fields, columns, byName, widths, onWidth, sort, onSort, onOpen, onCommit, empty, files, onFile, selected, onSelect, onSelectAll, selection, relations, onOpenRelated }: { files?: Record<string, FileInfo>; onFile?: (row: RecordRow, field: FieldInfo, file: File) => void; selected?: Set<string>; onSelect?: (id: string, on: boolean) => void; selection?: { count: number; onRemove?: () => void; onClear: () => void }; onSelectAll?: (on: boolean) => void; relations?: Relations; onOpenRelated?: (collection: string, id: string) => void; seen?: boolean; rows: RecordRow[]; totalOf: RecordRow[]; bodyRef: { current: HTMLElement | null }; fields: FieldInfo[]; columns: string[]; byName: Map<string, FieldInfo>; widths: Record<string, number>; onWidth: (name: string, width: number) => void; sort: Sort | null; onSort: (s: Sort | null) => void; onOpen: (id: string) => void; onCommit: (row: RecordRow, field: FieldInfo, text: string) => void; empty: string | null }) {
  const totals = totalsFor(totalOf, columns, byName);
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
                <th key={c} className={isNumeric(kind) ? "r th--sizable" : "th--sizable"} style={widths[c] ? { width: widths[c], minWidth: widths[c], maxWidth: widths[c] } : undefined} aria-sort={sort?.field === c ? (sort.direction === "asc" ? "ascending" : "descending") : undefined}>
                  <button type="button" onClick={() => onSort(nextSort(sort, c))}>
                    {byName.get(c)?.label ?? humanize(c)}
                    {sort?.field === c ? (sort.direction === "asc" ? <ArrowUp size={12} aria-label="ascending" /> : <ArrowDown size={12} aria-label="descending" />) : ""}
                  </button>
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
            {seen ? <th><span>Seen</span></th> : null}
          </tr>
        </thead>
        <tbody ref={(el) => { bodyRef.current = el; }}>
          {rows.map((row) => (
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
          ))}
          {empty ? (
            <tr>
              <td colSpan={columns.length + (seen ? 2 : 1) + (onSelect ? 1 : 0)} className="empty" style={{ whiteSpace: "normal" }}>
                {empty}
              </td>
            </tr>
          ) : null}
        </tbody>
        {totals.length && totalOf.length > 1 ? (
          <tfoot>
            <tr>
              {onSelect ? <td /> : null}
              <td />
              {columns.map((c, i) => {
                const t = totals.find((x) => x.field === c);
                return (
                  <td key={c} className={t ? "r num" : undefined}>
                    {t ? formatNumber(t.value) : i === 0 ? "Total" : ""}
                  </td>
                );
              })}
              {seen ? <td /> : null}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

