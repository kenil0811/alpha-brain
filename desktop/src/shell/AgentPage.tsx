/**
 * One agent's page (Q44, Q50): its name (Rename), the sentence it works by, its state (Pause,
 * Set going, Run now), its look (the face it wears in Agents, section 7c), its brief (the
 * person's page: Alpha drafts it, they edit it), its notes (what it learned, its own), when it
 * works, what it may touch, what it does (its pipeline, in words, never edited here: the person
 * asks Alpha), its runs with what each found, the decisions about it, and Delete for a custom
 * one (Alpha's own agents are paused, never deleted).
 */
import { useEffect, useState } from "react";
import type { AgentDetail, AgentRemoval, Client } from "../core/client";
import { when } from "../modules/format";
import { Badge, Button, Confirm } from "../ui";
import { ArrowLeft, Check, X } from "../ui/icons";
import type { Surface } from "./Rail";
import { stepSentence } from "./steps";
import { mayWords, VERDICT } from "./Agents";
import { useAgentLook } from "./AgentFace";
import { LookEditor } from "../avatar/LookPicker";
import type { Look } from "../avatar/looks";
import { usePreference } from "../core/preferences";
import { say } from "../core/client";
import { AgentTasks } from "../modules/Tasks";

/** The face this agent wears in Agents (section 7c): its own look, or Alpha's until one is
 *  picked; the companion's pickers from Settings. */
function AgentLookSection({ client, id, kind }: { client: Client; id: string; kind: string }) {
  const [look, setLook, own] = useAgentLook(client, id, kind);
  const [problem, setProblem] = useState<string | null>(null);
  const [looks, setLooks] = usePreference<Record<string, unknown>>(client, "agent_looks", {});
  const keep = (next: Look) => {
    setProblem(null);
    void setLook?.(next).then((err) => err && setProblem(err));
  };
  return (
    <div className="section">
      <div className="section__head">
        <h2>Its look</h2>
        <span className="faint">{own ? "The face it wears in Agents" : kind !== "custom" ? "Its own face until you pick another" : "It wears Alpha's look until you pick one"}</span>
        {own ? (
          <span className="section__right">
            <Button size="sm" variant="ghost" onClick={() => { const rest = { ...(looks ?? {}) }; delete rest[id]; void setLooks(rest).then((err) => err && setProblem(err)); }}>
              Wear Alpha's look
            </Button>
          </span>
        ) : null}
      </div>
      <div className="card card--pad">
        <LookEditor look={look} onChange={keep} problem={problem} />
      </div>
    </div>
  );
}

/** A page of the agent's own: the brief (editable) or the notes (read). */
/** The agent as its file (harness slice 6): its schedule, state, steps and what it may write in
 *  the front matter, its brief as the body; one text, edited and saved like a skill's. */
function AgentFile({ client, id, version, onChanged }: { client: Client; id: string; version: number; onChanged: () => void }) {
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (editing) return;
    let live = true;
    client.agentText(id).then((t) => live && setText(t.text)).catch((e: unknown) => live && setProblem(say(e)));
    return () => {
      live = false;
    };
  }, [client, id, version, editing]);
  const save = () =>
    void client
      .editAgentText(id, text)
      .then((t) => {
        setText(t.text);
        setEditing(false);
        setProblem(null);
        onChanged();
      })
      .catch((e: unknown) => setProblem(say(e)));
  return (
    <div className="section">
      <div className="section__head">
        <h2>Its file</h2>
        <span className="faint">When it works, what it may write, its steps or its brief; yours to edit, Alpha reads it every run</span>
        <div className="section__right">
          {editing ? (
            <>
              <Button size="sm" variant="primary" onClick={save}>Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setEditing(true)}>Edit</Button>
          )}
        </div>
      </div>
      <div className="card card--pad">
        {editing ? (
          <textarea className="note__edit" rows={18} value={text} onChange={(e) => setText(e.target.value)} aria-label="Edit the agent's file" spellCheck={false} />
        ) : (
          <pre className="skill__file" style={{ whiteSpace: "pre-wrap", margin: 0 }}>{text || "Loading…"}</pre>
        )}
        {problem ? <p className="notice" role="alert">{problem}</p> : null}
      </div>
    </div>
  );
}

function AgentNote({ title, words, body, editable, onSave, onAsk }: { title: string; words: string; body: string | null; editable: boolean; onSave?: (body: string) => Promise<unknown>; onAsk?: () => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  return (
    <div className="section">
      <div className="section__head">
        <h2>{title}</h2>
        <span className="faint">{words}</span>
      </div>
      <div className="card card--pad">
        {editing ? (
          <>
            <textarea className="note__edit" rows={8} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={`Edit the agent's ${title.toLowerCase()}`} />
            <div className="row" style={{ marginTop: 8 }}>
              <Button size="sm" variant="primary" onClick={() => void onSave?.(draft).then(() => setEditing(false))}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                Cancel
              </Button>
            </div>
          </>
        ) : body ? (
          <p className={`muted${editable ? " editable" : ""}`} style={{ whiteSpace: "pre-wrap", fontSize: "var(--text-md)" }} onClick={editable ? () => { setDraft(body); setEditing(true); } : undefined} title={editable ? "Click to edit" : undefined}>
            {body}
          </p>
        ) : editable ? (
          <div className="row" style={{ gap: 10 }}>
            <span className="empty">No brief yet.</span>
            {onAsk ? (
              <Button size="sm" onClick={onAsk}>
                Ask Alpha to write it
              </Button>
            ) : null}
            <Button size="sm" variant="ghost" onClick={() => { setDraft(""); setEditing(true); }}>
              Write it yourself
            </Button>
          </div>
        ) : (
          <span className="empty">Nothing yet.</span>
        )}
      </div>
    </div>
  );
}

export function AgentPage({ client, id, version, onGo, onAsk, onChanged }: { client: Client; id: string; version: number; onGo: (s: Surface) => void; onAsk: (text: string) => void; onChanged: () => void }) {
  const [agent, setAgent] = useState<AgentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [removal, setRemoval] = useState<AgentRemoval | null>(null);
  useEffect(() => {
    let live = true;
    client
      .agentPage(id)
      .then((a) => {
        if (!live) return;
        setAgent(a);
        setError(null);
      })
      .catch((e: unknown) => live && setError(say(e)));
    return () => {
      live = false;
    };
  }, [client, id, version]);
  // While it runs, its steps arrive through the window's one poll (`version` moves).
  if (error) return <div className="page"><p className="notice" role="alert">{error}</p></div>;
  if (!agent) return <div className="page"><p className="empty">Loading…</p></div>;
  const act = async (work: () => Promise<unknown>, words: string) => {
    try {
      await work();
      setMessage(words);
      onChanged();
    } catch (e) {
      setMessage(say(e));
    }
  };
  const custom = agent.kind === "custom";
  return (
    <div className="page">
      <Button size="sm" onClick={() => onGo({ kind: "intelligence", tab: "agents" })}>
        <ArrowLeft size={14} aria-hidden="true" /> Agents
      </Button>
      <div className="modhead" style={{ marginTop: 12 }}>
        <div className="modhead__title" style={{ display: "block" }}>
          {renaming !== null ? (
            <form className="row" onSubmit={(e) => { e.preventDefault(); const name = renaming.trim(); if (!name) return; void act(() => client.changeAgent(agent.id, { name }), `Renamed to ${name}.`).then(() => setRenaming(null)); }}>
              <input className="input" value={renaming} onChange={(e) => setRenaming(e.target.value)} aria-label="The agent's name" autoFocus />
              <Button size="sm" variant="primary" type="submit">Save</Button>
              <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>Cancel</Button>
            </form>
          ) : (
            <h1 style={agent.name.length > 60 ? { fontSize: "var(--text-xl)", lineHeight: 1.3 } : undefined}>{agent.name}</h1>
          )}
          {agent.description !== agent.name ? <p className="muted" style={{ marginTop: 4 }}>{agent.description}</p> : null}
          <div className="row" style={{ marginTop: 6 }}>
            <Badge tone={agent.running ? "info" : agent.on ? "good" : "gray"}>{agent.running ? "Running now" : agent.on ? "On" : "Paused"}</Badge>
            <span className="faint">
              {agent.when}
              {agent.on && agent.next_run_at ? ` · next ${when(agent.next_run_at)}` : ""}
              {agent.last_run_at ? ` · last ran ${when(agent.last_run_at)}` : " · hasn't run on its own yet"}
            </span>
          </div>
        </div>
        <div className="row">
          <Button size="sm" onClick={() => setRenaming(agent.name)}>Rename</Button>
          <Button size="sm" onClick={() => void act(() => client.changeAgent(agent.id, { state: agent.on ? "paused" : "on" }), agent.on ? "Paused." : "Going.")}>
            {agent.on ? "Pause" : "Set going"}
          </Button>
          <Button size="sm" disabled={Boolean(agent.running)} onClick={() => void act(() => client.runAgent(agent.id), "Running now.")}>
            Run now
          </Button>
          {agent.running ? (
            <Button size="sm" variant="ghost" onClick={() => void act(() => client.stopAgent(agent.id), "Stopping it.")}>
              Stop
            </Button>
          ) : null}
          <Button size="sm" variant="primary" onClick={() => onAsk(`Change the agent ${agent.name}: `)}>
            Ask Alpha to change this
          </Button>
          {custom ? (
            <Button size="sm" variant="danger" onClick={() => void client.agentRemoval(agent.id).then(setRemoval).catch((e: unknown) => setMessage(say(e)))}>
              Delete
            </Button>
          ) : null}
        </div>
      </div>
      <Confirm open={removal !== null} title={`Delete ${agent.name}?`} action="Delete" onCancel={() => setRemoval(null)} onConfirm={() => { const plan = removal; setRemoval(null); void client.deleteAgent(agent.id).then(() => { onChanged(); onGo({ kind: "intelligence", tab: "agents" }); }).catch((e: unknown) => setMessage(say(e))); return plan; }}>
        {removal ? `Deletes ${removal.what}. This can't be undone; Activity keeps that it was here.` : ""}
      </Confirm>
      {message ? <p className="notice notice--ok" role="status">{message}</p> : null}
      {agent.goal ? <p className="muted" style={{ marginTop: 8 }}>For: {agent.goal}</p> : null}
      {agent.last_verdict ? (
        <p className="row" style={{ marginTop: 8, gap: 8 }}>
          <span className={`badge ${VERDICT[agent.last_verdict].cls}`}>Last run {VERDICT[agent.last_verdict].words.toLowerCase()}</span>
          {agent.last_why ? <span className="muted">{agent.last_why}</span> : null}
        </p>
      ) : agent.last_error ? (
        <p className="notice">Last run didn't work: {agent.last_error}</p>
      ) : null}

      <AgentTasks client={client} agentId={agent.id} version={version} onGo={onGo} />

      <AgentLookSection client={client} id={agent.id} kind={agent.kind} />

      <AgentFile client={client} id={agent.id} version={version} onChanged={onChanged} />
      {agent.notes?.body ? <AgentNote title="Its notes" words="What it learned in its runs; its own page" body={agent.notes.body} editable={false} /> : null}

      <div className="section">
        <div className="section__head">
          <h2>When it works, and what it may touch</h2>
        </div>
        <div className="card card--pad">
          <p className="muted">
            It works {agent.when}, whenever you @-mention it ({`@${agent.name}`}) in a conversation, and when you press Run now.
          </p>
          <p className="muted" style={{ marginTop: 6 }}>
            It reads everything Alpha holds and may change {mayWords(agent.may)}; never more than Alpha may, and it never sends, posts or submits anything.
          </p>
          {agent.good_run ? <p className="faint" style={{ marginTop: 6 }}>A run succeeds when {agent.good_run}.</p> : null}
        </div>
      </div>

      {agent.pipeline?.length ? (
        <div className="section">
          <div className="section__head">
            <h2>What it does</h2>
            <span className="faint">its steps in words; the file above is where they are changed</span>
          </div>
          <div className="card card--pad">
            <ol className="steps">
              {agent.pipeline.map((st, i) => (
                <li key={i}>{stepSentence(st)}</li>
              ))}
            </ol>
          </div>
        </div>
      ) : null}

      <div className="section">
        <div className="section__head">
          <h2>Runs</h2>
          <span className="faint">{agent.runs.length ? `the last ${agent.runs.length}` : ""}</span>
        </div>
        {!agent.runs.length ? <p className="empty">It hasn't run yet.</p> : null}
        <div className="stack">
          {agent.runs.map((r) => (
            <div key={r.id} className="card card--pad">
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <b>{when(r.started_at)}</b>
                {r.verdict ? <span className={`badge ${VERDICT[r.verdict].cls}`}>{VERDICT[r.verdict].words}</span> : <span className="badge badge--running">Running</span>}
                {r.line ? <span className="muted">{r.line}</span> : null}
                {r.why ? <span className="notice" style={{ fontSize: "var(--text-sm)" }}>{r.why}</span> : null}
                {r.model_ms || r.repairs ? <span className="faint">{r.model_ms ? `${Math.round(r.model_ms / 1000)} s of model time` : ""}{r.repairs ? ` · ${r.repairs} repair${r.repairs === 1 ? "" : "s"}` : ""}</span> : <span className="faint">no model</span>}
              </div>
              {r.lines.length ? (
                <ul className="stages" style={{ marginTop: 6 }}>
                  {r.lines.map((l, i) => (
                    <li key={`${l.at}-${i}`} className={l.kind === "failed" ? "notice" : "stages__done"}>
                      {l.kind === "failed" ? <X size={12} aria-label="failed" /> : <Check size={12} aria-label="done" />} {l.text}
                      {l.data?.skill && typeof l.data.from === "number" ? (
                        <Button size="sm" variant="ghost" onClick={() => void act(() => client.restoreSkill(String(l.data?.skill), Number(l.data?.from)), `Took ${l.data?.skill} back to version ${l.data?.from}.`)}>
                          Undo this repair
                        </Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {agent.decisions.length ? (
        <div className="section">
          <div className="section__head">
            <h2>Decisions about it</h2>
            <span className="faint">yours bind it; Alpha's and its own stay open</span>
          </div>
          <div className="card list">
            {agent.decisions.map((d) => (
              <div key={d.id} className="item">
                <div className="item__body">
                  {d.what}
                  <div className="item__sub">
                    {d.by === "person" ? "You" : d.by === "alpha" ? "Alpha" : d.by} · {when(d.at)}
                    {d.state !== "binding" ? ` · ${d.state}` : ""}
                    {d.why ? ` · ${d.why}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
