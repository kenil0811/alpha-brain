/** List, board and gallery: a row as one line, as a card in a column, as a card in a grid. */
import { useState, type DragEvent } from "react";
import { Plus } from "lucide-react";
import type { FieldInfo } from "../../modules/fields";
import { humanize } from "../../modules/format";
import { NO_VALUE, groupBy, type DataRow } from "../engine";
import { CellValue, fieldLabel } from "../cells";
import type { ViewProps } from "../types";

export const titleOf = (row: DataRow, titleField: string | undefined) => {
  const v = titleField ? row[titleField] : undefined;
  return v === null || v === undefined || v === "" ? "Untitled" : String(v);
};

function Props({ p, row, fields }: { p: ViewProps; row: DataRow; fields: FieldInfo[] }) {
  return (
    <>
      {fields.map((f) =>
        row[f.name] === null || row[f.name] === undefined || row[f.name] === "" ? null : (
          <span key={f.name} className="dv-prop" title={fieldLabel(f)}>
            <CellValue field={f} value={row[f.name]} row={p.record(row.id)} relations={p.relations} onOpenLink={p.onOpenLink} />
          </span>
        ),
      )}
    </>
  );
}

export function ListView(p: ViewProps) {
  const rest = p.fields.filter((f) => f.name !== p.titleField && f.kind !== "long_text").slice(0, 4);
  return (
    <div className="dv-list">
      {p.rows.map((row) => (
        <div key={row.id} className="dv-list__row" role="button" tabIndex={0} onClick={() => p.onOpen(row.id)} onKeyDown={(e) => e.key === "Enter" && p.onOpen(row.id)}>
          <input type="checkbox" className="dv-check" aria-label="Select row" checked={p.selected.has(row.id)} onClick={(e) => e.stopPropagation()} onChange={(e) => p.onSelect([row.id], e.target.checked)} />
          <b className="dv-ellipsis">{titleOf(row, p.titleField)}</b>
          <span className="dv-list__props">
            <Props p={p} row={row} fields={rest} />
          </span>
        </div>
      ))}
      {p.empty ? <p className="dv-empty">{p.empty}</p> : null}
      <button type="button" className="dv-new" onClick={() => p.onNew()}>
        <Plus size={14} /> New row
      </button>
    </div>
  );
}

export function BoardView(p: ViewProps) {
  const field = p.allFields.find((f) => f.name === p.view.groupBy);
  const [over, setOver] = useState<string | null>(null);
  if (!field) return <p className="dv-empty">Pick a field to group by</p>;
  const groups = new Map(groupBy(p.rows, field.name, field.choices ?? undefined));
  const columns = [...(field.choices ?? []), ...(groups.has(NO_VALUE) ? [NO_VALUE] : [])];
  const extras = p.fields.filter((f) => f.name !== p.titleField && f.name !== field.name && f.kind !== "long_text").slice(0, 3);
  function drop(e: DragEvent, column: string) {
    e.preventDefault();
    setOver(null);
    const id = e.dataTransfer.getData("text/plain");
    const row = p.rows.find((r) => r.id === id);
    const value = column === NO_VALUE ? null : column;
    if (row && (row[field!.name] ?? null) !== value) void p.onEdit(id, { [field!.name]: value });
  }
  return (
    <div className="dv-board">
      {columns.map((column) => {
        const cards = groups.get(column) ?? [];
        const done = field.done_choices?.includes(column);
        return (
          <section
            key={column}
            className={`dv-board__col${over === column ? " dv-board__col--over" : ""}`}
            aria-label={humanize(column)}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(column);
            }}
            onDragLeave={() => setOver(null)}
            onDrop={(e) => drop(e, column)}
          >
            <h4 className="dv-board__head">
              <span className={`dv-pill${done ? " dv-pill--good" : ""}`}>{column === NO_VALUE ? column : humanize(column)}</span>
              <span className="dv-faint dv-num">{cards.length}</span>
            </h4>
            <div className="dv-board__cards">
              {cards.map((row) => (
                <div key={row.id} role="button" tabIndex={0} className="dv-card" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", row.id)} onClick={() => p.onOpen(row.id)} onKeyDown={(e) => e.key === "Enter" && p.onOpen(row.id)}>
                  <b className="dv-card__title">{titleOf(row, p.titleField)}</b>
                  <Props p={p} row={row} fields={extras} />
                </div>
              ))}
              {column !== NO_VALUE ? (
                <button type="button" className="dv-new dv-new--card" onClick={() => p.onNew({ [field.name]: column })}>
                  <Plus size={14} /> New
                </button>
              ) : null}
            </div>
          </section>
        );
      })}
    </div>
  );
}

export function GalleryView(p: ViewProps) {
  const rest = p.fields.filter((f) => f.name !== p.titleField).slice(0, 5);
  return (
    <div className="dv-gallery-wrap">
      <div className="dv-gallery">
        {p.rows.map((row) => (
          <div key={row.id} role="button" tabIndex={0} className="dv-card dv-card--tile" onClick={() => p.onOpen(row.id)} onKeyDown={(e) => e.key === "Enter" && p.onOpen(row.id)}>
            <b className="dv-card__title">{titleOf(row, p.titleField)}</b>
            {rest.map((f) => (
              <span key={f.name} className="dv-card__prop">
                <span className="dv-faint dv-ellipsis">{fieldLabel(f)}</span>
                <span className="dv-ellipsis">
                  <CellValue field={f} value={row[f.name]} row={p.record(row.id)} relations={p.relations} onOpenLink={p.onOpenLink} />
                </span>
              </span>
            ))}
          </div>
        ))}
        <button type="button" className="dv-card dv-card--tile dv-card--new" onClick={() => p.onNew()}>
          <Plus size={16} /> New row
        </button>
      </div>
      {p.empty ? <p className="dv-empty">{p.empty}</p> : null}
    </div>
  );
}
