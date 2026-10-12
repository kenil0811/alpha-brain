/**
 * Intelligence › Second Brain (the UI rulebook §12; the owner, 12 Oct): everything Alpha knows,
 * in one data view of facts, goals and hypotheses (`knowledgeSource`), a hypothesis approved or
 * rejected with ✓ / ✕ on hover. Its View dropdown adds **Graph** (the default, Obsidian's graph
 * view as the reference): every thing in the platform and every link (`brain/Graph`). Under them: standing instructions, standing permissions and Alpha's notes, each an
 * editable sentence (`writeNote`). A fact opens its own page (`#/intelligence/facts/<id>`).
 */
import { useEffect, useMemo, useState } from "react";
import { say } from "../core/client";
import type { Client, Intelligence as Data, Note, WorkGraph } from "../core/client";
import { humanize, when } from "../modules/format";
import { DataPage } from "../modules/DataPage";
import { Button, EmptyCard, ListRow, Notice, PageHeader, SectionCard, Trouble, useAssistant } from "../ui";
import { BrainIcon, ICON, PermissionIcon } from "../ui/icons";
import { BackLink } from "./BackLink";
import { cachedWorld } from "./brain/model";
import { GraphView } from "./brain/Graph";
import { FactRow } from "./FactRow";
import { GOAL_ROW, knowledgeSource } from "./intel/sources";
import { RevokeButton } from "./Settings";
import type { Surface } from "./Rail";

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
      setError(say(e));
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
      {body ? <p className="noteline__text">{body}</p> : <p className="noteline__text noteline__text--empty">{emptyText ?? "Nothing yet."}</p>}
      <Button size="sm" onClick={() => setEditing(true)} aria-label={`${body ? "Edit" : "Write"}: ${label}`}>
        {body ? "Edit" : "Write"}
      </Button>
    </div>
  );
}

const scopeWords = (n: Note) => (n.scope === "person" ? "About you" : n.scope.replace(/^(module|entity|skill):/, ""));

/** A subject's name, from the world map (`entity:<id>`, `module:<id>`). */
export function namer(world: WorkGraph | null): (subject: string) => string {
  const titles = new Map((world?.nodes ?? []).map((n) => [n.id, n.title]));
  return (subject) => titles.get(subject) ?? humanize(subject.replace(/^(entity|module):/, ""));
}

export function SecondBrain({ client, data, version = 0, onChanged, onAsk, onGo }: { client: Client; data: Data; version?: number; onChanged: () => void; onAsk?: (text: string) => void; onGo?: (s: Surface) => void }) {
  // the graph's options, set from the page's ⋮ while the Graph view is open
  const [orphans, setOrphans] = useState(true);
  const [labels, setLabels] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const { notes } = data.knowledge;
  const permissions = data.knowledge.permissions ?? [];
  const instructions = notes.find((n) => n.scope === "person" && n.title === "Standing instructions");
  const others = notes.filter((n) => n !== instructions);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const table = useMemo(() => knowledgeSource(client, "intel.knowledge", async () => (await client.intelligence()).knowledge, (s) => namer(cachedWorld(client))(s)), [client]);

  async function revoke(id: string) {
    try {
      await client.revokePermission(id);
      setMessage({ ok: true, text: "Revoked." });
      onChanged();
    } catch (e) {
      setMessage({ ok: false, text: say(e) });
    }
  }

  const graph = {
    render: (query: string) => <GraphView client={client} data={data} onGo={onGo} onChanged={onChanged} options={{ query, orphans, labels, refresh }} />,
    more: [
      { label: "Things with no links", on: orphans, onSelect: () => setOrphans((o) => !o) },
      { label: "Always show names", on: labels, onSelect: () => setLabels((l) => !l) },
      { label: "Refresh", onSelect: () => setRefresh((t) => t + 1), separatorBefore: true },
    ],
  };
  return (
    <div className="stack stack--wide">
      <DataPage client={client} source={table} version={version} onChanged={onChanged} onAsk={onAsk} graph={graph} onOpenRecord={(_k, id) => onGo?.(id.startsWith(GOAL_ROW) ? { kind: "goal", id: id.slice(GOAL_ROW.length) } : { kind: "fact", id })} />
      <div className="brain__keeps">
        <SectionCard title="Standing instructions">
          <NoteEditor client={client} scope="person" title="Standing instructions" body={instructions?.body ?? ""} summary={instructions?.summary} onChanged={onChanged} label="Standing instructions" emptyText="None yet." />
        </SectionCard>

        <SectionCard title="Standing permissions">
          {permissions.length ? (
            permissions.map((p) => (
              <ListRow key={p.id} icon={<PermissionIcon size={ICON} />} title={p.sentence} onOpen={onGo ? () => onGo({ kind: "permission", id: p.id }) : undefined} description={`Since ${when(p.granted_at)}`} controls={<RevokeButton permission={p} onRevoke={() => void revoke(p.id)} />} />
            ))
          ) : (
            <p className="faint">None yet.</p>
          )}
          {message ? <Notice tone={message.ok ? "ok" : "bad"}>{message.text}</Notice> : null}
        </SectionCard>

        {others.map((n) => (
          <SectionCard key={n.id} title={n.title} info={scopeWords(n)} actions={onGo ? <Button size="sm" variant="ghost" onClick={() => onGo({ kind: "note", id: n.id })}>Open</Button> : undefined}>
            <NoteEditor client={client} scope={n.scope} title={n.title} body={n.body} summary={n.summary} onChanged={onChanged} label={`Edit ${n.title}`} />
          </SectionCard>
        ))}
      </div>
    </div>
  );
}

/** A fact's own page: the fact with its provenance, Correct and Forget (`FactRow`). Back returns
 *  to Second Brain, which opens again on the view it was left on (Facts). */
export function FactPage({ client, id, version, onBack, onChanged, onAsk }: { client: Client; id: string; version: number; onBack: () => void; onChanged: () => void; onAsk?: (text: string) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    client
      .intelligence()
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(null);
      })
      .catch((e: unknown) => live && setError(say(e)));
    return () => {
      live = false;
    };
  }, [client, version, tick]);
  const fact = data?.knowledge.facts.find((f) => f.id === id);
  return (
    <>
      <PageHeader left={<BackLink to="Facts" onClick={onBack} />} title={fact ? humanize(fact.predicate) : "Fact"} />
      <div className="page page--narrow">
        {error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't load the fact: {error}</Trouble> : null}
        {!data && !error ? <p className="faint">Loading…</p> : null}
        {data && !fact ? <EmptyCard icon={<BrainIcon size={ICON} />} title="No such fact" /> : null}
        {fact ? (
          <SectionCard title="Fact">
            <FactRow fact={fact} client={client} onChanged={() => { onChanged(); setTick((n) => n + 1); }} onAsk={onAsk} />
          </SectionCard>
        ) : null}
      </div>
    </>
  );
}

/** One of what Alpha keeps, on a page of its own (12 Oct, the owner: every element has a page): a
 *  goal (its state and project; changing it asks Alpha, the core has no call for it), a standing
 *  permission (Revoke, confirmed) or a note (edited in place). */
export function KeptPage({ client, kind, id, version, onBack, onChanged, onGo }: { client: Client; kind: "goal" | "permission" | "note"; id: string; version: number; onBack: () => void; onChanged: () => void; onGo: (s: Surface) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const assistant = useAssistant();
  useEffect(() => {
    let live = true;
    client
      .intelligence()
      .then((d) => live && (setData(d), setError(null)))
      .catch((e: unknown) => live && setError(say(e)));
    return () => {
      live = false;
    };
  }, [client, version, tick]);
  const k = data?.knowledge;
  const goal = kind === "goal" ? k?.goals.find((g) => g.id === id) : undefined;
  const permission = kind === "permission" ? k?.permissions?.find((p) => p.id === id) : undefined;
  const note = kind === "note" ? k?.notes.find((n) => n.id === id) : undefined;
  const title = goal?.text ?? permission?.sentence ?? note?.title ?? { goal: "Goal", permission: "Permission", note: "Note" }[kind];
  const changed = () => {
    onChanged();
    setTick((n) => n + 1);
  };
  const tell = (words: string) => {
    assistant?.say(words);
    setMessage({ ok: true, text: "Asked Alpha; it confirms in the panel." });
  };
  async function revoke(pid: string) {
    try {
      await client.revokePermission(pid);
      setMessage({ ok: true, text: "Revoked." });
      changed();
    } catch (e) {
      setMessage({ ok: false, text: say(e) });
    }
  }
  return (
    <>
      <PageHeader left={<BackLink to="Second Brain" onClick={onBack} />} title={title.length > 60 ? `${title.slice(0, 59)}…` : title} />
      <div className="page page--narrow">
        {error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't load it: {error}</Trouble> : null}
        {!data && !error ? <p className="faint">Loading…</p> : null}
        {data && !goal && !permission && !note ? <EmptyCard icon={<BrainIcon size={ICON} />} title="It's gone" /> : null}
        {message ? <Notice tone={message.ok ? "ok" : "bad"}>{message.text}</Notice> : null}
        {goal ? (
          <SectionCard title="Goal">
            <ListRow title={goal.text} description={`${goal.state === "active" ? "Active" : humanize(goal.state)} · since ${when(goal.since)}`} />
            <div className="row">
              {goal.module ? <Button size="sm" onClick={() => onGo({ kind: "module", id: goal.module! })}>Open its project</Button> : null}
              {goal.state === "active" ? (
                <>
                  <Button size="sm" variant="primary" disabledReason={assistant ? undefined : "Open the assistant first."} onClick={() => tell(`Mark my goal "${goal.text}" as done.`)}>Mark done</Button>
                  <Button size="sm" variant="ghost" disabledReason={assistant ? undefined : "Open the assistant first."} onClick={() => tell(`Drop my goal "${goal.text}".`)}>Drop</Button>
                </>
              ) : null}
            </div>
          </SectionCard>
        ) : null}
        {permission ? (
          <SectionCard title="Standing permission">
            <ListRow icon={<PermissionIcon size={ICON} />} title={permission.sentence} description={`Since ${when(permission.granted_at)}`} controls={<RevokeButton permission={permission} onRevoke={() => void revoke(permission.id)} />} />
          </SectionCard>
        ) : null}
        {note ? (
          <SectionCard title={note.title} info={scopeWords(note)}>
            <NoteEditor client={client} scope={note.scope} title={note.title} body={note.body} summary={note.summary} onChanged={changed} label={`Edit ${note.title}`} />
          </SectionCard>
        ) : null}
      </div>
    </>
  );
}
