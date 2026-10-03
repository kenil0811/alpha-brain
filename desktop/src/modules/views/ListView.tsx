/** One line per row: the title and a few values, for scanning. */
import type { RecordRow } from "../../core/client";
import { showValue, type FieldInfo } from "../fields";

export function ListView({ rows, bodyRef, titleField, columns, byName, onOpen }: { rows: RecordRow[]; bodyRef: { current: HTMLElement | null }; titleField: string | undefined; columns: string[]; byName: Map<string, FieldInfo>; onOpen: (id: string) => void }) {
  const secondary = columns.filter((c) => c !== titleField).slice(0, 3);
  if (!rows.length) return <p className="empty">Nothing here yet.</p>;
  return (
    <div className="list" ref={(el) => { bodyRef.current = el; }}>
      {rows.map((row) => (
        <button key={row.id} type="button" className="list__row" onClick={() => onOpen(row.id)}>
          <b>{titleField ? String(row.values[titleField] ?? "Untitled") : row.id}</b>
          <span className="faint">
            {secondary
              .map((c) => showValue(row.values[c], byName.get(c)?.kind ?? "text"))
              .filter(Boolean)
              .join(" · ")}
          </span>
        </button>
      ))}
    </div>
  );
}

