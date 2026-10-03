/**
 * The project being made, on its own page (Alpha's CreationOnPage, ConversationCard,
 * QuestionsForm and CreationCard): "Describe your project" and Import while it is blank, then
 * the questions, what Alpha found and the options, the plan's "Create it", and the build's
 * progress, with Stop, Try again, Start over and Carry on. The chat only points here. Where it
 * stands comes from the core (`creation`, written by the model's creation_show); the page
 * reloads on every change, and every few seconds while a turn runs.
 */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { FileUp } from "lucide-react";
import type { Client, CreationAnswer, CreationOption, CreationQuestion, ModuleDetail } from "../core/client";
import { clock } from "../assistant/AssistantPanel";
import { Button, InfoTip } from "../ui";
import { isProjectFile, PROJECT_FILE } from "../shell/ProjectMenu";

/** The step it is on, in a few words (Alpha's ConversationCard). */
const STEP: Record<string, string> = {
  asking: "Waiting for your answers",
  proposing: "Options ready",
  planned: "Planned",
  building: "Building",
};
const BUILD_STAGES = ["Building it", "Checking that it works", "Ready to use"];

export function CreationOnPage({ client, detail, onChanged, onDescribe, onImport }: { client: Client; detail: ModuleDetail; onChanged: () => void; onDescribe: (text: string) => void; onImport: (file: File) => void }) {
  const creation = detail.creation;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The description goes through the chat, so the page hears of that turn only by looking:
  // until it shows up, the page says it is on it and looks every second.
  const [sent, setSent] = useState<string | null>(null);
  const running = detail.running?.[0] ?? null;
  const stageNow = detail.creation?.stage;
  useEffect(() => {
    if (running || stageNow !== "new") setSent(null);
  }, [running, stageNow]);
  // While a turn runs the page looks again every 3 s (Alpha's poll), so each stage shows as it lands.
  useEffect(() => {
    if (!running && !sent) return;
    const timer = window.setInterval(onChanged, running ? 3000 : 1000);
    return () => window.clearInterval(timer);
  }, [running, sent, onChanged]);
  if (!creation || creation.stage === "done") return null;

  async function answer(body: CreationAnswer) {
    setBusy(true);
    setError(null);
    try {
      await client.answerCreation(detail.id, body);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  async function stop() {
    if (!running?.id) return;
    try {
      if (!(await client.cancelTurn(running.id))) setError("This version of Alpha can't stop a turn yet; it finishes on its own.");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const stage = creation.stage;
  const failed = !running && creation.error;
  let body: ReactNode = null;
  if (sent && !running) {
    body = <Thinking since={sent} label="Understanding your request…" />;
  } else if (running && stage !== "building") {
    body = <Thinking since={running.started_at} onStop={() => void stop()} label={`${stage === "researching" ? "Looking around" : "Understanding your request"}…`} />;
  } else if (failed && creation.timed_out) {
    body = (
      <div className="failure" role="alert" aria-label="Stopped partway">
        <p className="notice">{creation.error}</p>
        <div className="row">
          <Button disabled={busy} onClick={() => void answer({ carry_on: true })}>
            Carry on
          </Button>
        </div>
      </div>
    );
  } else if (failed) {
    body = (
      <div className="failure" role="alert" aria-label="Alpha could not work this out">
        <p className="notice">Alpha could not work this out: {creation.error}.</p>
        <div className="row">
          <Button disabled={busy} onClick={() => void answer({ retry: true })}>
            Try again
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => void answer({ start_over: true })}>
            Start over
          </Button>
        </div>
      </div>
    );
  } else if (stage === "new") {
    body = (
      <Describe
        busy={busy}
        onStart={(text) => {
          setSent(new Date().toISOString());
          onDescribe(text);
        }}
        onImport={onImport}
      />
    );
  } else if (stage === "asking" && creation.questions?.length) {
    body = <QuestionsForm questions={creation.questions} busy={busy} onAnswer={(answers) => void answer({ answers })} onDefaults={() => void answer({ use_defaults: true })} />;
  } else if (stage === "proposing" && creation.proposal) {
    body = <ProposalCard proposal={creation.proposal} busy={busy} onChoose={(option, answers) => void answer({ choice: option.id, ...(Object.keys(answers).length ? { answers } : {}) })} />;
  } else if (stage === "planned") {
    body = (
      <div className="creation" aria-label="Create it">
        <p className="convo__plan">Plan ready — see Plan below</p>
        <div className="row">
          <Button disabled={busy} onClick={() => void answer({ build: true })}>
            Create it
          </Button>
          <InfoTip content="When the plan looks right, Alpha builds it, checks it and switches it on for you." label="What Create it does" />
        </div>
      </div>
    );
  } else if (stage === "building") {
    body = <Building detail={detail} running={running !== null} busy={busy} onStop={() => void stop()} onCarryOn={() => void answer({ carry_on: true })} />;
  }

  const step = (running || sent) && stage !== "building" ? null : STEP[stage] ?? null;
  return (
    <div className="section creation-on-page" aria-label="Making this project">
      <div className="convo convo--page">
        {step && !failed ? (
          <div className="convo__step">
            <span className="convo__steptext">{step}</span>
            {stage === "planned" ? <InfoTip content="To change or add something before it is made, just say so in the chat." label="How to change it" /> : null}
          </div>
        ) : null}
        {body}
        {error ? (
          <p className="notice" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

/** The blank project: one "Describe your project" box (sent to the chat) and Import. */
function Describe({ busy, onStart, onImport }: { busy: boolean; onStart: (text: string) => void; onImport: (file: File) => void }) {
  const [text, setText] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const start = (e?: FormEvent) => {
    e?.preventDefault();
    const clean = text.trim();
    if (clean) onStart(clean);
  };
  return (
    <form className="newproject" onSubmit={start}>
      <textarea
        autoFocus
        className="newproject__input"
        aria-label="Describe your project"
        placeholder="Describe your project"
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) start(e);
        }}
      />
      <div className="row newproject__actions">
        <Button variant="outline" size="sm" onClick={() => file.current?.click()}>
          <FileUp size={14} strokeWidth={1.75} aria-hidden="true" /> Import a project…
        </Button>
        <input
          ref={file}
          type="file"
          accept={`${PROJECT_FILE},.json,application/json`}
          hidden
          aria-label="Project file"
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []).find(isProjectFile);
            e.target.value = "";
            if (picked) onImport(picked);
          }}
        />
        <span className="newproject__spacer" />
        <Button type="submit" size="sm" disabled={busy || !text.trim()}>
          Start
        </Button>
      </div>
    </form>
  );
}

/** Every question takes several picks plus the person's own words; an answer joins them with
 *  "; ". Shared by the first questions and the decisions asked alongside the options. */
function useAnswers(questions: CreationQuestion[]) {
  const [choices, setChoices] = useState<Record<string, string[]>>({});
  const [other, setOther] = useState<Record<string, string>>({});
  const toggle = (id: string, option: string) =>
    setChoices((c) => {
      const picked = c[id] ?? [];
      return { ...c, [id]: picked.includes(option) ? picked.filter((o) => o !== option) : [...picked, option] };
    });
  function answers(): Record<string, string> {
    const out: Record<string, string> = {};
    for (const q of questions) {
      const parts = [...(choices[q.id] ?? []), (other[q.id] ?? "").trim()].filter(Boolean);
      if (parts.length) out[q.id] = parts.join("; ");
    }
    return out;
  }
  const fields = questions.map((q) => (
    <fieldset key={q.id} className="question">
      <legend>
        {q.question}
        {q.why_it_matters ? <InfoTip content={q.why_it_matters} label="Why this matters" /> : null}
      </legend>
      {q.options.map((option) => (
        <label key={option} className="question__option">
          <input type="checkbox" name={q.id} value={option} checked={(choices[q.id] ?? []).includes(option)} onChange={() => toggle(q.id, option)} />
          {option}
        </label>
      ))}
      <label className="question__option">
        Something else:
        <input type="text" aria-label={`Your own answer for: ${q.question}`} value={other[q.id] ?? ""} onChange={(e) => setOther((o) => ({ ...o, [q.id]: e.target.value }))} />
      </label>
    </fieldset>
  ));
  return { fields, answers };
}

function QuestionsForm({ questions, busy, onAnswer, onDefaults }: { questions: CreationQuestion[]; busy: boolean; onAnswer: (answers: Record<string, string>) => void; onDefaults: () => void }) {
  const { fields, answers } = useAnswers(questions);
  function submit(event: FormEvent) {
    event.preventDefault();
    const picked = answers();
    if (Object.keys(picked).length === 0) return;
    onAnswer(picked);
  }
  return (
    <form className="questions" onSubmit={submit} aria-label="A few questions">
      {fields}
      <div className="row">
        <Button type="submit" disabled={busy}>
          Continue
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onDefaults}>
          Use these defaults for now
        </Button>
      </div>
    </form>
  );
}

type Proposal = NonNullable<ModuleDetail["creation"]>["proposal"] & object;

/** Two or three shapes Alpha proposes after looking around; the person picks one. */
function ProposalCard({ proposal, busy, onChoose }: { proposal: Proposal; busy: boolean; onChoose: (option: CreationOption, answers: Record<string, string>) => void }) {
  const [showEvidence, setShowEvidence] = useState(false);
  const decisions = useAnswers(proposal.questions ?? []);
  return (
    <div className="proposal" aria-label="Options">
      {proposal.intro ? (
        <p className="proposal__intro" title={proposal.intro}>
          {proposal.intro}
        </p>
      ) : null}
      {proposal.findings?.length ? (
        <ul className="proposal__findings" aria-label="What Alpha found">
          {proposal.findings.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}
      {proposal.questions?.length ? <div className="questions">{decisions.fields}</div> : null}
      <div className="proposal__options">
        {proposal.options.map((option) => {
          const pick = option.id === proposal.default;
          return (
            <div key={option.id} className={`proposal__option${pick ? " proposal__option--default" : ""}`}>
              <b>
                {option.title}
                {pick ? <span className="pill pill--info proposal__pick">Alpha's pick</span> : null}
              </b>
              {option.summary ? <p>{option.summary}</p> : null}
              {option.why ? <p className="faint">{option.why}</p> : null}
              <Button size="sm" variant={pick ? "default" : "outline"} className="proposal__go" disabled={busy} onClick={() => onChoose(option, decisions.answers())}>
                {pick ? "Go with this" : "Go with this instead"}
              </Button>
            </div>
          );
        })}
      </div>
      {proposal.evidence?.length ? (
        <Button size="sm" variant="ghost" className="proposal__more" onClick={() => setShowEvidence((v) => !v)} aria-expanded={showEvidence}>
          {showEvidence ? "Hide what Alpha looked at" : `What Alpha looked at (${proposal.evidence.length})`}
        </Button>
      ) : null}
      {showEvidence ? (
        <ul className="proposal__evidence">
          {proposal.evidence.map((e, i) => (
            <li key={i}>
              {e.url ? (
                <a href={e.url} target="_blank" rel="noreferrer">
                  {e.title || e.url}
                </a>
              ) : (
                e.title
              )}
              {e.note ? <span className="faint"> · {e.note}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

/** The build: Building it → Checking that it works → Ready to use, from the build turn's own
 *  steps (what Alpha made, read and set up), with Stop. */
function Building({ detail, running, busy, onStop, onCarryOn }: { detail: ModuleDetail; running: boolean; busy: boolean; onStop: () => void; onCarryOn: () => void }) {
  const turn = detail.creation?.turn;
  const steps = detail.activity.filter((e) => turn && e.data.turn === turn && e.kind !== "replied" && e.kind !== "said");
  // Checking starts once the build reads or runs what it made (a reader's first run, an
  // automation's first run).
  const current = steps.some((e) => e.kind === "saw" || /^Set up:/.test(e.text)) ? 1 : 0;
  const last = steps[steps.length - 1];
  if (!running) {
    return (
      <div className="failure" role="alert" aria-label="Stopped partway">
        <p className="notice notice--quiet">Alpha stopped partway. What's made is kept.</p>
        <div className="row">
          <Button disabled={busy} onClick={onCarryOn}>
            Carry on
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="creation" aria-label="Creating it" aria-busy="true">
      <ol className="stages">
        {BUILD_STAGES.map((label, index) => (
          <li key={label} className={index < current ? "stages__done" : index === current ? "stages__current" : "stages__next"}>
            <span aria-hidden="true">{index < current ? "✓" : index === current ? "…" : "·"}</span> {label}
            {index < current ? <span className="sr-only"> (done)</span> : index === current ? <span className="sr-only"> (in progress)</span> : null}
          </li>
        ))}
      </ol>
      <p role="status" className="faint creation__status">
        {last ? last.text : "Starting…"}
        {steps.length > 1 ? ` · ${steps.length} steps so far` : ""}
      </p>
      <div className="row">
        <Button variant="outline" size="sm" onClick={onStop}>
          Stop
        </Button>
        <InfoTip content="Usually a few minutes. Keep using Alpha; it carries on while you do." label="How long it takes" />
      </div>
    </div>
  );
}

/** The wait, made visible: how long it has been, a word when it is longer than usual, and Stop. */
function Thinking({ since, onStop, label }: { since: string; onStop?: () => void; label: string }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = new Date(since).getTime();
    const tick = () => setSeconds(Math.max(0, Math.round((Date.now() - started) / 1000)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [since]);
  return (
    <div className="msg msg--ai creation__thinking" role="status">
      <div>
        {label} <span className="faint">{clock(seconds)}</span>
      </div>
      {seconds >= 90 ? <div className="faint">Longer than usual. A large request or a busy model service can take a few minutes; you can stop and try again.</div> : null}
      {onStop ? (
        <div className="row">
          <Button size="sm" variant="outline" onClick={onStop}>
            Stop
          </Button>
        </div>
      ) : null}
    </div>
  );
}

/** A plan's headings become bold lines and its numbered steps bullets (Alpha's planMarkdown). */
export function PlanSection({ body }: { body: string }) {
  const blocks = body.split(/\n{2,}/).map((b) => b.split("\n").filter((l) => l.trim()));
  return (
    <section className="section" aria-label="Plan">
      <div className="section__head">
        <h2>Plan</h2>
      </div>
      <div className="card card--pad projplan">
        {blocks.map((lines, i) => {
          if (!lines.length) return null;
          if (lines.every((l) => /^\s*([-*•]|\d+[.)])\s+/.test(l))) {
            return (
              <ul key={i}>
                {lines.map((l, j) => (
                  <li key={j}>{l.replace(/^\s*([-*•]|\d+[.)])\s+/, "")}</li>
                ))}
              </ul>
            );
          }
          return lines.map((l, j) =>
            /^#{1,6}\s+/.test(l) ? (
              <p key={`${i}-${j}`} className="projplan__head">
                <strong>{l.replace(/^#{1,6}\s+/, "")}</strong>
              </p>
            ) : (
              <p key={`${i}-${j}`}>{l.replace(/\*\*/g, "")}</p>
            ),
          );
        })}
      </div>
    </section>
  );
}
