/** List, board and gallery: a row as one line, as a card in a column, as a card in a grid. A
 * single click opens the row; a double click on a value edits it there. */
import { useState, type DragEvent, type KeyboardEvent, type MouseEvent } from "react";
import { Plus } from "lucide-react";
import type { FieldInfo } from "../../modules/fields";
import { humanize } from "../../modules/format";
import { NO_VALUE, groupBy, type DataRow } from "../engine";
import { EditInPlace, fieldLabel, useOpenOnClick } from "../cells";
import type { ViewProps } from "../types";

export const titleOf = (row: DataRow, titleField: string | undefined) => {
  const v = titleField ? row[titleField] : undefined;
  return v === null || v === undefined || v === "" ? "Untitled" : String(v);
};

/** One value on a card or line, edited in place on a double click. */
function Value({ p, row, field }: { p: ViewProps; row: DataRow; field: FieldInfo }) {
  return <EditInPlace field={field} value={row[field.name]} row={p.record(row.id)} relations={p.relations} onOpenLink={p.onOpenLink} onCommit={(v) => void p.onEdit(row.id, { [field.name]: v })} />;
}

/** Click, double click and Enter on a row or card: open it, unless the double click was on a
 * value (that edits). */
function useOpening(p: ViewProps) {
  const clicks = useOpenOnClick();
  return (id: string) => ({
    onClick: (e: MouseEvent) => clicks.click(e, () => p.onOpen(id)),
    onDoubleClick: (e: MouseEvent) => {
      clicks.cancel();
      if (!(e.target as Element).closest(".dv-inplace, input, button, a")) p.onOpen(id);
    },
    onKeyDown: (e: KeyboardEvent) => e.key === "Enter" && e.target === e.currentTarget && p.onOpen(id),
  });
}

function Props({ p, row, fields }: { p: ViewProps; row: DataRow; fields: FieldInfo[] }) {
  return (
    <>
      {fields.map((f) =>
        row[f.name] === null || row[f.name] === undefined || row[f.name] === "" ? null : (
          <span key={f.name} className="dv-prop" title={fieldLabel(f)}>
            <Value p={p} row={row} field={f} />
          </span>
        ),
      )}
    </>
  );
}

export function ListView(p: ViewProps) {
  const rest = p.fields.filter((f) => f.name !== p.titleField && f.kind !== "long_text").slice(0, 4);
  const opening = useOpening(p);
  return (
    <div className="dv-list">
      {p.rows.map((row) => (
        <div key={row.id} className="dv-list__row" role="button" tabIndex={0} {...opening(row.id)}>
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
  const opening = useOpening(p);
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
                <div key={row.id} role="button" tabIndex={0} className="dv-card" draggable onDragStart={(e) => e.dataTransfer.setData("text/plain", row.id)} {...opening(row.id)}>
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
  const opening = useOpening(p);
  return (
    <div className="dv-gallery-wrap">
      <div className="dv-gallery">
        {p.rows.map((row) => (
          <div key={row.id} role="button" tabIndex={0} className="dv-card dv-card--tile" {...opening(row.id)}>
            <b className="dv-card__title">{titleOf(row, p.titleField)}</b>
            {rest.map((f) => (
              <span key={f.name} className="dv-card__prop">
                <span className="dv-faint dv-ellipsis">{fieldLabel(f)}</span>
                <span className="dv-ellipsis">
                  <Value p={p} row={row} field={f} />
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
