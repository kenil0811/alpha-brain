/**
 * The conversation beside the workspace: one stream, scoped by the page (a message sent from a
 * module's page is about that module), with Alpha's threads as cards that open into their own
 * view. The companion is the same stream.
 */
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import type { Action, Client, JournalEntry, ModuleCard, Plan, Thread, Turn } from "../core/client";
import { when } from "../modules/format";
import { ActionCard } from "../shell/ActionCard";
import { MicButton, useSpeech } from "../shell/voice";

const THREAD_STATE: Record<string, string> = { open: "Open", working: "Working", waiting: "Needs you", done: "Done" };

/** A plan Alpha proposed (nothing is built until the person says yes, here or in words), or a
 *  build that stopped before it finished (it can carry on from where it stopped). */
function PlanCard({ plan, client, onDecided }: { plan: Plan; client: Client; onDecided: () => void }) {
  const [busy, setBusy] = useState(false);
  const stopped = plan.state === "stopped";
  const decide = (yes: boolean) => {
    setBusy(true);
    const go = stopped ? client.resumePlan(plan.id) : client.approvePlan(plan.id);
    void (yes ? go : client.declinePlan(plan.id)).finally(() => {
      setBusy(false);
      onDecided();
    });
  };
  return (
    <div className="creation plancard" aria-label={`Plan: ${plan.title}`}>
      <h3 className="creation__title">
        {plan.title}
        <span className="badge badge--waiting">{stopped ? "Stopped" : "Plan"}</span>
      </h3>
      <span className="faint">{stopped ? "The build stopped before it finished. It can carry on from where it stopped." : "Nothing is built until you say yes. Answer the questions above in a reply, or build it as proposed."}</span>
      <div className="row" style={{ marginTop: 8 }}>
        <button type="button" className="btn btn--sm btn--primary" disabled={busy} onClick={() => decide(true)}>
          {stopped ? "Continue building" : "Build it"}
        </button>
        <button type="button" className="btn btn--sm btn--ghost" disabled={busy} onClick={() => decide(false)}>
          {stopped ? "Leave it" : "Not now"}
        </button>
      </div>
    </div>
  );
}

function Message({ e }: { e: JournalEntry }) {
  if (e.kind === "said") return <div className="msg msg--user">{e.text}</div>;
  const fromThread = typeof e.data.from_thread === "string" ? e.data.from_thread : null;
  return (
    <div className={`msg msg--ai${e.kind === "failed" ? " msg--failed" : ""}`}>
      {fromThread ? <div className="msg__label">From the thread · {fromThread}</div> : null}
      <Rich text={e.text} />
      {typeof e.data.duration_ms === "number" ? <span className="msg__cite">{(e.data.duration_ms / 1000).toFixed(0)} s</span> : null}
    </div>
  );
}

/** Replies come as light Markdown: paragraphs, "- " lists and **bold**. */
function Rich({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  const inline = (line: string, key: number) => (
    <span key={key}>
      {line.split(/(\*\*[^*]+\*\*)/).map((part, i) => (part.startsWith("**") && part.endsWith("**") ? <b key={i}>{part.slice(2, -2)}</b> : part))}
    </span>
  );
  return (
    <>
      {blocks.map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => /^\s*[-•]\s/.test(l))) {
          return (
            <ul key={i} className="msg__list">
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\s*[-•]\s/, ""), j)}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{lines.map((l, j) => (j ? [<br key={`b${j}`} />, inline(l, j)] : inline(l, j)))}</p>;
      })}
    </>
  );
}

export function AssistantPanel({
  client,
  open,
  onOpen,
  scopeName,
  module,
  version,
  onChanged,
  draft,
  onDraftTaken,
  focusThread,
}: {
  client: Client;
  open: boolean;
  onOpen: (open: boolean) => void;
  scopeName: string;
  module: ModuleCard | null;
  version: number;
  onChanged: () => void;
  draft: string | null;
  onDraftTaken: () => void;
  focusThread?: { id: string; at: number } | null;
}) {
  const [turns, setTurns] = useState<JournalEntry[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [pending, setPending] = useState<Turn | null>(null);
  const [text, setText] = useState("");
  const [threadView, setThreadView] = useState<(Thread & { journal: JournalEntry[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const body = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(() => {
    client
      .conversation(module?.id ?? null)
      .then((c) => {
        setTurns(c.turns);
        setThreads(c.threads);
        setPlans(c.plans ?? []);
        setActions(c.actions ?? []);
      })
      .catch(() => undefined);
  }, [client]);
  useEffect(load, [load, version]);
  // A thread opened from elsewhere (Home's Open on a build) shows here with each step.
  useEffect(() => {
    if (!focusThread) return;
    void client.thread(focusThread.id).then(setThreadView).catch(() => undefined);
  }, [client, focusThread]);
  // While a thread view is open and Alpha works in it, its steps keep arriving.
  useEffect(() => {
    if (!threadView || threadView.state !== "working") return;
    const id = window.setInterval(() => void client.thread(threadView.id).then(setThreadView).catch(() => undefined), 4000);
    return () => window.clearInterval(id);
  }, [client, threadView?.id, threadView?.state]);
  // Alpha works on its own too (a deepen pass, a folder that changed): look again every 5 s
  // while a thread is working, every 15 s otherwise.
  const working = threads.some((t) => t.state === "working");
  useEffect(() => {
    const timer = setInterval(() => {
      load();
      if (working) onChanged();
    }, working ? 5000 : 15000);
    return () => clearInterval(timer);
  }, [working, load, onChanged]);
  useEffect(() => {
    body.current?.scrollTo?.({ top: body.current.scrollHeight });
  }, [turns, pending, threadView]);
  useEffect(() => {
    if (draft === null) return;
    setText(draft);
    onDraftTaken();
    setTimeout(() => {
      input.current?.focus();
      const end = input.current?.value.length ?? 0;
      input.current?.setSelectionRange(end, end);
    }, 30);
  }, [draft, onDraftTaken]);
  useEffect(() => {
    if (!pending) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [pending]);

  const send = useCallback(
    async (sentence: string) => {
      const clean = sentence.trim();
      if (!clean || pending) return;
      setText("");
      setError(null);
      setElapsed(0);
      const threadId = threadView?.id ?? null;
      setTurns((all) => (threadId ? all : [...all, { id: `local-${Date.now()}`, at: new Date().toISOString(), kind: "said", actor: "person", text: clean, data: {}, module: null, thread: null, entity_ids: [], source: null }]));
      try {
        const final = await client.askAndWait(clean, { module: threadId ? null : (module?.id ?? null), thread: threadId }, setPending);
        if (final.state === "failed") setError(final.reply ?? "That didn't work.");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setPending(null);
        load();
        if (threadId) void client.thread(threadId).then(setThreadView);
        onChanged();
      }
    },
    [client, module, pending, threadView, load, onChanged],
  );

  const speech = useSpeech((final, interim) => {
    setText(final || interim);
  });
  const key = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || !e.shiftKey)) {
      e.preventDefault();
      if (speech.listening) speech.stop();
      void send(text);
    }
  };

  if (!open) return null;
  const steps = pending?.steps ?? [];
  const workingNote = pending ? (
    <div className="msg msg--ai msg--working" role="status">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <span>
          Working on it… <span className="faint">{elapsed} s</span>
        </span>
        <button type="button" className="btn btn--sm btn--ghost" onClick={() => void client.stopTurn(pending.id).catch(() => undefined)}>
          Stop
        </button>
      </div>
      {steps.length ? (
        <ul className="stages">
          {steps.slice(-8).map((s, i) => (
            <li key={`${s.at}-${i}`} className="stages__done">
              ✓ {s.text}
            </li>
          ))}
        </ul>
      ) : elapsed > 8 ? (
        <span className="faint">Researching and deciding; steps show here as they happen.</span>
      ) : null}
    </div>
  ) : null;

  return (
    <aside className="assist" aria-label="Assistant">
      {threadView ? (
        <div className="assist__head">
          <button type="button" className="assist__back" onClick={() => setThreadView(null)}>
            ‹ Back
          </button>
          <div style={{ minWidth: 0 }}>
            <b style={{ fontWeight: 500 }}>{threadView.title}</b>
            <div className="assist__ctx">Thread · {threadView.state === "open" ? "open" : threadView.state}</div>
          </div>
        </div>
      ) : (
        <div className="assist__head">
          <div className="assist__mark" aria-hidden="true">
            A
          </div>
          <div style={{ minWidth: 0 }}>
            <b style={{ fontWeight: 500 }}>Assistant</b>
            <div className="assist__ctx">{scopeName}</div>
          </div>
          <span style={{ marginLeft: "auto" }} />
          <button type="button" className="iconbtn" onClick={() => onOpen(false)} aria-label="Close the assistant">
            ›
          </button>
        </div>
      )}
      <div className="assist__body" ref={body}>
        {threadView ? (
          <>
            {threadView.journal.map((e) =>
              e.kind === "said" || e.kind === "replied" || e.kind === "failed" ? (
                <Message key={e.id} e={e} />
              ) : (
                <div key={e.id} className="faint thread__step">
                  {when(e.at)} · {e.text}
                </div>
              ),
            )}
            {!threadView.journal.length ? <p className="muted">Nothing in this thread yet. What you say here stays here, out of the main conversation.</p> : null}
          </>
        ) : (
          <>
            {threads.map((t) => {
              // A build has no time limit: the person stops it when it isn't going anywhere.
              const build = t.kind === "build" ? plans.find((p) => p.thread === t.id && (p.state === "building" || p.state === "approved")) : undefined;
              return (
                <div key={t.id} className="creation-wrap">
                  <button type="button" className="creation" onClick={() => void client.thread(t.id).then(setThreadView)}>
                    <h3 className="creation__title">
                      {t.title}
                      <span className={`badge badge--${t.state === "waiting" ? "waiting" : "running"}`}>{THREAD_STATE[t.state] ?? t.state}</span>
                    </h3>
                    <span className="faint">{t.kind === "build" && t.state === "working" ? `Building in the background · ${t.step_count ?? 0} steps · open it to watch` : t.state === "working" ? "Alpha is working on this now" : t.state === "waiting" ? "Waiting for your answer · open it to reply here" : "Its own thread · open it to talk about this work"}</span>
                    {t.state === "working" && t.steps?.length ? <span className="faint thread__last">{t.steps[t.steps.length - 1].kind === "failed" ? "✗" : "✓"} {t.steps[t.steps.length - 1].text}</span> : null}
                  </button>
                  {build ? (
                    <button type="button" className="btn btn--sm btn--ghost creation__stop" onClick={() => void client.stopPlan(build.id).catch(() => undefined).finally(() => { load(); onChanged(); })}>
                      Stop
                    </button>
                  ) : null}
                </div>
              );
            })}
            {module ? (
              <div className="msg msg--ai">
                I'm looking at <b>{module.name}</b>. Ask about it, tell me to add or change something, or log to it.
              </div>
            ) : null}
            {!turns.length && !module ? <div className="msg msg--ai">Tell me what to keep track of, ask about anything I hold, or say what to look up. "Log two eggs", "find back-end roles on We Work Remotely", "read my job search folder".</div> : null}
            {turns.map((e) => (
              <Message key={e.id} e={e} />
            ))}
            {plans
              .filter((p) => p.state === "proposed" || p.state === "stopped")
              .map((p) => (
                <PlanCard key={p.id} plan={p} client={client} onDecided={() => { load(); onChanged(); }} />
              ))}
            {actions
              .filter((a) => a.state === "proposed" || a.state === "running" || a.state === "approved" || (a.state === "failed" && !a.error?.includes("declined")))
              .map((a) => (
                <ActionCard key={a.id} action={a} client={client} compact onDecided={() => { load(); onChanged(); }} />
              ))}
          </>
        )}
        {workingNote}
        {error ? (
          <p className="notice" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <div className="composer">
        <div className="composer__box">
          <textarea ref={input} rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={key} placeholder={threadView ? "Reply in this thread" : "Say what to do, ask, or log something…"} aria-label="Message Alpha" />
          <MicButton listening={speech.listening} supported={speech.supported} onToggle={speech.toggle} small />
          <button type="button" className="btn btn--primary btn--sm" disabled={!text.trim() || Boolean(pending)} onClick={() => void send(text)}>
            Send
          </button>
        </div>
        <div className="composer__row">
          <span>Uses your Claude subscription</span>
          <span style={{ marginLeft: "auto" }}>⏎ to send</span>
        </div>
      </div>
    </aside>
  );
}
