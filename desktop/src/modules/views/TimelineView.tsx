/** Rows along time: months newest first, each row on its day with a few values. */
import type { RecordRow } from "../../core/client";
import { showValue, type FieldInfo } from "../fields";
import { byMonth } from "./engine";

export function TimelineView({ rows, field, titleField, fields, onOpen }: { rows: RecordRow[]; field: FieldInfo; titleField: string | undefined; fields: FieldInfo[]; onOpen: (id: string) => void }) {
  const months = byMonth(rows, field);
  const extras = fields.filter((f) => f.name !== titleField && f.name !== field.name && f.kind !== "long_text").slice(0, 2);
  if (!months.length) return <p className="empty">Nothing with a {field.label ?? field.name} yet.</p>;
  return (
    <div className="timeline">
      {months.map((m) => (
        <section key={m.month} className="timeline__month" aria-label={monthName(m.month)}>
          <h4>{monthName(m.month)}</h4>
          {m.rows.map((row) => (
            <button key={row.id} type="button" className="timeline__row" onClick={() => onOpen(row.id)}>
              <span className="timeline__day num">{String(row.values[field.name]).slice(8, 10)}</span>
              <b>{titleField ? String(row.values[titleField] ?? "Untitled") : row.id}</b>
              <span className="faint">{extras.map((f) => showValue(row.values[f.name], f.kind, f.unit)).filter(Boolean).join(" · ")}</span>
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

function monthName(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}
