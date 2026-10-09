/**
 * One cell of a record, in every view: shown as words with its provenance marks (quiet grey
 * "Estimated" or "Assumed" chips that say why on hover or focus, rulebook §6), or being edited in
 * place. A file cell opens or reveals the document.
 */
import { type KeyboardEvent, type ReactNode, type TdHTMLAttributes, useRef, useState } from "react";
import type { FileInfo, RecordRow, Relations } from "../../core/client";
import { host } from "../../core/host";
import { editText, inputType, isNumeric, showValue, type FieldInfo } from "../fields";
import { dayText, humanize } from "../format";
import { Badge, Dropdown, IconButton, Tooltip } from "../../ui";
import { Check, FolderOpen, ICON_SM, Pencil } from "../../ui/icons";

/** When a reader-fed row came and went, as dates: "New · 9 Oct" (first seen today), "Since 2 Oct",
 *  "Gone 5 Oct" (absolute, 9 Oct, the UI rulebook §2). */
export function SeenCell({ row }: { row: RecordRow }) {
  const day = (iso: string) => dayText(new Date(iso));
  const today = new Date().toDateString();
  if (row.gone_at) return <td><Badge tone="gray">Gone {day(row.gone_at)}</Badge></td>;
  if (new Date(row.created_at).toDateString() === today) return <td><Badge tone="good">New · {day(row.created_at)}</Badge></td>;
  return <td className="faint">Since {day(row.created_at)}</td>;
}

/** A link to another table's record (its title, from the table's `relations`), or to a person
 *  or a company: a pill that opens it, with a way back (the drawer's stack). */
/** What every kind of cell takes from the table around it: a frozen column's place, the menu
 *  that opens on a right-click or a menu key, and so on. Spread onto the `<td>`. */
export type TdProps = TdHTMLAttributes<HTMLTableCellElement>;

export function RelationCell({ row, field, relations, onOpenRelated, tdProps, adornment }: { row: RecordRow; field: FieldInfo; relations?: Relations; onOpenRelated?: (collection: string, id: string) => void; tdProps?: TdProps; adornment?: ReactNode }) {
  const value = row.values[field.name];
  if (!value) return <td {...tdProps}>{adornment}<span className="faint">—</span></td>;
  const id = String(value);
  const title = relations?.[field.name]?.[id] ?? id;
  const target = field.relation;
  const opens = Boolean(onOpenRelated && target && target !== "person" && target !== "organisation");
  return (
    <td {...tdProps}>
      {adornment}
      {opens ? (
        <button type="button" className="linkbtn" onClick={(e) => { e.stopPropagation(); onOpenRelated!(target!, id); }} title={`Open ${title}`}>
          <Badge tone="info">{title}</Badge>
        </button>
      ) : (
        <Badge tone="info">{title}</Badge>
      )}
    </td>
  );
}

/** The editor in a cell: a box the right size for the kind, saved when the person clicks away
 *  or presses Enter, dropped on Escape. A choice is saved the moment it is picked. It asks only
 *  once (`done`), because a removed input may still blur. */
function CellEditor({ field, value, onDone }: { field: FieldInfo; value: unknown; onDone: (text: string | null) => void }) {
  const [text, setText] = useState(() => editText(value, field.kind));
  const done = useRef(false);
  const finish = (next: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(next);
  };
  const label = humanize(field.name);
  const key = (e: KeyboardEvent) => {
    e.stopPropagation(); // the row and the page behind must not hear it
    if (e.key === "Enter" && field.kind !== "long_text") finish(text);
    if (e.key === "Escape") finish(null);
  };
  if (field.kind === "choice" || field.kind === "status") {
    return <Dropdown defaultOpen size="sm" label={label} value={text} onChange={(v) => finish(v)} onOpenChange={(o) => !o && finish(null)} placeholder="—" options={[{ value: "", label: "—" }, ...(field.choices ?? []).map((c) => ({ value: c, label: humanize(c) }))]} />;
  }
  if (field.kind === "bool") {
    return <Dropdown defaultOpen size="sm" label={label} value={text || "false"} onChange={(v) => finish(v)} onOpenChange={(o) => !o && finish(null)} options={[{ value: "false", label: "No" }, { value: "true", label: "Yes" }]} />;
  }
  if (field.kind === "long_text") {
    return <textarea autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => finish(text)} onKeyDown={key} aria-label={label} />;
  }
  return <input autoFocus type={inputType(field.kind)} step={field.kind === "number" ? "any" : undefined} value={text} onChange={(e) => setText(e.target.value)} onFocus={(e) => e.currentTarget.select()} onBlur={() => finish(text)} onKeyDown={key} aria-label={label} placeholder={field.kind === "multichoice" ? (field.choices ?? []).join(", ") : undefined} />;
}

/** Whether a cell can be edited in place: relations and files change another way. */
export function cellEditable(field: FieldInfo): boolean {
  return field.kind !== "relation" && field.kind !== "file";
}

/**
 * One cell, in every view. A double-click edits it, or the pencil that shows at its right edge on
 * hover and keyboard focus (clicking away saves, Escape cancels; Enter or F2 starts from the
 * keyboard). `editing` and `onEditing` let the table start an edit from a
 * menu; without them the cell keeps its own state (the form view's). `tdProps` carries what the
 * table puts on every cell (its context menu, a frozen column's place); `adornment` is a small
 * mark before the value (the pin).
 */
export function Cell({ row, field, onCommit, files, onFile, relations, onOpenRelated, editing: editingProp, onEditing, tdProps, adornment, locked }: { row: RecordRow; field: FieldInfo; onCommit: (text: string) => void; files?: Record<string, FileInfo>; onFile?: (file: File) => void; relations?: Relations; onOpenRelated?: (collection: string, id: string) => void; editing?: boolean; onEditing?: (on: boolean) => void; tdProps?: TdProps; adornment?: ReactNode; /** Why this cell can't change, if it can't: shown on hover, and it never opens for editing. */ locked?: string | null }) {
  const [own, setOwn] = useState(false);
  const editing = editingProp ?? own;
  const setEditing = onEditing ?? setOwn;
  if (field.kind === "relation") return <RelationCell row={row} field={field} relations={relations} onOpenRelated={onOpenRelated} tdProps={tdProps} adornment={adornment} />;
  if (field.kind === "file") return <FileCell row={row} field={field} files={files ?? {}} onFile={onFile} tdProps={tdProps} adornment={adornment} />;
  const value = row.values[field.name];
  const numeric = isNumeric(field.kind);
  const estimate = Boolean(row.provenance?.estimated) && numeric;
  const assumed = row.provenance?.assumed;
  const source = row.provenance?.source;
  const lookedUp = numeric && Boolean(source) && source !== "stated" && source !== "estimated";
  const rests = [estimate ? "Estimated by Alpha." : lookedUp ? `From ${source}.` : "", assumed ? `Alpha assumed ${assumed}.` : ""].filter(Boolean).join(" ");
  const base = [tdProps?.className, numeric ? "r num" : ""].filter(Boolean).join(" ") || undefined;
  if (editing && !locked) {
    return (
      <td {...tdProps} className={base} onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
        <CellEditor
          field={field}
          value={value}
          onDone={(text) => {
            setEditing(false);
            if (text !== null) onCommit(text);
          }}
        />
      </td>
    );
  }
  const begin = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    if (!locked) setEditing(true);
  };
  const words = showValue(value, field.kind, field.unit);
  // A click opens the record; a double-click, Enter or F2 edits the cell (the convention from
  // pull request #3: scanning by click, editing on purpose).
  return (
    <td
      {...tdProps}
      className={`${base ?? ""}${locked ? "" : " editable"}`.trim()}
      onDoubleClick={begin}
      tabIndex={0}
      onKeyDown={(e) => {
        tdProps?.onKeyDown?.(e);
        if (e.defaultPrevented || e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === "F2") {
          e.preventDefault();
          begin(e);
        }
      }}
      title={locked ?? (rests ? `${rests} Double-click to correct it.` : "Double-click to edit")}
    >
      {adornment}
      {words === "" ? <span className="faint">—</span> : field.kind === "url" ? <a href={String(value)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{words}</a> : field.kind === "status" || field.kind === "choice" ? <Badge tone={field.done_choices?.includes(String(value)) ? "good" : "gray"}>{words}</Badge> : field.kind === "bool" ? (value ? <Check size={ICON_SM} aria-label="Yes" /> : <span className="faint">—</span>) : words}
      {estimate || (assumed && numeric) ? (
        <Tooltip text={`${rests} Double-click the cell to correct it.`}>
          <Badge tone="gray" className="provchip" tabIndex={0} aria-label={`${estimate ? "Estimated" : "Assumed"}: ${rests}`}>
            {estimate ? "Estimated" : "Assumed"}
          </Badge>
        </Tooltip>
      ) : null}
      {locked ? null : <IconButton size="sm" className="cellpen" tabIndex={-1} label={`Edit ${field.label ?? humanize(field.name)}`} icon={<Pencil size={ICON_SM} />} onClick={begin} onDoubleClick={(e) => e.stopPropagation()} />}
    </td>
  );
}

/** A file field: the document's name, opened with the Mac's own app, or a way to add one. */
export function FileCell({ row, field, files, onFile, tdProps, adornment }: { row: RecordRow; field: FieldInfo; files: Record<string, FileInfo>; onFile?: (file: File) => void; tdProps?: TdProps; adornment?: ReactNode }) {
  const id = row.values[field.name] ? String(row.values[field.name]) : "";
  const info = id ? files[id] : undefined;
  if (info) {
    return (
      <td {...tdProps} onClick={(e) => e.stopPropagation()}>
        {adornment}
        <button type="button" className="linkbtn" title={host.available() ? "Open" : info.path} onClick={() => void host.openPath(info.path)}>
          {info.name}
        </button>
        <span className="faint"> · {formatBytes(info.size)}</span>
        {host.available() ? (
          <IconButton label="Show in Finder" icon={<FolderOpen />} onClick={() => void host.revealPath(info.path)} />
        ) : null}
      </td>
    );
  }
  return (
    <td {...tdProps} onClick={(e) => e.stopPropagation()}>
      {adornment}
      {onFile ? (
        <label className="linkbtn faint">
          {id ? "File missing · " : ""}Upload
          <input type="file" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
        </label>
      ) : (
        <span className="faint">—</span>
      )}
    </td>
  );
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}


export function LongText({ value, onCommit }: { value: unknown; onCommit: (text: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  if (editing) {
    return (
      <textarea autoFocus rows={6} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => { setEditing(false); onCommit(text); }} aria-label="Edit text" />
    );
  }
  return (
    <p className="editable" onClick={() => { setText(value ? String(value) : ""); setEditing(true); }} title="Click to edit">
      {value ? String(value) : <span className="faint">Nothing yet. Click to write.</span>}
    </p>
  );
}
