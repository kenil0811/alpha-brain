/**
 * Intelligence › Second Brain (the UI rulebook §12; the owner, 12 Oct): everything Alpha knows,
 * in two views of the same data. **Graph** (the default, Obsidian's graph view as the reference)
 * is every thing in the platform and every link (`brain/Graph`). **Table** is facts, goals and
 * hypotheses in one data view (`knowledgeSource`), a hypothesis approved or rejected with ✓ / ✕
 * on hover. Under them: standing instructions, standing permissions and Alpha's notes, each an
 * editable sentence (`writeNote`). A fact opens its own page (`#/intelligence/facts/<id>`).
 */
import { useEffect, useMemo, useState } from "react";
import { say } from "../core/client";
import type { Client, Intelligence as Data, Note, WorkGraph } from "../core/client";
import { humanize, when } from "../modules/format";
import { DataPage } from "../modules/DataPage";
import { Button, EmptyCard, ListRow, Notice, PageHeader, SectionCard, Toggle, Trouble } from "../ui";
import { BrainIcon, ICON, ICON_SM, PermissionIcon, Table2 } from "../ui/icons";
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

export type BrainView = "graph" | "table";

const VIEW_KEY = "alpha.brain.view";
const lastView = (): BrainView => {
  try {
    return localStorage.getItem(VIEW_KEY) === "table" ? "table" : "graph";
  } catch {
    return "graph";
  }
};

/** A subject's name, from the world map (`entity:<id>`, `module:<id>`). */
export function namer(world: WorkGraph | null): (subject: string) => string {
  const titles = new Map((world?.nodes ?? []).map((n) => [n.id, n.title]));
  return (subject) => titles.get(subject) ?? humanize(subject.replace(/^(entity|module):/, ""));
}

export function SecondBrain({ client, data, version = 0, onChanged, onAsk, onGo, initialView }: { client: Client; data: Data; version?: number; onChanged: () => void; onAsk?: (text: string) => void; onGo?: (s: Surface) => void; initialView?: BrainView }) {
  // Graph or Table is this window's choice, kept like its widths (not an address of its own).
  const [view, setViewState] = useState<BrainView>(() => initialView ?? lastView());
  const setView = (v: BrainView) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* no storage: the choice is not kept */
    }
  };
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

  const switcher = <Toggle<BrainView> inBody label="Second Brain view" value={view} onChange={setView} items={[{ id: "graph", label: "Graph", icon: <BrainIcon size={ICON_SM} /> }, { id: "table", label: "Table", icon: <Table2 size={ICON_SM} /> }]} />;
  return (
    <div className="stack stack--wide">
      {switcher}
      {view === "graph" ? (
        <GraphView client={client} data={data} onGo={onGo} onChanged={onChanged} />
      ) : (
        <DataPage client={client} source={table} version={version} onChanged={onChanged} onAsk={onAsk} onOpenRecord={(_k, id) => (id.startsWith(GOAL_ROW) ? undefined : onGo?.({ kind: "fact", id }))} />
      )}
      <div className="brain__keeps">
        <SectionCard title="Standing instructions">
          <NoteEditor client={client} scope="person" title="Standing instructions" body={instructions?.body ?? ""} summary={instructions?.summary} onChanged={onChanged} label="Standing instructions" emptyText="None yet." />
        </SectionCard>

        <SectionCard title="Standing permissions">
          {permissions.length ? (
            permissions.map((p) => (
              <ListRow key={p.id} icon={<PermissionIcon size={ICON} />} title={p.sentence} description={`Since ${when(p.granted_at)}`} controls={<RevokeButton permission={p} onRevoke={() => void revoke(p.id)} />} />
            ))
          ) : (
            <p className="faint">None yet.</p>
          )}
          {message ? <Notice tone={message.ok ? "ok" : "bad"}>{message.text}</Notice> : null}
        </SectionCard>

        {others.map((n) => (
          <SectionCard key={n.id} title={n.title} info={scopeWords(n)}>
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
