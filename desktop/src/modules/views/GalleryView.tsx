/** Cards in a grid: the title, a few values, a link when there is one; for browsing rather
 *  than scanning. */
import type { ReactNode } from "react";
import type { RecordRow } from "../../core/client";
import type { ColorTone } from "./engine";
import { showValue, type FieldInfo } from "../fields";
import { humanize } from "../format";

export function GalleryView({ rows, fields, titleField, onOpen, toneOf, rowIcon }: { rows: RecordRow[]; fields: FieldInfo[]; titleField: string | undefined; onOpen: (id: string) => void; toneOf?: (row: RecordRow) => ColorTone | undefined; rowIcon?: (row: RecordRow) => ReactNode }) {
  const shown = fields.filter((f) => f.name !== titleField && f.kind !== "long_text" && f.kind !== "file").slice(0, 4);
  if (!rows.length) return <p className="empty">Nothing here yet.</p>;
  return (
    <div className="gallery">
      {rows.map((row) => (
        <button key={row.id} type="button" className={`gallery__card${toneOf?.(row) ? ` tone--${toneOf(row)}` : ""}`} onClick={() => onOpen(row.id)}>
          <b>{rowIcon?.(row)}{titleField ? String(row.values[titleField] ?? "Untitled") : row.id}</b>
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
