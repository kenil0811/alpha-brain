/** Cards in a grid: the title, a few values, a link when there is one; for browsing rather
 *  than scanning. A click opens a card; a double-click on a value edits it there. */
import type { RecordRow } from "../../core/client";
import type { FieldInfo } from "../fields";
import { humanize } from "../format";
import { CardValue, opens } from "./cells";

export function GalleryView({ rows, fields, titleField, onOpen, onCommit }: { rows: RecordRow[]; fields: FieldInfo[]; titleField: string | undefined; onOpen: (id: string) => void; onCommit: (row: RecordRow, field: FieldInfo, text: string) => void }) {
  const title = fields.find((f) => f.name === titleField);
  const shown = fields.filter((f) => f.name !== titleField && f.kind !== "long_text" && f.kind !== "file").slice(0, 4);
  if (!rows.length) return <p className="empty">Nothing here yet.</p>;
  return (
    <div className="gallery">
      {rows.map((row) => (
        <div key={row.id} className="gallery__card" {...opens(() => onOpen(row.id))}>
          <b><CardValue row={row} field={title} onCommit={onCommit} /></b>
          {shown.map((f) =>
            row.values[f.name] === null || row.values[f.name] === undefined || row.values[f.name] === "" ? null : (
              <span key={f.name} className="gallery__line">
                <span className="faint">{f.label ?? humanize(f.name)}</span> <CardValue row={row} field={f} onCommit={onCommit} />
              </span>
            ),
          )}
        </div>
      ))}
    </div>
  );
}
