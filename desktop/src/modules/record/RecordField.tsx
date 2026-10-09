/**
 * One field of a record page, labelled and editable, sized to the answer it expects (the UI
 * rulebook §7 and §15): a short input for a short value, a text area for long text, number, date
 * and date-time inputs, a dropdown for a choice or a status, toggles for several choices, a pill
 * that opens the related record (with a dropdown to point it elsewhere), a file that opens or is
 * shown in Finder. Nothing here writes: it reports the typed value to the page, which holds it
 * until Save (9 Oct, the record pages). An empty value reads "Unknown", never a dash. The marks
 * keep their hover reasons: ≈ the number is Alpha's estimate, ? it rests on an assumption.
 */
import { useEffect, useState } from "react";
import type { Client, DocumentInfo, RecordRow, Relations } from "../../core/client";
import { host } from "../../core/host";
import { Badge, Button, Dropdown, IconButton, type DropdownOption } from "../../ui";
import { Check, FolderOpen, ICON_SM } from "../../ui/icons";
import { coerce, editText, isNumeric, titleFieldOf, type FieldInfo } from "../fields";
import { humanize } from "../format";

export const fieldLabel = (f: FieldInfo) => f.label || humanize(f.name);
export const isEmpty = (v: unknown) => v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);

/** The marks on a number that does not rest on the person's word, with the reason for each. */
export function marks(row: RecordRow | null, field: FieldInfo): { mark: "≈" | "?"; reason: string; label: string }[] {
  if (!row || !isNumeric(field.kind)) return [];
  const p = row.provenance ?? {};
  const out: { mark: "≈" | "?"; reason: string; label: string }[] = [];
  if (p.estimated) out.push({ mark: "≈", label: "estimated", reason: "Estimated by Alpha. Type a value to correct it." });
  if (p.assumed) out.push({ mark: "?", label: "on an assumption", reason: `Alpha assumed ${p.assumed}. Type a value to correct it.` });
  return out;
}

/** What a stored value looks like in a field's input (a date-time input wants no seconds). */
function inputText(value: unknown, field: FieldInfo): string {
  const text = editText(value, field.kind);
  return field.kind === "datetime" ? text.slice(0, 16) : text;
}

function RelationField({ client, field, value, relations, relatedTitle, open, onChange }: { client: Client; field: FieldInfo; value: unknown; relations?: Relations; relatedTitle?: string; open: (() => void) | null; onChange: (v: unknown) => void }) {
  const target = field.relation ?? "";
  const [options, setOptions] = useState<DropdownOption[] | null>(null);
  // What the field can point at: the records of its table, or the people or companies Alpha keeps.
  useEffect(() => {
    let live = true;
    const load = target.startsWith("entity:") || target === "person" || target === "organisation"
      ? client.people().then((all) => all.filter((e) => (target.endsWith("person") ? e.kind === "person" : e.kind !== "person")).map((e) => ({ value: e.id, label: e.name })))
      : client.table(target).then((t) => {
          const title = titleFieldOf(t.table.fields, t.table.title_field);
          return t.records.map((r) => ({ value: r.id, label: String((title && r.values[title]) || r.id) }));
        });
    load.then((o) => live && setOptions(o)).catch(() => live && setOptions([]));
    return () => {
      live = false;
    };
  }, [client, target]);
  const id = isEmpty(value) ? "" : String(value);
  const title = relations?.[field.name]?.[id] ?? relatedTitle ?? id;
  const all = [{ value: "", label: "None" }, ...(options ?? [])];
  if (id && !all.some((o) => o.value === id)) all.push({ value: id, label: title });
  return (
    <div className="recfield__relation">
      {id ? (
        open ? (
          <button type="button" className="linkbtn" onClick={open} title={`Open ${title}`}>
            <Badge tone="info">{title}</Badge>
          </button>
        ) : (
          <Badge tone="info">{title}</Badge>
        )
      ) : (
        <span className="faint">Unknown</span>
      )}
      <Dropdown size="sm" label={`Change ${fieldLabel(field)}`} value={id} onChange={(v) => onChange(v || null)} options={all} placeholder="Change…" />
    </div>
  );
}

/** A file field holds a document's id: show its name, open it with the Mac's own app, or show it
 *  in Finder. Attaching one writes at once on the core's side, so it is not offered on a page
 *  that writes only on Save (disabled, with the next step). */
function FileField({ client, id }: { client: Client; id: string }) {
  const [doc, setDoc] = useState<DocumentInfo | null>(null);
  useEffect(() => {
    let live = true;
    if (id) client.document(id).then((d) => live && setDoc(d)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [client, id]);
  if (!id) return <Button size="sm" disabledReason="A page writes only on Save, and attaching a file writes at once. Drop the file on the collection, or ask Alpha to attach it.">Add file</Button>;
  if (!doc) return <span className="faint">{id}</span>;
  return (
    <span className="row">
      <button type="button" className="linkbtn" title={host.available() ? "Open" : doc.path} onClick={() => void host.openPath(doc.path)}>
        {doc.title}
      </button>
      {host.available() ? <IconButton size="sm" label="Show in Finder" icon={<FolderOpen />} onClick={() => void host.revealPath(doc.path)} /> : null}
    </span>
  );
}

export function RecordField({ client, field, value, row, relations, relatedTitle, open, error, onChange }: { client: Client; field: FieldInfo; value: unknown; row: RecordRow | null; relations?: Relations; relatedTitle?: string; open: (() => void) | null; error?: string; onChange: (value: unknown) => void }) {
  const label = fieldLabel(field);
  const inputId = `recfield-${field.name}`;
  const kind = field.kind;
  const short = kind === "number" || kind === "date" || kind === "datetime" || kind === "bool" || kind === "choice" || kind === "status";
  const choices = field.choices ?? [];
  const text = (type: string) => (
    <input id={inputId} className="textfield" type={type} step={kind === "number" ? "any" : undefined} value={inputText(value, field)} placeholder="Unknown" aria-invalid={error ? true : undefined} onChange={(e) => onChange(coerce(e.target.value, kind))} />
  );
  let control;
  if (kind === "long_text") {
    control = <textarea id={inputId} className="textfield" rows={4} value={inputText(value, field)} placeholder="Unknown" aria-invalid={error ? true : undefined} onChange={(e) => onChange(coerce(e.target.value, kind))} />;
  } else if (kind === "choice" || kind === "status") {
    control = <Dropdown id={inputId} label={label} value={isEmpty(value) ? "" : String(value)} onChange={(v) => onChange(v || null)} placeholder="Unknown" options={[{ value: "", label: "Unknown" }, ...choices.map((c) => ({ value: c, label: humanize(c) }))]} />;
  } else if (kind === "bool") {
    control = <Dropdown id={inputId} label={label} value={isEmpty(value) ? "" : value ? "true" : "false"} onChange={(v) => onChange(v === "" ? null : v === "true")} placeholder="Unknown" options={[{ value: "", label: "Unknown" }, { value: "true", label: "Yes" }, { value: "false", label: "No" }]} />;
  } else if (kind === "multichoice") {
    const chosen = Array.isArray(value) ? (value as unknown[]).map(String) : [];
    control = (
      <div className="row" role="group" aria-label={label}>
        {choices.map((c) => {
          const on = chosen.includes(c);
          const next = on ? chosen.filter((x) => x !== c) : [...chosen, c];
          return (
            <Button key={c} size="sm" aria-pressed={on} icon={on ? <Check size={ICON_SM} /> : undefined} onClick={() => onChange(next.length ? next : null)}>
              {humanize(c)}
            </Button>
          );
        })}
        {choices.length === 0 ? <span className="faint">Unknown</span> : null}
      </div>
    );
  } else if (kind === "relation") {
    control = <RelationField client={client} field={field} value={value} relations={relations} relatedTitle={relatedTitle} open={open} onChange={onChange} />;
  } else if (kind === "file") {
    control = <FileField client={client} id={isEmpty(value) ? "" : String(value)} />;
  } else {
    control = text(kind === "number" ? "number" : kind === "date" ? "date" : kind === "datetime" ? "datetime-local" : kind === "url" ? "url" : "text");
  }
  return (
    <div className={`recfield${short ? " recfield--short" : ""}${error ? " recfield--bad" : ""}`}>
      <label className="recfield__label" htmlFor={inputId}>
        {label}
        {field.unit ? <span className="faint"> ({field.unit})</span> : null}
        {field.required ? <span className="faint"> · required</span> : null}
        {marks(row, field).map((m) => (
          <span key={m.mark} className="est" title={m.reason} aria-label={m.label}>
            {m.mark}
          </span>
        ))}
      </label>
      {control}
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
