/**
 * Intelligence: everything Zazoo can do (skills), runs on its own (automations), reaches
 * (connections) and knows (knowledge: facts, notes, goals). Each is a sentence the person can
 * read, switch or correct, never a configuration form; a click opens its own page
 * (IntelItem.tsx), where every field edits.
 */
import { WorkMap } from "./map/WorkMap";
import { type FormEvent, useEffect, useState } from "react";
import type { Client, Connection, ConnectionRemoval, GraphNode, Intelligence as Data, Note, Skill } from "../core/client";
import { humanize, when } from "../modules/format";
import { AutomationList } from "./Automations";
import type { Surface } from "./Rail";
import { factOrigin } from "./facts";
import { Button, Badge, IconButton, Tabs, useComingSoon } from "../ui";
import { PlusIcon, X } from "../ui/icons";
import { findItem, INSTRUCTIONS, IntelItemPage, opener, type ItemContext } from "./IntelItem";

export type IntelTab = "map" | "skills" | "automations" | "connections" | "knowledge";
const TABS: { id: IntelTab; label: string }[] = [
  { id: "map", label: "Map" },
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

/** What removing a connection takes with it: the same words Activity records afterwards. */
function removalWords(plan: ConnectionRemoval): string {
  return `Removes ${plan.what}. ${plan.connector === "files" ? "Your files stay." : "Your tables keep their rows."}`;
}

function Connections({ client, data, onChanged, onOpen }: { client: Client; data: Data; onChanged: () => void; onOpen: (id: string) => void }) {
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
        {!live.length ? <p className="empty">Nothing connected yet. Zazoo can always read public web pages; connect a folder, a site you sign into, or your calendar below.</p> : null}
        {live.map((c) => {
          const meta = CONNECTOR[c.connector] ?? { icon: "•", label: () => c.target, reach: "" };
          return (
            <div key={c.id} className="item item--open" onClick={opener(() => onOpen(c.id))}>
              <div className="item__ico" aria-hidden="true">
                {meta.icon}
              </div>
              <div className="item__body">
                <button type="button" className="linkbtn item__title" onClick={() => onOpen(c.id)}>
                  {meta.label(c)}
                </button>
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
        <form className="card card--pad" onSubmit={(e: FormEvent) => { e.preventDefault(); void run("folder", () => client.connectFolder(folder.trim()), "Zazoo is reading the folder."); }}>
          <div className="intel__head">
            <h3>A folder</h3>
          </div>
          <p className="muted" style={{ fontSize: "var(--text-md)" }}>Resumes, notes, spreadsheets, PDFs. Zazoo reads them and keeps up as they change.</p>
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

const KIND_LABEL: Record<Skill["kind"], string> = { read: "Reads", act: "Does", run: "Runs" };

function SkillCard({ skill, modules, onOpen }: { skill: Skill; modules: Record<string, string>; onOpen?: () => void }) {
  const [open, setOpen] = useState(false);
  const soon = useComingSoon();
  const where = skill.site ?? (skill.module ? modules[skill.module] ?? "a module" : "");
  const health = skill.health === "ok" ? "Working" : skill.health === "broken" ? "Being repaired" : "Not tried yet";
  return (
    <div className={`card card--pad intel__card${onOpen ? " intel__card--open" : ""}`} onClick={onOpen ? opener(onOpen) : undefined}>
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
      <div className="row" style={{ marginTop: 6 }}>
        <Button size="sm" onClick={() => soon("Running a skill on its own")}>
          Run
        </Button>
        {skill.notes ? (
          <Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>
            {open ? "Hide notes" : "Zazoo's notes"}
          </Button>
        ) : null}
      </div>
      {skill.notes && open ? <div className="people__page" style={{ marginTop: 8 }}>{skill.notes}</div> : null}
    </div>
  );
}

/** A note: its title opens its page, a double-click on its text edits it here. */
function NoteCard({ note, client, onChanged, onOpen }: { note: Note; client: Client; onChanged: () => void; onOpen: () => void }) {
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(note.body);
  return (
    <div className="card card--pad intel__card">
      <div className="intel__head">
        <h3>
          <button type="button" className="linkbtn" onClick={onOpen}>
            {note.title}
          </button>
        </h3>
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
        <p className="muted editable" style={{ whiteSpace: "pre-wrap", fontSize: "var(--text-md)" }} onDoubleClick={() => setEditing(true)} title="Double-click to edit">
          {note.body}
        </p>
      )}
    </div>
  );
}

function Knowledge({ client, data, onChanged, onOpen }: { client: Client; data: Data; onChanged: () => void; onOpen: (id: string) => void }) {
  const { facts, notes, goals } = data.knowledge;
  const soon = useComingSoon();
  const [field, setField] = useState("");
  const [value, setValue] = useState("");
  const permissions = data.knowledge.permissions ?? [];
  const instructions = notes.find((n) => n.scope === "person" && n.title === "Standing instructions");
  return (
    <div className="intel">
      <div className="card card--pad intel__card">
        <div className="intel__head">
          <h3>About you</h3>
          <span className="faint">what you told Zazoo, and what it noticed</span>
        </div>
        {!facts.length ? <p className="empty">Nothing yet. Tell Zazoo about yourself in any conversation and it remembers.</p> : null}
        <dl className="intel__facts">
          {facts.map((f) => (
            <div key={f.id} className="intel__fact" onClick={opener(() => onOpen(f.id))}>
              <dt>
                <button type="button" className="linkbtn" onClick={() => onOpen(f.id)}>
                  {humanize(f.predicate)}
                </button>
                {f.state !== "suggested" ? <IconButton size="sm" className="intel__forget" label={`Forget ${humanize(f.predicate).toLowerCase()}`} icon={<X size={13} />} onClick={() => soon("Forgetting a fact")} /> : null}
              </dt>
              <dd>
                {f.value}
                <div className="faint">{factOrigin(f)}</div>
                {f.state === "suggested" ? (
                  <span className="row" style={{ marginTop: 4 }}>
                    <Button size="sm" variant="primary" onClick={() => void client.decideFact(f.id, true).then(onChanged)}>
                      Yes
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => void client.decideFact(f.id, false).then(onChanged)}>
                      No
                    </Button>
                  </span>
                ) : null}
              </dd>
            </div>
          ))}
        </dl>
        <form className="row intel__add" onSubmit={(e: FormEvent) => { e.preventDefault(); soon("Adding a fact"); }}>
          <input className="need__input" value={field} onChange={(e) => setField(e.target.value)} placeholder="A new fact" aria-label="What" />
          <input className="need__input" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Its value" aria-label="Value" />
          <Button size="sm" type="submit" icon={<PlusIcon size={14} />} disabled={!field.trim() || !value.trim()}>
            Add
          </Button>
        </form>
      </div>
      <div className="card card--pad intel__card">
        <div className="intel__head">
          <h3>Goals</h3>
        </div>
        {!goals.length ? <p className="empty">No goals yet. Say one ("under 2,000 kcal on weekdays") and Zazoo works towards it.</p> : null}
        <div className="stack">
          {goals.map((g) => (
            <div key={g.id} className="intel__open" onClick={opener(() => onOpen(g.id))}>
              <button type="button" className="linkbtn" style={{ fontWeight: 500 }} onClick={() => onOpen(g.id)}>
                {g.text}
              </button>
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
          <span className="faint">what Zazoo may do without asking; anything sent asks every time</span>
        </div>
        {!permissions.length ? <p className="empty">None yet. When Zazoo proposes a draft or a message, "Always allow" on its card makes one.</p> : null}
        <div className="stack">
          {permissions.map((p) => (
            <div key={p.id} className="row intel__open" style={{ justifyContent: "space-between" }} onClick={opener(() => onOpen(p.id))}>
              <span>
                <button type="button" className="linkbtn" onClick={() => onOpen(p.id)}>
                  {p.sentence}
                </button>{" "}
                <span className="faint">· since {when(p.granted_at)}</span>
              </span>
              <Button size="sm" variant="ghost" onClick={() => void client.revokePermission(p.id).then(onChanged)}>
                Revoke
              </Button>
            </div>
          ))}
        </div>
      </div>
      {instructions ? null : (
        <NoteCard note={INSTRUCTIONS} client={client} onChanged={onChanged} onOpen={() => onOpen(INSTRUCTIONS.id)} />
      )}
      {notes.map((n) => (
        <NoteCard key={n.id} note={n} client={client} onChanged={onChanged} onOpen={() => onOpen(n.id)} />
      ))}
    </div>
  );
}

/** The item a map node is, as (tab, id) for `findItem`: node ids are `<kind>:<id>`. */
const NODE_TAB: Partial<Record<GraphNode["kind"], string>> = { skill: "skills", automation: "automations", connection: "connections", goal: "knowledge", page: "knowledge" };

export function Intelligence({ client, tab, item, version, onTab, onChanged, onGo, onAsk }: { client: Client; tab: IntelTab; item?: string; version: number; onTab: (t: IntelTab) => void; onChanged: () => void; onGo: (s: Surface) => void; onAsk: (text: string) => void }) {
  const soon = useComingSoon();
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modules, setModules] = useState<Record<string, string>>({});
  useEffect(() => {
    client
      .intelligence()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    client
      .modules()
      .then((list) => setModules(Object.fromEntries(list.map((m) => [m.id, m.name]))))
      .catch(() => setModules({}));
  }, [client, version]);
  const ctx: ItemContext | null = data ? { client, data, modules, onGo, onAsk, onChanged } : null;
  const open = (t: string) => (id: string) => onGo({ kind: "intelligence", tab: t, item: id });
  if (item) return ctx ? <IntelItemPage tab={tab} item={item} ctx={ctx} /> : <div className="page">{error ? <p className="notice">{error}</p> : <p className="empty">Loading…</p>}</div>;
  return (
    <div className="page">
      <div className="home__head">
        <h1>Intelligence</h1>
        <span className="muted">Everything Zazoo can do, runs on its own, reaches, and knows</span>
      </div>
      <Tabs label="Intelligence" value={tab} onChange={onTab} items={TABS} style={{ marginTop: 16 }} />
      {!data ? (
        error ? <p className="notice">{error}</p> : <p className="muted">Loading…</p>
      ) : tab === "map" ? (
        <WorkMap
          client={client}
          onGo={onGo}
          card={(n) => {
            const t = NODE_TAB[n.kind];
            return t && ctx ? findItem(t, n.id.slice(n.kind.length + 1), ctx)?.body : null;
          }}
        />
      ) : tab === "skills" ? (
        <div className="intel">
          <div className="intel__group intel__group--bar">
            Learned
            <Button size="sm" icon={<PlusIcon size={14} />} onClick={() => soon("A new skill")}>
              New skill
            </Button>
          </div>
          {data.skills.length ? (
            data.skills.map((s) => <SkillCard key={s.name} skill={s} modules={modules} onOpen={() => onGo({ kind: "skill", name: s.name })} />)
          ) : (
            <div className="card card--pad intel__card modcard--new">
              <b>Skills Zazoo learns</b>
              <p className="muted">When Zazoo reads a list, does a task on a site, or runs something on its own, it keeps how it did it here, versioned and repaired when a site changes.</p>
            </div>
          )}
          <div className="intel__group">Hands</div>
          {data.hands.map((s) => (
            <div key={s.name} className="card card--pad intel__card intel__card--open" onClick={opener(() => open("skills")(`hand:${s.name}`))}>
              <div className="intel__head">
                <h3>
                  <button type="button" className="linkbtn" onClick={() => open("skills")(`hand:${s.name}`)}>
                    {s.title}
                  </button>
                </h3>
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
        <AutomationList client={client} items={data.automations} onChanged={onChanged} onOpen={(id) => onGo({ kind: "automation", id })} empty="Nothing runs on its own yet. Ask Zazoo to keep something current (“keep my LinkedIn connections up to date”) and it appears here as a sentence with a switch." />
      ) : tab === "connections" ? (
        <Connections client={client} data={data} onChanged={onChanged} onOpen={open("connections")} />
      ) : (
        <Knowledge client={client} data={data} onChanged={onChanged} onOpen={open("knowledge")} />
      )}
    </div>
  );
}
