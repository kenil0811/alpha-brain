/** A record's fields, each editable in place, the long texts under, when it was added and last
 *  changed: the form view's body. (Records open as pages of their own now, 9 Oct, the UI
 *  rulebook §7; the side drawer and the peeks are gone, R12.) Dates read the near way ("3 min
 *  ago", "14:32") with the exact one on hover (rule 16). */
import type { FileInfo, Provenance, RecordRow, Relations } from "../../core/client";
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
          {shown.map((f) => {
            const origin = row.provenance.fields?.[f.name];
            return (
              <tr key={f.name}>
                <th scope="row">{humanize(f.name)}</th>
                <Cell row={row} field={f} onCommit={(text) => onCommit(f, text)} relations={relations} onOpenRelated={onOpenRelated} files={files} />
                {origin ? <FieldOrigin origin={origin} /> : null}
              </tr>
            );
          })}
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
      {long.map((f) => {
        const origin = row.provenance.fields?.[f.name];
        return (
          <div key={f.name} className="drawer__long">
            <h4>
              {humanize(f.name)}
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

/** Where a value came from, when a part wrote it (main's §12): its source and date beside the
 *  value, or why it could not be filled. The row is three cells wide for these. */
function FieldOrigin({ origin }: { origin: NonNullable<Provenance["fields"]>[string] }) {
  const when = origin.fetched_at ? new Date(origin.fetched_at).toLocaleDateString(undefined, { day: "numeric", month: "short" }) : "";
  if (origin.problem) {
    return <td className="origin origin--problem" title={origin.problem}>not filled: {origin.problem}</td>;
  }
  return (
    <td className="origin" title={`${origin.source ?? ""}${when ? ` · ${when}` : ""}`}>
      {origin.source ? `from ${origin.source}` : ""}
      {when ? ` · ${when}` : ""}
    </td>
  );
}
