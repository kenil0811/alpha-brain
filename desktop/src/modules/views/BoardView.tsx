/** Cards in columns by a choice or status field; a drag moves a row to another value. A click
 *  opens a card; a double-click on a value edits it there. */
import { type DragEvent, useState } from "react";
import type { RecordRow } from "../../core/client";
import type { FieldInfo } from "../fields";
import { humanize } from "../format";
import { CardValue, opens } from "./cells";

export function BoardView({ rows, field, titleField, fields, onOpen, onMove, onCommit }: { rows: RecordRow[]; field: FieldInfo; titleField: string | undefined; fields: FieldInfo[]; onOpen: (id: string) => void; onMove: (row: RecordRow, value: string) => void; onCommit: (row: RecordRow, field: FieldInfo, text: string) => void }) {
  const [over, setOver] = useState<string | null>(null);
  const columns = field.choices ?? [];
  const title = fields.find((f) => f.name === titleField);
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
              <div key={row.id} className="board__card" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", row.id)} {...opens(() => onOpen(row.id))}>
                <b><CardValue row={row} field={title} onCommit={onCommit} /></b>
                {extras.map((f) => (
                  <span key={f.name} className="faint">
                    <CardValue row={row} field={f} onCommit={onCommit} beside />
                  </span>
                ))}
              </div>
            ))}
            {!cards.length ? <p className="empty" style={{ padding: 12 }}>Nothing here</p> : null}
          </div>
        );
      })}
    </div>
  );
}
