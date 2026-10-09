/** A record's fields, each editable in place, the long texts under, when it was added and last
 *  changed: the form view's body. (Records open as pages of their own now, 9 Oct, the UI
 *  rulebook §7; the side drawer that lived here is gone.) */
import type { FileInfo, RecordRow, Relations } from "../../core/client";
import type { FieldInfo } from "../fields";
import { humanize, when } from "../format";
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
              <td>{when(row.created_at)}</td>
            </tr>
          ) : null}
          {row.updated_at && row.updated_at !== row.created_at ? (
            <tr>
              <th scope="row">Last changed</th>
              <td>{when(row.updated_at)}</td>
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
