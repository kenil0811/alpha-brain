/**
 * One cell of a record, in every view: shown as words with its provenance marks (≈ estimated,
 * ? on an assumption), or being edited in place. A file cell opens or reveals the document.
 */
import { type KeyboardEvent, type MouseEvent, useState } from "react";
import type { FileInfo, RecordRow, Relations } from "../../core/client";
import { host } from "../../core/host";
import { editText, inputType, isNumeric, showValue, type FieldInfo } from "../fields";
import { humanize } from "../format";
import { pressed } from "../../shell/shortcuts";
import { Badge, IconButton } from "../../ui";
import { FolderOpen } from "../../ui/icons";

/** When a reader-fed row came and went, in words: "New today", "Since 2 Oct", "Gone 5 Oct". */
export function SeenCell({ row }: { row: RecordRow }) {
  const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
  const today = new Date().toDateString();
  if (row.gone_at) return <td><Badge tone="gray">Gone {day(row.gone_at)}</Badge></td>;
  if (new Date(row.created_at).toDateString() === today) return <td><Badge tone="good">New today</Badge></td>;
  return <td className="faint">Since {day(row.created_at)}</td>;
}

/** A link to another table's record (its title, from the table's `relations`), or to a person
 *  or a company: a pill that opens it, with a way back (the drawer's stack). */
export function RelationCell({ row, field, relations, onOpenRelated, as: Tag = "td" }: { row: RecordRow; field: FieldInfo; relations?: Relations; onOpenRelated?: (collection: string, id: string) => void; as?: "td" | "span" }) {
  const value = row.values[field.name];
  if (!value) return <Tag><span className="faint">—</span></Tag>;
  const id = String(value);
  const title = relations?.[field.name]?.[id] ?? id;
  const target = field.relation;
  const opens = Boolean(onOpenRelated && target && target !== "person" && target !== "organisation");
  return (
    <Tag>
      {opens ? (
        <button type="button" className="linkbtn" onClick={(e) => { e.stopPropagation(); onOpenRelated!(target!, id); }} title={`Open ${title}`}>
          <Badge tone="info">{title}</Badge>
        </button>
      ) : (
        <Badge tone="info">{title}</Badge>
      )}
    </Tag>
  );
}

/** `as="span"` is the same value on a card or a line (board, list, gallery, calendar, timeline):
 *  the click still opens the record, the double-click still edits. */
export function Cell({ row, field, onCommit, files, onFile, relations, onOpenRelated, as: Tag = "td" }: { row: RecordRow; field: FieldInfo; onCommit: (text: string) => void; files?: Record<string, FileInfo>; onFile?: (file: File) => void; relations?: Relations; onOpenRelated?: (collection: string, id: string) => void; as?: "td" | "span" }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  if (field.kind === "relation") return <RelationCell row={row} field={field} relations={relations} onOpenRelated={onOpenRelated} as={Tag} />;
  if (field.kind === "file") return <FileCell row={row} field={field} files={files ?? {}} onFile={onFile} as={Tag} />;
  const value = row.values[field.name];
  const numeric = isNumeric(field.kind);
  const estimate = Boolean(row.provenance?.estimated) && numeric;
  const assumed = row.provenance?.assumed;
  const source = row.provenance?.source;
  const lookedUp = numeric && Boolean(source) && source !== "stated" && source !== "estimated";
  const rests = [estimate ? "Estimated by Zazoo." : lookedUp ? `From ${source}.` : "", assumed ? `Zazoo assumed ${assumed}.` : ""].filter(Boolean).join(" ");
  function begin(e?: { stopPropagation: () => void }) {
    e?.stopPropagation();
    setText(editText(value, field.kind));
    setEditing(true);
  }
  function finish(commit: boolean) {
    setEditing(false);
    if (commit) onCommit(text);
  }
  function key(e: KeyboardEvent) {
    if (pressed(e, "cell-save") && field.kind !== "long_text") finish(true);
    if (pressed(e, "cell-cancel")) finish(false);
  }
  const label = humanize(field.name);
  if (editing) {
    return (
      <Tag className={numeric ? "r" : undefined} onClick={(e) => e.stopPropagation()}>
        {field.kind === "choice" || field.kind === "status" ? (
          <select autoFocus value={text} onChange={(e) => setText(e.target.value)} onBlur={() => finish(true)} onKeyDown={key} aria-label={label}>
            <option value="">—</option>
            {(field.choices ?? []).map((c) => (
              <option key={c} value={c}>
                {humanize(c)}
              </option>
            ))}
          </select>
        ) : field.kind === "bool" ? (
          <select autoFocus value={text || "false"} onChange={(e) => setText(e.target.value)} onBlur={() => finish(true)} onKeyDown={key} aria-label={label}>
            <option value="false">No</option>
            <option value="true">Yes</option>
          </select>
        ) : field.kind === "long_text" ? (
          <textarea autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)} onBlur={() => finish(true)} onKeyDown={key} aria-label={label} />
        ) : (
          <input autoFocus type={inputType(field.kind)} step={field.kind === "number" ? "any" : undefined} value={text} onChange={(e) => setText(e.target.value)} onFocus={(e) => e.currentTarget.select()} onBlur={() => finish(true)} onKeyDown={key} aria-label={label} placeholder={field.kind === "multichoice" ? (field.choices ?? []).join(", ") : undefined} />
        )}
      </Tag>
    );
  }
  const words = showValue(value, field.kind, field.unit);
  // A click opens the row (it bubbles to the row); a double-click, Enter or F2 edits the cell
  // (the convention from pull request #3: scanning by click, editing on purpose).
  return (
    <Tag
      className={`${numeric ? "r num" : ""} editable`.trim()}
      onDoubleClick={(e) => begin(e)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === "F2") {
          e.preventDefault();
          begin(e);
        }
      }}
      title={rests ? `${rests} Double-click to correct it.` : "Double-click to edit"}
    >
      {words === "" ? <span className="faint">—</span> : field.kind === "url" ? <a href={String(value)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>{words}</a> : field.kind === "status" || field.kind === "choice" ? <span className={`pill ${field.done_choices?.includes(String(value)) ? "pill--good" : "pill--gray"}`}>{words}</span> : field.kind === "bool" ? (value ? "✓" : <span className="faint">—</span>) : words}
      {estimate ? (
        <span className="est" title={`${rests} Double-click the cell to correct it.`} aria-label="estimated">
          ≈
        </span>
      ) : assumed && numeric ? (
        <span className="est" title={`${rests} Double-click the cell to correct it.`} aria-label="on an assumption">
          ?
        </span>
      ) : null}
    </Tag>
  );
}

/** A file field: the document's name, opened with the Mac's own app, or a way to add one. */
export function FileCell({ row, field, files, onFile, as: Tag = "td" }: { row: RecordRow; field: FieldInfo; files: Record<string, FileInfo>; onFile?: (file: File) => void; as?: "td" | "span" }) {
  const id = row.values[field.name] ? String(row.values[field.name]) : "";
  const info = id ? files[id] : undefined;
  if (info) {
    return (
      <Tag onClick={(e) => e.stopPropagation()}>
        <button type="button" className="linkbtn" title={host.available() ? "Open" : info.path} onClick={() => void host.openPath(info.path)}>
          {info.name}
        </button>
        <span className="faint"> · {formatBytes(info.size)}</span>
        {host.available() ? (
          <IconButton label="Show in Finder" icon={<FolderOpen />} onClick={() => void host.revealPath(info.path)} />
        ) : null}
      </Tag>
    );
  }
  return (
    <Tag onClick={(e) => e.stopPropagation()}>
      {onFile ? (
        <label className="linkbtn faint">
          {id ? "File missing · " : ""}Add file
          <input type="file" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
        </label>
      ) : (
        <span className="faint">—</span>
      )}
    </Tag>
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
    <p className="editable" tabIndex={0} onDoubleClick={() => { setText(value ? String(value) : ""); setEditing(true); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === "F2") { e.preventDefault(); setText(value ? String(value) : ""); setEditing(true); } }} title="Double-click to edit">
      {value ? String(value) : <span className="faint">Nothing yet. Double-click to write.</span>}
    </p>
  );
}

/** A record's value on a card or a line: edited in place on a double-click, like a table cell.
 *  The values beside a title are left out when empty, as before (the record panel fills them). */
export function CardValue({ row, field, onCommit, beside }: { row: RecordRow; field: FieldInfo | undefined; onCommit: (row: RecordRow, field: FieldInfo, text: string) => void; beside?: boolean }) {
  if (!field) return <>{row.id}</>;
  const v = row.values[field.name];
  if (beside && (v === null || v === undefined || v === "")) return null;
  return <Cell as="span" row={row} field={field} onCommit={(text) => onCommit(row, field, text)} />;
}

/** What a card or a line does: a click opens its record (the second click of a double-click is
 *  the value's, which edits), Enter too. */
export function opens(open: () => void) {
  return {
    role: "button" as const,
    tabIndex: 0,
    onClick: (e: MouseEvent) => {
      if (e.detail <= 1) open();
    },
    onKeyDown: (e: KeyboardEvent) => {
      if (e.target === e.currentTarget && e.key === "Enter") {
        e.preventDefault();
        open();
      }
    },
  };
}
