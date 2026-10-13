/**
 * Intelligence: everything Alpha can do (skills), its agents (automations: one per recurring process), reaches
 * (connections) and knows (knowledge: facts, notes, goals). Each is a sentence the person can
 * read, switch or correct, never a configuration form.
 */
import { WorkMap } from "./map/WorkMap";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { Client, ConnectionRemoval, Intelligence as Data, Note, Permission } from "../core/client";
import { humanize, when } from "../modules/format";
import { DataPage, type HeldRows } from "../modules/DataPage";
import { skillsHeld, skillsTable } from "./intel/skillsTable";
import { CONNECTION_COLOURS, connectionRow, connectionsTable, reachLines } from "./intel/connectionsTable";
import { AGENT_COLOURS, agentsTable, alphaRow, automationRow } from "./intel/agentsTable";
import { FACT_COLOURS, factRow, factsTable } from "./intel/factsTable";
import { AgentFace, ALPHA_AGENT } from "./AgentFace";
import type { Surface } from "./Rail";
import { Button, Badge, Confirm, Tabs } from "../ui";
import { say } from "../core/client";

export type IntelTab = "map" | "skills" | "automations" | "connections" | "knowledge";
const TABS: { id: IntelTab; label: string }[] = [
  { id: "map", label: "Map" },
  { id: "skills", label: "Skills" },
  { id: "automations", label: "Agents" },
  { id: "connections", label: "Connections" },
  { id: "knowledge", label: "Knowledge" },
];

/** What removing a connection takes with it: the same words Activity records afterwards. */
function removalWords(plan: ConnectionRemoval): string {
  return `Removes ${plan.what}. ${plan.connector === "files" ? "Your files stay." : "Your tables keep their rows."}`;
}

function Connections({ client, data, onChanged }: { client: Client; data: Data; onChanged: () => void }) {
  const [folder, setFolder] = useState("");
  const [site, setSite] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [removing, setRemoving] = useState<{ id: string; plan: ConnectionRemoval | null } | null>(null);
  function askRemove(id: string) {
    setRemoving({ id, plan: null });
    client
      .connectionRemoval(id)
      .then((plan) => setRemoving((r) => (r?.id === id ? { id, plan } : r)))
      .catch((e: unknown) => {
        setRemoving(null);
        setMessage({ ok: false, text: say(e) });
      });
  }
  async function run(label: string, work: () => Promise<unknown>, ok: string) {
    setBusy(label);
    setMessage(null);
    try {
      await work();
      setMessage({ ok: true, text: ok });
      onChanged();
    } catch (e) {
      setMessage({ ok: false, text: say(e) });
    } finally {
      setBusy(null);
    }
  }
  const live = useMemo(() => data.connections.filter((c) => c.status !== "off"), [data]);
  const hasCalendar = live.some((c) => c.connector === "calendar");
  // the table (section 7b): its columns and rows kept the same until the connections change;
  // the buttons are read fresh each time, so they show what is busy
  const table = useMemo(() => connectionsTable(live), [live]);
  const load = useMemo(() => () => Promise.resolve(live.map(connectionRow)), [live]);
  const byId = new Map(live.map((c) => [c.id, c]));
  const held: HeldRows = {
    load,
    words: "Add one below",
    colours: CONNECTION_COLOURS,
    actions: (row) => {
      const c = byId.get(row.id);
      if (!c) return null;
      return (
        <>
          <Button size="sm" disabled={busy !== null} onClick={() => void run(c.id, () => client.syncConnection(c.id), "Read again.")}>
            {busy === c.id ? "…" : c.connector === "browser" ? "Check" : "Read now"}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy !== null || removing !== null} onClick={() => askRemove(c.id)}>
            {removing?.id === c.id && !removing.plan ? "…" : "Remove"}
          </Button>
        </>
      );
    },
  };
  const going = removing?.plan ? byId.get(removing.id) : undefined;
  return (
    <div className="stack">
      {live.length ? (
        <div className="intel__table">
          <DataPage client={client} table={table} held={held} version={0} onChanged={onChanged} />
          <p className="faint intel__reach">{reachLines(live).join(" ")}</p>
        </div>
      ) : (
        <div className="card">
          <p className="empty">Nothing connected yet. Alpha can always read public web pages; connect a folder, a site you sign into, or your calendar below.</p>
        </div>
      )}
      <Confirm open={Boolean(going)} title={going ? `Remove ${String(connectionRow(going).values.what)}?` : ""} action="Remove" onConfirm={() => { const id = removing?.id; setRemoving(null); if (id) void run(id, () => client.removeConnection(id), "Removed."); }} onCancel={() => setRemoving(null)}>
        {removing?.plan ? removalWords(removing.plan) : null}
      </Confirm>
      <div className="intel">
        <form className="card card--pad" onSubmit={(e: FormEvent) => { e.preventDefault(); void run("folder", () => client.connectFolder(folder.trim()), "Alpha is reading the folder."); }}>
          <div className="intel__head">
            <h3>A folder</h3>
          </div>
          <p className="muted" style={{ fontSize: "var(--text-md)" }}>Resumes, notes, spreadsheets, PDFs. Alpha reads them and keeps up as they change.</p>
          <div className="row" style={{ marginTop: 10 }}>
            <input className="need__input" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="~/Documents/Job search" aria-label="Folder" />
            <Button variant="primary" type="submit" disabled={!folder.trim() || busy !== null}>
              Read it
            </Button>
          </div>
        </form>
        <form className="card card--pad" onSubmit={(e: FormEvent) => { e.preventDefault(); void run("site", () => client.connectSite(site.trim()), "A window is open: sign in there, then close it."); }}>
          <div className="intel__head">
            <h3>A site you sign into</h3>
          </div>
          <p className="muted" style={{ fontSize: "var(--text-md)" }}>LinkedIn, a job board, a dashboard. A window opens; you sign in yourself and close it.</p>
          <div className="row" style={{ marginTop: 10 }}>
            <input className="need__input" value={site} onChange={(e) => setSite(e.target.value)} placeholder="linkedin.com" aria-label="Site" />
            <Button variant="primary" type="submit" disabled={!site.trim() || busy !== null}>
              Sign in
            </Button>
          </div>
        </form>
        {!hasCalendar ? (
          <div className="card card--pad">
            <div className="intel__head">
              <h3>Your calendar</h3>
            </div>
            <p className="muted" style={{ fontSize: "var(--text-md)" }}>Every calendar in macOS Calendar (Google, iCloud, Exchange). macOS asks you once.</p>
            <div className="row" style={{ marginTop: 10 }}>
              <Button variant="primary" disabled={busy !== null} onClick={() => void run("calendar", () => client.connectCalendar(), "Calendars connected.")}>
                Connect calendars
              </Button>
            </div>
          </div>
        ) : null}
      </div>
      {message ? (
        <p className={message.ok ? "notice notice--ok" : "notice"} role="status">
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

function NoteCard({ note, client, onChanged }: { note: Note; client: Client; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  return (
    <div className="card card--pad intel__card">
      <div className="intel__head">
        <h3>{note.title}</h3>
        <span className="faint">{note.scope === "person" ? "about you" : note.scope.replace(/^module:/, "")}</span>
      </div>
      {editing ? (
        <>
          <textarea className="note__edit" rows={6} value={body} onChange={(e) => setBody(e.target.value)} aria-label={`Edit ${note.title}`} />
          <div className="row" style={{ marginTop: 8 }}>
            <Button size="sm" variant="primary" onClick={() => void client.writeNote(note.scope, note.title, body).then(() => { setEditing(false); onChanged(); })}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </>
      ) : (
        <p className="muted editable" style={{ whiteSpace: "pre-wrap", fontSize: "var(--text-md)" }} onClick={() => setEditing(true)} title="Click to edit">
          {note.body}
        </p>
      )}
    </div>
  );
}

function Knowledge({ client, data, onChanged }: { client: Client; data: Data; onChanged: () => void }) {
  const { facts, notes, goals } = data.knowledge;
  const permissions = data.knowledge.permissions ?? [];
  const instructions = notes.find((n) => n.scope === "person" && n.title === "Standing instructions");
  // About you as a table (section 7d): a suggested fact's Yes and No at its row's end
  const [deciding, setDeciding] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<Permission | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const decide = (id: string, accept: boolean) => {
    setDeciding(id);
    setProblem(null);
    client
      .decideFact(id, accept)
      .then(onChanged)
      .catch((e: unknown) => setProblem(`Couldn't keep that: ${say(e)}`))
      .finally(() => setDeciding(null));
  };
  const factTable = useMemo(() => factsTable(facts), [facts]);
  // the suggested ones first: they wait on the person
  const factLoad = useMemo(() => () => Promise.resolve([...facts].sort((a, b) => Number(b.state === "suggested") - Number(a.state === "suggested")).map(factRow)), [facts]);
  const suggested = new Set(facts.filter((f) => f.state === "suggested").map((f) => f.id));
  const factRows: HeldRows = {
    load: factLoad,
    words: "Changed by telling Alpha",
    colours: FACT_COLOURS,
    actions: (row) =>
      suggested.has(row.id) ? (
        <>
          <Button size="sm" variant="primary" disabled={deciding !== null} onClick={() => decide(row.id, true)}>
            Yes
          </Button>
          <Button size="sm" variant="ghost" disabled={deciding !== null} onClick={() => decide(row.id, false)}>
            No
          </Button>
        </>
      ) : null,
  };
  return (
    <div className="intel">
      <div className="intel__group">About you · what you told Alpha, and what it noticed</div>
      {facts.length ? (
        <div className="intel__table">
          <DataPage client={client} table={factTable} held={factRows} version={0} onChanged={onChanged} />
        </div>
      ) : (
        <div className="card card--pad intel__card">
          <p className="empty">Nothing yet. Tell Alpha about yourself in any conversation and it remembers.</p>
        </div>
      )}
      {problem ? <p className="notice intel__table" role="alert">{problem}</p> : null}
      <div className="card card--pad intel__card">
        <div className="intel__head">
          <h3>Goals</h3>
        </div>
        {!goals.length ? <p className="empty">No goals yet. Say one ("under 2,000 kcal on weekdays") and Alpha works towards it.</p> : null}
        <div className="stack">
          {goals.map((g) => (
            <div key={g.id}>
              <b style={{ fontWeight: 500 }}>{g.text}</b>
              <div className="item__sub">
                {g.state === "active" ? "Active" : humanize(g.state)} · since {when(g.since)}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="card card--pad intel__card">
        <div className="intel__head">
          <h3>Standing permissions</h3>
          <span className="faint">what Alpha may do without asking; anything sent asks every time</span>
        </div>
        {!permissions.length ? <p className="empty">None yet. When Alpha proposes a draft or a message, "Always allow" on its card makes one.</p> : null}
        <div className="stack">
          {permissions.map((p) => (
            <div key={p.id} className="row" style={{ justifyContent: "space-between" }}>
              <span>
                {p.sentence} <span className="faint">· since {when(p.granted_at)}</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => setRevoking(p)}>
                Revoke
              </Button>
            </div>
          ))}
        </div>
        {/* a revoke asks first (section 9c), saying what changes */}
        <Confirm open={revoking !== null} title="Revoke this permission?" action="Revoke" onConfirm={() => { const p = revoking; setRevoking(null); if (p) client.revokePermission(p.id).then(onChanged).catch((e: unknown) => setProblem(`Couldn't revoke it: ${say(e)}`)); }} onCancel={() => setRevoking(null)}>
          {revoking ? `“${revoking.sentence}”: Alpha will ask you again before doing this.` : null}
        </Confirm>
      </div>
      {instructions ? null : (
        <NoteCard note={{ id: "new", scope: "person", title: "Standing instructions", body: "Ask before sending anything to anyone.", updated_at: "" }} client={client} onChanged={onChanged} />
      )}
      {notes.map((n) => (
        <NoteCard key={n.id} note={n} client={client} onChanged={onChanged} />
      ))}
    </div>
  );
}

/** Agents (section 7c): Alpha and the automations in one table, each wearing its face; an
 *  automation's switch and Run now at its row's start (the list had the switch first). */
function Agents({ client, data, modules, onChanged, onGo }: { client: Client; data: Data; modules: Record<string, string>; onChanged: () => void; onGo?: (s: Surface) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function act(id: string, work: () => Promise<unknown>, words: string) {
    setBusy(id);
    setMessage(null);
    try {
      await work();
      setMessage({ ok: true, text: words });
      onChanged();
    } catch (e) {
      setMessage({ ok: false, text: say(e) });
    } finally {
      setBusy(null);
    }
  }
  const table = useMemo(() => agentsTable(data.automations, modules), [data, modules]);
  const load = useMemo(() => () => Promise.resolve([alphaRow(), ...data.automations.map((a) => automationRow(a, modules))]), [data, modules]);
  const byId = new Map(data.automations.map((a) => [a.id, a]));
  const held: HeldRows = {
    load,
    words: "Changed by asking Alpha",
    colours: AGENT_COLOURS,
    icon: (row) => <AgentFace client={client} id={row.id} label={`${String(row.values.agent)}'s face`} />,
    actions: (row) => {
      const a = byId.get(row.id);
      if (!a) return null;
      return (
        <>
          <button type="button" className={`switch${a.enabled ? "" : " switch--off"}`} role="switch" aria-checked={a.enabled} aria-label={a.enabled ? `Switch off: ${a.title}` : `Switch on: ${a.title}`} disabled={busy === a.id} onClick={() => void act(a.id, () => client.switchAutomation(a.id, !a.enabled), a.enabled ? "Switched off." : "Switched on.")} />
          <Button size="sm" disabled={busy === a.id || a.running} onClick={() => void act(a.id, () => client.runAutomation(a.id), "Started. Its steps show on its page as it goes.")}>
            {a.running ? "Running…" : "Run now"}
          </Button>
        </>
      );
    },
  };
  return (
    <div className="stack">
      <div className="intel__table">
        <DataPage client={client} table={table} held={held} version={0} onChanged={onChanged} onOpenRecord={onGo ? (_t, id) => onGo(id === ALPHA_AGENT ? { kind: "assistant" } : { kind: "automation", id }) : undefined} />
        {!data.automations.length ? <p className="faint intel__reach">No automations yet. Ask Alpha to keep something current ("keep my LinkedIn connections up to date") and it appears here with a switch, a verdict per run and a page you can edit.</p> : null}
      </div>
      {message ? (
        <p className={message.ok ? "notice notice--ok" : "notice"} role="status">
          {message.text}
        </p>
      ) : null}
    </div>
  );
}

export function Intelligence({ client, tab, version, onTab, onChanged, onGo }: { client: Client; tab: IntelTab; version: number; onTab: (t: IntelTab) => void; onChanged: () => void; onGo?: (s: Surface) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modules, setModules] = useState<Record<string, string>>({});
  useEffect(() => {
    client
      .intelligence()
      .then(setData)
      .catch((e: unknown) => setError(say(e)));
    client
      .modules()
      .then((list) => setModules(Object.fromEntries(list.map((m) => [m.id, m.name]))))
      .catch(() => setModules({}));
  }, [client, version]);
  // Skills as a table (section 7a): the columns and the rows, kept the same until either changes
  const skillTable = useMemo(() => skillsTable(data?.skills ?? [], modules), [data, modules]);
  const skillRows = useMemo(() => skillsHeld(data?.skills ?? [], modules), [data, modules]);
  return (
    <div className="page">
      <div className="home__head">
        <h1>Intelligence</h1>
        <span className="muted">Everything Alpha can do, runs on its own, reaches, and knows</span>
      </div>
      <Tabs label="Intelligence" value={tab} onChange={onTab} items={TABS} style={{ marginTop: 16 }} />
      {!data ? (
        error ? <p className="notice">{error}</p> : <p className="muted">Loading…</p>
      ) : tab === "map" ? (
        <WorkMap client={client} onGo={onGo} />
      ) : tab === "skills" ? (
        <div className="intel">
          {data.skills.length ? (
            <div className="intel__table">
              <DataPage client={client} table={skillTable} held={skillRows} version={version} onChanged={onChanged} onOpenRecord={onGo ? (_t, name) => onGo({ kind: "skill", name }) : undefined} />
            </div>
          ) : (
            <div className="card card--pad intel__card modcard--new">
              <b>Skills Alpha learns</b>
              <p className="muted">When Alpha reads a list, does a task on a site, or runs something on its own, it keeps how it did it here, versioned and repaired when a site changes.</p>
            </div>
          )}
          <div className="intel__group">Hands</div>
          {data.hands.map((s) => (
            <div key={s.name} className="card card--pad intel__card">
              <div className="intel__head">
                <h3>{s.title}</h3>
                <Badge tone="gray">Built in</Badge>
              </div>
              <p className="muted">{s.description}</p>
              <div className="skill__meta">
                {s.tools.map((t) => (
                  <span key={t.name} className="faint" title={t.description}>
                    {humanize(t.name)}
                    {t.effect === "write" ? " (asks first)" : ""}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : tab === "automations" ? (
        <Agents client={client} data={data} modules={modules} onChanged={onChanged} onGo={onGo} />
      ) : tab === "connections" ? (
        <Connections client={client} data={data} onChanged={onChanged} />
      ) : (
        <Knowledge client={client} data={data} onChanged={onChanged} />
      )}
    </div>
  );
}
