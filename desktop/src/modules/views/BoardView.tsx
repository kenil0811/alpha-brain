/** Cards in columns by any field (a choice or status by its options); a drag moves a card to
 *  another value where the field takes one. Sub-grouped, one board per value of the second
 *  field; cards coloured by the view's rules. */
import { type DragEvent, type ReactNode, useState } from "react";
import type { RecordRow } from "../../core/client";
import { showValue, type FieldInfo } from "../fields";
import { groupRows, type ColorTone } from "./engine";

function Board({ rows, field, titleField, extras, onOpen, onMove, hideEmpty, order, toneOf, rowIcon }: { rows: RecordRow[]; field: FieldInfo; titleField: string | undefined; extras: FieldInfo[]; onOpen: (id: string) => void; onMove?: (row: RecordRow, value: string) => void; hideEmpty?: boolean; order?: "manual" | "asc" | "desc"; toneOf?: (row: RecordRow) => ColorTone | undefined; rowIcon?: (row: RecordRow) => ReactNode }) {
  const [over, setOver] = useState<string | null>(null);
  const columns = groupRows(rows, field, { hideEmpty, order });
  function drop(e: DragEvent, column: string) {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/plain");
    const row = rows.find((r) => r.id === id);
    if (row && onMove) onMove(row, column);
  }
  return (
    <div className="board board--page">
      {columns.map(({ key, label, rows: cards }) => {
        const done = field.done_choices?.includes(key);
        return (
          <div key={key} className={`board__col${over === key ? " board__col--over" : ""}${done ? " board__col--done" : ""}`} onDragOver={(e) => { if (onMove) { e.preventDefault(); setOver(key); } }} onDragLeave={() => setOver(null)} onDrop={(e) => drop(e, key)} aria-label={label}>
            <h4>
              {label} <span>{cards.length}</span>
            </h4>
            {cards.map((row) => {
              const tone = toneOf?.(row);
              return (
                <button key={row.id} type="button" className={`board__card${tone ? ` tone--${tone}` : ""}`} draggable={Boolean(onMove)} onDragStart={(e) => e.dataTransfer.setData("text/plain", row.id)} onClick={() => onOpen(row.id)}>
                  <b>
                    {rowIcon?.(row)}
                    {titleField ? String(row.values[titleField] ?? "Untitled") : row.id}
                  </b>
                  {extras.map((f) => (
                    <span key={f.name} className="faint">
                      {showValue(row.values[f.name], f.kind)}
                    </span>
                  ))}
                </button>
              );
            })}
            {!cards.length ? <p className="empty" style={{ padding: 12 }}>Nothing here</p> : null}
          </div>
        );
      })}
    </div>
  );
}

export function BoardView({ rows, field, titleField, fields, onOpen, onMove, subField, hideEmpty, order, toneOf, rowIcon }: { rows: RecordRow[]; field: FieldInfo; titleField: string | undefined; fields: FieldInfo[]; onOpen: (id: string) => void; onMove: (row: RecordRow, value: string) => void; subField?: FieldInfo | null; hideEmpty?: boolean; order?: "manual" | "asc" | "desc"; toneOf?: (row: RecordRow) => ColorTone | undefined; rowIcon?: (row: RecordRow) => ReactNode }) {
  const extras = fields.filter((f) => f.name !== titleField && f.name !== field.name).slice(0, 2);
  // a card moves only where the value is one of the field's options
  const movable = field.kind === "choice" || field.kind === "status" ? onMove : undefined;
  const one = (rs: RecordRow[]) => <Board rows={rs} field={field} titleField={titleField} extras={extras} onOpen={onOpen} onMove={movable} hideEmpty={hideEmpty} order={order} toneOf={toneOf} rowIcon={rowIcon} />;
  if (!subField) return one(rows);
  return (
    <div className="subboards">
      {groupRows(rows, subField, { hideEmpty: true }).map((g) => (
        <section key={g.key} className="subboard" aria-label={g.label}>
          <h4 className="subboard__head">
            {g.label} <span className="faint">{g.rows.length}</span>
          </h4>
          {one(g.rows)}
        </section>
      ))}
    </div>
  );
}
