/** One record, opened beside the view: every field editable in place, the long texts under,
 *  when it was added and last changed, Remove. */
import type { RecordRow } from "../../core/client";
import type { FieldInfo } from "../fields";
import { humanize } from "../format";
import { Button, IconButton } from "../../ui";
import { X } from "../../ui/icons";
import { Cell, LongText } from "./cells";

export function RecordPanel({ row, fields, titleField, onClose, onCommit, onRemove }: { row: RecordRow; fields: FieldInfo[]; titleField: string | undefined; onClose: () => void; onCommit: (field: FieldInfo, text: string) => void; onRemove: () => void }) {
  const title = titleField ? String(row.values[titleField] ?? "") : "";
  const long = fields.filter((f) => f.kind === "long_text");
  const shown = fields.filter((f) => f.name !== titleField && f.kind !== "long_text");
  const when = (iso: string) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
  return (
    <section className="drawer" aria-label={title || "Details"}>
      <div className="drawer__head">
        <h3>{title || "Details"}</h3>
        <span className="spacer" />
        <Button size="sm" variant="danger" onClick={onRemove}>
          Remove
        </Button>
        <IconButton size="sm" label="Close details" icon={<X />} onClick={onClose} />
      </div>
      <table className="table table--kv">
        <tbody>
          {shown.map((f) => (
            <tr key={f.name}>
              <th scope="row">{humanize(f.name)}</th>
              <Cell row={row} field={f} onCommit={(text) => onCommit(f, text)} />
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
    </section>
  );
}

