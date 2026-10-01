/**
 * Intelligence: everything Alpha can do (skills), runs on its own (automations), reaches
 * (connections) and knows (knowledge: facts, notes, goals). Each is a sentence the person can
 * read, switch or correct, never a configuration form.
 */
import { type FormEvent, useEffect, useState } from "react";
import type { Client, Connection, ConnectionRemoval, Intelligence as Data, Note } from "../core/client";
import { humanize, when } from "../modules/format";
import { AutomationList } from "./Automations";

export type IntelTab = "skills" | "automations" | "connections" | "knowledge";
const TABS: { id: IntelTab; label: string }[] = [
  { id: "skills", label: "Skills" },
  { id: "automations", label: "Automations" },
  { id: "connections", label: "Connections" },
  { id: "knowledge", label: "Knowledge" },
];

const CONNECTOR: Record<string, { icon: string; label: (c: Connection) => string; reach: string }> = {
  files: { icon: "▤", label: (c) => c.target.split("/").slice(-2).join("/"), reach: "Reads the documents in this folder as they change; never changes your files" },
  browser: { icon: "◎", label: (c) => `${c.target}, signed in as you`, reach: "Reads pages the way you would; never posts, messages or clicks" },
  calendar: { icon: "▦", label: () => "Your calendars", reach: "Reads events and attendees; adds nothing without a yes" },
};

const STATUS: Record<Connection["status"], { pill: string; words: string }> = {
  connected: { pill: "pill--good", words: "Connected" },
  needs_ok: { pill: "pill--warn", words: "Needs your OK" },
  broken: { pill: "pill--bad", words: "Not working" },
  off: { pill: "pill--gray", words: "Off" },
};

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** What removing a connection takes with it, in a sentence the person reads before saying yes. */
function removalWords(plan: ConnectionRemoval): string {
  const goes: string[] = [];
  if (plan.connector === "browser") goes.push(plan.signin ? "Alpha's sign-in (you'd sign in again to reconnect)" : "the connection");
  if (plan.readers.length) goes.push(`the ${plan.readers.length === 1 ? "reader" : "readers"} Alpha wrote for it`);
  if (plan.automations.length) goes.push(`the ${plan.automations.length === 1 ? "automation" : "automations"} ${plan.automations.map((t) => `“${t}”`).join(", ")}`);
  if (plan.documents) goes.push(`${plural(plan.documents, "document")} read from it`);
  if (plan.events) goes.push(`${plural(plan.events, "event")} read from it`);
  goes.push("Alpha's record of reading it");
  const list = goes.length > 1 ? `${goes.slice(0, -1).join(", ")} and ${goes[goes.length - 1]}` : goes[0];
  const kept = plan.connector === "files" ? " Your files aren't touched." : " What it already put in your tables stays.";
  return `This deletes ${list}.${kept}`;
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
        setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
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
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  }
  const live = data.connections.filter((c) => c.status !== "off");
  const hasCalendar = live.some((c) => c.connector === "calendar");
  return (
    <div className="stack">
      <div className="card list">
        {!live.length ? <p className="empty">Nothing connected yet. Alpha can always read public web pages; connect a folder, a site you sign into, or your calendar below.</p> : null}
        {live.map((c) => {
          const meta = CONNECTOR[c.connector] ?? { icon: "•", label: () => c.target, reach: "" };
          return (
            <div key={c.id} className="item">
              <div className="item__ico" aria-hidden="true">
                {meta.icon}
              </div>
              <div className="item__body">
                <b>{meta.label(c)}</b>
                <div className="item__sub">
                  {meta.reach}
                  {c.last_sync ? ` · last read ${when(c.last_sync)}` : ""}
                  {c.last_error ? ` · ${c.last_error}` : ""}
                </div>
              </div>
              <span className={`pill ${STATUS[c.status].pill}`}>{STATUS[c.status].words}</span>
              <button type="button" className="btn btn--sm" disabled={busy !== null} onClick={() => void run(c.id, () => client.syncConnection(c.id), "Read again.")}>
                {c.connector === "browser" ? "Check" : "Read now"}
              </button>
              <button type="button" className="btn btn--sm btn--ghost" disabled={busy !== null || removing !== null} onClick={() => askRemove(c.id)}>
                Remove
              </button>
              {removing?.id === c.id ? (
                <div className="removal" role="alertdialog" aria-label={`Remove ${meta.label(c)}`}>
                  {removing.plan ? (
                    <>
                      <p>
                        <b>Remove {c.connector === "browser" ? c.target : meta.label(c)}?</b> {removalWords(removing.plan)}
                      </p>
                      <div className="row">
                        <button type="button" className="btn btn--sm btn--danger" disabled={busy !== null} onClick={() => void run(c.id, () => client.removeConnection(c.id), "Removed.").then(() => setRemoving(null))}>
                          Remove
                        </button>
                        <button type="button" className="btn btn--sm btn--ghost" onClick={() => setRemoving(null)}>
                          Keep it
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="muted">Working out what goes with it…</p>
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="intel">
        <form className="card card--pad" onSubmit={(e: FormEvent) => { e.preventDefault(); void run("folder", () => client.connectFolder(folder.trim()), "Alpha is reading the folder."); }}>
          <div className="intel__head">
            <h3>A folder</h3>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>Resumes, notes, spreadsheets, PDFs. Alpha reads them and keeps up as they change.</p>
          <div className="row" style={{ marginTop: 10 }}>
            <input className="need__input" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="~/Documents/Job search" aria-label="Folder" />
            <button type="submit" className="btn btn--primary" disabled={!folder.trim() || busy !== null}>
              Read it
            </button>
          </div>
        </form>
        <form className="card card--pad" onSubmit={(e: FormEvent) => { e.preventDefault(); void run("site", () => client.connectSite(site.trim()), "A window is open: sign in there, then close it."); }}>
          <div className="intel__head">
            <h3>A site you sign into</h3>
          </div>
          <p className="muted" style={{ fontSize: 13 }}>LinkedIn, a job board, a dashboard. A window opens; you sign in yourself and close it.</p>
          <div className="row" style={{ marginTop: 10 }}>
            <input className="need__input" value={site} onChange={(e) => setSite(e.target.value)} placeholder="linkedin.com" aria-label="Site" />
            <button type="submit" className="btn btn--primary" disabled={!site.trim() || busy !== null}>
              Sign in
            </button>
          </div>
        </form>
        {!hasCalendar ? (
          <div className="card card--pad">
            <div className="intel__head">
              <h3>Your calendar</h3>
            </div>
            <p className="muted" style={{ fontSize: 13 }}>Every calendar in macOS Calendar (Google, iCloud, Exchange). macOS asks you once.</p>
            <div className="row" style={{ marginTop: 10 }}>
              <button type="button" className="btn btn--primary" disabled={busy !== null} onClick={() => void run("calendar", () => client.connectCalendar(), "Calendars connected.")}>
                Connect calendars
              </button>
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
            <button type="button" className="btn btn--sm btn--primary" onClick={() => void client.writeNote(note.scope, note.title, body).then(() => { setEditing(false); onChanged(); })}>
              Save
            </button>
            <button type="button" className="btn btn--sm btn--ghost" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </>
      ) : (
        <p className="muted editable" style={{ whiteSpace: "pre-wrap", fontSize: 13 }} onClick={() => setEditing(true)} title="Click to edit">
          {note.body}
        </p>
      )}
    </div>
  );
}

function Knowledge({ client, data, onChanged }: { client: Client; data: Data; onChanged: () => void }) {
  const { facts, notes, goals } = data.knowledge;
  const instructions = notes.find((n) => n.scope === "person" && n.title === "Standing instructions");
  return (
    <div className="intel">
      <div className="card card--pad intel__card">
        <div className="intel__head">
          <h3>About you</h3>
          <span className="faint">what you told Alpha, and what it noticed</span>
        </div>
        {!facts.length ? <p className="empty">Nothing yet. Tell Alpha about yourself in any conversation and it remembers.</p> : null}
        <dl className="intel__facts">
          {facts.map((f) => (
            <div key={f.id}>
              <dt>{humanize(f.predicate)}</dt>
              <dd>
                {f.value}
                {f.state === "suggested" ? (
                  <span className="row" style={{ marginTop: 4 }}>
                    <button type="button" className="btn btn--sm btn--primary" onClick={() => void client.decideFact(f.id, true).then(onChanged)}>
                      Yes
                    </button>
                    <button type="button" className="btn btn--sm btn--ghost" onClick={() => void client.decideFact(f.id, false).then(onChanged)}>
                      No
                    </button>
                  </span>
                ) : (
                  <span className="faint"> · {f.source.startsWith("turn:") ? "you said" : f.source}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
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
      {instructions ? null : (
        <NoteCard note={{ id: "new", scope: "person", title: "Standing instructions", body: "Ask before sending anything to anyone.", updated_at: "" }} client={client} onChanged={onChanged} />
      )}
      {notes.map((n) => (
        <NoteCard key={n.id} note={n} client={client} onChanged={onChanged} />
      ))}
    </div>
  );
}

export function Intelligence({ client, tab, version, onTab, onChanged }: { client: Client; tab: IntelTab; version: number; onTab: (t: IntelTab) => void; onChanged: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    client
      .intelligence()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [client, version]);
  return (
    <div className="page">
      <div className="home__head">
        <h1>Intelligence</h1>
        <span className="muted">Everything Alpha can do, runs on its own, reaches, and knows</span>
      </div>
      <div className="subtabs" role="tablist" style={{ marginTop: 16 }}>
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => onTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {!data ? (
        error ? <p className="notice">{error}</p> : <p className="muted">Loading…</p>
      ) : tab === "skills" ? (
        <div className="intel">
          {data.skills.map((s) => (
            <div key={s.name} className="card card--pad intel__card">
              <div className="intel__head">
                <h3>{s.title}</h3>
                <span className="pill pill--gray">{s.origin === "builtin" ? "Built in" : "Alpha made"}</span>
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
          {data.readers.map((r) => (
            <div key={r.name} className="card card--pad intel__card">
              <div className="intel__head">
                <h3>{r.description}</h3>
                <span className={`pill ${r.health === "ok" ? "pill--good" : "pill--bad"}`}>{r.health === "ok" ? "Working" : "Being repaired"}</span>
              </div>
              <p className="muted">
                Alpha made this to read {r.site}. Version {r.version}
                {r.last_run_at ? ` · last read ${r.last_count ?? 0} rows ${when(r.last_run_at)}` : ""}
              </p>
              {r.last_problem ? <p className="notice" style={{ fontSize: 12 }}>{r.last_problem}</p> : null}
            </div>
          ))}
          <div className="card card--pad intel__card modcard--new">
            <b>Skills Alpha learns</b>
            <p className="muted">When something works and you'll want it again, Alpha keeps how it did it here. Say "remember how I do this" to teach one.</p>
          </div>
        </div>
      ) : tab === "automations" ? (
        <AutomationList client={client} items={data.automations} onChanged={onChanged} empty="Nothing runs on its own yet. Ask Alpha to keep something current (“keep my LinkedIn connections up to date”) and it appears here as a sentence with a switch." />
      ) : tab === "connections" ? (
        <Connections client={client} data={data} onChanged={onChanged} />
      ) : (
        <Knowledge client={client} data={data} onChanged={onChanged} />
      )}
    </div>
  );
}
