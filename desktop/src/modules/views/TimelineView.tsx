/** Rows along time: months newest first, each row on its day with a few values. A click opens
 *  a row; a double-click on a value edits it there. */
import type { RecordRow } from "../../core/client";
import type { FieldInfo } from "../fields";
import { CardValue, opens } from "./cells";
import { byMonth } from "./engine";

export function TimelineView({ rows, field, titleField, fields, onOpen, onCommit }: { rows: RecordRow[]; field: FieldInfo; titleField: string | undefined; fields: FieldInfo[]; onOpen: (id: string) => void; onCommit: (row: RecordRow, field: FieldInfo, text: string) => void }) {
  const title = fields.find((f) => f.name === titleField);
  const months = byMonth(rows, field);
  const extras = fields.filter((f) => f.name !== titleField && f.name !== field.name && f.kind !== "long_text").slice(0, 2);
  if (!months.length) return <p className="empty">Nothing with a {field.label ?? field.name} yet.</p>;
  return (
    <div className="timeline">
      {months.map((m) => (
        <section key={m.month} className="timeline__month" aria-label={monthName(m.month)}>
          <h4>{monthName(m.month)}</h4>
          {m.rows.map((row) => (
            <div key={row.id} className="timeline__row" {...opens(() => onOpen(row.id))}>
              <span className="timeline__day num">{String(row.values[field.name]).slice(8, 10)}</span>
              <b><CardValue row={row} field={title} onCommit={onCommit} /></b>
              {extras.map((f) => (
                <span key={f.name} className="faint">
                  <CardValue row={row} field={f} onCommit={onCommit} beside />
                </span>
              ))}
            </div>
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
