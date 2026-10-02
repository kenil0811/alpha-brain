/** The first conversation, once (Alpha's FirstSteps): five short questions, then Alpha's proposed first shape. */
import { type FormEvent, useEffect, useState } from "react";
import type { Client, OnboardingStatus } from "../core/client";

export function FirstSteps({ client, onStart }: { client: Client; onStart: (request: string) => void }) {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    Promise.resolve()
      .then(() => client.onboarding())
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [client]);
  if (!status || (status.done && !status.proposal?.options.length)) return null;
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setStatus(await client.answerOnboarding(answers));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  async function skip() {
    try {
      setStatus(await client.skipOnboarding());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }
  if (status.done && status.proposal) {
    return (
      <div className="card card--pad firststeps" aria-label="Where to begin">
        <div className="eyebrow">Where to begin</div>
        <p style={{ marginTop: 4 }}>{status.proposal.intro}</p>
        <div className="proposal__options">
          {status.proposal.options.map((o) => (
            <div key={o.title} className="proposal__option">
              <b>{o.title}</b>
              <p>{o.request}</p>
              <p className="faint">{o.why}</p>
              <button type="button" className="btn btn--sm btn--primary" onClick={() => onStart(o.request)}>
                Start with this
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => void skip()}>
          Dismiss
        </button>
      </div>
    );
  }
  return (
    <form className="card card--pad firststeps" aria-label="First steps" onSubmit={submit}>
      <div className="eyebrow">First steps</div>
      <p style={{ marginTop: 4 }}>Five short answers and Alpha proposes where to begin. Everything you say lands on your About you page, where you can change it.</p>
      <div className="firststeps__grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        {status.questions.map((q) => (
          <div key={q.id} className="field field--compact">
            <label htmlFor={`first-${q.id}`}>{q.label}</label>
            <input id={`first-${q.id}`} value={answers[q.id] ?? ""} placeholder={q.hint} onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))} />
          </div>
        ))}
      </div>
      {error ? (
        <p className="notice" role="alert">
          {error}
        </p>
      ) : null}
      <div className="row">
        <button type="submit" className="btn btn--primary btn--sm" disabled={busy || !Object.values(answers).some((v) => v.trim())}>
          {busy ? "Thinking…" : "Propose where to begin"}
        </button>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => void skip()} disabled={busy}>
          Skip for now
        </button>
      </div>
    </form>
  );
}
