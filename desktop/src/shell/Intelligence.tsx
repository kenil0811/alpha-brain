/**
 * Intelligence: everything Alpha can do (skills), runs on its own (automations), reaches
 * (connections) and knows (knowledge: facts, notes, goals). Each is a sentence the person can
 * read, switch or correct, never a configuration form.
 */
import { type FormEvent, useEffect, useState } from "react";
import { CalendarDays, Folder, Globe, Link } from "lucide-react";
import type { Client, Connection, ConnectionRemoval, Intelligence as Data, ModuleCard, Note } from "../core/client";
import { humanize, when } from "../modules/format";
import { InfoTip, PageHeader, Tabs } from "../ui";
import { AutomationList } from "./Automations";
import type { Surface } from "./Rail";
import { SecondBrain } from "./SecondBrain";

export type IntelTab = "brain" | "skills" | "automations" | "connections" | "knowledge";
const TABS: { id: IntelTab; label: string; hint: string }[] = [
  { id: "brain", label: "Second brain", hint: "What Alpha holds and how it connects" },
  { id: "skills", label: "Skills", hint: "Everything Alpha can do" },
  { id: "automations", label: "Automations", hint: "What runs on its own" },
  { id: "connections", label: "Connections", hint: "What Alpha can reach" },
  { id: "knowledge", label: "Knowledge", hint: "What Alpha knows about you" },
];

const CONNECTOR: Record<string, { icon: typeof Folder; label: (c: Connection) => string; reach: string }> = {
  files: { icon: Folder, label: (c) => c.target.split("/").slice(-2).join("/"), reach: "Reads the documents in this folder as they change; never changes your files" },
  browser: { icon: Globe, label: (c) => `${c.target}, signed in as you`, reach: "Reads pages the way you would; never posts, messages or clicks" },
  calendar: { icon: CalendarDays, label: () => "Your calendars", reach: "Reads events and attendees; adds nothing without a yes" },
};

const STATUS: Record<Connection["status"], { pill: string; words: string }> = {
  connected: { pill: "pill--good", words: "Connected" },
  needs_ok: { pill: "pill--warn", words: "Needs your OK" },
  broken: { pill: "pill--bad", words: "Not working" },
  off: { pill: "pill--gray", words: "Off" },
};

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
        {!live.length ? <p className="empty">Nothing connected yet.</p> : null}
        {live.map((c) => {
          const meta = CONNECTOR[c.connector] ?? { icon: Link, label: () => c.target, reach: "" };
          const Icon = meta.icon;
          return (
            <div key={c.id} className="item">
              <div className="item__ico" aria-hidden="true">
                <Icon size={16} />
              </div>
              <div className="item__body">
                <b>{meta.label(c)}</b>
                <div className={`item__sub${removing?.id === c.id ? " item__sub--warn" : ""}`}>
                  {removing?.id === c.id ? (
                    removing.plan ? removalWords(removing.plan) : "…"
                  ) : (
                    <>
                      {meta.reach}
                      {c.last_sync ? ` · last read ${when(c.last_sync)}` : ""}
                      {c.last_error ? ` · ${c.last_error}` : ""}
                    </>
                  )}
                </div>
              </div>
              <span className={`pill ${STATUS[c.status].pill}`}>{STATUS[c.status].words}</span>
              {removing?.id === c.id ? (
                <>
                  <button type="button" className="btn btn--sm" onClick={() => setRemoving(null)}>
                    Keep it
                  </button>
                  <button type="button" className="btn btn--sm btn--danger" disabled={!removing.plan || busy !== null} onClick={() => void run(c.id, () => client.removeConnection(c.id), "Removed.").then(() => setRemoving(null))}>
                    Remove
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="btn btn--sm" disabled={busy !== null} onClick={() => void run(c.id, () => client.syncConnection(c.id), "Read again.")}>
                    {c.connector === "browser" ? "Check" : "Read now"}
                  </button>
                  <button type="button" className="btn btn--sm btn--ghost" disabled={busy !== null || removing !== null} onClick={() => askRemove(c.id)}>
                    Remove
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="intel">
        <form className="card card--pad" onSubmit={(e: FormEvent) => { e.preventDefault(); void run("folder", () => client.connectFolder(folder.trim()), "Alpha is reading the folder."); }}>
          <div className="intel__head">
            <h3>A folder</h3>
            <InfoTip content="Resumes, notes, spreadsheets, PDFs. Alpha reads them and keeps up as they change." label="About folders" />
          </div>
          <div className="row">
            <input className="need__input" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="~/Documents/Job search" aria-label="Folder" />
            <button type="submit" className="btn btn--primary" disabled={!folder.trim() || busy !== null}>
              Read it
            </button>
          </div>
        </form>
        <form className="card card--pad" onSubmit={(e: FormEvent) => { e.preventDefault(); void run("site", () => client.connectSite(site.trim()), "A window is open: sign in there, then close it."); }}>
          <div className="intel__head">
            <h3>A site you sign into</h3>
            <InfoTip content="LinkedIn, a job board, a dashboard. A window opens; you sign in yourself and close it." label="About sites" />
          </div>
          <div className="row">
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
              <InfoTip content="Every calendar in macOS Calendar (Google, iCloud, Exchange). macOS asks you once." label="About calendars" />
            </div>
            <div className="row">
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
        <p className="muted editable note__body" onClick={() => setEditing(true)} title="Click to edit">
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
          <InfoTip content="What you told Alpha, and what it noticed. Tell it about yourself in any conversation and it remembers." label="About this" />
        </div>
        {!facts.length ? <p className="empty">Nothing yet.</p> : null}
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
          <InfoTip content={'Say one ("under 2,000 kcal on weekdays") and Alpha works towards it.'} label="About goals" />
        </div>
        {!goals.length ? <p className="empty">No goals yet.</p> : null}
        <div className="stack">
          {goals.map((g) => (
            <div key={g.id}>
              <b className="goal__text">{g.text}</b>
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

export function Intelligence({ client, modules, tab, version, onTab, onGo, onChanged }: { client: Client; modules: ModuleCard[]; tab: IntelTab; version: number; onTab: (t: IntelTab) => void; onGo: (s: Surface) => void; onChanged: () => void }) {
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
      <PageHeader title={<>Intelligence <InfoTip content="Everything Alpha can do, runs on its own, reaches, and knows." label="About Intelligence" /></>} />
      <Tabs className="page__tabs" aria-label="Intelligence" items={TABS.map((t) => ({ value: t.id, label: <span title={t.hint}>{t.label}</span> }))} value={tab} onChange={(v) => onTab(v as IntelTab)} />
      {!data ? (
        error ? <p className="notice" role="alert">{error}</p> : <p className="muted">Loading…</p>
      ) : tab === "brain" ? (
        <SecondBrain client={client} modules={modules} facts={data.knowledge.facts} onOpenModule={(id) => onGo({ kind: "module", id })} onOpenKnowledge={() => onTab("knowledge")} />
      ) : tab === "skills" ? (
        <div className="intel">
          {data.skills.map((s) => (
            <div key={s.name} className="card card--pad intel__card">
              <div className="intel__head">
                <h3>{s.title}</h3>
                <InfoTip content={s.description ?? ""} label={`About ${s.title}`} />
                <span className="pill pill--gray">{s.origin === "builtin" ? "Built in" : "Alpha made"}</span>
              </div>
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
                Reads {r.site} · version {r.version}
                {r.last_run_at ? ` · last read ${r.last_count ?? 0} rows ${when(r.last_run_at)}` : ""}
              </p>
              {r.last_problem ? <p className="notice notice--sm">{r.last_problem}</p> : null}
            </div>
          ))}
          <div className="card card--pad intel__card modcard--new">
            <div className="intel__head">
              <b>Skills Alpha learns</b>
              <InfoTip content={'When something works and you\'ll want it again, Alpha keeps how it did it here. Say "remember how I do this" to teach one.'} label="About learned skills" />
            </div>
          </div>
        </div>
      ) : tab === "automations" ? (
        <AutomationList client={client} items={data.automations} onChanged={onChanged} empty="Nothing runs on its own yet." />
      ) : tab === "connections" ? (
        <Connections client={client} data={data} onChanged={onChanged} />
      ) : (
        <Knowledge client={client} data={data} onChanged={onChanged} />
      )}
    </div>
  );
}
