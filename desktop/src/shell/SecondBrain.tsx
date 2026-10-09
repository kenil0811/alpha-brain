/**
 * Intelligence › Second Brain (the UI rulebook §12): what Alpha knows about the person. Facts
 * waiting for a yes sit above the rest; every fact has a Provenance disclosure and can be
 * corrected or forgotten as far as the core allows (`FactRow`). Goals, standing permissions and
 * Alpha's notes follow; a note is an editable sentence (`writeNote`), a goal is read-only
 * because the core has no call that edits one. (9 Oct, the pages phase; it was "Knowledge".)
 */
import { useState } from "react";
import type { Client, Intelligence as Data, Note } from "../core/client";
import { humanize, when } from "../modules/format";
import { Button, EmptyCard, ListRow, Notice, SectionCard } from "../ui";
import { BookOpen, Flag, ICON, PermissionIcon } from "../ui/icons";
import { FactRow } from "./FactRow";

/** A note as a sentence the person can edit in place; saving is next to the field. */
export function NoteEditor({ client, scope, title, body, summary, onChanged, label, emptyText }: { client: Client; scope: string; title: string; body: string; summary?: string | null; onChanged: () => void; label: string; emptyText?: string }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(body);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setError(null);
    try {
      await client.writeNote(scope, title, text, summary ?? undefined);
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }
  return editing ? (
    <div className="stack">
      <textarea className="note__edit" rows={6} value={text} onChange={(e) => setText(e.target.value)} aria-label={label} />
      <div className="row">
        <Button size="sm" variant="primary" onClick={() => void save()}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setText(body); }}>
          Cancel
        </Button>
        {error ? <Notice tone="bad">{error}</Notice> : null}
      </div>
    </div>
  ) : (
    <div className="noteline">
      {body ? <p className="noteline__text">{body}</p> : <p className="noteline__text noteline__text--empty">{emptyText ?? "Nothing written yet."}</p>}
      <Button size="sm" onClick={() => setEditing(true)} aria-label={`${body ? "Edit" : "Write"}: ${label}`}>
        {body ? "Edit" : "Write"}
      </Button>
    </div>
  );
}

const scopeWords = (n: Note) => (n.scope === "person" ? "About you" : n.scope.replace(/^(module|entity|skill):/, ""));

export function SecondBrain({ client, data, onChanged, onAsk }: { client: Client; data: Data; onChanged: () => void; onAsk?: (text: string) => void }) {
  const { facts, notes, goals } = data.knowledge;
  const permissions = data.knowledge.permissions ?? [];
  const waiting = facts.filter((f) => f.state === "suggested");
  const known = facts.filter((f) => f.state !== "suggested");
  const instructions = notes.find((n) => n.scope === "person" && n.title === "Standing instructions");
  const others = notes.filter((n) => n !== instructions);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function revoke(id: string) {
    try {
      await client.revokePermission(id);
      setMessage({ ok: true, text: "Revoked." });
      onChanged();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }
  return (
    <div className="stack stack--wide">
      {waiting.length ? (
        <SectionCard title="Waiting for your confirmation" subtitle="Alpha noticed these; nothing is used until you say yes.">
          {waiting.map((f) => (
            <FactRow key={f.id} fact={f} client={client} onChanged={onChanged} onAsk={onAsk} />
          ))}
        </SectionCard>
      ) : null}

      <SectionCard title="Facts" subtitle={known.length ? `${known.length} ${known.length === 1 ? "thing" : "things"} Alpha knows about you` : undefined}>
        {known.length ? (
          known.map((f) => <FactRow key={f.id} fact={f} client={client} onChanged={onChanged} onAsk={onAsk} />)
        ) : (
          <EmptyCard icon={<BookOpen size={ICON} />} title="Nothing yet">Tell Alpha about yourself in any conversation and it remembers; each fact shows where it came from.</EmptyCard>
        )}
      </SectionCard>

      <SectionCard title="Goals" subtitle="What Alpha works towards with you">
        {goals.length ? (
          goals.map((g) => <ListRow key={g.id} icon={<Flag size={ICON} />} title={g.text} description={`${g.state === "active" ? "Active" : humanize(g.state)} · since ${when(g.since)}`} />)
        ) : (
          <EmptyCard icon={<Flag size={ICON} />} title="No goals yet">Say one in a conversation (“under 2,000 kcal on weekdays”) and Alpha works towards it.</EmptyCard>
        )}
      </SectionCard>

      <SectionCard title="Standing instructions" subtitle="What Alpha always keeps in mind; yours to write">
        <NoteEditor client={client} scope="person" title="Standing instructions" body={instructions?.body ?? ""} summary={instructions?.summary} onChanged={onChanged} label="Standing instructions" emptyText="None yet." />
      </SectionCard>

      <SectionCard title="Standing permissions" subtitle="What Alpha may do without asking; anything that reaches someone asks every time">
        {permissions.length ? (
          permissions.map((p) => (
            <ListRow key={p.id} icon={<PermissionIcon size={ICON} />} title={p.sentence} description={`Since ${when(p.granted_at)}`} controls={<Button size="sm" variant="ghost" onClick={() => void revoke(p.id)}>Revoke</Button>} />
          ))
        ) : (
          <EmptyCard icon={<PermissionIcon size={ICON} />} title="None yet">When Alpha proposes a draft or a message, “Always allow” on its card makes one.</EmptyCard>
        )}
        {message ? <Notice tone={message.ok ? "ok" : "bad"}>{message.text}</Notice> : null}
      </SectionCard>

      {others.map((n) => (
        <SectionCard key={n.id} title={n.title} subtitle={`Alpha's note · ${scopeWords(n)}`}>
          <NoteEditor client={client} scope={n.scope} title={n.title} body={n.body} summary={n.summary} onChanged={onChanged} label={`Edit ${n.title}`} />
        </SectionCard>
      ))}
    </div>
  );
}
