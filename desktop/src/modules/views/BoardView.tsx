/** Cards in columns by a choice or status field; a drag moves a row to another value. */
import { type DragEvent, useState } from "react";
import type { RecordRow } from "../../core/client";
import { showValue, type FieldInfo } from "../fields";
import { humanize } from "../format";

export function BoardView({ rows, field, titleField, fields, onOpen, onMove }: { rows: RecordRow[]; field: FieldInfo; titleField: string | undefined; fields: FieldInfo[]; onOpen: (id: string) => void; onMove: (row: RecordRow, value: string) => void }) {
  const [over, setOver] = useState<string | null>(null);
  const columns = field.choices ?? [];
  const extras = fields.filter((f) => f.name !== titleField && f.name !== field.name).slice(0, 2);
  function drop(e: DragEvent, column: string) {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/plain");
    const row = rows.find((r) => r.id === id);
    if (row) onMove(row, column);
  }
  return (
    <div className="board board--page">
      {columns.map((column) => {
        const cards = rows.filter((r) => String(r.values[field.name] ?? "") === column);
        const done = field.done_choices?.includes(column);
        return (
          <div key={column} className={`board__col${over === column ? " board__col--over" : ""}${done ? " board__col--done" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(column); }} onDragLeave={() => setOver(null)} onDrop={(e) => drop(e, column)} aria-label={humanize(column)}>
            <h4>
              {humanize(column)} <span>{cards.length}</span>
            </h4>
            {cards.map((row) => (
              <button key={row.id} type="button" className="board__card" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", row.id)} onClick={() => onOpen(row.id)}>
                <b>{titleField ? String(row.values[titleField] ?? "Untitled") : row.id}</b>
                {extras.map((f) => (
                  <span key={f.name} className="faint">
                    {showValue(row.values[f.name], f.kind)}
                  </span>
                ))}
              </button>
            ))}
            {!cards.length ? <p className="empty" style={{ padding: 12 }}>Nothing here</p> : null}
          </div>
        );
      })}
    </div>
  );
}

