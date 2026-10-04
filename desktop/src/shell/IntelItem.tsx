/**
 * One Intelligence item on its own page (`#/intelligence/<tab>/<id>`): a connection, a built-in
 * hand (`skills/hand:<name>`), a fact, a goal, a standing permission or a note (skills and
 * automations have their own pages). Everything the core holds about it, and every field
 * editable: double-click it (or its pencil); a field the core can write is saved, any other is
 * drafted for Zazoo in the panel and nothing changes until the person sends it (an idea from
 * pull request #3's IntelItem). The map's card shows the same edits for the node it opens.
 */
import { type KeyboardEvent, type MouseEvent, type ReactNode, useEffect, useRef, useState } from "react";
import type { Automation, Client, ConnectionRemoval, Fact, Intelligence as Data, Note, Skill } from "../core/client";
import { humanize, when } from "../modules/format";
import { Badge, Button, IconButton, useComingSoon } from "../ui";
import { ArrowLeft, Pencil } from "../ui/icons";
import type { Surface } from "./Rail";
import { factOrigin } from "./facts";

export interface ItemContext {
  client: Client;
  data: Data;
  /** Module names by id. */
  modules: Record<string, string>;
  onGo: (s: Surface) => void;
  /** Put a request in Zazoo's composer; never sends. */
  onAsk: (text: string) => void;
  onChanged: () => void;
}

/** The placeholder the Knowledge tab shows until the person writes their standing instructions. */
export const INSTRUCTIONS: Note = { id: "standing-instructions", scope: "person", title: "Standing instructions", body: "Ask before sending anything to anyone.", updated_at: "" };

/** A click that opens a row, unless it landed on one of the row's own controls. */
export function opener(open: () => void) {
  return (e: MouseEvent) => {
    if (!(e.target as Element).closest("button, a, input, select, textarea, [role=switch]")) open();
  };
}

const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** One value. Double-click it, press Enter or F2 on it, or use its pencil to change it; Enter
 *  or leaving the field saves, Esc puts it back. `zazoo` fields have no route in the core:
 *  saving drafts the change for Zazoo. */
export function EditField({ label, value, multiline, choices, zazoo, onSave }: { label: string; value: string; multiline?: boolean; choices?: string[]; zazoo?: boolean; onSave: (next: string) => unknown }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [line, setLine] = useState<{ ok: boolean; text: string } | null>(null);
  const settled = useRef(false);
  const start = () => {
    settled.current = false;
    setLine(null);
    setDraft(value);
  };
  async function save(raw: string) {
    if (settled.current) return;
    settled.current = true;
    setDraft(null);
    const next = raw.trim();
    if (!next || next === value) return;
    try {
      await onSave(next);
      setLine({ ok: true, text: zazoo ? "Drafted for Zazoo. Nothing changes until you send it." : "Saved." });
    } catch (e) {
      setLine({ ok: false, text: errorText(e) });
    }
  }
  const keys = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      settled.current = true;
      setDraft(null);
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
        {zazoo ? <span className="faint"> · through Zazoo</span> : null}
      </div>
      {draft === null ? (
        <div className="ifield__value">
          <span
            className={`editable${multiline ? " ifield__long" : ""}`}
            tabIndex={0}
            title="Double-click to edit"
            onDoubleClick={start}
            onKeyDown={(e) => (e.key === "Enter" || e.key === "F2") && (e.preventDefault(), start())}
          >
            {(choices ? humanize(value) : value) || <span className="faint">Nothing yet</span>}
          </span>
          <IconButton size="sm" label={`Edit ${label.toLowerCase()}`} icon={<Pencil size={14} />} onClick={start} />
        </div>
      ) : choices ? (
        <select className="need__input" {...common} onChange={(e) => void save(e.target.value)}>
          {choices.map((c) => (
            <option key={c} value={c}>
              {humanize(c)}
            </option>
          ))}
        </select>
      ) : multiline ? (
        <textarea className="note__edit" rows={5} {...common} onChange={(e) => setDraft(e.target.value)} />
      ) : (
        <input className="need__input ifield__input" {...common} onChange={(e) => setDraft(e.target.value)} />
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
  const shown = rows.filter(([, v]) => v !== null && v !== undefined && v !== "");
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

/** A direct action and its result in one line. */
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

function Go({ to, ctx, children }: { to: Surface; ctx: ItemContext; children: ReactNode }) {
  return (
    <button type="button" className="linkbtn" onClick={() => ctx.onGo(to)}>
      {children}
    </button>
  );
}

function ModuleLink({ id, ctx }: { id: string | null | undefined; ctx: ItemContext }) {
  return id && ctx.modules[id] ? <Go to={{ kind: "module", id }} ctx={ctx}>{ctx.modules[id]}</Go> : null;
}

function FactDetail({ fact, ctx }: { fact: Fact; ctx: ItemContext }) {
  const { busy, act, shown } = useAct(ctx.onChanged);
  const soon = useComingSoon();
  const what = humanize(fact.predicate);
  return (
    <>
      <EditField label={what} value={fact.value} zazoo onSave={(next) => ctx.onAsk(`Correct what you know about me: my ${what.toLowerCase()} is “${next}”, not “${fact.value}”.`)} />
      <div className="row">
        {fact.state === "suggested" ? (
          <>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => void act(() => ctx.client.decideFact(fact.id, true), "Kept.")}>
              Yes, that's right
            </Button>
            <Button size="sm" disabled={busy} onClick={() => void act(() => ctx.client.decideFact(fact.id, false), "Turned down.")}>
              No
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => soon("Forgetting a fact")}>
            Forget
          </Button>
        )}
      </div>
      {shown}
      <Meta
        rows={[
          ["State", fact.state === "suggested" ? "Waiting for your yes" : humanize(fact.state)],
          ["About", fact.subject === "person" ? "You" : fact.subject],
          ["Where from", factOrigin(fact)],
          ["Confidence", `${Math.round(fact.confidence * 100)}%`],
          ["True from", fact.valid_from ? when(fact.valid_from) : null],
          ["Until", fact.valid_to ? when(fact.valid_to) : null],
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
      <Meta rows={[["Module", <ModuleLink id={g.module} ctx={ctx} />], ["Since", when(g.since)]]} />
    </>
  );
}

function PermissionDetail({ id, ctx }: { id: string; ctx: ItemContext }) {
  const p = (ctx.data.knowledge.permissions ?? []).find((x) => x.id === id)!;
  const { busy, act, shown } = useAct(ctx.onChanged);
  return (
    <>
      <EditField label="What Zazoo may do without asking" value={p.sentence} zazoo onSave={(next) => ctx.onAsk(`Change the standing permission “${p.sentence}” to “${next}”.`)} />
      <div className="row">
        <Button size="sm" variant="danger" disabled={busy} onClick={() => void act(() => ctx.client.revokePermission(p.id), "Revoked. Zazoo asks every time again.")}>
          Revoke
        </Button>
      </div>
      {shown}
      <Meta rows={[["Covers", humanize(p.procedure)], ["Kind", p.effect === "prepare" ? "Prepares, never sends" : humanize(p.effect)], ["Since", when(p.granted_at)]]} />
    </>
  );
}

function NoteDetail({ note, ctx }: { note: Note; ctx: ItemContext }) {
  const module = note.scope.startsWith("module:") ? note.scope.slice(7) : null;
  return (
    <>
      <EditField label="Title" value={note.title} zazoo onSave={(next) => ctx.onAsk(`Rename the note “${note.title}” to “${next}”.`)} />
      <EditField label="Note" value={note.body} multiline onSave={(next) => ctx.client.writeNote(note.scope, note.title, next).then(ctx.onChanged)} />
      <Meta rows={[["For", note.scope === "person" ? "You" : module ? (ctx.modules[module] ? <ModuleLink id={module} ctx={ctx} /> : module) : note.scope], ["Updated", note.updated_at ? when(note.updated_at) : null]]} />
    </>
  );
}

/** A built-in hand: code shipped with Alpha, so nothing on it is edited. */
function HandDetail({ name, ctx }: { name: string; ctx: ItemContext }) {
  const h = ctx.data.hands.find((x) => x.name === name)!;
  const reaches = ctx.data.connections.filter((c) => c.connector === h.name && c.status !== "off");
  return (
    <>
      {h.description ? <p className="muted">{h.description}</p> : null}
      <Meta rows={[["Origin", "Built in"], ["Reaches", reaches.length ? reaches.map((c) => <Go key={c.id} to={{ kind: "intelligence", tab: "connections", item: c.id }} ctx={ctx}>{c.target}</Go>) : null]]} />
      <div className="card list">
        {h.tools.map((t) => (
          <div key={t.name} className="item">
            <div className="item__body">
              <b>{humanize(t.name)}</b>
              {t.description ? <div className="item__sub">{t.description}</div> : null}
            </div>
            <Badge tone={t.effect === "write" ? "warn" : "gray"}>{t.effect === "write" ? "Asks first" : "Reads"}</Badge>
          </div>
        ))}
      </div>
    </>
  );
}

/** A skill's fields, drafted for Zazoo: a skill is its know-how, never patched by hand. */
export function SkillEdits({ skill, onAsk }: { skill: Pick<Skill, "name" | "description" | "when_to_use" | "url">; onAsk: (text: string) => void }) {
  return (
    <>
      <EditField label="What it does" value={skill.description} zazoo onSave={(next) => onAsk(`Change the skill ${skill.name} (${skill.description}) to: ${next}`)} />
      <EditField label="When to use it" value={skill.when_to_use ?? ""} zazoo onSave={(next) => onAsk(`Use the skill ${skill.name} when: ${next}`)} />
      {skill.url ? <EditField label="Page" value={skill.url} zazoo onSave={(next) => onAsk(`Point the skill ${skill.name} at ${next} instead of ${skill.url}.`)} /> : null}
    </>
  );
}

/** An automation's fields, drafted for Zazoo (the core switches and runs it, nothing else). */
export function AutomationEdits({ auto, onAsk }: { auto: Pick<Automation, "title" | "when" | "procedure">; onAsk: (text: string) => void }) {
  return (
    <>
      <EditField label="What it does" value={auto.title} zazoo onSave={(next) => onAsk(`Change the automation “${auto.title}” to: ${next}`)} />
      <EditField label="When" value={auto.when} zazoo onSave={(next) => onAsk(`Change when “${auto.title}” runs from ${auto.when} to ${next}.`)} />
      {auto.procedure ? <EditField label="Instructions" value={auto.procedure} multiline zazoo onSave={(next) => onAsk(`Change the instructions of “${auto.title}” to: ${next}`)} /> : null}
    </>
  );
}

function AutomationCard({ id, ctx }: { id: string; ctx: ItemContext }) {
  const a = ctx.data.automations.find((x) => x.id === id)!;
  const { busy, act, shown } = useAct(ctx.onChanged);
  return (
    <>
      <AutomationEdits auto={a} onAsk={ctx.onAsk} />
      <div className="row">
        <button type="button" className={`switch${a.enabled ? "" : " switch--off"}`} role="switch" aria-checked={a.enabled} aria-label={a.enabled ? "Switch off" : "Switch on"} disabled={busy} onClick={() => void act(() => ctx.client.switchAutomation(a.id, !a.enabled), a.enabled ? "Switched off." : "Switched on.")} />
        <Button size="sm" disabled={busy || a.running} onClick={() => void act(() => ctx.client.runAutomation(a.id), "Started.")}>
          {a.running ? "Running…" : "Run now"}
        </Button>
      </div>
      {shown}
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
    ctx.client.connectionRemoval(id).then(setPlan, () => setPlan(null));
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
        <Button size="sm" disabled={busy} onClick={() => void act(() => ctx.client.syncConnection(c.id), "Read again.")}>
          {c.connector === "browser" ? "Check" : "Read now"}
        </Button>
        {confirming ? (
          <>
            <span className="item__sub--warn">Removes {plan?.what ?? "it"}.</span>
            <Button size="sm" onClick={() => setConfirming(false)}>
              Keep it
            </Button>
            <Button size="sm" variant="danger" disabled={busy} onClick={() => void act(() => ctx.client.removeConnection(c.id), "Removed.").then(() => ctx.onGo({ kind: "intelligence", tab: "connections" }))}>
              Remove
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" disabled={busy || !plan} onClick={() => setConfirming(true)}>
            Remove
          </Button>
        )}
      </div>
      {shown}
      {c.last_error ? <p className="notice">{c.last_error}</p> : null}
      <Meta
        rows={[
          ["Status", c.status === "needs_ok" ? "Needs your OK" : humanize(c.status)],
          ["Kind", humanize(c.connector)],
          ["Last read", c.last_sync ? when(c.last_sync) : null],
          ["Skills using it", plan?.readers.length ? plan.readers.map((r) => <Go key={r} to={{ kind: "skill", name: r }} ctx={ctx}>{r}</Go>) : null],
          ["Automations using it", plan?.automations.length ? plan.automations.join(", ") : null],
        ]}
      />
    </>
  );
}

/** What an item's address points at: its kind in words, its title and its fields, or null when
 *  it's gone. Skills and automations are here for the map's card; their pages are their own. */
export function findItem(tab: string, item: string, ctx: ItemContext): { kind: string; title: string; body: ReactNode } | null {
  const d = ctx.data;
  if (tab === "skills") {
    if (item.startsWith("hand:")) {
      const h = d.hands.find((x) => x.name === item.slice(5));
      return h ? { kind: "Built in", title: h.title, body: <HandDetail name={h.name} ctx={ctx} /> } : null;
    }
    const s = d.skills.find((x) => x.name === item);
    return s ? { kind: "Skill", title: s.description, body: <SkillEdits skill={s} onAsk={ctx.onAsk} /> } : null;
  }
  if (tab === "automations") {
    const a = d.automations.find((x) => x.id === item);
    return a ? { kind: "Automation", title: a.title, body: <AutomationCard id={item} ctx={ctx} /> } : null;
  }
  if (tab === "connections") {
    const c = d.connections.find((x) => x.id === item);
    return c ? { kind: "Connection", title: c.target, body: <ConnectionDetail id={item} ctx={ctx} /> } : null;
  }
  if (tab === "knowledge") {
    const k = d.knowledge;
    const fact = k.facts.find((f) => f.id === item);
    if (fact) return { kind: "About you", title: humanize(fact.predicate), body: <FactDetail fact={fact} ctx={ctx} /> };
    const goal = k.goals.find((g) => g.id === item);
    if (goal) return { kind: "Goal", title: goal.text, body: <GoalDetail id={item} ctx={ctx} /> };
    const perm = (k.permissions ?? []).find((p) => p.id === item);
    if (perm) return { kind: "Standing permission", title: perm.sentence, body: <PermissionDetail id={item} ctx={ctx} /> };
    const note = item === INSTRUCTIONS.id ? (k.notes.find((n) => n.scope === "person" && n.title === INSTRUCTIONS.title) ?? INSTRUCTIONS) : k.notes.find((n) => n.id === item);
    if (note) return { kind: "Note", title: note.title, body: <NoteDetail note={note} ctx={ctx} /> };
  }
  return null;
}

const TAB_WORDS: Record<string, string> = { map: "Map", skills: "Skills", automations: "Automations", connections: "Connections", knowledge: "Knowledge" };

export function IntelItemPage({ tab, item, ctx }: { tab: string; item: string; ctx: ItemContext }) {
  const found = findItem(tab, item, ctx);
  return (
    <div className="page">
      <Button size="sm" onClick={() => ctx.onGo({ kind: "intelligence", tab })}>
        <ArrowLeft size={14} aria-hidden="true" /> {TAB_WORDS[tab] ?? "Intelligence"}
      </Button>
      {found ? (
        <>
          <div className="modhead" style={{ marginTop: 12 }}>
            <div className="modhead__title" style={{ display: "block" }}>
              <div className="eyebrow">{found.kind}</div>
              <h1 style={found.title.length > 60 ? { fontSize: "var(--text-xl)", lineHeight: 1.3 } : undefined}>{found.title}</h1>
            </div>
          </div>
          <div className="card card--pad stack ipage">{found.body}</div>
        </>
      ) : (
        <p className="empty">This is no longer here.</p>
      )}
    </div>
  );
}
