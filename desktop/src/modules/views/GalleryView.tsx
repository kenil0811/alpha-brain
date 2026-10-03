/** Cards in a grid: the title, a few values, a link when there is one; for browsing rather
 *  than scanning. */
import type { RecordRow } from "../../core/client";
import { showValue, type FieldInfo } from "../fields";
import { humanize } from "../format";

export function GalleryView({ rows, fields, titleField, onOpen }: { rows: RecordRow[]; fields: FieldInfo[]; titleField: string | undefined; onOpen: (id: string) => void }) {
  const shown = fields.filter((f) => f.name !== titleField && f.kind !== "long_text" && f.kind !== "file").slice(0, 4);
  if (!rows.length) return <p className="empty">Nothing here yet.</p>;
  return (
    <div className="gallery">
      {rows.map((row) => (
        <button key={row.id} type="button" className="gallery__card" onClick={() => onOpen(row.id)}>
          <b>{titleField ? String(row.values[titleField] ?? "Untitled") : row.id}</b>
          {shown.map((f) => {
            const words = showValue(row.values[f.name], f.kind, f.unit);
            if (!words) return null;
            return (
              <span key={f.name} className="gallery__line">
                <span className="faint">{f.label ?? humanize(f.name)}</span> {words}
              </span>
            );
          })}
        </button>
      ))}
    </div>
  );
}
