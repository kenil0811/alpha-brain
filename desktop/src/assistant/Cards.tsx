/**
 * The structured steps of a conversation, as cards built from the kit (9 Oct, the UI rulebook
 * §9): "Your workflow", the page Alpha drafted (Q39), with its questions, and a question,
 * with choice pills and "Or say it your way"; questions asked together are one form. Moved out
 * of the panel so the panel stays about the conversation.
 */
import { useState } from "react";
import { say } from "../core/client";
import type { Ask, Client, Question, Turn, Workflow } from "../core/client";
import { Button } from "../ui";

/** The questions the workflow page asks before its build: each with its choices, Alpha's pick
 *  selected, and a line to say it another way. What is chosen goes with the yes. */
export function Questions({ questions, answers, onChange }: { questions: Question[]; answers: Record<string, string>; onChange: (answers: Record<string, string>) => void }) {
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
              <input className="planq__other" value={custom} placeholder={q.options.length ? "Or say it your way" : (q.default ? `Alpha's pick: ${q.default}` : "Your answer")} aria-label={`Your answer: ${q.text}`} onChange={(e) => onChange({ ...answers, [key]: e.target.value })} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

export function defaultAnswers(questions: Question[]): Record<string, string> {
  const out: Record<string, string> = {};
  questions.forEach((q, i) => {
    const v = q.answer ?? q.default;
    if (v) out[String(i)] = v;
  });
  return out;
}

const WHO_WORDS: Record<string, string> = { alpha: "Alpha", you: "You", both: "Alpha prepares, you decide" };

/** "Your workflow" (§12): the page Alpha drafted from the interview, in the person's words.
 *  The steps with who does each, what it keeps, documents, settings with their origin, Alpha's
 *  suggestions (accept or skip), the questions; "Yes, build it". The person changes it by
 *  saying what is different in the conversation, never by editing it here. */
export function WorkflowCard({ workflow, client, onDecided }: { workflow: Workflow; client: Client; onDecided: () => void }) {
  const b = workflow.body;
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [decisions, setDecisions] = useState<Record<string, string>>(() => Object.fromEntries(b.suggestions.map((s) => [s.id, s.decision ?? "accept"])));
  const [answers, setAnswers] = useState<Record<string, string>>(() => defaultAnswers(b.questions ?? []));
  const [showSources, setShowSources] = useState<Record<string, boolean>>({});
  const drafted = workflow.state === "drafted";
  const decide = (yes: boolean) => {
    setBusy(true);
    void (yes ? client.agreeWorkflow(workflow.id, b.suggestions.length ? decisions : undefined, b.questions.length ? answers : undefined) : client.declineWorkflow(workflow.id)).finally(() => {
      setBusy(false);
      onDecided();
    });
  };
  return (
    <div className="creation wfcard" aria-label={`Your workflow: ${workflow.title}`}>
      <h3 className="creation__title">
        {workflow.title}
        <span className="badge badge--waiting">{drafted ? `Your workflow · v${workflow.version}` : workflow.state}</span>
      </h3>
      <p className="wf__purpose">{b.purpose}</p>
      <section className="wf__section" aria-label="How it goes">
        <h4 className="wf__head">How it goes</h4>
        <ol className="wf__steps">
          {b.steps.map((s) => (
            <li key={s.id} className="wf__step">
              <b>{s.title}</b> <span className={`wf__who wf__who--${s.who}`}>{WHO_WORDS[s.who] ?? s.who}</span>
              {s.outward ? <span className="wf__who wf__who--asks">asks you first</span> : null}
              <div>{s.what}</div>
              <div className="faint">
                {s.when}
                {s.reaches.length ? ` · reads ${s.reaches.join(", ")}` : ""}
              </div>
            </li>
          ))}
        </ol>
      </section>
      {b.keeps.length ? (
        <section className="wf__section" aria-label="What it keeps">
          <h4 className="wf__head">What it keeps</h4>
          <ul className="wf__list">
            {b.keeps.map((k) => (
              <li key={k.key}>
                <b>{k.thing}</b>
                {k.what ? ` — ${k.what}` : ""}
                {k.fields.length ? <span className="faint"> · {k.fields.map((f) => f.label).join(", ")}</span> : null}
                {k.relates_to.length ? <span className="faint"> · linked to {k.relates_to.join(", ")}</span> : null}
              </li>
            ))}
            {b.documents.map((d) => (
              <li key={d.name}>
                <b>{d.name}</b> <span className="faint">document{d.for ? ` for ${d.for}` : ""}{d.from ? ` · from ${d.from}` : ""}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {b.settings.length || b.assumptions.length ? (
        <section className="wf__section" aria-label="Settings and assumptions">
          <h4 className="wf__head">
            Settings and assumptions{" "}
            <button type="button" className="linklike" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              {open ? "hide" : `show ${b.settings.length + b.assumptions.length}`}
            </button>
          </h4>
          {open ? (
            <ul className="wf__list">
              {b.settings.map((st) => (
                <li key={st.key}>
                  {st.label}: <b>{String(st.value ?? "")}{st.unit ? ` ${st.unit}` : ""}</b> <span className="faint">· {st.origin}{st.why ? ` · ${st.why}` : ""}</span>
                </li>
              ))}
              {b.assumptions.map((a) => (
                <li key={a} className="faint">assumed: {a}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}
      {b.suggestions.length ? (
        <section className="wf__section" aria-label="Alpha suggests">
          <h4 className="wf__head">Alpha suggests</h4>
          <ul className="wf__list">
            {b.suggestions.map((sg) => (
              <li key={sg.id} className="wf__suggest">
                <div>
                  <b>{sg.title}</b> — {sg.what}
                  {sg.why ? <span className="faint"> {sg.why}</span> : null}
                  {sg.sources.length ? (
                    <>
                      {" "}
                      <button type="button" className="linklike" onClick={() => setShowSources({ ...showSources, [sg.id]: !showSources[sg.id] })}>
                        {showSources[sg.id] ? "hide sources" : "why?"}
                      </button>
                      {showSources[sg.id] ? (
                        <span className="faint">
                          {" "}
                          {sg.sources.map((u, i) => (
                            <a key={u} className="planp__src" href={u} target="_blank" rel="noreferrer">
                              {i ? ", " : ""}source {i + 1}
                            </a>
                          ))}
                        </span>
                      ) : null}
                    </>
                  ) : null}
                </div>
                {drafted ? (
                  <div className="planp__opts" role="group" aria-label={`Decide: ${sg.title}`}>
                    {(["accept", "skip"] as const).map((d) => (
                      <Button key={d} size="sm" variant={decisions[sg.id] === d ? "primary" : undefined} aria-pressed={decisions[sg.id] === d} onClick={() => setDecisions({ ...decisions, [sg.id]: d })}>
                        {d === "accept" ? "Add it" : "Skip"}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {drafted && b.questions.length ? <Questions questions={b.questions} answers={answers} onChange={setAnswers} /> : null}
      {drafted ? (
        <>
          <span className="faint">Nothing is built until you say yes. To change anything, say what's different here; Alpha rewrites the page and keeps the version before.</span>
          <div className="row">
            <Button size="sm" variant="primary" disabled={busy} onClick={() => decide(true)}>
              Yes, build it
            </Button>
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide(false)}>
              Not now
            </Button>
          </div>
        </>
      ) : workflow.state === "stopped" ? (
        <>
          <span className="faint">The build stopped before it finished; it can carry on from where it stopped.</span>
          <div className="row">
            <Button size="sm" variant="primary" disabled={busy} onClick={() => { setBusy(true); void client.resumeWorkflow(workflow.id).finally(() => { setBusy(false); onDecided(); }); }}>
              Continue building
            </Button>
          </div>
        </>
      ) : (
        <span className="faint">{workflow.state === "agreed" ? "Agreed. The build starts in the background and reports here." : workflow.state === "building" ? "Being built now." : workflow.state === "built" ? "Built. Open the module to use it." : `This workflow is ${workflow.state}.`}</span>
      )}
    </div>
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

/** Questions Alpha asked together (one turn, several `ask_person` calls) are one form: each
 *  with its choices to tap or words to type, one Answer for all of them, so the person is
 *  never sent on after the first tap (11 Oct: "after i selected one, it submitted"). What is
 *  left blank stays open as its own card. */
export function AskGroup({ asks, client, onAnswered }: { asks: Ask[]; client: Client; onAnswered: (turn: Turn | null) => void }) {
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answerOf = (a: Ask) => (typed[a.id] ?? "").trim() || picked[a.id] || "";
  const answered = asks.filter((a) => answerOf(a));
  const send = async () => {
    if (!answered.length) return;
    setBusy(true);
    setError(null);
    try {
      const out = await client.answerAsks(Object.fromEntries(answered.map((a) => [a.id, answerOf(a)])));
      onAnswered(out.turn);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };
  return (
    <form className="askcard askcard--group" role="group" aria-label="Alpha asks" onSubmit={(e) => { e.preventDefault(); void send(); }}>
      {asks.map((a, i) => (
        <fieldset className="askcard__one" key={a.id} aria-label={a.text}>
          <p className="askcard__q">
            <span className="askcard__n">{i + 1}.</span> {a.text}
          </p>
          {a.options.length ? (
            <div className="askcard__options">
              {a.options.map((o) => (
                <Button className={`askcard__opt${picked[a.id] === o ? " askcard__opt--on" : ""}`} key={o} disabled={busy} aria-pressed={picked[a.id] === o} onClick={() => { setPicked({ ...picked, [a.id]: picked[a.id] === o ? "" : o }); setTyped({ ...typed, [a.id]: "" }); }}>
                  {o}
                </Button>
              ))}
            </div>
          ) : null}
          <input className="askcard__input" value={typed[a.id] ?? ""} onChange={(e) => { setTyped({ ...typed, [a.id]: e.target.value }); if (e.target.value.trim()) setPicked({ ...picked, [a.id]: "" }); }} placeholder={a.options.length ? "Or say it your way" : "Your answer"} aria-label={`Your answer: ${a.text}`} disabled={busy} />
        </fieldset>
      ))}
      <div className="askcard__other">
        <Button size="sm" variant="primary" type="submit" disabled={busy || !answered.length}>
          {answered.length && answered.length < asks.length ? `Answer ${answered.length} of ${asks.length}` : "Answer"}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void Promise.all(asks.map((a) => client.dismissAsk(a.id))).then(() => onAnswered(null)).catch(() => undefined)}>
          Skip all
        </Button>
        {answered.length && answered.length < asks.length ? <span className="faint">The rest stay open.</span> : null}
      </div>
      {error ? <p className="notice">{error}</p> : null}
    </form>
  );
}

/** Open questions grouped by the turn that asked them: one form per turn with several, a
 *  card for a question on its own. */
export function groupAsks(asks: Ask[]): Ask[][] {
  const groups: Ask[][] = [];
  const byTurn = new Map<string, Ask[]>();
  asks.forEach((a) => {
    const key = a.turn && !a.derived ? a.turn : `one:${a.id}`;
    const found = byTurn.get(key);
    if (found) found.push(a);
    else {
      const group = [a];
      byTurn.set(key, group);
      groups.push(group);
    }
  });
  return groups;
}
