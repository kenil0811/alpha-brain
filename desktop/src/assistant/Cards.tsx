/**
 * The structured steps of a conversation, as cards built from the kit (9 Oct, the UI rulebook
 * §9): a plan Alpha proposes, with Approve and Veto, and a question, with choice pills and
 * "Or say it your way". Moved out of the panel so the panel stays about the conversation.
 */
import { useState } from "react";
import type { Ask, Client, Plan, Turn } from "../core/client";
import { Badge, Button, Rich } from "../ui";

/** A plan Alpha proposed (nothing is built until the person approves, here or in words), or a
 *  build that stopped before it finished (Approve carries on from where it stopped). It shows the
 *  plan's task (its title) and the plan as proposed (its body): the plan carries no separate
 *  expected outcome or success criteria, so none is shown (the core would have to produce them). */
export function PlanCard({ plan, client, onDecided }: { plan: Plan; client: Client; onDecided: () => void }) {
  const [busy, setBusy] = useState(false);
  const stopped = plan.state === "stopped";
  const decide = (approve: boolean) => {
    setBusy(true);
    // One request per decision. (Until 2 Oct evening the yes request was built eagerly, so
    // "Not now" approved and "Leave it" resumed before declining: builds ran on a no.)
    const go = () => (stopped ? client.resumePlan(plan.id) : client.approvePlan(plan.id));
    void (approve ? go() : client.declinePlan(plan.id)).finally(() => {
      setBusy(false);
      onDecided();
    });
  };
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
      <span className="faint">{stopped ? "The build stopped before it finished. Approve to carry on from where it stopped." : "Nothing is built until you approve. Answer any question in a reply, or approve it as proposed."}</span>
      <div className="row">
        <Button size="sm" variant="primary" disabled={busy} onClick={() => decide(true)}>
          Approve
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide(false)}>
          Veto
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
      setError(e instanceof Error ? e.message : String(e));
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
