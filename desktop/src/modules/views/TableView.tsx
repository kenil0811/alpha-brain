/** The table: columns the person chose, sized by hand, sorted by a header, totals under the
 *  numeric ones, a row that opens its record. */
import type { FileInfo, RecordRow } from "../../core/client";
import { isNumeric, type FieldInfo } from "../fields";
import { formatNumber, humanize } from "../format";
import { ArrowDown, ArrowUp, ChevronRight } from "../../ui/icons";
import { nextSort, totalsFor, type Sort } from "./engine";
import { Cell, SeenCell } from "./cells";

export function TableView({ seen, rows, totalOf, bodyRef, fields, columns, byName, widths, onWidth, sort, onSort, openId, onOpen, onCommit, empty, files, onFile }: { files?: Record<string, FileInfo>; onFile?: (row: RecordRow, field: FieldInfo, file: File) => void; seen?: boolean; rows: RecordRow[]; totalOf: RecordRow[]; bodyRef: { current: HTMLElement | null }; fields: FieldInfo[]; columns: string[]; byName: Map<string, FieldInfo>; widths: Record<string, number>; onWidth: (name: string, width: number) => void; sort: Sort | null; onSort: (s: Sort | null) => void; openId: string | null; onOpen: (id: string) => void; onCommit: (row: RecordRow, field: FieldInfo, text: string) => void; empty: string | null }) {
  const totals = totalsFor(totalOf, columns, byName);
  return (
    <div className="tablewrap">
      <table className="table" aria-label={undefined}>
        <thead>
          <tr>
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
            <tr key={row.id} className={`row--open${openId === row.id ? " row--current" : ""}`} onClick={() => onOpen(row.id)} aria-label={`Open ${String(row.values[fields[0]?.name] ?? row.id)}`}>
              {columns.map((c) => (
                <Cell key={c} row={row} field={byName.get(c)!} onCommit={(text) => onCommit(row, byName.get(c)!, text)} files={files} onFile={onFile ? (file) => onFile(row, byName.get(c)!, file) : undefined} />
              ))}
              {seen ? <SeenCell row={row} /> : null}
              <td className="r">
                <span className="faint"><ChevronRight size={14} aria-hidden="true" /></span>
              </td>
            </tr>
          ))}
          {empty ? (
            <tr>
              <td colSpan={columns.length + (seen ? 2 : 1)} className="empty" style={{ whiteSpace: "normal" }}>
                {empty}
              </td>
            </tr>
          ) : null}
        </tbody>
        {totals.length && totalOf.length > 1 ? (
          <tfoot>
            <tr>
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

