/** One line per row: the title and a few values, for scanning. A click opens the row; a
 *  double-click on a value edits it there. */
import type { RecordRow } from "../../core/client";
import type { FieldInfo } from "../fields";
import { CardValue, opens } from "./cells";

export function ListView({ rows, bodyRef, titleField, columns, byName, onOpen, onCommit }: { rows: RecordRow[]; bodyRef: { current: HTMLElement | null }; titleField: string | undefined; columns: string[]; byName: Map<string, FieldInfo>; onOpen: (id: string) => void; onCommit: (row: RecordRow, field: FieldInfo, text: string) => void }) {
  const secondary = columns.filter((c) => c !== titleField).slice(0, 3);
  if (!rows.length) return <p className="empty">Nothing here yet.</p>;
  return (
    <div className="list" ref={(el) => { bodyRef.current = el; }}>
      {rows.map((row) => (
        <div key={row.id} className="list__row" {...opens(() => onOpen(row.id))}>
          <b><CardValue row={row} field={titleField ? byName.get(titleField) : undefined} onCommit={onCommit} /></b>
          {secondary.map((c) => (
            <span key={c} className="faint">
              <CardValue row={row} field={byName.get(c)} onCommit={onCommit} beside />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
