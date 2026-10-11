/** One record, opened beside the view: every field editable in place, the long texts under,
 *  when it was added and last changed, Remove. A relation in it opens the related record in
 *  the same drawer, on a stack: Back returns to where the person came from. The fields alone
 *  (`RecordFields`) are also the form view's body. */
import type { Provenance, RecordRow, Relations } from "../../core/client";
import type { FieldInfo } from "../fields";
import { humanize } from "../format";
import { useState } from "react";
import { Button, Confirm, IconButton } from "../../ui";
import { ArrowLeft, X } from "../../ui/icons";
import { Cell, LongText } from "./cells";

export function RecordFields({ row, fields, titleField, relations, onCommit, onOpenRelated }: { row: RecordRow; fields: FieldInfo[]; titleField: string | undefined; relations?: Relations; onCommit: (field: FieldInfo, text: string) => void; onOpenRelated?: (collection: string, id: string) => void }) {
  const long = fields.filter((f) => f.kind === "long_text");
  const shown = fields.filter((f) => f.name !== titleField && f.kind !== "long_text");
  const when = (iso: string) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "");
  return (
    <>
      <table className="table table--kv">
        <tbody>
          {shown.map((f) => {
            const origin = row.provenance.fields?.[f.name];
            return (
              <tr key={f.name}>
                <th scope="row">{humanize(f.name)}</th>
                <Cell row={row} field={f} onCommit={(text) => onCommit(f, text)} relations={relations} onOpenRelated={onOpenRelated} />
                {origin ? <FieldOrigin origin={origin} /> : null}
              </tr>
            );
          })}
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

/** Where a value came from, when a part wrote it (§12): its source and date beside the value,
 *  or why it could not be filled. The table row is three cells wide for these rows. */
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

export function RecordPanel({ row, fields, titleField, relations, tableTitle, onClose, onCommit, onRemove, onOpenRelated, back }: { row: RecordRow; fields: FieldInfo[]; titleField: string | undefined; relations?: Relations; tableTitle?: string; onClose: () => void; onCommit: (field: FieldInfo, text: string) => void; onRemove?: () => void; onOpenRelated?: (collection: string, id: string) => void; back?: { to: string; onBack: () => void } }) {
  const title = titleField ? String(row.values[titleField] ?? "") : "";
  const [asking, setAsking] = useState(false);
  return (
    <section className="drawer" aria-label={title || "Details"}>
      <Confirm open={asking} title={`Remove ${title || "this row"}?`} action="Remove it" onConfirm={() => { setAsking(false); onRemove?.(); }} onCancel={() => setAsking(false)}>
        It leaves the table; Activity keeps that it was here.
      </Confirm>
      <div className="drawer__head">
        {back ? <IconButton size="sm" label={`Back to ${back.to}`} icon={<ArrowLeft />} onClick={back.onBack} /> : null}
        <div className="drawer__title">
          <h3>{title || "Details"}</h3>
          {tableTitle ? <span className="faint">{tableTitle}</span> : null}
        </div>
        <span className="spacer" />
        {onRemove ? (
          <Button size="sm" variant="danger" onClick={() => setAsking(true)}>
            Remove
          </Button>
        ) : null}
        <IconButton size="sm" label="Close details" icon={<X />} onClick={onClose} />
      </div>
      <RecordFields row={row} fields={fields} titleField={titleField} relations={relations} onCommit={onCommit} onOpenRelated={onOpenRelated} />
    </section>
  );
}
