/**
 * A record's history (the UI rulebook §7, ⋮ More › History): every change the journal holds for
 * this record, newest first: who made it, the field, old → new, the day and time. There is no
 * route for a record's history; the journal has it already: `GET /api/activity` for the module,
 * and the entries whose data names this table and this record (`edit_record` and Alpha's own
 * edit tool both journal `{collection, record, before, after}`). Undo and Redo step through the
 * changes and save as they go: Undo writes a change's old values back, Redo its new ones (⌘Z and
 * ⇧⌘Z on the page do the same).
 * ponytail: the activity route returns at most 500 entries per module, so a very busy module
 * may not show the oldest changes of a record; a per-record route in the core would lift that.
 */
import type { JournalEntry } from "../../core/client";
import { Badge, Button, Dialog } from "../../ui";
import { showValue, type FieldInfo } from "../fields";
import { dayText, humanize, timeText } from "../format";
import { fieldLabel } from "./RecordField";

export interface Change {
  id: string;
  at: string;
  who: string;
  /** Old and new values by field name. */
  before: Record<string, unknown>;
  after: Record<string, unknown>;
}

const obj = (v: unknown): Record<string, unknown> | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);

/** Who made a change, in words: you, Alpha, or the named automation or agent. */
export function whoWords(actor: string): string {
  if (actor === "person") return "You";
  if (actor === "alpha") return "Alpha";
  const named = actor.includes(":") ? actor.slice(actor.indexOf(":") + 1) : actor;
  return humanize(named);
}

/** The entries of the journal that name this record. */
export function entriesAbout(entries: JournalEntry[], table: string, id: string): JournalEntry[] {
  return entries.filter((e) => e.data?.collection === table && e.data?.record === id).sort((a, b) => b.at.localeCompare(a.at));
}

/** The ones that changed values, newest first. */
export function changesFrom(about: JournalEntry[]): Change[] {
  return about.flatMap((e) => {
    const before = obj(e.data.before);
    const after = obj(e.data.after);
    return before && after ? [{ id: e.id, at: e.at, who: whoWords(e.actor), before, after }] : [];
  });
}

/** "8 Oct, 14:30": always the day and the time (the UI rulebook §2). */
export function dayAndTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${dayText(d)}, ${timeText(d)}`;
}

export function HistoryDialog({ open, onClose, changes, fields, undone, canUndo, canRedo, onUndo, onRedo }: { open: boolean; onClose: () => void; changes: Change[]; fields: FieldInfo[]; /** The ids of the changes undone so far. */ undone: string[]; canUndo: boolean; canRedo: boolean; onUndo: () => void; onRedo: () => void }) {
  const byName = new Map(fields.map((f) => [f.name, f]));
  const words = (name: string, value: unknown) => {
    const f = byName.get(name);
    const text = f ? showValue(value, f.kind, f.unit) : value === null || value === undefined ? "" : String(value);
    return text === "" ? "Unknown" : text;
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="History" className="dialog--history">
      <div className="dialog__body">Every change to this record, newest first. Undo puts the old values back and Redo the new ones; each saves at once.</div>
      <div className="row history__bar">
        <Button size="sm" onClick={onUndo} disabledReason={!canUndo ? "There is no earlier change to undo." : undefined}>
          Undo
        </Button>
        <Button size="sm" onClick={onRedo} disabledReason={!canRedo ? "Nothing has been undone yet." : undefined}>
          Redo
        </Button>
      </div>
      {changes.length === 0 ? (
        <p className="faint">No changes yet.</p>
      ) : (
        <ol className="history">
          {changes.map((c) => (
            <li key={c.id} className="history__item">
              <div className="history__head">
                <b>{c.who}</b>
                <span className="faint">{dayAndTime(c.at)}</span>
                {undone.includes(c.id) ? <Badge tone="warn">Undone</Badge> : null}
              </div>
              {Object.keys(c.after).map((name) => (
                <div key={name} className="history__line">
                  <span className="muted">{byName.get(name) ? fieldLabel(byName.get(name)!) : humanize(name)}</span>
                  <span>
                    {words(name, c.before[name])} → {words(name, c.after[name])}
                  </span>
                </div>
              ))}
            </li>
          ))}
        </ol>
      )}
      <div className="row dialog__actions">
        <Button onClick={onClose} autoFocus>
          Done
        </Button>
      </div>
    </Dialog>
  );
}
