/**
 * Intelligence: everything Alpha can do (skills), runs on its own (automations), reaches
 * (connections) and knows (knowledge: facts, notes, goals). Each is a sentence the person can
 * read, switch or correct, never a configuration form.
 */
import { type FormEvent, useEffect, useState } from "react";
import { CalendarDays, Folder, Globe, Link } from "lucide-react";
import type { Client, Connection, ConnectionRemoval, Intelligence as Data, ModuleCard, Note, Skill } from "../core/client";
import { humanize, when } from "../modules/format";
import { Badge, Button, InfoTip, PageHeader, Tabs } from "../ui";
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
          Connections <InfoTip text="Accounts and services your projects may use. Alpha never shows or stores raw passwords here." />
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
                  <Button size="sm" onClick={() => setRemoving(null)}>
                    Keep it
                  </Button>
                  <Button size="sm" variant="danger" disabled={!removing.plan || busy !== null} onClick={() => void run(c.id, () => client.removeConnection(c.id), "Removed.").then(() => setRemoving(null))}>
                    Remove
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" disabled={busy !== null} onClick={() => void run(c.id, () => client.syncConnection(c.id), "Read again.")}>
                    {c.connector === "browser" ? "Check" : "Read now"}
                  </Button>
                  <Button size="sm" variant="ghost" disabled={busy !== null || removing !== null} onClick={() => askRemove(c.id)}>
                    Remove
                  </Button>
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
            <InfoTip text="Resumes, notes, spreadsheets, PDFs. Alpha reads them and keeps up as they change." />
          </div>
          <div className="row">
            <input className="need__input" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="~/Documents/Job search" aria-label="Folder" />
            <Button variant="primary" type="submit" disabled={!folder.trim() || busy !== null}>
              Read it
            </Button>
          </div>
        </form>
        <form className="card card--pad" onSubmit={(e: FormEvent) => { e.preventDefault(); void run("site", () => client.connectSite(site.trim()), "A window is open: sign in there, then close it."); }}>
          <div className="intel__head">
            <h3>A site you sign into</h3>
            <InfoTip text="LinkedIn, a job board, a dashboard. A window opens; you sign in yourself and close it." />
          </div>
          <div className="row">
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
              <InfoTip text="Every calendar in macOS Calendar (Google, iCloud, Exchange). macOS asks you once." />
            </div>
            <div className="row">
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

const KIND_LABEL: Record<Skill["kind"], string> = { read: "Reads", act: "Does", run: "Runs" };

function SkillCard({ skill, modules, onOpen }: { skill: Skill; modules: Record<string, string>; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const where = skill.site ?? (skill.module ? modules[skill.module] ?? "a project" : "");
  const health = skill.health === "ok" ? "Working" : skill.health === "broken" ? "Being repaired" : "Not tried yet";
  return (
    <div className="card card--pad intel__card">
      <div className="intel__head">
        <h3>
          {onOpen ? (
            <button type="button" className="linkbtn" onClick={onOpen}>
              {skill.description}
            </button>
          ) : (
            skill.description
          )}
        </h3>
        <Badge tone={skill.health === "ok" ? "good" : skill.health === "broken" ? "bad" : "gray"}>{health}</Badge>
      </div>
      <p className="muted">
        <Badge tone="info" style={{ marginRight: 8 }}>
          {KIND_LABEL[skill.kind]}
        </Badge>
        {where ? `${where} · ` : ""}version {skill.version}
        {skill.effect ? ` · ${skill.effect === "send" ? "sends, asks every time" : "prepares, stays in your account"}` : ""}
        {skill.last_run_at ? ` · last ${skill.kind === "read" ? `read ${skill.last_count ?? 0} rows` : "run"} ${when(skill.last_run_at)}` : ""}
      </p>
      {skill.when_to_use ? <p className="faint">When: {skill.when_to_use}</p> : null}
      {skill.last_problem ? <p className="notice" style={{ fontSize: "var(--text-sm)" }}>{skill.last_problem}</p> : null}
      {skill.notes ? (
        <>
          <Button size="sm" style={{ marginTop: 6 }} onClick={() => setOpen(!open)}>
            {open ? "Hide notes" : "Alpha's notes"}
          </Button>
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
            <Button size="sm" variant="primary" onClick={() => void client.writeNote(note.scope, note.title, body).then(() => { setEditing(false); onChanged(); })}>
              Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
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
          <InfoTip text={'Say one ("under 2,000 kcal on weekdays") and Alpha works towards it.'} />
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
              <Button size="sm" variant="ghost" onClick={() => void client.revokePermission(p.id).then(onChanged)}>
                Revoke
              </Button>
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
      <PageHeader title={<>Intelligence <InfoTip text="What Alpha knows and can do across your projects." /></>} />
      <Tabs className="subtabs page__tabs" label="Intelligence" items={TABS.map((t) => ({ id: t.id, label: <span title={t.hint}>{t.label}</span> }))} value={tab} onChange={onTab} />
      {!data ? (
        error ? <p className="notice" role="alert">{error}</p> : <p className="muted">Loading…</p>
      ) : tab === "brain" ? (
        <SecondBrain client={client} modules={modules} facts={data.knowledge.facts} onOpenModule={(id) => onGo({ kind: "module", id })} onOpenKnowledge={() => onTab("knowledge")} />
      ) : tab === "skills" ? (
        <div className="stack">
          <Skills client={client} />
          <div className="section__head section__head--tight">
            <h2>
              Skills Alpha learns <InfoTip text="When Alpha reads a list, does a task on a site, or runs something on its own, it keeps how it did it here, versioned and repaired when a site changes." />
            </h2>
          </div>
          <div className="intel">
            {data.skills.length ? data.skills.map((s) => <SkillCard key={s.name} skill={s} modules={moduleNames} onOpen={() => onGo({ kind: "skill", name: s.name })} />) : <p className="muted">None yet.</p>}
          </div>
          <div className="section__head section__head--tight">
            <h2>
              Built in <InfoTip text="What Alpha can reach without being taught." />
            </h2>
          </div>
          <div className="intel">
            {data.hands.map((s) => (
              <div key={s.name} className="card card--pad intel__card">
                <div className="intel__head">
                  <h3>{s.title}</h3>
                  <InfoTip text={s.description ?? ""} />
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
