/**
 * A record's History and Notes, under its details on its own page (13 Oct, Q42 section 2b; the
 * features from pull request #5, the look main's own: the person page's list and its Page).
 *
 * History reads the core's versions of this one record (`recordHistory`, never the journal),
 * newest first, a page at a time with Show older; nothing is dropped. Each change says who and
 * when and which fields went from what to what; a long text says only that it changed, with
 * Show to see both. Undo writes the old values back as an ordinary edit (journaled, and itself
 * a change Undo can take back), only while the fields still hold what the change wrote.
 */
import { useEffect, useState } from "react";
import type { Client, Note, Part, Provenance, RecordChange, RecordHistory as History, RecordRow } from "../core/client";
import { Button } from "../ui";
import { showValue, type FieldInfo } from "./fields";
import { humanize, when } from "./format";

/** Who made a change, in words: you, a reader, a part of the module, or Alpha. */
export function whoChanged(by: Provenance, fields: string[], parts: Part[]): string {
  if (by.by === "person") return "You";
  if (by.reader) return `Reader ${humanize(by.reader)}`;
  const partIds = new Set(fields.map((f) => by.fields?.[f]?.part).filter((p): p is string => Boolean(p)));
  if (partIds.size === 1) {
    const id = [...partIds][0];
    return parts.find((p) => p.id === id)?.title ?? humanize(id);
  }
  return "Alpha";
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const LONG = 80;

function Change({ change, row, fields, parts, readonly, onUndo }: { change: RecordChange; row: RecordRow; fields: Map<string, FieldInfo>; parts: Part[]; readonly: boolean; onUndo: (c: RecordChange) => Promise<void> }) {
  const [shown, setShown] = useState(false);
  const [busy, setBusy] = useState(false);
  // the field's own label when it has one, else its name in words, as the details above say it
  const label = (name: string) => {
    const own = fields.get(name)?.label;
    return own && own !== name ? own : humanize(name);
  };
  const words = (name: string, value: unknown) => {
    const f = fields.get(name);
    return showValue(value, f?.kind ?? "text", f?.unit) || "—";
  };
  const isLong = (name: string) => fields.get(name)?.kind === "long_text" || [change.fields.find((x) => x.field === name)?.before, change.fields.find((x) => x.field === name)?.after].some((v) => String(v ?? "").length > LONG);
  const current = change.fields.every((f) => same(row.values[f.field], f.after));
  const who = whoChanged(change.by, change.fields.map((f) => f.field), parts);
  return (
    <div className="item">
      <span className="item__when num">{change.at ? when(change.at) : ""}</span>
      <div className="item__body">
        <b>{who}</b>
        {change.fields.map((f) =>
          isLong(f.field) ? (
            <div key={f.field} className="item__sub">
              {label(f.field)} changed{" "}
              <Button size="sm" variant="ghost" onClick={() => setShown((s) => !s)} aria-expanded={shown}>
                {shown ? "Hide" : "Show"}
              </Button>
              {shown ? (
                <div className="history__long">
                  <div><span className="faint">Before</span><p>{words(f.field, f.before)}</p></div>
                  <div><span className="faint">After</span><p>{words(f.field, f.after)}</p></div>
                </div>
              ) : null}
            </div>
          ) : (
            <div key={f.field} className="item__sub">
              {label(f.field)}: {words(f.field, f.before)} → {words(f.field, f.after)}
            </div>
          ),
        )}
      </div>
      {!readonly ? (
        <Button size="sm" disabled={busy || !current} title={current ? "Put back what was there before this change" : "Changed again since; undo the later change first."} onClick={() => { setBusy(true); void onUndo(change).finally(() => setBusy(false)); }}>
          Undo
        </Button>
      ) : null}
    </div>
  );
}

export function RecordHistory({ client, table, row, fields, parts, readonly, version, onUndone }: { client: Client; table: string; row: RecordRow; fields: FieldInfo[]; parts: Part[]; readonly: boolean; version: number; onUndone: (saved: RecordRow) => void }) {
  const [pages, setPages] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const byName = new Map(fields.map((f) => [f.name, f]));

  useEffect(() => {
    let live = true;
    client
      .recordHistory(table, row.id)
      .then((h) => {
        if (!live) return;
        setPages(h);
        setError(null);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
    // a new revision (an edit here, an undo, a part's run) reads the history again from the newest
  }, [client, table, row.id, row.revision, version]);

  const older = async () => {
    if (!pages?.changes.length) return;
    setLoadingMore(true);
    try {
      const next = await client.recordHistory(table, row.id, pages.changes[pages.changes.length - 1].revision);
      setPages({ ...next, changes: [...pages.changes, ...next.changes] });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingMore(false);
    }
  };
  const undo = async (change: RecordChange) => {
    try {
      const saved = await client.editRecord(table, row.id, Object.fromEntries(change.fields.map((f) => [f.field, f.before ?? null])), row.revision);
      onUndone(saved);
    } catch (e) {
      setError(`Couldn't undo it: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  return (
    <div className="section">
      <div className="section__head">
        <h2>History</h2>
        <span className="faint">Every change to this record, newest first</span>
      </div>
      {error ? <p className="notice" role="alert">{error}</p> : null}
      <div className="card list">
        {!pages ? <p className="empty">Loading…</p> : null}
        {pages?.changes.map((c) => <Change key={c.revision} change={c} row={row} fields={byName} parts={parts} readonly={readonly} onUndo={undo} />)}
        {pages && !pages.more && pages.added ? (
          <div className="item">
            <span className="item__when num">{when(pages.added.at)}</span>
            <div className="item__body">
              <b>Added</b> <span className="faint">by {whoChanged(pages.added.by, [], parts).replace(/^You$/, "you")}</span>
            </div>
          </div>
        ) : null}
        {pages?.more ? (
          <div className="item">
            <Button size="sm" disabled={loadingMore} onClick={() => void older()}>
              {loadingMore ? "Loading…" : "Show older"}
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The person's note on this record: shown as text, Edit opens the box, Save writes it. */
export function RecordNote({ client, table, id, note, readonly, onSaved }: { client: Client; table: string; id: string; note: Note | null; readonly: boolean; onSaved: () => void }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note?.body ?? "");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!editing) setBody(note?.body ?? "");
  }, [note, editing]);
  const save = () => {
    client
      .writeNote(`record:${table}/${id}`, "Notes", body)
      .then(() => {
        setEditing(false);
        setError(null);
        onSaved();
      })
      .catch((e: unknown) => setError(`Couldn't save the note: ${e instanceof Error ? e.message : String(e)}`));
  };
  return (
    <div className="section">
      <div className="section__head">
        <h2>Notes</h2>
        <span className="faint">Your notes on this record; Alpha reads them when it works on it</span>
        {!readonly ? (
          <div className="section__right">
            {editing ? (
              <>
                <Button size="sm" variant="primary" onClick={save}>
                  Save
                </Button>
                <Button size="sm" onClick={() => { setEditing(false); setBody(note?.body ?? ""); }}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => setEditing(true)}>
                {note ? "Edit" : "Write"}
              </Button>
            )}
          </div>
        ) : null}
      </div>
      {error ? <p className="notice" role="alert">{error}</p> : null}
      <div className="card card--pad">
        {editing ? (
          <textarea className="note__edit" rows={6} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Your note on this record" placeholder="What you want to remember about this record." />
        ) : note?.body ? (
          <div className="people__page">{note.body}</div>
        ) : (
          <p className="muted" style={{ fontSize: "var(--text-md)" }}>No notes yet.</p>
        )}
      </div>
    </div>
  );
}
