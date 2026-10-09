/** The form view: one record at a time, every field as a form, with previous and next over the
 *  rows the page shows (searched, filtered, sorted as the table is). For going through records
 *  one by one, checking or filling each. */
import type { FileInfo, RecordRow, Relations } from "../../core/client";
import type { FieldInfo } from "../fields";
import { IconButton } from "../../ui";
import { ChevronLeft, ChevronRight, ICON_SM, OpenIcon } from "../../ui/icons";
import { RecordFields } from "./RecordPanel";

export function FormView({ rows, at, onAt, fields, titleField, relations, files, onCommit, onOpenRelated, onOpen, empty }: { rows: RecordRow[]; at: number; onAt: (i: number) => void; fields: FieldInfo[]; titleField: string | undefined; relations?: Relations; files?: Record<string, FileInfo>; onCommit: (row: RecordRow, field: FieldInfo, text: string) => void; onOpenRelated?: (collection: string, id: string) => void; /** The record's own page. */ onOpen?: (id: string) => void; empty: string | null }) {
  if (!rows.length) return <p className="empty">{empty ?? "Nothing here yet."}</p>;
  const index = Math.min(Math.max(at, 0), rows.length - 1);
  const row = rows[index];
  const title = titleField ? String(row.values[titleField] ?? "") : "";
  return (
    <section className="formview" aria-label={`Record ${index + 1} of ${rows.length}`}>
      <div className="formview__head">
        <IconButton size="sm" label="Previous record" icon={<ChevronLeft />} disabled={index === 0} onClick={() => onAt(index - 1)} />
        <span className="formview__count">
          {index + 1} of {rows.length}
        </span>
        <IconButton size="sm" label="Next record" icon={<ChevronRight />} disabled={index === rows.length - 1} onClick={() => onAt(index + 1)} />
        <h3 className="formview__title">{title || "Details"}</h3>
        {onOpen ? <IconButton size="sm" label={`Open ${title || "this record"}`} icon={<OpenIcon size={ICON_SM} />} onClick={() => onOpen(row.id)} /> : null}
      </div>
      <RecordFields row={row} fields={fields} titleField={titleField} relations={relations} files={files} onCommit={(field, text) => onCommit(row, field, text)} onOpenRelated={onOpenRelated} />
    </section>
  );
}
