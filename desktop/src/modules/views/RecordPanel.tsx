/** A record's fields, each editable in place, the long texts under, when it was added and last
 *  changed: the form view's body. (Records open as pages of their own now, 9 Oct, the UI
 *  rulebook §7; the side drawer and the peeks are gone, R12.) Dates read the near way ("3 min
 *  ago", "14:32") with the exact one on hover (rule 16). */
import type { FileInfo, RecordRow, Relations } from "../../core/client";
import type { FieldInfo } from "../fields";
import { humanize, recent } from "../format";
import { Cell, LongText } from "./cells";

export function RecordFields({ row, fields, titleField, relations, files, onCommit, onOpenRelated }: { row: RecordRow; fields: FieldInfo[]; titleField: string | undefined; relations?: Relations; files?: Record<string, FileInfo>; onCommit: (field: FieldInfo, text: string) => void; onOpenRelated?: (collection: string, id: string) => void }) {
  const long = fields.filter((f) => f.kind === "long_text");
  const shown = fields.filter((f) => f.name !== titleField && f.kind !== "long_text");
  return (
    <>
      <table className="table table--kv">
        <tbody>
          {shown.map((f) => (
            <tr key={f.name}>
              <th scope="row">{humanize(f.name)}</th>
              <Cell row={row} field={f} onCommit={(text) => onCommit(f, text)} relations={relations} onOpenRelated={onOpenRelated} files={files} />
            </tr>
          ))}
          {row.created_at ? (
            <tr>
              <th scope="row">Added</th>
              <td title={recent(row.created_at).title}>{recent(row.created_at).text}</td>
            </tr>
          ) : null}
          {row.updated_at && row.updated_at !== row.created_at ? (
            <tr>
              <th scope="row">Last changed</th>
              <td title={recent(row.updated_at).title}>{recent(row.updated_at).text}</td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {long.map((f) => (
        <div key={f.name} className="drawer__long">
          <h4>{humanize(f.name)}</h4>
          <LongText value={row.values[f.name]} onCommit={(text) => onCommit(f, text)} />
        </div>
      ))}
    </>
  );
}
