/** The form that adds one row by hand, one field at a time; the first field takes focus. A file
 *  field takes a file before the row exists (slice 2 B6): the page saves the row, then attaches
 *  the file to it. */
import { type FormEvent, useEffect, useRef, useState } from "react";
import { coerce, fieldLabel, inputType, type FieldInfo } from "../fields";
import { humanize } from "../format";
import { Button } from "../../ui";

export function AddRow({ fields, collection, onAdd, onDone }: { fields: FieldInfo[]; collection: string; onAdd: (values: Record<string, unknown>, files: Record<string, File>) => Promise<boolean>; onDone: () => void }) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, File>>({});
  const [busy, setBusy] = useState(false);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => first.current?.focus(), []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    const values: Record<string, unknown> = {};
    for (const f of fields) {
      if (f.kind === "file") continue; // attached once the row exists
      const text = draft[f.name] ?? "";
      if (f.kind === "bool") values[f.name] = text === "true";
      else if (text.trim() !== "") values[f.name] = coerce(text, f.kind);
    }
    setBusy(true);
    const ok = await onAdd(values, files);
    setBusy(false);
    if (ok) {
      setDraft({});
      setFiles({});
      onDone();
    }
  }
  const set = (name: string, value: string) => setDraft((d) => ({ ...d, [name]: value }));
  return (
    <form className="addrow" onSubmit={submit} aria-label={`Add to ${humanize(collection)}`}>
      {fields.map((f, i) => {
        const id = `add-${collection}-${f.name}`;
        const label = `${fieldLabel(f)}${f.required ? "" : " (optional)"}`;
        return (
          <div key={f.name} className="field field--compact">
            <label htmlFor={id}>{label}</label>
            {f.kind === "choice" || f.kind === "status" ? (
              <select id={id} value={draft[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)}>
                <option value="">Choose…</option>
                {(f.choices ?? []).map((c) => (
                  <option key={c} value={c}>
                    {humanize(c)}
                  </option>
                ))}
              </select>
            ) : f.kind === "bool" ? (
              <select id={id} value={draft[f.name] ?? "false"} onChange={(e) => set(f.name, e.target.value)}>
                <option value="false">No</option>
                <option value="true">Yes</option>
              </select>
            ) : f.kind === "file" ? (
              <input id={id} type="file" onChange={(e) => { const file = e.target.files?.[0]; setFiles((all) => { const next = { ...all }; if (file) next[f.name] = file; else delete next[f.name]; return next; }); }} />
            ) : f.kind === "long_text" ? (
              <textarea id={id} rows={3} value={draft[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)} />
            ) : (
              <input ref={i === 0 ? first : undefined} id={id} type={inputType(f.kind)} step={f.kind === "number" ? "any" : undefined} value={draft[f.name] ?? ""} onChange={(e) => set(f.name, e.target.value)} placeholder={f.kind === "multichoice" ? (f.choices ?? []).join(", ") : undefined} />
            )}
          </div>
        );
      })}
      <div className="row">
        <Button size="sm" variant="primary" type="submit" disabled={busy}>
          Add
        </Button>
        <Button size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

