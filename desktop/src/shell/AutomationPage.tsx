/**
 * One agent's page (Q33: every automation is an agent's process): the switch and Run now, its goal
 * and last verdict, its page (Alpha writes it, the person edits it; saved as the note
 * `agent:<id>`), its title, when it runs and what it does as fields (the core has no call that
 * edits those, so Save stays disabled with the reason), the companion it wears, and its runs with
 * a verdict each. The shared page header carries a back link and the serif title (9 Oct, §5).
 */
import { useEffect, useState } from "react";
import type { AutomationDetail, Client } from "../core/client";
import { when } from "../modules/format";
import { Badge, Button, Notice, PageHeader, SectionCard, Trouble } from "../ui";
import { Check, ICON_SM, X } from "../ui/icons";
import { BackLink } from "./BackLink";
import type { Surface } from "./Rail";
import { Field } from "./SkillPage";
import { LookPicker } from "../avatar/LookPicker";
import { AgentAvatar, useAgentLook } from "./AgentAvatar";
import { stepSentence } from "./steps";
import { VERDICT } from "./Automations";

export function AutomationPage({ client, id, version, onGo, onAsk, onChanged }: { client: Client; id: string; version: number; onGo: (s: Surface) => void; onAsk: (text: string) => void; onChanged: () => void }) {
  const [auto, setAuto] = useState<AutomationDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [draft, setDraft] = useState<{ title: string; when: string; does: string } | null>(null);
  const [pageBody, setPageBody] = useState<string | null>(null);
  const [look, setLook] = useAgentLook(client, id);
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
  const back = <BackLink to="Agents" onClick={() => onGo({ kind: "intelligence", tab: "agents" })} />;
  if (!auto) {
    return (
      <>
        <PageHeader left={back} />
        <div className="page page--column">{error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't open this agent: {error}</Trouble> : <p className="faint">Loading this agent…</p>}</div>
      </>
    );
  }
  const fields = draft ?? { title: auto.title, when: auto.when, does: auto.pipeline?.length ? auto.pipeline.map((st, i) => `${i + 1}. ${stepSentence(st)}`).join("\n") : auto.procedure };
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
        centre={
          <span className="intel__head">
            <AgentAvatar client={client} agent={auto.id} size={32} label={auto.title} />
            <h1 className="pagehead__title serif">{auto.title}</h1>
          </span>
        }
        right={
          <>
            <Button size="sm" onClick={() => void act(() => client.switchAutomation(auto.id, !auto.enabled), auto.enabled ? "Switched off." : "Switched on.")}>
              {auto.enabled ? "Switch off" : "Switch on"}
            </Button>
            <Button size="sm" disabled={Boolean(auto.running)} onClick={() => void act(() => client.runAutomation(auto.id), "Running now.")}>
              Run now
            </Button>
            <Button size="sm" variant="primary" onClick={() => onAsk(`Change the agent "${auto.title}": `)}>
              Ask Alpha to change this
            </Button>
          </>
        }
      />
      <div className="page page--column">
        <div className="stack stack--wide">
          <div className="row">
            <Badge tone={auto.running ? "info" : auto.enabled ? "good" : "gray"}>{auto.running ? "Running now" : auto.enabled ? "On" : "Off"}</Badge>
            {auto.last_verdict ? <Badge tone={VERDICT[auto.last_verdict].tone}>Last run {VERDICT[auto.last_verdict].words.toLowerCase()}</Badge> : null}
            <span className="faint">
              {auto.goal ? `${auto.goal} · ` : ""}
              {auto.when}
              {auto.enabled && auto.next_run_at ? ` · next ${when(auto.next_run_at)}` : ""}
              {auto.last_run_at ? ` · last ran ${when(auto.last_run_at)}` : ""}
            </span>
          </div>
          {message ? <Notice tone={message.ok ? "ok" : "bad"}>{message.text}</Notice> : null}
          {auto.last_verdict && auto.last_why ? <Notice tone={auto.last_verdict === "succeeded" ? "ok" : "bad"}>{auto.last_why}</Notice> : !auto.last_verdict && auto.last_error ? <Trouble>Last run didn't work: {auto.last_error}</Trouble> : null}

          <SectionCard
            title="Its page"
            info={auto.good_run ? `A run succeeds when ${auto.good_run}.` : undefined}
            actions={
              pageBody !== null ? (
                <>
                  <Button size="sm" variant="ghost" onClick={() => setPageBody(null)}>
                    Discard
                  </Button>
                  <Button size="sm" variant="primary" onClick={() => void act(() => client.writeNote(`agent:${auto.id}`, auto.title, pageBody), "Saved.").then(() => setPageBody(null))}>
                    Save
                  </Button>
                </>
              ) : !auto.guidelines?.body ? (
                <Button size="sm" onClick={() => onAsk(`Write the page for the agent "${auto.title}": what it is for, what a good run looks like, what to do when a source needs a sign-in or stops reading, and what to tell me.`)}>
                  Ask Alpha to write it
                </Button>
              ) : null
            }
          >
            {pageBody !== null ? (
              <textarea className="textfield" rows={8} value={pageBody} onChange={(e) => setPageBody(e.target.value)} aria-label="Edit the agent's page" autoFocus />
            ) : (
              <p className="editable" style={{ whiteSpace: "pre-wrap" }} tabIndex={0} title="Click to edit" onClick={() => setPageBody(auto.guidelines?.body ?? "")} onKeyDown={(e) => e.key === "Enter" && setPageBody(auto.guidelines?.body ?? "")}>
                {auto.guidelines?.body || <span className="faint">No page yet. Click to write it.</span>}
              </p>
            )}
          </SectionCard>

          <SectionCard
            title="Agent"
            actions={
              <>
                {draft ? (
                  <Button size="sm" variant="ghost" onClick={() => setDraft(null)}>
                    Discard
                  </Button>
                ) : null}
                <Button size="sm" variant="primary" disabledReason="Editing an agent needs Alpha's core">
                  Save
                </Button>
              </>
            }
          >
            <div className="intel__fields">
              <Field label="Title" value={fields.title} onChange={(v) => setDraft({ ...fields, title: v })} />
              <Field label="When" value={fields.when} onChange={(v) => setDraft({ ...fields, when: v })} />
              <Field label={auto.pipeline?.length ? "Steps" : "Instructions"} value={fields.does} onChange={(v) => setDraft({ ...fields, does: v })} rows={8} />
            </div>
          </SectionCard>

          <SectionCard title="Companion">
            <LookPicker value={look} onChange={(l) => void setLook(l)} />
          </SectionCard>

          <SectionCard title="Runs">
            {!auto.runs.length ? <p className="faint">None yet.</p> : null}
            <div className="stack">
              {auto.runs.map((r) => (
                <div key={r.id} className="run">
                  <div className="row" style={{ gap: "var(--space-2)", flexWrap: "wrap" }}>
                    <b>{when(r.started_at)}</b>
                    {r.verdict ? <Badge tone={VERDICT[r.verdict].tone}>{VERDICT[r.verdict].words}</Badge> : <Badge tone="info">Running</Badge>}
                    {r.line ? <span className="muted">{r.line}</span> : null}
                    {r.why ? <span className="faint">{r.why}</span> : null}
                    {r.model_ms || r.repairs ? <span className="faint">{r.model_ms ? `${Math.round(r.model_ms / 1000)} s of model time` : ""}{r.repairs ? ` · ${r.repairs} repair${r.repairs === 1 ? "" : "s"}` : ""}</span> : null}
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
