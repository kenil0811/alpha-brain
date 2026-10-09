/**
 * The cards under a record's fields (the UI rulebook §7): Notes, Intelligence, Governance, each a
 * `SectionCard` with a small title and a one-line subtitle. Which show is the person's choice per
 * collection (`PREF.recordSections`, set from the data view's ⋮ More). Empty ones say so in one
 * sentence with "yet". (9 Oct, the record pages.)
 *
 * - Notes: the core keeps a page per scope; a record's is `topic:record-<table>-<id>`, written
 *   with `writeNote` and read from the wiki the way Intelligence reads it.
 * - Intelligence: the facts Alpha holds about the entity this record is (when the table's
 *   identity field links it to a person or company), and the journal entries that name the record.
 * - Governance: where the record came from and when. The core keeps its provenance for the whole
 *   record (who last wrote it, from what), not value by value, and the card says so.
 */
import { useEffect, useState } from "react";
import type { Client, EntityDetail, JournalEntry, Note, RecordRow } from "../../core/client";
import { FactRow } from "../../shell/FactRow";
import { Badge, Button, EmptyCard, SectionCard, Trouble } from "../../ui";
import type { FieldInfo } from "../fields";
import { when } from "../format";
import { marks, fieldLabel } from "./RecordField";
import { whoWords } from "./RecordHistory";

export function NotesSection({ client, table, id, title, version, onChanged }: { client: Client; table: string; id: string; title: string; version: number; onChanged: () => void }) {
  const isNew = id === "new";
  const scope = `topic:record-${table}-${id}`;
  const [note, setNote] = useState<Note | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (isNew || editing) return;
    let live = true;
    client
      .intelligence()
      .then((i) => {
        if (!live) return;
        setNote(i.knowledge.notes.find((n) => n.scope === scope) ?? null);
        setError(null);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [client, scope, isNew, editing, version, tick]);
  const save = () =>
    client
      .writeNote(scope, note?.title ?? title, body)
      .then((n) => {
        setNote(n);
        setEditing(false);
        setError(null);
        onChanged();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  return (
    <SectionCard
      title="Notes"
      subtitle="Yours, about this record only."
      actions={
        editing ? (
          <>
            <Button size="sm" variant="primary" onClick={() => void save()}>
              Save note
            </Button>
            <Button size="sm" onClick={() => { setEditing(false); setError(null); }}>
              Cancel
            </Button>
          </>
        ) : (
          <Button size="sm" disabledReason={isNew ? "Fill in a field first; the record is made when you leave it, then its notes can be kept." : undefined} onClick={() => { setBody(note?.body ?? ""); setEditing(true); }}>
            {note ? "Edit" : "Write"}
          </Button>
        )
      }
    >
      {error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't {editing ? "save the note" : "load the notes"}: {error}</Trouble> : null}
      {editing ? (
        <textarea className="textfield recnote" rows={6} value={body} onChange={(e) => setBody(e.target.value)} aria-label={`Notes about ${title}`} />
      ) : note ? (
        <p className="recnote__text">{note.body}</p>
      ) : (
        <p className="muted">No notes yet.</p>
      )}
    </SectionCard>
  );
}

export function IntelligenceSection({ client, row, about, version, onChanged, onAsk }: { client: Client; row: RecordRow | null; about: JournalEntry[]; version: number; onChanged: () => void; onAsk?: (text: string) => void }) {
  const [entity, setEntity] = useState<EntityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const entityId = row?.entity ?? null;
  useEffect(() => {
    if (!entityId) return;
    let live = true;
    client
      .entity(entityId)
      .then((e) => {
        if (!live) return;
        setEntity(e);
        setError(null);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [client, entityId, version, tick]);
  const facts = entity ? [...entity.facts.filter((f) => f.state === "suggested"), ...entity.facts.filter((f) => f.state === "accepted")] : [];
  const nothing = facts.length === 0 && about.length === 0;
  return (
    <SectionCard title="Intelligence" subtitle="What Alpha knows about this record, and what has acted on it.">
      {error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't load what Alpha knows: {error}</Trouble> : null}
      {facts.map((f) => (
        <FactRow key={f.id} fact={f} client={client} onChanged={() => { setTick((n) => n + 1); onChanged(); }} onAsk={onAsk} />
      ))}
      {about.length ? (
        <div className="list">
          {about.slice(0, 8).map((e) => (
            <div key={e.id} className="list__row">
              <span className="faint people__when">{when(e.at)}</span>
              <Badge tone={e.kind === "failed" ? "bad" : e.actor === "person" ? "info" : "gray"}>{whoWords(e.actor)}</Badge>
              <span className="people__line">{e.text}</span>
            </div>
          ))}
        </div>
      ) : null}
      {nothing && !error ? <p className="muted">Alpha knows nothing about this record yet.</p> : null}
    </SectionCard>
  );
}

export function GovernanceSection({ row, fields }: { row: RecordRow | null; fields: FieldInfo[] }) {
  if (!row) {
    return (
      <SectionCard title="Governance" subtitle="Where this record came from, and when.">
        <EmptyCard title="Nothing recorded yet">Where each value came from appears here once the record is saved.</EmptyCard>
      </SectionCard>
    );
  }
  const p = row.provenance ?? {};
  const resting = fields.flatMap((f) => marks(row, f).map((m) => ({ f, m })));
  const lines: [string, string][] = [
    ["Added", when(row.created_at)],
    ["Last changed", when(row.updated_at)],
    ["Last changed by", p.by ? whoWords(p.by) : "Unknown"],
    ["Source", p.source ? (p.source === "stated" ? "You said so" : p.source) : "Unknown"],
    ...(row.seen_at ? ([["Last seen by its reader", when(row.seen_at)]] as [string, string][]) : []),
    ...(row.gone_at ? ([["Gone from its reader", when(row.gone_at)]] as [string, string][]) : []),
  ];
  return (
    <SectionCard title="Governance" subtitle="Where this record came from, and when. The core keeps it for the whole record, not value by value.">
      <dl className="prov2__body recgov">
        {lines.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
        {resting.map(({ f, m }) => (
          <div key={`${f.name}${m.mark}`}>
            <dt>{fieldLabel(f)}</dt>
            <dd>
              {m.reason.replace(" Type a value to correct it.", "")}
            </dd>
          </div>
        ))}
      </dl>
    </SectionCard>
  );
}
