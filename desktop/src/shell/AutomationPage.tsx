/**
 * One automation's page: the sentence, when it runs, the switch and Run now, what it runs (in
 * words, never edited here: the person asks Alpha), and its runs with what each found. The
 * shared page header carries a back link to Intelligence and the serif title (9 Oct, §5).
 */
import { useEffect, useState } from "react";
import type { AutomationDetail, Client } from "../core/client";
import { when } from "../modules/format";
import { Badge, Button, EmptyCard, Notice, PageHeader, SectionCard, Trouble } from "../ui";
import { Check, ICON_SM, X } from "../ui/icons";
import { BackLink } from "./BackLink";
import type { Surface } from "./Rail";
import { stepSentence } from "./steps";

export function AutomationPage({ client, id, version, onGo, onAsk, onChanged }: { client: Client; id: string; version: number; onGo: (s: Surface) => void; onAsk: (text: string) => void; onChanged: () => void }) {
  const [auto, setAuto] = useState<AutomationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
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
  }, [client, id, version, tick]);
  // While it runs, its steps arrive through the window's one poll (`version` moves).
  const back = <BackLink to="Automations" onClick={() => onGo({ kind: "intelligence", tab: "automations" })} />;
  if (!auto) {
    return (
      <>
        <PageHeader left={back} />
        <div className="page page--column">{error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't open this automation: {error}</Trouble> : <p className="faint">Loading this automation…</p>}</div>
      </>
    );
  }
  const act = async (work: () => Promise<unknown>, words: string) => {
    try {
      await work();
      setMessage({ ok: true, text: words });
      onChanged();
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : String(e) });
    }
  };
  return (
    <>
      <PageHeader
        left={back}
        title={auto.title}
        right={
          <>
            <Button size="sm" onClick={() => void act(() => client.switchAutomation(auto.id, !auto.enabled), auto.enabled ? "Switched off." : "Switched on.")}>
              {auto.enabled ? "Switch off" : "Switch on"}
            </Button>
            <Button size="sm" disabled={Boolean(auto.running)} onClick={() => void act(() => client.runAutomation(auto.id), "Running now.")}>
              Run now
            </Button>
            <Button size="sm" variant="primary" onClick={() => onAsk(`Change the automation "${auto.title}": `)}>
              Ask Alpha to change this
            </Button>
          </>
        }
      />
      <div className="page page--column">
        <div className="stack stack--wide">
          <div className="row">
            <Badge tone={auto.running ? "info" : auto.enabled ? "good" : "gray"}>{auto.running ? "Running now" : auto.enabled ? "On" : "Off"}</Badge>
            <span className="faint">
              {auto.when}
              {auto.enabled && auto.next_run_at ? ` · next ${when(auto.next_run_at)}` : ""}
              {auto.last_run_at ? ` · last ran ${when(auto.last_run_at)}` : " · hasn't run on its own yet"}
            </span>
          </div>
          {message ? <Notice tone={message.ok ? "ok" : "bad"}>{message.text}</Notice> : null}
          {auto.last_error ? <Trouble>Last run didn't work: {auto.last_error}</Trouble> : null}

          <SectionCard title="What it does" subtitle={auto.pipeline?.length ? "A pipeline: these steps, with no model" : "Alpha follows these instructions each run"}>
            {auto.pipeline?.length ? (
              <ol className="steps">
                {auto.pipeline.map((st, i) => (
                  <li key={i}>{stepSentence(st)}</li>
                ))}
              </ol>
            ) : (
              <div className="people__page">{auto.procedure}</div>
            )}
          </SectionCard>

          <SectionCard title="Runs" subtitle={auto.runs.length ? `The last ${auto.runs.length}` : undefined}>
            {!auto.runs.length ? <EmptyCard title="It hasn't run yet">Each run, with what it found, appears here.</EmptyCard> : null}
            <div className="stack">
              {auto.runs.map((r) => (
                <div key={r.at} className="run">
                  <div className="row">
                    <b>{when(r.at)}</b>
                    {r.outcome ? <span className="muted">{r.outcome}</span> : <span className="faint">Still running, or ended without a word.</span>}
                  </div>
                  {r.lines.length ? (
                    <ul className="stages">
                      {r.lines.map((l, i) => (
                        <li key={`${l.at}-${i}`} className={l.kind === "failed" ? "notice" : "stages__done"}>
                          {l.kind === "failed" ? <X size={ICON_SM} aria-label="failed" /> : <Check size={ICON_SM} aria-label="done" />} {l.text}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
