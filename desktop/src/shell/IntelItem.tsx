/**
 * One Intelligence item on its own page (`#/intelligence/<tab>/<id>`): a skill, a site reader,
 * an automation, a connection, a fact, a goal, a standing permission, a note, or a person or
 * company from the second brain. Everything the core holds about it, and every field editable:
 * saved directly where the core has a route for it, otherwise drafted for Zazoo to do (the person
 * sends it). The same details show in the second brain's card beside the graph.
 */
import { type MouseEvent, type ReactNode, useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronRight, Pencil } from "lucide-react";
import type { Client, ConnectionRemoval, EntityDetail, Fact, Intelligence as Data, ModuleCard, Note } from "../core/client";
import { humanize, when } from "../modules/format";
import { IconButton, InfoTip, PageHeader } from "../ui";
import type { Surface } from "./Rail";
import { Input, Textarea } from "../ui/Input";
import { Button } from "../ui/Button";
import { Badge } from "../ui/Badge";

export interface ItemContext {
  client: Client;
  data: Data;
  modules: ModuleCard[];
  onGo: (s: Surface) => void;
  onAsk: (text: string) => void;
  onChanged: () => void;
}

/** The placeholder the Knowledge tab shows until the person writes their standing instructions. */
export const INSTRUCTIONS: Note = { id: "standing-instructions", scope: "person", title: "Standing instructions", body: "Ask before sending anything to anyone.", updated_at: "" };

/** Where a fact came from, in the person's words. */
export function sourceWords(source: string): string {
  if (source === "person") return "You said so";
  if (source.startsWith("module:")) return "From a project";
  if (source.startsWith("turn:")) return "From a conversation";
  return "Alpha worked it out";
}

/** A list row that opens an item's page: the whole row is the target, its title is the button
 *  (for the keyboard), and the row's own buttons keep their job. */
export function OpenRow({ open, className = "item item--link", children }: { open: () => void; className?: string; children?: ReactNode }) {
  const onClick = (e: MouseEvent) => {
    if (!(e.target as Element).closest("button, a, input, select, textarea")) open();
  };
  return (
    <div className={className} onClick={onClick}>
      {children}
      <ChevronRight size={16} className="item__chev" aria-hidden="true" />
    </div>
  );
}

/** The row's title, as the button that opens it. */
export function OpenTitle({ open, children }: { open: () => void; children: ReactNode }) {
  return (
    <button type="button" className="item__open" onClick={open}>
      {children}
    </button>
  );
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** One value on an item's page. Double-click it (or Edit) to change it; Enter or leaving the field
 *  saves, Esc puts it back. `zazoo` fields have no direct route: saving drafts the change in Zazoo. */
export function EditField({ label, value, multiline, choices, zazoo, onSave }: { label: string; value: string; multiline?: boolean; choices?: string[]; zazoo?: boolean; onSave: (next: string) => unknown }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [line, setLine] = useState<{ ok: boolean; text: string } | null>(null);
  const settled = useRef(false);
  const start = () => {
    settled.current = false;
    setLine(null);
    setDraft(value);
  };
  const cancel = () => {
    settled.current = true;
    setDraft(null);
  };
  async function save(raw: string) {
    if (settled.current) return;
    settled.current = true;
    setDraft(null);
    const next = raw.trim();
    if (!next || next === value) return;
    try {
      await onSave(next);
      setLine({ ok: true, text: zazoo ? "Drafted in Zazoo. Nothing changes until you send it." : "Saved." });
    } catch (e) {
      setLine({ ok: false, text: errorText(e) });
    }
  }
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      cancel();
    } else if (e.key === "Enter" && !(multiline && e.shiftKey)) {
      e.preventDefault();
      void save(draft ?? "");
    }
  };
  const common = { autoFocus: true, "aria-label": label, value: draft ?? "", onKeyDown: keys, onBlur: () => void save(draft ?? "") };
  return (
    <div className="ifield">
      <div className="ifield__label">
        {label}
        {zazoo ? (
          <span className="ifield__via">
            through Zazoo <InfoTip content="The core can't change this directly. Saving drafts the change in Zazoo; nothing changes until you send it." label={`How ${label.toLowerCase()} changes`} />
          </span>
        ) : null}
      </div>
      {draft === null ? (
        <div className="ifield__value">
          <span className={`editable${multiline ? " ifield__long" : ""}`} title="Double-click to edit" onDoubleClick={start}>
            {(choices ? humanize(value) : value) || <span className="faint">Nothing yet</span>}
          </span>
          <IconButton size="sm" aria-label={`Edit ${label.toLowerCase()}`} title="Edit" onClick={start}>
            <Pencil size={14} />
          </IconButton>
        </div>
      ) : choices ? (
        <select className="ui-input ifield__input" {...common} onChange={(e) => void save(e.target.value)}>
          {choices.map((c) => (
            <option key={c} value={c}>
              {humanize(c)}
            </option>
          ))}
        </select>
      ) : multiline ? (
        <Textarea className="ifield__input" rows={5} {...common} onChange={(e) => setDraft(e.target.value)} />
      ) : (
        <Input className="ifield__input" {...common} onChange={(e) => setDraft(e.target.value)} />
      )}
      {line ? (
        <p className={line.ok ? "notice notice--ok" : "notice"} role={line.ok ? "status" : "alert"}>
          {line.text}
        </p>
      ) : null}
    </div>
  );
}

/** What the core holds about an item that isn't edited here; empty values are left out. */
function Meta({ rows }: { rows: [string, ReactNode][] }) {
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== "" && v !== false);
  if (!shown.length) return null;
  return (
    <dl className="kv">
      {shown.map(([k, v]) => (
        <div key={k} className="kv__row">
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A direct action's result, in one line. */
function useAct(onChanged: () => void) {
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState<{ ok: boolean; text: string } | null>(null);
  async function act(work: () => Promise<unknown>, ok: string) {
    setBusy(true);
    setLine(null);
    try {
      await work();
      setLine({ ok: true, text: ok });
      onChanged();
    } catch (e) {
      setLine({ ok: false, text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }
  const shown = line ? (
    <p className={line.ok ? "notice notice--ok" : "notice"} role={line.ok ? "status" : "alert"}>
      {line.text}
    </p>
  ) : null;
  return { busy, act, shown };
}

function Project({ id, ctx }: { id: string | null | undefined; ctx: ItemContext }) {
  const m = ctx.modules.find((x) => x.id === id || x.name === id);
  if (!m) return null;
  return (
    <button type="button" className="linklike" onClick={() => ctx.onGo({ kind: "module", id: m.id })}>
      {m.name}
    </button>
  );
}

/** A link to another item's page. */
function ItemLink({ to, children, ctx }: { to: Surface; children: ReactNode; ctx: ItemContext }) {
  return (
    <button type="button" className="linklike" onClick={() => ctx.onGo(to)}>
      {children}
    </button>
  );
}

export function FactDetail({ fact, ctx }: { fact: Fact; ctx: ItemContext }) {
  const { busy, act, shown } = useAct(ctx.onChanged);
  const what = humanize(fact.predicate);
  return (
    <>
      <EditField label={what} value={fact.value} zazoo onSave={(next) => ctx.onAsk(`Change what you know about me: my ${what.toLowerCase()} is “${next}”, not “${fact.value}”.`)} />
      {fact.state === "suggested" ? (
        <div className="row">
          <Button size="sm" disabled={busy} onClick={() => void act(() => ctx.client.decideFact(fact.id, true), "Accepted.")}>
            Yes, that's right
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void act(() => ctx.client.decideFact(fact.id, false), "Turned down.")}>
            No
          </Button>
        </div>
      ) : null}
      {shown}
      <Meta
        rows={[
          ["State", fact.state === "suggested" ? "Waiting for your yes" : humanize(fact.state)],
          ["About", fact.subject === "person" ? "You" : <ItemLink ctx={ctx} to={{ kind: "intelligence", tab: "brain", item: fact.subject.replace(/^entity:/, "") }}>{fact.subject.replace(/^entity:/, "")}</ItemLink>],
          ["Where from", <>{sourceWords(fact.source)} {fact.source.startsWith("module:") ? <Project id={fact.source.slice(7)} ctx={ctx} /> : null}</>],
          ["Why", fact.why],
          ["Confidence", `${Math.round(fact.confidence * 100)}%`],
          ["Recorded", when(fact.recorded_at)],
          ["True from", when(fact.valid_from)],
          ["Until", when(fact.valid_to)],
        ]}
      />
    </>
  );
}

function GoalDetail({ id, ctx }: { id: string; ctx: ItemContext }) {
  const g = ctx.data.knowledge.goals.find((x) => x.id === id)!;
  return (
    <>
      <EditField label="Goal" value={g.text} zazoo onSave={(next) => ctx.onAsk(`Change the goal “${g.text}” to “${next}”.`)} />
      <EditField label="State" value={g.state} choices={["active", "done", "dropped"]} zazoo onSave={(next) => ctx.onAsk(`Mark the goal “${g.text}” as ${next}.`)} />
      <Meta rows={[["Project", <Project id={g.module} ctx={ctx} />], ["Since", when(g.since)]]} />
    </>
  );
}

function PermissionDetail({ id, ctx }: { id: string; ctx: ItemContext }) {
  const p = (ctx.data.knowledge.permissions ?? []).find((x) => x.id === id)!;
  const { busy, act, shown } = useAct(ctx.onChanged);
  return (
    <>
      <EditField label="What Alpha may do without asking" value={p.sentence} zazoo onSave={(next) => ctx.onAsk(`Change the standing permission “${p.sentence}” to “${next}”.`)} />
      <div className="row">
        <Button variant="destructive" size="sm" disabled={busy} onClick={() => void act(() => ctx.client.revokePermission(p.id), "Revoked. Alpha asks every time again.")}>
          Revoke
        </Button>
      </div>
      {shown}
      <Meta rows={[["Covers", humanize(p.procedure)], ["Kind", p.effect === "prepare" ? "Prepares, never sends" : humanize(p.effect)], ["Since", when(p.granted_at)]]} />
    </>
  );
}

function NoteDetail({ note, ctx }: { note: Note; ctx: ItemContext }) {
  const scope = note.scope === "person" ? "About you" : note.scope.replace(/^(module|topic):/, "");
  const project = note.scope.startsWith("module:") ? ctx.modules.find((m) => m.name === scope) : undefined;
  return (
    <>
      <EditField label="Title" value={note.title} zazoo onSave={(next) => ctx.onAsk(`Rename the note “${note.title}” to “${next}”.`)} />
      <EditField label="Note" value={note.body} multiline onSave={(next) => ctx.client.writeNote(note.scope, note.title, next).then(ctx.onChanged)} />
      <Meta rows={[["For", project ? <Project id={project.id} ctx={ctx} /> : scope], ["Updated", when(note.updated_at)]]} />
    </>
  );
}

function SkillDetail({ name, ctx }: { name: string; ctx: ItemContext }) {
  const s = ctx.data.skills.find((x) => x.name === name)!;
  const reaches = ctx.data.connections.filter((c) => c.connector === s.name && c.status !== "off");
  return (
    <>
      <EditField label="Name" value={s.title} zazoo onSave={(next) => ctx.onAsk(`Rename the skill “${s.title}” to “${next}”.`)} />
      <EditField label="What it does" value={s.description ?? ""} multiline zazoo onSave={(next) => ctx.onAsk(`Change what the skill “${s.title}” does to: ${next}`)} />
      <Meta rows={[["Origin", s.origin === "builtin" ? "Built in" : "Alpha made"], ["Reaches", reaches.length ? reaches.map((c) => <ItemLink key={c.id} ctx={ctx} to={{ kind: "intelligence", tab: "connections", item: c.id }}>{c.target}</ItemLink>) : null]]} />
      <div className="section__head section__head--tight">
        <h2>Tools</h2>
      </div>
      <div className="card list">
        {s.tools.map((t) => (
          <div key={t.name} className="item">
            <div className="item__body">
              <b>{humanize(t.name)}</b>
              {t.description ? <div className="item__sub">{t.description}</div> : null}
            </div>
            <Badge variant={t.effect === "write" ? "warning" : "neutral"}>{t.effect === "write" ? "Asks first" : "Reads"}</Badge>
          </div>
        ))}
      </div>
    </>
  );
}

function ReaderDetail({ name, ctx }: { name: string; ctx: ItemContext }) {
  const r = ctx.data.readers.find((x) => x.name === name)!;
  const signin = ctx.data.connections.find((c) => c.connector === "browser" && c.target === r.site);
  return (
    <>
      <EditField label="What it reads" value={r.description} zazoo onSave={(next) => ctx.onAsk(`Change the reader “${r.name}” to read: ${next}`)} />
      <EditField label="Page" value={r.url} zazoo onSave={(next) => ctx.onAsk(`Point the reader “${r.name}” at ${next} instead of ${r.url}.`)} />
      {r.last_problem ? <p className="notice">{r.last_problem}</p> : null}
      <Meta
        rows={[
          ["Health", r.health === "ok" ? "Working" : "Being repaired"],
          ["Site", signin ? <ItemLink ctx={ctx} to={{ kind: "intelligence", tab: "connections", item: signin.id }}>{r.site}</ItemLink> : r.site],
          ["Version", String(r.version)],
          ["Last read", r.last_run_at ? `${r.last_count ?? 0} rows · ${when(r.last_run_at)}` : null],
          ["Name", r.name],
        ]}
      />
    </>
  );
}

function AutomationDetail({ id, ctx }: { id: string; ctx: ItemContext }) {
  const a = ctx.data.automations.find((x) => x.id === id)!;
  const { busy, act, shown } = useAct(ctx.onChanged);
  // While it runs, look again every few seconds so its steps show up here.
  useEffect(() => {
    if (!a.running) return;
    const timer = setInterval(ctx.onChanged, 4000);
    return () => clearInterval(timer);
  }, [a.running, ctx.onChanged]);
  return (
    <>
      <EditField label="What it does" value={a.title} zazoo onSave={(next) => ctx.onAsk(`Change the automation “${a.title}” to: ${next}`)} />
      <EditField label="When" value={a.when} zazoo onSave={(next) => ctx.onAsk(`Change when “${a.title}” runs from ${a.when} to ${next}.`)} />
      {a.procedure ? <EditField label="Instructions" value={a.procedure} multiline zazoo onSave={(next) => ctx.onAsk(`Change the instructions of “${a.title}” to: ${next}`)} /> : null}
      <div className="row">
        <button type="button" className={`switch${a.enabled ? "" : " switch--off"}`} role="switch" aria-checked={a.enabled} aria-label={a.enabled ? "Switch off" : "Switch on"} disabled={busy} onClick={() => void act(() => ctx.client.switchAutomation(a.id, !a.enabled), a.enabled ? "Switched off." : "Switched on.")} />
        <span>{a.enabled ? "On" : "Off"}</span>
        <Button variant="outline" size="sm" disabled={busy || a.running} onClick={() => void act(() => ctx.client.runAutomation(a.id), "Started. Its steps show here as it goes.")}>
          {a.running ? "Running…" : "Run now"}
        </Button>
      </div>
      {shown}
      {a.running && a.steps?.length ? (
        <ul className="stages">
          {a.steps.map((s, i) => (
            <li key={`${s.at}-${i}`} className={s.kind === "failed" ? "notice" : "stages__done"}>
              {s.text}
            </li>
          ))}
        </ul>
      ) : null}
      {a.last_error ? <p className="notice">Last run didn't work: {a.last_error}</p> : null}
      <Meta
        rows={[
          ["Project", <Project id={a.module} ctx={ctx} />],
          ["Next run", a.enabled ? when(a.next_run_at) : "Off"],
          ["Last ran", a.last_run_at ? when(a.last_run_at) : "Not yet"],
          ["Last result", a.last_result],
          ["Schedule", a.schedule],
        ]}
      />
    </>
  );
}

function ConnectionDetail({ id, ctx }: { id: string; ctx: ItemContext }) {
  const c = ctx.data.connections.find((x) => x.id === id)!;
  const { busy, act, shown } = useAct(ctx.onChanged);
  // What depends on it: the same dry run Remove shows before it confirms.
  const [plan, setPlan] = useState<ConnectionRemoval | null>(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    ctx.client.connectionRemoval(id).then(setPlan).catch(() => setPlan(null));
  }, [ctx.client, id]);
  const named = c.connector === "files" ? "folder" : c.connector === "browser" ? "site" : null;
  return (
    <>
      {named ? (
        <EditField label={named === "folder" ? "Folder" : "Site"} value={c.target} zazoo onSave={(next) => ctx.onAsk(`Read the ${named} ${next} instead of ${c.target}.`)} />
      ) : (
        <Meta rows={[["Reads", "Your calendars"]]} />
      )}
      <div className="row">
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void act(() => ctx.client.syncConnection(c.id), "Read again.")}>
          {c.connector === "browser" ? "Check" : "Read now"}
        </Button>
        {confirming ? (
          <>
            <span className="item__sub--warn">Removes {plan?.what ?? "it"}.</span>
            <Button variant="outline" size="sm" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button variant="destructive" size="sm" disabled={busy} onClick={() => void act(() => ctx.client.removeConnection(c.id), "Removed.").then(() => ctx.onGo({ kind: "intelligence", tab: "connections" }))}>
              Remove
            </Button>
          </>
        ) : (
          <Button variant="ghost" size="sm" disabled={busy || !plan} onClick={() => setConfirming(true)}>
            Remove
          </Button>
        )}
      </div>
      {shown}
      {c.last_error ? <p className="notice">{c.last_error}</p> : null}
      <Meta
        rows={[
          ["Status", humanize(c.status.replace("needs_ok", "needs your OK"))],
          ["Kind", humanize(c.connector)],
          ["Last read", when(c.last_sync)],
          ["Readers using it", plan?.readers.length ? plan.readers.map((r) => <ItemLink key={r} ctx={ctx} to={{ kind: "intelligence", tab: "skills", item: `reader:${r}` }}>{r}</ItemLink>) : null],
          ["Automations using it", plan?.automations.length ? plan.automations.map((a) => {
            const auto = ctx.data.automations.find((x) => x.id === a || x.title === a);
            return auto ? <ItemLink key={a} ctx={ctx} to={{ kind: "intelligence", tab: "automations", item: auto.id }}>{auto.title}</ItemLink> : <span key={a}>{a}</span>;
          }) : null],
        ]}
      />
    </>
  );
}

/** A person or company Alpha has met (the second brain's other nodes). */
export function EntityDetailView({ id, ctx }: { id: string; ctx: ItemContext }) {
  const [e, setE] = useState<EntityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { busy, act, shown } = useAct(() => {
    ctx.onChanged();
    ctx.client.entity(id).then(setE).catch(() => undefined);
  });
  useEffect(() => {
    ctx.client.entity(id).then(setE).catch((x: unknown) => setError(errorText(x)));
  }, [ctx.client, id]);
  if (!e) return error ? <p className="notice" role="alert">{error}</p> : <p className="muted">Loading…</p>;
  const keys = Object.entries(e.keys).flatMap(([k, vs]) => vs.map((v) => `${v} (${k})`));
  return (
    <>
      <EditField label="Name" value={e.name} zazoo onSave={(next) => ctx.onAsk(`Rename ${e.name} to “${next}”.`)} />
      {e.maybe_same.map((o) => (
        <div key={o.id} className="row">
          <span className="item__sub">Maybe the same as {o.name}</span>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => void act(() => ctx.client.merge(e.id, o.id), "Merged.")}>
            They're the same
          </Button>
        </div>
      ))}
      {shown}
      <Meta rows={[["Kind", humanize(e.kind)], ["Also called", e.aliases.join(", ")], ["Known by", keys.join(", ")], ["Facts", e.facts.map((f) => `${humanize(f.predicate)}: ${f.value}`).join(" · ")]]} />
      {e.timeline.length ? (
        <>
          <div className="section__head section__head--tight">
            <h2>History</h2>
          </div>
          <div className="card list">
            {e.timeline.slice(0, 12).map((j) => (
              <div key={j.id} className="item">
                <span className="item__when">{when(j.at)}</span>
                <div className="item__body">
                  {j.text}
                  {j.module ? (
                    <div className="item__sub">
                      <Project id={j.module} ctx={ctx} />
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

/** What an address points at: its kind's words and its details, or null when it's gone. */
export function findItem(tab: string, item: string, ctx: ItemContext): { kind: string; body: ReactNode } | null {
  const d = ctx.data;
  if (tab === "skills") {
    if (item.startsWith("reader:")) {
      const name = item.slice(7);
      return d.readers.some((r) => r.name === name) ? { kind: "Site reader", body: <ReaderDetail name={name} ctx={ctx} /> } : null;
    }
    return d.skills.some((s) => s.name === item) ? { kind: "Skill", body: <SkillDetail name={item} ctx={ctx} /> } : null;
  }
  if (tab === "automations") return d.automations.some((a) => a.id === item) ? { kind: "Automation", body: <AutomationDetail id={item} ctx={ctx} /> } : null;
  if (tab === "connections") return d.connections.some((c) => c.id === item) ? { kind: "Connection", body: <ConnectionDetail id={item} ctx={ctx} /> } : null;
  if (tab === "brain") return { kind: "Person or company", body: <EntityDetailView id={item} ctx={ctx} /> };
  if (tab === "knowledge") {
    const k = d.knowledge;
    const fact = k.facts.find((f) => f.id === item);
    if (fact) return { kind: "Fact", body: <FactDetail fact={fact} ctx={ctx} /> };
    if (k.goals.some((g) => g.id === item)) return { kind: "Goal", body: <GoalDetail id={item} ctx={ctx} /> };
    if ((k.permissions ?? []).some((p) => p.id === item)) return { kind: "Standing permission", body: <PermissionDetail id={item} ctx={ctx} /> };
    const note = item === INSTRUCTIONS.id ? (k.notes.find((n) => n.scope === "person" && n.title === INSTRUCTIONS.title) ?? INSTRUCTIONS) : k.notes.find((n) => n.id === item);
    if (note) return { kind: "Note", body: <NoteDetail note={note} ctx={ctx} /> };
  }
  return null;
}

const TAB_WORDS: Record<string, string> = { brain: "Second brain", skills: "Skills", automations: "Automations", connections: "Connections", knowledge: "Knowledge" };

export function IntelItemPage({ tab, item, ctx }: { tab: string; item: string; ctx: ItemContext }) {
  const found = findItem(tab, item, ctx);
  const back = TAB_WORDS[tab] ?? "Intelligence";
  return (
    <div className="page">
      <PageHeader
        title={
          <span className="crumbs">
            <IconButton size="sm" aria-label={`Back to ${back}`} title={`Back to ${back}`} onClick={() => ctx.onGo({ kind: "intelligence", tab })}>
              <ArrowLeft size={16} />
            </IconButton>
            <button type="button" className="crumbs__up" onClick={() => ctx.onGo({ kind: "intelligence", tab })}>
              {back}
            </button>
            <ChevronRight size={14} className="faint" aria-hidden="true" />
            {found?.kind ?? "Not found"}
          </span>
        }
      />
      {found ? <div className="card card--pad stack ipage">{found.body}</div> : <p className="empty">This is no longer here.</p>}
    </div>
  );
}
