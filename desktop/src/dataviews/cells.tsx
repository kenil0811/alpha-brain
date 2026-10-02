/**
 * How one value looks and how it is edited, for every field kind, in every view: a cell in the
 * table, a property on a card, a field on the record page. Relation values are resolved to the
 * record or person they name and shown as links that open it.
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Check } from "lucide-react";
import type { Client, RecordRow } from "../core/client";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from "../ui/DropdownMenu";
import { editText, inputType, isNumeric, showValue, titleFieldOf, type FieldInfo } from "../modules/fields";
import { humanize } from "../modules/format";

export const fieldLabel = (f: FieldInfo) => f.label ?? humanize(f.name);

// ---------- relations ----------

export interface Link {
  kind: "record" | "entity";
  id: string;
  label: string;
  /** For a record: the table it lives in. */
  table?: string;
}

export interface Relations {
  resolve: (field: FieldInfo, value: unknown) => Link | null;
  options: (field: FieldInfo) => { value: string; label: string }[];
  /** A related table's records, for the record page of a linked row. */
  tableOf: (name: string) => { fields: FieldInfo[]; title: string; title_field: string | null; records: RecordRow[] } | undefined;
}

type Target = { links: Link[]; byKey: Map<string, Link>; table?: { fields: FieldInfo[]; title: string; title_field: string | null; records: RecordRow[] } };

/** Loads what each relation field points at once per table load, then resolves values by id
 * or, failing that, by name. */
export function useRelations(client: Client, fields: FieldInfo[], version: number): Relations {
  const targets = useMemo(() => [...new Set(fields.filter((f) => f.kind === "relation" && f.relation).map((f) => f.relation!))], [fields]);
  const [loaded, setLoaded] = useState<Record<string, Target>>({});
  useEffect(() => {
    let live = true;
    void Promise.all(
      targets.map(async (target): Promise<[string, Target]> => {
        const index = (links: Link[]): Map<string, Link> => {
          const byKey = new Map<string, Link>();
          for (const l of links) {
            byKey.set(l.id, l);
            if (!byKey.has(l.label.toLowerCase())) byKey.set(l.label.toLowerCase(), l);
          }
          return byKey;
        };
        try {
          if (target.startsWith("entity:")) {
            const kind = target.slice(7);
            const people = await client.people();
            const links = people.filter((e) => !kind || e.kind === kind).map((e): Link => ({ kind: "entity", id: e.id, label: e.name }));
            return [target, { links, byKey: index(links) }];
          }
          const data = await client.table(target);
          const title = titleFieldOf(data.table.fields, data.table.title_field);
          const links = data.records.map((r): Link => ({ kind: "record", id: r.id, label: String((title && r.values[title]) ?? r.id), table: target }));
          return [target, { links, byKey: index(links), table: { fields: data.table.fields, title: data.table.title, title_field: data.table.title_field, records: data.records } }];
        } catch {
          return [target, { links: [], byKey: new Map() }];
        }
      }),
    ).then((entries) => {
      if (live) setLoaded(Object.fromEntries(entries));
    });
    return () => {
      live = false;
    };
  }, [client, targets, version]);
  return useMemo(
    () => ({
      resolve: (field, value) => {
        if (value === null || value === undefined || value === "" || !field.relation) return null;
        const t = loaded[field.relation];
        const text = String(value);
        return t?.byKey.get(text) ?? t?.byKey.get(text.toLowerCase()) ?? null;
      },
      options: (field) => (field.relation ? (loaded[field.relation]?.links ?? []).map((l) => ({ value: l.id, label: l.label })) : []),
      tableOf: (name) => loaded[name]?.table,
    }),
    [loaded],
  );
}

// ---------- showing ----------

export function CellValue({ field, value, row, relations, onOpenLink }: { field: FieldInfo; value: unknown; row?: RecordRow; relations?: Relations; onOpenLink?: (link: Link) => void }) {
  if (value === null || value === undefined || value === "" || (Array.isArray(value) && !value.length)) {
    return field.kind === "bool" ? <span className="dv-faint">No</span> : <span className="dv-faint">—</span>;
  }
  if (field.kind === "relation") {
    const link = relations?.resolve(field, value);
    if (!link) return <span className="dv-pill">{String(value)}</span>;
    return (
      <button
        type="button"
        className="dv-pill dv-pill--link"
        title={`Open ${link.label}`}
        onClick={(e) => {
          e.stopPropagation();
          onOpenLink?.(link);
        }}
      >
        {link.label}
      </button>
    );
  }
  if (field.kind === "url")
    return (
      <a href={String(value)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
        {showValue(value, field.kind)}
      </a>
    );
  if (field.kind === "bool") return value ? <Check size={14} aria-label="Yes" className="dv-yes" /> : <span className="dv-faint">No</span>;
  if (field.kind === "status" || field.kind === "choice") {
    const done = field.done_choices?.includes(String(value));
    return <span className={`dv-pill${done ? " dv-pill--good" : ""}`}>{humanize(String(value))}</span>;
  }
  if (field.kind === "multichoice" && Array.isArray(value))
    return (
      <span className="dv-pills">
        {value.map((v) => (
          <span key={String(v)} className="dv-pill">
            {humanize(String(v))}
          </span>
        ))}
      </span>
    );
  // An estimate is marked per field when the core names the fields, else on a row's numbers.
  const est = row?.provenance?.estimated;
  const estimated = Array.isArray(est) ? est.includes(field.name) : Boolean(est) && isNumeric(field.kind);
  return (
    <>
      {showValue(value, field.kind, field.unit)}
      {estimated ? (
        <span className="dv-est" title="An estimate. Click the cell to correct it." aria-label="estimate">
          ≈
        </span>
      ) : null}
    </>
  );
}

// ---------- editing ----------

/** Typed text back into a stored value. Empty clears the field. */
export function fromText(text: string, field: FieldInfo): unknown {
  if (text.trim() === "") return null;
  if (isNumeric(field.kind)) {
    const n = Number(text);
    return Number.isFinite(n) ? n : text;
  }
  if (field.kind === "bool") return text === "true";
  if (field.kind === "datetime") return text.length === 16 ? `${text}:00` : text;
  return text;
}

/** The editor for one value. `onDone(value)` saves; `onDone(undefined)` cancels. Enter saves,
 * Escape cancels, leaving the field saves. */
export function CellEditor({ field, value, relations, onDone, autoFocus = true }: { field: FieldInfo; value: unknown; relations?: Relations; onDone: (value: unknown) => void; autoFocus?: boolean }) {
  const start = field.kind === "datetime" && typeof value === "string" ? value.slice(0, 16) : editText(value, field.kind);
  const [text, setText] = useState(start);
  const done = useRef(false);
  const finish = (save: boolean, next = text) => {
    if (done.current) return;
    done.current = true;
    onDone(save ? fromText(next, field) : undefined);
  };
  const key = (e: KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter" && !(field.kind === "long_text" && e.shiftKey)) {
      e.preventDefault();
      finish(true);
    }
    if (e.key === "Escape") finish(false);
  };
  const label = fieldLabel(field);
  if (field.kind === "choice" || field.kind === "status") {
    return (
      <select className="dv-editor" autoFocus={autoFocus} value={text} aria-label={label} onChange={(e) => finish(true, e.target.value)} onBlur={() => finish(false)} onKeyDown={key}>
        <option value="">—</option>
        {(field.choices ?? []).map((c) => (
          <option key={c} value={c}>
            {humanize(c)}
          </option>
        ))}
      </select>
    );
  }
  if (field.kind === "multichoice") return <MultiEditor field={field} value={value} onDone={onDone} />;
  if (field.kind === "long_text")
    return <textarea className="dv-editor" autoFocus={autoFocus} rows={4} value={text} aria-label={label} onChange={(e) => setText(e.target.value)} onBlur={() => finish(true)} onKeyDown={key} />;
  const listId = field.kind === "relation" ? `dv-rel-${field.name}` : undefined;
  const options = field.kind === "relation" ? (relations?.options(field) ?? []) : [];
  return (
    <>
      <input
        className="dv-editor"
        autoFocus={autoFocus}
        type={inputType(field.kind)}
        step={field.kind === "number" ? "any" : undefined}
        list={listId}
        value={field.kind === "relation" ? (options.find((o) => o.value === text)?.label ?? text) : text}
        aria-label={label}
        onChange={(e) => setText(field.kind === "relation" ? (options.find((o) => o.label === e.target.value)?.value ?? e.target.value) : e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        onBlur={() => finish(true)}
        onKeyDown={key}
      />
      {listId ? (
        <datalist id={listId}>
          {options.map((o) => (
            <option key={o.value} value={o.label} />
          ))}
        </datalist>
      ) : null}
    </>
  );
}

function MultiEditor({ field, value, onDone }: { field: FieldInfo; value: unknown; onDone: (value: unknown) => void }) {
  const [picked, setPicked] = useState<string[]>(Array.isArray(value) ? value.map(String) : []);
  return (
    <DropdownMenu defaultOpen onOpenChange={(open) => !open && onDone(picked.length ? picked : null)}>
      <DropdownMenuTrigger asChild>
        <button type="button" className="dv-editor dv-editor--multi" aria-label={fieldLabel(field)}>
          {picked.map(humanize).join(", ") || "—"}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {(field.choices ?? []).map((c) => (
          <DropdownMenuCheckboxItem key={c} checked={picked.includes(c)} onSelect={(e) => e.preventDefault()} onCheckedChange={(on) => setPicked((p) => (on ? [...p, c] : p.filter((x) => x !== c)))}>
            <span className="dv-menu__mark">{picked.includes(c) ? <Check size={12} /> : null}</span>
            {humanize(c)}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A field that shows its value and turns into its editor on click: the record page, cards. */
export function EditInPlace({ field, value, row, relations, onCommit, onOpenLink }: { field: FieldInfo; value: unknown; row?: RecordRow; relations?: Relations; onCommit: (value: unknown) => void; onOpenLink?: (link: Link) => void }) {
  const [editing, setEditing] = useState(false);
  if (field.kind === "bool") {
    return (
      <input type="checkbox" className="dv-check" checked={Boolean(value)} aria-label={fieldLabel(field)} onChange={(e) => onCommit(e.target.checked)} onClick={(e) => e.stopPropagation()} />
    );
  }
  if (editing)
    return (
      <CellEditor
        field={field}
        value={value}
        relations={relations}
        onDone={(next) => {
          setEditing(false);
          if (next !== undefined && JSON.stringify(next ?? null) !== JSON.stringify(value ?? null)) onCommit(next);
        }}
      />
    );
  return (
    <div className={`dv-inplace${field.kind === "long_text" ? " dv-inplace--long" : ""}`} role="button" tabIndex={0} title="Click to edit" onClick={() => setEditing(true)} onKeyDown={(e) => e.key === "Enter" && setEditing(true)}>
      {field.kind === "long_text" && (value === null || value === undefined || value === "") ? <span className="dv-faint">Nothing yet. Click to write.</span> : <CellValue field={field} value={value} row={row} relations={relations} onOpenLink={onOpenLink} />}
    </div>
  );
}
