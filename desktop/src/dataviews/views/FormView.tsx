/** The form: one new row at a time, every field on it, and the record page uses the same one. */
import { useState, type FormEvent } from "react";
import { Button } from "../../ui/Button";
import { inputType, type FieldInfo } from "../../modules/fields";
import { humanize } from "../../modules/format";
import { fieldLabel, fromText, type Relations } from "../cells";
import type { ViewProps } from "../types";

export function NewRecordForm({ fields, relations, onAdd, onCancel, initial = {} }: { fields: FieldInfo[]; relations: Relations; onAdd: (values: Record<string, unknown>) => Promise<boolean>; onCancel?: () => void; initial?: Record<string, string> }) {
  const [draft, setDraft] = useState<Record<string, string>>(initial);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(0);
  const set = (name: string, value: string) => setDraft((d) => ({ ...d, [name]: value }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    const values: Record<string, unknown> = {};
    for (const f of fields) {
      const text = draft[f.name] ?? "";
      if (f.kind === "multichoice") {
        const parts = text.split(",").filter(Boolean);
        if (parts.length) values[f.name] = parts;
      } else if (text !== "") values[f.name] = fromText(text, f);
    }
    setBusy(true);
    const ok = await onAdd(values);
    setBusy(false);
    if (ok) {
      setDraft(initial);
      setAdded((n) => n + 1);
    }
  }
  return (
    <form className="dv-form" onSubmit={submit}>
      {fields.map((f, i) => {
        const id = `dv-new-${f.name}`;
        const value = draft[f.name] ?? "";
        return (
          <div key={f.name} className="dv-form__field">
            <label htmlFor={id}>
              {fieldLabel(f)}
              {f.required ? <span aria-label="required"> *</span> : null}
            </label>
            {f.kind === "choice" || f.kind === "status" ? (
              <select id={id} className="dv-select" value={value} onChange={(e) => set(f.name, e.target.value)}>
                <option value="">Choose…</option>
                {(f.choices ?? []).map((c) => (
                  <option key={c} value={c}>
                    {humanize(c)}
                  </option>
                ))}
              </select>
            ) : f.kind === "multichoice" ? (
              <span id={id} className="dv-form__choices" role="group" aria-label={fieldLabel(f)}>
                {(f.choices ?? []).map((c) => {
                  const on = value.split(",").includes(c);
                  return (
                    <label key={c} className="dv-inline">
                      <input type="checkbox" className="dv-check" checked={on} onChange={(e) => set(f.name, (e.target.checked ? [...value.split(","), c] : value.split(",").filter((x) => x !== c)).filter(Boolean).join(","))} />
                      {humanize(c)}
                    </label>
                  );
                })}
              </span>
            ) : f.kind === "bool" ? (
              <input id={id} type="checkbox" className="dv-check" checked={value === "true"} onChange={(e) => set(f.name, e.target.checked ? "true" : "false")} />
            ) : f.kind === "long_text" ? (
              <textarea id={id} className="dv-select dv-input" rows={3} value={value} onChange={(e) => set(f.name, e.target.value)} />
            ) : (
              <>
                <input
                  id={id}
                  autoFocus={i === 0}
                  className="dv-select dv-input"
                  type={inputType(f.kind)}
                  step={f.kind === "number" ? "any" : undefined}
                  list={f.kind === "relation" ? `${id}-list` : undefined}
                  value={f.kind === "relation" ? (relations.options(f).find((o) => o.value === value)?.label ?? value) : value}
                  required={f.required}
                  onChange={(e) => set(f.name, f.kind === "relation" ? (relations.options(f).find((o) => o.label === e.target.value)?.value ?? e.target.value) : e.target.value)}
                />
                {f.kind === "relation" ? (
                  <datalist id={`${id}-list`}>
                    {relations.options(f).map((o) => (
                      <option key={o.value} value={o.label} />
                    ))}
                  </datalist>
                ) : null}
              </>
            )}
          </div>
        );
      })}
      <div className="dv-form__actions">
        <Button type="submit" size="sm" disabled={busy}>
          Add row
        </Button>
        {onCancel ? (
          <Button size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
        {added ? <span className="dv-faint">Added {added === 1 ? "one row" : `${added} rows`}</span> : null}
      </div>
    </form>
  );
}

export function FormView(p: ViewProps) {
  return (
    <div className="dv-formview">
      <NewRecordForm fields={p.allFields} relations={p.relations} onAdd={p.onAdd} />
    </div>
  );
}
