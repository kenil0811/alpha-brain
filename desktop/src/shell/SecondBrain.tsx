/**
 * Intelligence › Second Brain (the UI rulebook §12): what Alpha knows about the person, as one
 * picture, the brain in an egg (`map/BrainEgg`), and beside it what waits for a yes, then the
 * thing picked in the egg (the person by default: their facts), goals, standing instructions,
 * standing permissions and Alpha's notes. **Map** switches to the map of the world and of
 * Alpha's work (`map/WorkMap`). A note is an editable sentence (`writeNote`); a goal is read-only
 * because the core has no call that edits one.
 */
import { useEffect, useMemo, useState } from "react";
import type { Client, Intelligence as Data, Note, WorkGraph } from "../core/client";
import { humanize, when } from "../modules/format";
import { Badge, Button, IconButton, ListRow, Notice, SectionCard, Tabs } from "../ui";
import { ICON, ICON_SM, PermissionIcon, X } from "../ui/icons";
import { FactRow } from "./FactRow";
import { BrainEgg } from "./map/BrainEgg";
import { brainOf } from "./map/egg";
import { cacheFor, WorkMap } from "./map/WorkMap";
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
      {body ? <p className="noteline__text">{body}</p> : <p className="noteline__text noteline__text--empty">{emptyText ?? "Nothing yet."}</p>}
      <Button size="sm" onClick={() => setEditing(true)} aria-label={`${body ? "Edit" : "Write"}: ${label}`}>
        {body ? "Edit" : "Write"}
      </Button>
    </div>
  );
}

const scopeWords = (n: Note) => (n.scope === "person" ? "About you" : n.scope.replace(/^(module|entity|skill):/, ""));

export type BrainView = "brain" | "map";

const VIEW_KEY = "alpha.brain.view";
const lastView = (): BrainView => {
  try {
    return localStorage.getItem(VIEW_KEY) === "map" ? "map" : "brain";
  } catch {
    return "brain";
  }
};

export function SecondBrain({ client, data, onChanged, onAsk, onGo, initialView }: { client: Client; data: Data; onChanged: () => void; onAsk?: (text: string) => void; onGo?: (s: Surface) => void; initialView?: BrainView }) {
  // Brain or Map is this window's choice, kept like its widths (not an address of its own).
  const [view, setViewState] = useState<BrainView>(() => initialView ?? lastView());
  const setView = (v: BrainView) => {
    setViewState(v);
    try {
      localStorage.setItem(VIEW_KEY, v);
    } catch {
      /* no storage: the choice is not kept */
    }
  };
  const { facts, notes, goals } = data.knowledge;
  const permissions = data.knowledge.permissions ?? [];
  const waiting = facts.filter((f) => f.state === "suggested" && f.predicate !== "related_to");
  const known = facts.filter((f) => f.state !== "suggested" && f.predicate !== "related_to");
  const instructions = notes.find((n) => n.scope === "person" && n.title === "Standing instructions");
  const others = notes.filter((n) => n !== instructions);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [picked, setPicked] = useState("you");
  // The world map is shared with Map: asked once, and again only on Map's Refresh (Q30).
  const [world, setWorld] = useState<WorkGraph | null>(() => cacheFor(client).get("world")?.graph ?? null);
  useEffect(() => {
    if (view !== "brain") return;
    const had = cacheFor(client).get("world");
    if (had) {
      setWorld(had.graph);
      return;
    }
    let live = true;
    client
      .graph("world")
      .then((graph) => {
        cacheFor(client).set("world", { graph, at: new Date() });
        if (live) setWorld(graph);
      })
      .catch(() => undefined); // the egg still draws what Intelligence holds
    return () => {
      live = false;
    };
  }, [client, view]);
  const brain = useMemo(() => brainOf(world, data), [world, data]);

  async function revoke(id: string) {
    try {
      await client.revokePermission(id);
      setMessage({ ok: true, text: "Revoked." });
      onChanged();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  }

  const switcher = <Tabs<BrainView> className="toggle toggle--views" style={{ alignSelf: "flex-start" }} label="Second Brain view" value={view} onChange={setView} items={[{ id: "brain", label: "Brain" }, { id: "map", label: "Map" }]} />;
  if (view === "map") {
    return (
      <div className="stack stack--wide">
        {switcher}
        <WorkMap client={client} onGo={onGo} />
      </div>
    );
  }

  const fact = picked.startsWith("fact:") ? known.find((f) => `fact:${f.id}` === picked) : undefined;
  const goal = picked.startsWith("goal:") ? goals.find((g) => `goal:${g.id}` === picked) : undefined;
  const unpick = <IconButton size="sm" label="Close" icon={<X size={ICON_SM} />} onClick={() => setPicked("you")} />;
  return (
    <div className="brain__box">
      <div className="brain">
        <div className="brain__left">
          {switcher}
          <BrainEgg client={client} brain={brain} selected={picked === "you" ? null : picked} onGo={onGo} onSelect={setPicked} />
        </div>
        <div className="brain__side stack">
          {waiting.length ? (
            <SectionCard title="Waiting for your confirmation" actions={<Badge tone="warn">{waiting.length}</Badge>}>
              {waiting.map((f) => (
                <FactRow key={f.id} fact={f} client={client} onChanged={onChanged} onAsk={onAsk} />
              ))}
            </SectionCard>
          ) : null}

          {fact ? (
            <SectionCard title={humanize(fact.predicate)} actions={unpick}>
              <FactRow fact={fact} client={client} onChanged={onChanged} onAsk={onAsk} />
            </SectionCard>
          ) : goal ? (
            <SectionCard title="Goal" actions={unpick}>
              <ListRow title={goal.text} description={`${goal.state === "active" ? "Active" : humanize(goal.state)} · since ${when(goal.since)}`} />
            </SectionCard>
          ) : (
            <SectionCard title="Facts" actions={known.length ? <Badge tone="gray">{known.length}</Badge> : undefined}>
              {known.length ? known.map((f) => <FactRow key={f.id} fact={f} client={client} onChanged={onChanged} onAsk={onAsk} />) : <p className="faint">None yet.</p>}
            </SectionCard>
          )}

          {goals.length ? (
            <SectionCard title="Goals">
              {goals.map((g) => (
                <ListRow key={g.id} title={g.text} description={`${g.state === "active" ? "Active" : humanize(g.state)} · since ${when(g.since)}`} />
              ))}
            </SectionCard>
          ) : null}

          <SectionCard title="Standing instructions">
            <NoteEditor client={client} scope="person" title="Standing instructions" body={instructions?.body ?? ""} summary={instructions?.summary} onChanged={onChanged} label="Standing instructions" emptyText="None yet." />
          </SectionCard>

          <SectionCard title="Standing permissions">
            {permissions.length ? (
              permissions.map((p) => (
                <ListRow key={p.id} icon={<PermissionIcon size={ICON} />} title={p.sentence} description={`Since ${when(p.granted_at)}`} controls={<Button size="sm" variant="ghost" onClick={() => void revoke(p.id)}>Revoke</Button>} />
              ))
            ) : (
              <p className="faint">None yet.</p>
            )}
            {message ? <Notice tone={message.ok ? "ok" : "bad"}>{message.text}</Notice> : null}
          </SectionCard>

          {others.map((n) => (
            <SectionCard key={n.id} title={n.title} subtitle={scopeWords(n)}>
              <NoteEditor client={client} scope={n.scope} title={n.title} body={n.body} summary={n.summary} onChanged={onChanged} label={`Edit ${n.title}`} />
            </SectionCard>
          ))}
        </div>
      </div>
    </div>
  );
}
