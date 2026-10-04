/** The table: columns the person chose, sized by hand, sorted by a header, totals under the
 *  numeric ones, a row that opens its record. */
import type { FileInfo, RecordRow, Relations } from "../../core/client";
import { isNumeric, type FieldInfo } from "../fields";
import { formatNumber, humanize } from "../format";
import { ArrowDown, ArrowUp, ChevronRight } from "../../ui/icons";
import { nextSort, totalsFor, type Sort } from "./engine";
import { Cell, SeenCell } from "./cells";

export function TableView({ seen, rows, totalOf, bodyRef, fields, columns, byName, widths, onWidth, sort, onSort, openId, onOpen, onCommit, empty, files, onFile, selected, onSelect, onSelectAll, relations, onOpenRelated }: { files?: Record<string, FileInfo>; onFile?: (row: RecordRow, field: FieldInfo, file: File) => void; selected?: Set<string>; onSelect?: (id: string, on: boolean) => void; onSelectAll?: (on: boolean) => void; relations?: Relations; onOpenRelated?: (collection: string, id: string) => void; seen?: boolean; rows: RecordRow[]; totalOf: RecordRow[]; bodyRef: { current: HTMLElement | null }; fields: FieldInfo[]; columns: string[]; byName: Map<string, FieldInfo>; widths: Record<string, number>; onWidth: (name: string, width: number) => void; sort: Sort | null; onSort: (s: Sort | null) => void; openId: string | null; onOpen: (id: string) => void; onCommit: (row: RecordRow, field: FieldInfo, text: string) => void; empty: string | null }) {
  const totals = totalsFor(totalOf, columns, byName);
  return (
    <div className="tablewrap">
      <table className="table" aria-label={undefined}>
        <thead>
          <tr>
            {onSelect ? (
              <th className="sel">
                <input type="checkbox" aria-label="Select every row on this page" checked={rows.length > 0 && rows.every((r) => selected?.has(r.id))} onChange={(e) => onSelectAll?.(e.target.checked)} />
              </th>
            ) : null}
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
            {seen ? <th>Seen</th> : null}
            <th aria-label="Actions" />
          </tr>
        </thead>
        <tbody ref={(el) => { bodyRef.current = el; }}>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={`row--open${openId === row.id ? " row--current" : ""}${selected?.has(row.id) ? " row--selected" : ""}`}
              onClick={() => onOpen(row.id)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  onOpen(row.id);
                }
              }}
              aria-label={`Open ${String(row.values[fields[0]?.name] ?? row.id)}`}
            >
              {onSelect ? (
                <td className="sel" onClick={(e) => e.stopPropagation()}>
                  <input type="checkbox" aria-label={`Select ${String(row.values[fields[0]?.name] ?? row.id)}`} checked={selected?.has(row.id) ?? false} onChange={(e) => onSelect(row.id, e.target.checked)} />
                </td>
              ) : null}
              {columns.map((c) => (
                <Cell key={c} row={row} field={byName.get(c)!} onCommit={(text) => onCommit(row, byName.get(c)!, text)} relations={relations} onOpenRelated={onOpenRelated} files={files} onFile={onFile ? (file) => onFile(row, byName.get(c)!, file) : undefined} />
              ))}
              {seen ? <SeenCell row={row} /> : null}
              <td className="r">
                <span className="faint"><ChevronRight size={14} aria-hidden="true" /></span>
              </td>
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
              {columns.map((c, i) => {
                const t = totals.find((x) => x.field === c);
                return (
                  <td key={c} className={t ? "r num" : undefined}>
                    {t ? formatNumber(t.value) : i === 0 ? "Total" : ""}
                  </td>
                );
              })}
              {seen ? <td /> : null}
              <td />
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}

