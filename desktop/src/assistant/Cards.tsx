/**
 * The structured steps of a conversation, as cards built from the kit (9 Oct, the UI rulebook
 * §9): a plan Alpha proposes, with Approve and Decline, and a question, with choice pills and
 * "Or say it your way". Moved out of the panel so the panel stays about the conversation.
 */
import { useState } from "react";
import { say } from "../core/client";
import type { Ask, Client, Plan, PlanPiece, PlanQuestion, Turn } from "../core/client";
import { Badge, Button, InfoTip, Rich } from "../ui";

/** The questions a plan asks before its build (Q36): each with its choices, Alpha's pick
 *  selected, and a line to say it another way. What is chosen goes with the approval. */
export function PlanQuestions({ questions, answers, onChange }: { questions: PlanQuestion[]; answers: Record<string, string>; onChange: (answers: Record<string, string>) => void }) {
  return (
    <ol className="planq">
      {questions.map((q, i) => {
        const key = String(i);
        const chosen = answers[key] ?? q.default ?? "";
        const custom = chosen && !q.options.includes(chosen) ? chosen : "";
        return (
          <li key={key} className="planq__item">
            <div className="planq__text">{q.text}</div>
            <div className="planq__opts">
              {q.options.map((o) => (
                <Button key={o} size="sm" variant={chosen === o ? "primary" : undefined} aria-pressed={chosen === o} onClick={() => onChange({ ...answers, [key]: o })}>
                  {o}
                  {o === q.default ? <span className="planq__pick"> · Alpha's pick</span> : null}
                </Button>
              ))}
              <input className="planq__other" value={custom} placeholder={q.options.length ? "Or say it your way" : q.default ? `Alpha's pick: ${q.default}` : "Your answer"} aria-label={`Your answer: ${q.text}`} onChange={(e) => onChange({ ...answers, [key]: e.target.value })} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function defaultAnswers(questions: PlanQuestion[]): Record<string, string> {
  const out: Record<string, string> = {};
  questions.forEach((q, i) => {
    const v = q.answer ?? q.default;
    if (v) out[String(i)] = v;
  });
  return out;
}

// What each block means sits in an InfoTip, not a subtitle (the UI rulebook §17).
const PIECE_GROUPS: { kind: PlanPiece["kind"]; title: string; note: string }[] = [
  { kind: "kept", title: "Kept for you", note: "What every such thing has and you'd miss. Skip any you don't want." },
  { kind: "choice", title: "Your call", note: "Where the products differ or it costs something: keep, defer or skip." },
  { kind: "wont", title: "Not this time", note: "Named so it isn't forgotten. Keep one to bring it in now." },
];
const DECISIONS = ["keep", "defer", "skip"] as const;
const DECISION_WORDS: Record<string, string> = { keep: "Keep", defer: "Defer", skip: "Skip" };
const CAN_WORDS: Record<string, string> = { now: "Can build now", needs: "Needs", not_yet: "Not yet" };

/** A researched plan's pieces (Q37) in three blocks: kept for you (the lean core), your call
 *  (each with why, how it would be built here and whether it can be built now) and not this
 *  time. The person keeps, defers or skips each; Alpha's recommendation is pressed. */
export function PlanPieces({ pieces, decisions, onChange }: { pieces: PlanPiece[]; decisions: Record<string, string>; onChange: (decisions: Record<string, string>) => void }) {
  return (
    <div className="planp">
      {PIECE_GROUPS.map((g) => {
        const items = pieces.filter((p) => p.kind === g.kind);
        if (!items.length) return null;
        return (
          <section key={g.kind} className="planp__group" aria-label={g.title}>
            <h4 className="planp__head">
              {g.title} <InfoTip text={g.note} />
            </h4>
            {items.map((p) => {
              const chosen = decisions[p.id] ?? p.recommend;
              const sources = (p.sources ?? []).filter((s) => s.title || s.url);
              return (
                <div key={p.id} className="planp__item">
                  <div className="planp__title">
                    {p.title} <span className="planp__what">— {p.what}</span>
                  </div>
                  {p.why ? <div className="faint">{p.why}</div> : null}
                  <div className="planp__meta">
                    <span className={`planp__can planp__can--${p.can}`}>
                      {CAN_WORDS[p.can] ?? p.can}
                      {p.needs ? `: ${p.needs}` : ""}
                    </span>
                    {p.build ? <span className="faint">How: {p.build}</span> : null}
                    {p.known ? <span className="faint">Rests on: {p.known}</span> : null}
                    {sources.length ? (
                      <span className="faint">
                        From:{" "}
                        {sources.map((s, i) => (
                          <span key={`${s.url ?? s.title}-${i}`}>
                            {i ? ", " : ""}
                            {s.url ? (
                              <a className="planp__src" href={s.url} target="_blank" rel="noreferrer">
                                {s.title || s.url}
                              </a>
                            ) : (
                              s.title
                            )}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </div>
                  <div className="planp__opts" role="group" aria-label={`Decide: ${p.title}`}>
                    {DECISIONS.map((d) => (
                      <Button key={d} size="sm" variant={chosen === d ? "primary" : undefined} aria-pressed={chosen === d} onClick={() => onChange({ ...decisions, [p.id]: d })}>
                        {DECISION_WORDS[d]}
                        {d === p.recommend ? <span className="planq__pick"> · Alpha's pick</span> : null}
                      </Button>
                    ))}
                  </div>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

export function defaultDecisions(pieces: PlanPiece[]): Record<string, string> {
  const out: Record<string, string> = {};
  pieces.forEach((p) => {
    out[p.id] = p.decision ?? p.recommend;
  });
  return out;
}

/** A plan Alpha proposed (nothing is built until the person approves, here or in words), or a
 *  build that stopped before it finished (Approve carries on from where it stopped). It shows the
 *  plan's task (its title) and the plan as proposed (its body): the plan carries no separate
 *  expected outcome or success criteria, so none is shown (the core would have to produce them).
 *  A plan with questions (Q36) or researched pieces (Q37) shows them with Alpha's picks pressed:
 *  Approve carries the answers and decisions. */
export function PlanCard({ plan, client, onDecided }: { plan: Plan; client: Client; onDecided: () => void }) {
  const [busy, setBusy] = useState(false);
  const questions = plan.state === "proposed" ? (plan.questions ?? []) : [];
  const pieces = plan.state === "proposed" ? (plan.pieces ?? []) : [];
  const [answers, setAnswers] = useState<Record<string, string>>(() => defaultAnswers(plan.questions ?? []));
  const [decisions, setDecisions] = useState<Record<string, string>>(() => defaultDecisions(plan.pieces ?? []));
  const stopped = plan.state === "stopped";
  const decide = (approve: boolean) => {
    setBusy(true);
    // One request per decision. (Until 2 Oct evening the yes request was built eagerly, so
    // "Not now" approved and "Leave it" resumed before declining: builds ran on a no.)
    const go = () => (stopped ? client.resumePlan(plan.id) : client.approvePlan(plan.id, questions.length ? answers : undefined, pieces.length ? decisions : undefined));
    void (approve ? go() : client.declinePlan(plan.id)).finally(() => {
      setBusy(false);
      onDecided();
    });
  };
  const open = questions.filter((_q, i) => !(answers[String(i)] ?? "").trim()).length;
  const kept = pieces.filter((p) => (decisions[p.id] ?? p.recommend) === "keep").length;
  return (
    <section className="creation plancard" aria-label={`Plan: ${plan.title}`}>
      <h3 className="creation__title">
        {plan.title}
        <Badge tone="warn">{stopped ? "Stopped" : "Needs approval"}</Badge>
      </h3>
      {plan.body ? (
        <div className="plancard__body">
          <Rich text={plan.body} />
        </div>
      ) : null}
      {pieces.length ? <PlanPieces pieces={pieces} decisions={decisions} onChange={setDecisions} /> : null}
      {questions.length ? <PlanQuestions questions={questions} answers={answers} onChange={setAnswers} /> : null}
      <span className="faint">
        {stopped
          ? "The build stopped before it finished. Approve to carry on from where it stopped."
          : pieces.length
            ? `Nothing is built until you approve. ${kept} of ${pieces.length} pieces kept, Alpha's picks pressed: change any${open ? `; ${open === 1 ? "one question has no pick yet" : `${open} questions have no pick yet`}` : ""}.`
            : questions.length
              ? open
                ? `Nothing is built until you approve. ${open === 1 ? "One question has no pick yet" : `${open} questions have no pick yet`}: answer it, or approve and Alpha decides it sensibly.`
                : "Nothing is built until you approve. Alpha's picks are selected: change any, or say it your way."
              : "Nothing is built until you approve. Answer any question in a reply, or approve it as proposed."}
      </span>
      <div className="row">
        <Button size="sm" variant="primary" disabled={busy} onClick={() => decide(true)}>
          Approve
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide(false)}>
          Decline
        </Button>
      </div>
    </section>
  );
}

/** A question Alpha asked, as choices to tap (or words to type); the answer starts the next
 *  turn, so the person never has to repeat the question. */
export function AskCard({ ask, client, onAnswered }: { ask: Ask; client: Client; onAnswered: (turn: Turn | null) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answer = async (words: string) => {
    setBusy(true);
    setError(null);
    try {
      const out = await client.answerAsk(ask.id, words);
      onAnswered(out.turn);
    } catch (e) {
      setError(say(e));
      setBusy(false);
    }
  };
  return (
    <div className="askcard" role="group" aria-label="Alpha asks">
      <p className="askcard__q">{ask.text}</p>
      {ask.options.length ? (
        <div className="askcard__options">
          {ask.options.map((o) => (
            <Button className="askcard__opt" key={o} disabled={busy} onClick={() => void answer(o)}>
              {o}
            </Button>
          ))}
        </div>
      ) : null}
      <form className="askcard__other" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void answer(text.trim()); }}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={ask.options.length ? "Or say it your way" : "Your answer"} aria-label="Your answer" disabled={busy} />
        <Button size="sm" variant="primary" type="submit" disabled={busy || !text.trim()}>
          Answer
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void client.dismissAsk(ask.id).then(() => onAnswered(null)).catch(() => undefined)}>
          Skip
        </Button>
      </form>
      {error ? <p className="notice">{error}</p> : null}
    </div>
  );
}
