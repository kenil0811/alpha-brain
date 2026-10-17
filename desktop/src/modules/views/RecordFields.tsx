/** One record's fields: every field editable in place, the long texts under, when it was
 *  added and last changed, and beside each value where it came from (§12). The record's own
 *  page shows them (`RecordPage`), and so does the form view. */
import type { Provenance, RecordRow, Relations } from "../../core/client";
import { fieldLabel, type FieldInfo } from "../fields";
import { dayText, when as whenText } from "../format";
import { Cell, CheckMark, LongText } from "./cells";

/** `page`: on the record's own page the title is a field like the rest (it is edited there) and
 *  the dates are in the page's header, so neither repeats here. */
export function RecordFields({ row, fields, titleField, relations, onCommit, onOpenRelated, page = false }: { row: RecordRow; fields: FieldInfo[]; titleField: string | undefined; relations?: Relations; onCommit: (field: FieldInfo, text: string) => void; onOpenRelated?: (collection: string, id: string) => void; page?: boolean }) {
  const long = fields.filter((f) => f.kind === "long_text");
  const shown = fields.filter((f) => (page || f.name !== titleField) && f.kind !== "long_text");
  const when = (iso: string) => whenText(iso);
  return (
    <>
      <table className={page ? "table table--kv table--wrap" : "table table--kv"}>
        <tbody>
          {shown.map((f) => {
            const origin = row.provenance.fields?.[f.name];
            return (
              <tr key={f.name}>
                <th scope="row">{fieldLabel(f)}</th>
                <Cell row={row} field={f} onCommit={(text) => onCommit(f, text)} relations={relations} onOpenRelated={onOpenRelated} marks={!origin} />
                {origin ? <FieldOrigin origin={origin} /> : <td />}
              </tr>
            );
          })}
          {!page && row.created_at ? (
            <tr>
              <th scope="row">Added</th>
              <td>{when(row.created_at)}</td>
              <td />
            </tr>
          ) : null}
          {!page && row.updated_at && row.updated_at !== row.created_at ? (
            <tr>
              <th scope="row">Last changed</th>
              <td>{when(row.updated_at)}</td>
              <td />
            </tr>
          ) : null}
        </tbody>
      </table>
      {long.map((f) => {
        const origin = row.provenance.fields?.[f.name];
        return (
          <div key={f.name} className="drawer__long">
            <h4>
              {fieldLabel(f)}
              {origin?.source && row.values[f.name] != null ? <span className="faint origin"> · from {origin.source}</span> : null}
            </h4>
            {origin?.problem && row.values[f.name] == null ? <p className="origin origin--problem">Not filled: {origin.problem}</p> : null}
            <LongText value={row.values[f.name]} onCommit={(text) => onCommit(f, text)} />
          </div>
        );
      })}
    </>
  );
}

/** Where a value came from, when a part wrote it (§12): its source and date beside the value,
 *  or why it could not be filled. The table row is three cells wide for these rows. */
function FieldOrigin({ origin }: { origin: NonNullable<Provenance["fields"]>[string] }) {
  const when = origin.fetched_at ? dayText(new Date(origin.fetched_at)) : "";
  if (origin.problem) {
    return <td className="origin origin--problem" title={origin.problem}>not filled: {origin.problem}</td>;
  }
  return (
    <td className="origin" title={`${origin.source ?? ""}${when ? ` · ${when}` : ""}`}>
      {origin.source ? `from ${origin.source}` : ""}
      {when ? ` · ${when}` : ""}
      {origin.checked ? <CheckMark checked={origin.checked} /> : null}
    </td>
  );
}

