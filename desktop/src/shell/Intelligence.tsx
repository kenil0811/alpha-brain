/**
 * Intelligence: everything Alpha can do (skills), runs on its own (automations), reaches
 * (connections) and knows (knowledge: facts, notes, goals). Each is a sentence the person can
 * read, switch or correct, never a configuration form. Each item opens its own page
 * (`./IntelItem.tsx`); the second brain is its own place to look and edit.
 */
import { type FormEvent, useEffect, useState } from "react";
import { CalendarDays, Folder, Globe, Link, Puzzle } from "lucide-react";
import type { Client, Connection, ConnectionRemoval, Intelligence as Data, ModuleCard, Note } from "../core/client";
import { humanize, when } from "../modules/format";
import { InfoTip, PageHeader, Tabs } from "../ui";
import { Badge, type BadgeVariant } from "../ui/Badge";
import { AboutYou } from "./AboutYou";
import { AutomationTable } from "./Automations";
import { INSTRUCTIONS, IntelItemPage, OpenRow, OpenTitle, SKILL_HEALTH, SKILL_KIND, type ItemContext } from "./IntelItem";
import type { Surface } from "./Rail";
import { SecondBrain } from "./SecondBrain";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";

export type IntelTab = "brain" | "skills" | "automations" | "connections" | "knowledge";
const TABS: { id: IntelTab; label: string; hint: string }[] = [
  { id: "brain", label: "Second brain", hint: "Every project and every fact Alpha holds, and how they connect." },
  { id: "skills", label: "Skills", hint: "What Alpha has learned to read, do and run, and what it can reach." },
  { id: "automations", label: "Automations", hint: "Every schedule across your projects, switchable in place." },
  { id: "connections", label: "Connections", hint: "The folders, sites and calendars Alpha reads." },
  { id: "knowledge", label: "Knowledge", hint: "What Alpha knows and uses across your projects." },
];

const CONNECTOR: Record<string, { icon: typeof Folder; label: (c: Connection) => string; reach: string }> = {
  files: { icon: Folder, label: (c) => c.target.split("/").slice(-2).join("/"), reach: "Reads the documents in this folder as they change; never changes your files" },
  browser: { icon: Globe, label: (c) => `${c.target}, signed in as you`, reach: "Reads pages the way you would; never posts, messages or clicks" },
  calendar: { icon: CalendarDays, label: () => "Your calendars", reach: "Reads events and attendees; adds nothing without a yes" },
};

const STATUS: Record<Connection["status"], { badge: BadgeVariant; words: string }> = {
  connected: { badge: "success", words: "Connected" },
  needs_ok: { badge: "warning", words: "Needs your OK" },
  broken: { badge: "danger", words: "Not working" },
  off: { badge: "neutral", words: "Off" },
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
            <OpenRow key={c.id} open={() => onOpen(c.id)}>
              <div className="item__ico" aria-hidden="true">
                <Icon size={16} />
              </div>
              <div className="item__body">
                <OpenTitle open={() => onOpen(c.id)}>{meta.label(c)}</OpenTitle>
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
              <Badge variant={STATUS[c.status].badge}>{STATUS[c.status].words}</Badge>
              {removing?.id === c.id ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setRemoving(null)}>
                    Keep it
                  </Button>
                  <Button variant="destructive" size="sm" disabled={!removing.plan || busy !== null} onClick={() => void run(c.id, () => client.removeConnection(c.id), "Removed.").then(() => setRemoving(null))}>
                    Remove
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void run(c.id, () => client.syncConnection(c.id), "Read again.")}>
                    {c.connector === "browser" ? "Check" : "Read now"}
                  </Button>
                  <Button variant="ghost" size="sm" disabled={busy !== null || removing !== null} onClick={() => askRemove(c.id)}>
                    Remove
                  </Button>
                </>
              )}
            </OpenRow>
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
            <Input className="need__input" value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="~/Documents/Job search" aria-label="Folder" />
            <Button type="submit" disabled={!folder.trim() || busy !== null}>
              Read it
            </Button>
          </div>
        </form>
        <form className="card card--pad" onSubmit={(e: FormEvent) => { e.preventDefault(); void run("site", () => client.connectSite(site.trim()), "A window is open: sign in there, then close it."); }}>
          <div className="intel__head">
            <h3>A site you sign into</h3>
            <InfoTip content="LinkedIn, a job board, a dashboard. A window opens; you sign in yourself and close it." label="About sites" />
          </div>
          <div className="row">
            <Input className="need__input" value={site} onChange={(e) => setSite(e.target.value)} placeholder="linkedin.com" aria-label="Site" />
            <Button type="submit" disabled={!site.trim() || busy !== null}>
              Sign in
            </Button>
          </div>
        </form>
        {!hasCalendar ? (
          <div className="card card--pad">
            <div className="intel__head">
              <h3>Your calendar</h3>
              <InfoTip content="Every calendar in macOS Calendar (Google, iCloud, Exchange). macOS asks you once." label="About calendars" />
            </div>
            <div className="row">
              <Button disabled={busy !== null} onClick={() => void run("calendar", () => client.connectCalendar(), "Calendars connected.")}>
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

function Knowledge({ client, data, modules, onChanged, onOpen }: { client: Client; data: Data; modules: ModuleCard[]; onChanged: () => void; onOpen: (id: string) => void }) {
  const { facts, notes, goals } = data.knowledge;
  const permissions = data.knowledge.permissions ?? [];
  const instructions = notes.find((n) => n.scope === "person" && n.title === INSTRUCTIONS.title);
  const shownNotes: Note[] = instructions ? notes : [INSTRUCTIONS, ...notes];
  return (
    <div className="stack">
    <AboutYou client={client} facts={facts} modules={modules} onChanged={onChanged} onOpen={onOpen} />
    <div className="intel">
      <div className="card card--pad intel__card">
        <div className="intel__head">
          <h3>Goals</h3>
          <InfoTip content={'Say one ("under 2,000 kcal on weekdays") and Alpha works towards it.'} label="About goals" />
        </div>
        {!goals.length ? <p className="empty">No goals yet.</p> : null}
        <div className="list">
          {goals.map((g) => (
            <OpenRow key={g.id} open={() => onOpen(g.id)} className="item item--link item--flush">
              <div className="item__body">
                <OpenTitle open={() => onOpen(g.id)}>{g.text}</OpenTitle>
                <div className="item__sub">
                  {g.state === "active" ? "Active" : humanize(g.state)} · since {when(g.since)}
                </div>
              </div>
            </OpenRow>
          ))}
        </div>
      </div>
      <div className="card card--pad intel__card">
        <div className="intel__head">
          <h3>Standing permissions</h3>
          <span className="faint">what Alpha may do without asking; anything sent asks every time</span>
        </div>
        {!permissions.length ? <p className="empty">None yet. When Alpha proposes a draft or a message, "Always allow" on its card makes one.</p> : null}
        <div className="list">
          {permissions.map((p) => (
            <OpenRow key={p.id} open={() => onOpen(p.id)} className="item item--link item--flush">
              <div className="item__body">
                <OpenTitle open={() => onOpen(p.id)}>{p.sentence}</OpenTitle>
                <div className="item__sub">since {when(p.granted_at)}</div>
              </div>
              <Button variant="ghost" size="sm" onClick={() => void client.revokePermission(p.id).then(onChanged)}>
                Revoke
              </Button>
            </OpenRow>
          ))}
        </div>
      </div>
      <div className="card card--pad intel__card">
        <div className="intel__head">
          <h3>Notes</h3>
          <InfoTip content="What Alpha keeps in mind, by topic. Yours to read and correct." label="About notes" />
        </div>
        <div className="list">
          {shownNotes.map((n) => (
            <OpenRow key={n.id} open={() => onOpen(n.id)} className="item item--link item--flush">
              <div className="item__body">
                <OpenTitle open={() => onOpen(n.id)}>{n.title}</OpenTitle>
                <div className="item__sub">
                  {n.scope === "person" ? "About you" : n.scope.replace(/^(module|topic):/, "")}
                  {n.updated_at ? ` · ${when(n.updated_at)}` : " · not written yet"}
                </div>
              </div>
            </OpenRow>
          ))}
        </div>
      </div>
    </div>
    </div>
  );
}

export function Intelligence({ client, modules, tab, item, version, onTab, onGo, onChanged, onAsk }: { client: Client; modules: ModuleCard[]; tab: IntelTab; item?: string; version: number; onTab: (t: IntelTab) => void; onGo: (s: Surface) => void; onChanged: () => void; onAsk: (text: string) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    client
      .intelligence()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [client, version]);
  const open = (id: string) => onGo({ kind: "intelligence", tab, item: id });
  const ctx: ItemContext | null = data ? { client, data, modules, onGo, onAsk, onChanged } : null;
  if (item) {
    if (ctx) return <IntelItemPage tab={tab} item={item} ctx={ctx} />;
    return <div className="page">{error ? <p className="notice" role="alert">{error}</p> : <p className="muted">Loading…</p>}</div>;
  }
  return (
    <div className="page">
      <PageHeader title={<>Intelligence <InfoTip content="What Alpha knows and can do across your projects." label="About Intelligence" /></>} />
      <Tabs className="page__tabs" aria-label="Intelligence" items={TABS.map((t) => ({ value: t.id, label: <span title={t.hint}>{t.label}</span> }))} value={tab} onChange={(v) => onTab(v as IntelTab)} />
      {!data ? (
        error ? <p className="notice" role="alert">{error}</p> : <p className="muted">Loading…</p>
      ) : tab === "brain" ? (
        <SecondBrain ctx={ctx!} onOpenKnowledge={() => onTab("knowledge")} />
      ) : tab === "skills" ? (
        <div className="stack">
          <div className="section__head section__head--tight">
            <h2>
              Learned <InfoTip content="When Alpha reads a list, does a task on a site, or runs something on its own, it keeps how it did it here, versioned and repaired when a site changes." label="About learned skills" />
            </h2>
          </div>
          <div className="card list">
            {!data.skills.length ? <p className="empty">None yet. Alpha keeps one here the first time a task works.</p> : null}
            {data.skills.map((s) => {
              const kind = SKILL_KIND[s.kind];
              const where = s.site ?? modules.find((m) => m.id === s.module)?.name;
              return (
                <OpenRow key={s.name} open={() => open(s.name)}>
                  <div className="item__ico" aria-hidden="true">
                    <kind.icon size={16} />
                  </div>
                  <div className="item__body">
                    <OpenTitle open={() => open(s.name)}>{s.description}</OpenTitle>
                    <div className="item__sub">
                      {kind.words}
                      {where ? ` · ${where}` : ""} · version {s.version}
                      {s.last_run_at ? ` · last ${s.kind === "read" ? `read ${s.last_count ?? 0} rows` : "run"} ${when(s.last_run_at)}` : ""}
                      {s.last_problem ? ` · ${s.last_problem}` : ""}
                    </div>
                  </div>
                  <Badge variant={SKILL_HEALTH[s.health].badge}>{SKILL_HEALTH[s.health].words}</Badge>
                </OpenRow>
              );
            })}
          </div>
          <div className="section__head section__head--tight">
            <h2>
              Built in <InfoTip content="The hands Alpha has without being taught: the browser, your files, your calendar." label="About built-in abilities" />
            </h2>
          </div>
          <div className="card list">
            {data.hands.map((h) => (
              <OpenRow key={h.name} open={() => open(`hand:${h.name}`)}>
                <div className="item__ico" aria-hidden="true">
                  <Puzzle size={16} />
                </div>
                <div className="item__body">
                  <OpenTitle open={() => open(`hand:${h.name}`)}>{h.title}</OpenTitle>
                  <div className="item__sub">{h.tools.map((t) => humanize(t.name) + (t.effect === "write" ? " (asks first)" : "")).join(" · ")}</div>
                </div>
                <Badge variant="neutral">Built in</Badge>
              </OpenRow>
            ))}
          </div>
        </div>
      ) : tab === "automations" ? (
        <AutomationTable client={client} items={data.automations} modules={modules} onOpenModule={(id) => onGo({ kind: "module", id })} onOpen={open} onChanged={onChanged} />
      ) : tab === "connections" ? (
        <Connections client={client} data={data} onChanged={onChanged} onOpen={open} />
      ) : (
        <Knowledge client={client} data={data} modules={modules} onChanged={onChanged} onOpen={open} />
      )}
    </div>
  );
}
