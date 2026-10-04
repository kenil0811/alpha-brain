/**
 * One automation's page: the sentence, when it runs, the switch and Run now, what it runs (in
 * words, never edited here: the person asks Alpha), and its runs with what each found.
 */
import { useEffect, useState } from "react";
import type { AutomationDetail, Client } from "../core/client";
import { when } from "../modules/format";
import { Badge, Button, PageHeader } from "../ui";
import { Check, X } from "../ui/icons";
import type { Surface } from "./Rail";
import { stepSentence } from "./steps";

export function AutomationPage({ client, id, version, onGo, onAsk, onChanged }: { client: Client; id: string; version: number; onGo: (s: Surface) => void; onAsk: (text: string) => void; onChanged: () => void }) {
  const [auto, setAuto] = useState<AutomationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
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
      <PageHeader
        path={[{ label: "Intelligence", onClick: () => onGo({ kind: "intelligence" }) }, { label: "Automations", onClick: () => onGo({ kind: "intelligence", tab: "automations" }) }]}
        title={<span title={auto.title}>{auto.title}</span>}
        meta={
          <>
            <Badge tone={auto.running ? "info" : auto.enabled ? "good" : "gray"}>{auto.running ? "Running now" : auto.enabled ? "On" : "Off"}</Badge>
            <span>
              {auto.when}
              {auto.enabled && auto.next_run_at ? ` · next ${when(auto.next_run_at)}` : ""}
              {auto.last_run_at ? ` · last ran ${when(auto.last_run_at)}` : " · hasn't run on its own yet"}
            </span>
          </>
        }
        right={
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
        }
      />
      {message ? <p className="notice notice--ok" role="status">{message}</p> : null}
      {auto.last_error ? <p className="notice">Last run didn't work: {auto.last_error}</p> : null}

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
            <div key={r.at} className="card card--pad">
              <div className="row">
                <b>{when(r.at)}</b>
                {r.outcome ? <span className="muted">{r.outcome}</span> : <span className="faint">Still running, or ended without a word.</span>}
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
