/**
 * One automation's page: the sentence, when it runs, the switch and Run now, what it runs (in
 * words, never edited here: the person asks Alpha), and its runs with what each found.
 */
import { useEffect, useState } from "react";
import type { AutomationDetail, Client } from "../core/client";
import { when } from "../modules/format";
import { Badge, Button } from "../ui";
import { ArrowLeft, Check, X } from "../ui/icons";
import type { Surface } from "./Rail";
import { stepSentence } from "./steps";
import { VERDICT } from "./Automations";

export function AutomationPage({ client, id, version, onGo, onAsk, onChanged }: { client: Client; id: string; version: number; onGo: (s: Surface) => void; onAsk: (text: string) => void; onChanged: () => void }) {
  const [auto, setAuto] = useState<AutomationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [pageBody, setPageBody] = useState("");
  useEffect(() => {
    let live = true;
    client
      .automationPage(id)
      .then((a) => {
        if (!live) return;
        setAuto(a);
        setError(null);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [client, id, version]);
  // While it runs, its steps arrive through the window's one poll (`version` moves).
  if (error) return <div className="page"><p className="notice" role="alert">{error}</p></div>;
  if (!auto) return <div className="page"><p className="empty">Loading…</p></div>;
  const act = async (work: () => Promise<unknown>, words: string) => {
    try {
      await work();
      setMessage(words);
      onChanged();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <div className="page">
      <Button size="sm" onClick={() => onGo({ kind: "intelligence", tab: "automations" })}>
        <ArrowLeft size={14} aria-hidden="true" /> Agents
      </Button>
      <div className="modhead" style={{ marginTop: 12 }}>
        <div className="modhead__title" style={{ display: "block" }}>
          <h1 style={auto.title.length > 60 ? { fontSize: "var(--text-xl)", lineHeight: 1.3 } : undefined}>{auto.title}</h1>
          <div className="row" style={{ marginTop: 6 }}>
            <Badge tone={auto.running ? "info" : auto.enabled ? "good" : "gray"}>{auto.running ? "Running now" : auto.enabled ? "On" : "Off"}</Badge>
            <span className="faint">
              {auto.when}
              {auto.enabled && auto.next_run_at ? ` · next ${when(auto.next_run_at)}` : ""}
              {auto.last_run_at ? ` · last ran ${when(auto.last_run_at)}` : " · hasn't run on its own yet"}
            </span>
          </div>
        </div>
        <div className="row">
          <Button size="sm" onClick={() => void act(() => client.switchAutomation(auto.id, !auto.enabled), auto.enabled ? "Switched off." : "Switched on.")}>
            {auto.enabled ? "Switch off" : "Switch on"}
          </Button>
          <Button size="sm" disabled={Boolean(auto.running)} onClick={() => void act(() => client.runAutomation(auto.id), "Running now.")}>
            Run now
          </Button>
          <Button size="sm" variant="primary" onClick={() => onAsk(`Change the automation "${auto.title}": `)}>
            Ask Alpha to change this
          </Button>
        </div>
      </div>
      {message ? <p className="notice notice--ok" role="status">{message}</p> : null}
      {auto.goal ? <p className="muted" style={{ marginTop: 8 }}>For: {auto.goal}</p> : null}
      {auto.last_verdict ? (
        <p className="row" style={{ marginTop: 8, gap: 8 }}>
          <span className={`badge ${VERDICT[auto.last_verdict].cls}`}>Last run {VERDICT[auto.last_verdict].words.toLowerCase()}</span>
          {auto.last_why ? <span className="muted">{auto.last_why}</span> : null}
        </p>
      ) : auto.last_error ? (
        <p className="notice">Last run didn't work: {auto.last_error}</p>
      ) : null}

      <div className="section">
        <div className="section__head">
          <h2>Its page</h2>
          <span className="faint">What it is for, what a good run looks like, what to do; Alpha wrote it, you can change it</span>
        </div>
        <div className="card card--pad">
          {editing ? (
            <>
              <textarea className="note__edit" rows={8} value={pageBody} onChange={(e) => setPageBody(e.target.value)} aria-label="Edit the agent's page" />
              <div className="row" style={{ marginTop: 8 }}>
                <Button size="sm" variant="primary" onClick={() => void client.writeNote(`agent:${auto.id}`, auto.title, pageBody).then(() => { setEditing(false); onChanged(); })}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              </div>
            </>
          ) : auto.guidelines?.body ? (
            <p className="muted editable" style={{ whiteSpace: "pre-wrap", fontSize: "var(--text-md)" }} onClick={() => { setPageBody(auto.guidelines?.body ?? ""); setEditing(true); }} title="Click to edit">
              {auto.guidelines.body}
            </p>
          ) : (
            <div className="row" style={{ gap: 10 }}>
              <span className="empty">No page yet.</span>
              <Button size="sm" onClick={() => onAsk(`Write the page for the agent "${auto.title}": what it is for, what a good run looks like, what to do when a source needs a sign-in or stops reading, and what to tell me.`)}>
                Ask Alpha to write it
              </Button>
              <Button size="sm" variant="ghost" onClick={() => { setPageBody(""); setEditing(true); }}>
                Write it yourself
              </Button>
            </div>
          )}
          {auto.good_run ? <p className="faint" style={{ marginTop: 10 }}>A run succeeds when {auto.good_run}.</p> : null}
        </div>
      </div>

      <div className="section">
        <div className="section__head">
          <h2>What it does</h2>
          <span className="faint">{auto.pipeline?.length ? "a pipeline: these steps, with no model" : "Alpha follows these instructions each run"}</span>
        </div>
        <div className="card card--pad">
          {auto.pipeline?.length ? (
            <ol className="steps">
              {auto.pipeline.map((st, i) => (
                <li key={i}>{stepSentence(st)}</li>
              ))}
            </ol>
          ) : (
            <div className="people__page">{auto.procedure}</div>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section__head">
          <h2>Runs</h2>
          <span className="faint">{auto.runs.length ? `the last ${auto.runs.length}` : ""}</span>
        </div>
        {!auto.runs.length ? <p className="empty">It hasn't run yet.</p> : null}
        <div className="stack">
          {auto.runs.map((r) => (
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
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
