/**
 * Intelligence: everything Alpha can do (skills), runs on its own (automations), reaches
 * (connections) and knows (knowledge: facts, notes, goals). Each is a sentence the person can
 * read, switch or correct, never a configuration form.
 */
import { type FormEvent, useEffect, useState } from "react";
import { CalendarDays, Folder, Globe, Link } from "lucide-react";
import type { Client, Connection, ConnectionRemoval, Intelligence as Data, ModuleCard, Note, Skill } from "../core/client";
import { humanize, when } from "../modules/format";
import { InfoTip, PageHeader, Tabs } from "../ui";
import { AboutYou } from "./AboutYou";
import { AutomationTable } from "./Automations";
import { ProjectLinks } from "./ProjectLinks";
import { Skills } from "./Skills";
import type { Surface } from "./Rail";
import { SecondBrain } from "./SecondBrain";

export type IntelTab = "brain" | "skills" | "automations" | "connections" | "knowledge";
const TABS: { id: IntelTab; label: string; hint: string }[] = [
  { id: "brain", label: "Second brain", hint: "Every project and every fact Alpha holds, and how they connect." },
  { id: "skills", label: "Skills", hint: "A reusable ability outside any project: on its own, or when a sentence calls for it." },
  { id: "automations", label: "Automations", hint: "Every schedule across your projects, switchable in place." },
  { id: "connections", label: "Connections", hint: "A project reads another only when it asked to and you left it on." },
  { id: "knowledge", label: "Knowledge", hint: "What Alpha knows and uses across your projects." },
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
      <div className="section__head section__head--tight">
        <h2>
          Connections <InfoTip content="Accounts and services your projects may use. Alpha never shows or stores raw passwords here." label="About Connections" />
        </h2>
      </div>
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

const KIND_LABEL: Record<Skill["kind"], string> = { read: "Reads", act: "Does", run: "Runs" };

function SkillCard({ skill, modules }: { skill: Skill; modules: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  const where = skill.site ?? (skill.module ? modules[skill.module] ?? "a project" : "");
  const health = skill.health === "ok" ? "Working" : skill.health === "broken" ? "Being repaired" : "Not tried yet";
  return (
    <div className="card card--pad intel__card">
      <div className="intel__head">
        <h3>{skill.description}</h3>
        <span className={`pill ${skill.health === "ok" ? "pill--good" : skill.health === "broken" ? "pill--bad" : "pill--gray"}`}>{health}</span>
      </div>
      <p className="muted">
        <span className="pill pill--info" style={{ marginRight: 8 }}>
          {KIND_LABEL[skill.kind]}
        </span>
        {where ? `${where} · ` : ""}version {skill.version}
        {skill.effect ? ` · ${skill.effect === "send" ? "sends, asks every time" : "prepares, stays in your account"}` : ""}
        {skill.last_run_at ? ` · last ${skill.kind === "read" ? `read ${skill.last_count ?? 0} rows` : "run"} ${when(skill.last_run_at)}` : ""}
      </p>
      {skill.when_to_use ? <p className="faint">When: {skill.when_to_use}</p> : null}
      {skill.last_problem ? <p className="notice" style={{ fontSize: 12 }}>{skill.last_problem}</p> : null}
      {skill.notes ? (
        <>
          <button type="button" className="btn btn--sm" style={{ marginTop: 6 }} onClick={() => setOpen(!open)}>
            {open ? "Hide notes" : "Alpha's notes"}
          </button>
          {open ? <div className="people__page" style={{ marginTop: 8 }}>{skill.notes}</div> : null}
        </>
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
        <p className="muted editable note__body" onClick={() => setEditing(true)}>
          {note.body}
        </p>
      )}
    </div>
  );
}

function Knowledge({ client, data, modules, onChanged }: { client: Client; data: Data; modules: ModuleCard[]; onChanged: () => void }) {
  const { facts, notes, goals } = data.knowledge;
  const permissions = data.knowledge.permissions ?? [];
  const instructions = notes.find((n) => n.scope === "person" && n.title === "Standing instructions");
  return (
    <div className="stack">
    <AboutYou client={client} facts={facts} modules={modules} onChanged={onChanged} />
    <div className="intel">
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
              <button type="button" className="btn btn--sm btn--ghost" onClick={() => void client.revokePermission(p.id).then(onChanged)}>
                Revoke
              </button>
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
    </div>
  );
}

export function Intelligence({ client, modules, tab, version, onTab, onGo, onChanged }: { client: Client; modules: ModuleCard[]; tab: IntelTab; version: number; onTab: (t: IntelTab) => void; onGo: (s: Surface) => void; onChanged: () => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [moduleNames, setModuleNames] = useState<Record<string, string>>({});
  useEffect(() => {
    client
      .intelligence()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    client
      .modules()
      .then((list) => setModuleNames(Object.fromEntries(list.map((m) => [m.id, m.name]))))
      .catch(() => setModuleNames({}));
  }, [client, version]);
  return (
    <div className="page">
      <PageHeader title={<>Intelligence <InfoTip content="What Alpha knows and can do across your projects." label="About Intelligence" /></>} />
      <Tabs className="page__tabs" aria-label="Intelligence" items={TABS.map((t) => ({ value: t.id, label: <span title={t.hint}>{t.label}</span> }))} value={tab} onChange={(v) => onTab(v as IntelTab)} />
      {!data ? (
        error ? <p className="notice" role="alert">{error}</p> : <p className="muted">Loading…</p>
      ) : tab === "brain" ? (
        <SecondBrain client={client} modules={modules} facts={data.knowledge.facts} onOpenModule={(id) => onGo({ kind: "module", id })} onOpenKnowledge={() => onTab("knowledge")} />
      ) : tab === "skills" ? (
        <div className="stack">
          <Skills client={client} />
          <div className="section__head section__head--tight">
            <h2>
              Skills Alpha learns <InfoTip content="When Alpha reads a list, does a task on a site, or runs something on its own, it keeps how it did it here, versioned and repaired when a site changes." label="About skills Alpha learns" />
            </h2>
          </div>
          <div className="intel">
            {data.skills.length ? data.skills.map((s) => <SkillCard key={s.name} skill={s} modules={moduleNames} />) : <p className="muted">None yet.</p>}
          </div>
          <div className="section__head section__head--tight">
            <h2>
              Built in <InfoTip content="What Alpha can reach without being taught." label="About built-in abilities" />
            </h2>
          </div>
          <div className="intel">
            {data.hands.map((s) => (
              <div key={s.name} className="card card--pad intel__card">
                <div className="intel__head">
                  <h3>{s.title}</h3>
                  <InfoTip content={s.description ?? ""} label={`About ${s.title}`} />
                  <span className="pill pill--gray">Built in</span>
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
          </div>
        </div>
      ) : tab === "automations" ? (
        <AutomationTable client={client} items={data.automations} modules={modules} onOpenModule={(id) => onGo({ kind: "module", id })} onChanged={onChanged} />
      ) : tab === "connections" ? (
        <div className="stack">
          <Connections client={client} data={data} onChanged={onChanged} />
          <ProjectLinks client={client} modules={modules} version={version} onOpenModule={(id) => onGo({ kind: "module", id })} />
        </div>
      ) : (
        <Knowledge client={client} data={data} modules={modules} onChanged={onChanged} />
      )}
    </div>
  );
}
