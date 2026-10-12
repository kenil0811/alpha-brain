/**
 * The conversation beside the workspace: one stream, scoped by the page (a message sent from a
 * module's page is about that module), with Alpha's threads as cards that open into their own
 * view. The companion is the same stream.
 */
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { moduleWords } from "../core/client";
import type { Action, Ask, Client, Convo, JournalEntry, ModuleCard, Question, Thread, Turn, Workflow } from "../core/client";
import { when } from "../modules/format";
import { ActionCard } from "../shell/ActionCard";
import { MicButton, useSpeech } from "../shell/voice";
import { Button, IconButton, Trouble, Rich } from "../ui";
import { ChevronRight, ChevronDown, Check, X } from "../ui/icons";

const THREAD_STATE: Record<string, string> = { open: "Open", working: "Working", waiting: "Needs you", done: "Done" };
const CONVO_STATE: Record<string, string> = { open: "live", working: "working", waiting: "needs you", done: "closed" };

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
          <div className="row" style={{ marginTop: 8 }}>
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
          <div className="row" style={{ marginTop: 8 }}>
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
function AskCard({ ask, client, onAnswered }: { ask: Ask; client: Client; onAnswered: (turn: Turn | null) => void }) {
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

/** A reply whose trailing question became a card (Q35) shows without that question: the card
 *  carries it, so the person reads it once. A reply that was only the question shows nothing. */
export function withoutCarded(text: string, asks: Ask[], turn: unknown): string | null {
  const carded = asks.find((a) => a.derived && a.turn === turn);
  if (!carded) return text;
  const question = carded.text.trim();
  const plain = text.trim();
  const at = plain.lastIndexOf(question.replace(/\?$/, ""));
  if (at < 0) return text;
  const rest = plain.slice(0, at).replace(/[*_\s]+$/, "").trim();
  return rest.length ? rest : null;
}

function Message({ e, asks }: { e: JournalEntry; asks?: Ask[] }) {
  if (e.kind === "said") return <div className="msg msg--user">{e.text}</div>;
  const fromThread = typeof e.data.from_thread === "string" ? e.data.from_thread : null;
  let text: string | null = e.text;
  if (e.kind === "replied" && asks) text = withoutCarded(e.text, asks, e.data.turn);
  if (text === null) return null;
  return (
    <div className={`msg msg--ai${e.kind === "failed" ? " msg--failed" : ""}`}>
      {fromThread ? <div className="msg__label">From the thread · {fromThread}</div> : null}
      <Rich text={text} />
      {typeof e.data.duration_ms === "number" ? <span className="msg__cite">{(e.data.duration_ms / 1000).toFixed(0)} s</span> : null}
    </div>
  );
}

export interface ConversationProps {
  client: Client;
  scopeName: string;
  module: ModuleCard | null;
  version: number;
  onChanged: () => void;
  draft: { text: string; send: boolean } | null;
  onDraftTaken: () => void;
  focusThread?: { id: string; at: number } | null;
  focusConversation?: { id: string; at: number } | null;
}

/** The side panel: the conversation of the page the person is on, closable. */
export function AssistantPanel({ open, onOpen, ...rest }: ConversationProps & { open: boolean; onOpen: (open: boolean) => void }) {
  if (!open) return null;
  return <Conversation layout="panel" onClose={() => onOpen(false)} {...rest} />;
}

/** A conversation with Alpha: its messages, the cards (a workflow page, an action, a question with
 *  choices), what Alpha is doing now with the reply as it is written, and the composer. The
 *  same thing in the side panel ("panel") and on the Assistant page ("page", wide). */
export function Conversation({
  client,
  layout,
  onClose,
  scopeName,
  module,
  version,
  onChanged,
  draft,
  onDraftTaken,
  focusThread,
  focusConversation,
}: ConversationProps & { layout: "panel" | "page"; onClose?: () => void }) {
  const [turns, setTurns] = useState<JournalEntry[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [asks, setAsks] = useState<Ask[]>([]);
  const [showSteps, setShowSteps] = useState(false);
  const [pending, setPending] = useState<Turn | null>(null);
  const [text, setText] = useState("");
  const [threadView, setThreadView] = useState<(Thread & { journal: JournalEntry[] }) | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [convos, setConvos] = useState<Convo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const body = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const load = useCallback(() => {
    client
      .conversation(module?.id ?? null, active)
      .then((c) => {
        setTurns(c.turns);
        setThreads(c.threads);
        setWorkflows(c.workflows ?? []);
        setActions(c.actions ?? []);
        setAsks(c.asks ?? []);
        setConvos(c.conversations ?? []);
        setLoadError(null);
        if (!active && c.conversation) setActive(c.conversation.id);
      })
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : String(e)));
  }, [client, module?.id, active]);
  useEffect(load, [load, version]);
  // A page change shows that page's live conversation, not the one from the last page.
  useEffect(() => {
    setActive(null);
    setThreadView(null);
  }, [module?.id]);
  // A conversation opened from elsewhere (the companion's Open).
  useEffect(() => {
    if (!focusConversation) return;
    setThreadView(null);
    setActive(focusConversation.id);
  }, [focusConversation]);
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
  // Alpha works on its own too (a build, a folder that changed): `version` moves when the
  // window's one poll sees a change (core/changes.ts); the panel keeps no clock of its own.
  // The view follows the newest words unless the person scrolled up to read something.
  const stick = useRef(true);
  useEffect(() => {
    if (stick.current) body.current?.scrollTo?.({ top: body.current.scrollHeight });
  }, [turns, pending, threadView]);
  const onScroll = () => {
    const el = body.current;
    if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  };
  const pendingId = pending?.id ?? null;
  useEffect(() => {
    // Keyed on the turn's id, not the polled object: the clock must not restart every second.
    if (!pendingId) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [pendingId]);

  // Set the moment a send starts, before the core has answered: a second ⏎ in that moment
  // used to send the sentence twice.
  const sending = useRef(false);
  const send = useCallback(
    async (sentence: string) => {
      const clean = sentence.trim();
      if (!clean || pending || sending.current) return;
      sending.current = true;
      setText("");
      setError(null);
      setElapsed(0);
      const threadId = threadView?.id ?? null;
      setTurns((all) => (threadId ? all : [...all, { id: `local-${Date.now()}`, at: new Date().toISOString(), kind: "said", actor: "person", text: clean, data: {}, module: null, thread: null, entity_ids: [], source: null }]));
      try {
        // The panel always speaks in a conversation of its own: the page's live one, or a new one.
        let conversation = threadId ? null : active;
        if (!threadId && !conversation) {
          conversation = (await client.newConversation(module?.id ?? null, clean.slice(0, 60))).id;
          setActive(conversation);
        }
        const final = await client.askAndWait(clean, { module: threadId ? null : (module?.id ?? null), thread: threadId, conversation }, setPending, 500);
        if (final.conversation && !threadId) setActive(final.conversation.id);
        if (final.state === "failed") setError(final.reply ?? "That didn't work.");
      } catch (e) {
        // The core stopped answering (or lost the turn): the words come back to the box.
        setError(`${e instanceof Error ? e.message : String(e)} Your message is back in the box.`);
        setText((current) => current || clean);
      } finally {
        sending.current = false;
        setPending(null);
        load();
        if (threadId) void client.thread(threadId).then(setThreadView).catch(() => undefined);
        onChanged();
      }
    },
    [client, module, pending, threadView, active, load, onChanged],
  );

  // A sentence from the window: sent at once (quick entry), unless a turn is already running,
  // in which case it waits in the composer where the person can see it; or put in the composer
  // to finish ("Ask Alpha to change this").
  useEffect(() => {
    if (draft === null) return;
    onDraftTaken();
    if (draft.send && !pending) {
      void send(draft.text);
      return;
    }
    setText(draft.text);
    setTimeout(() => {
      input.current?.focus();
      const end = input.current?.value.length ?? 0;
      input.current?.setSelectionRange(end, end);
    }, 30);
  }, [draft, onDraftTaken, pending, send]);

  const follow = useCallback(
    async (turn: Turn | null) => {
      if (!turn) return;
      setPending(turn);
      setElapsed(0);
      try {
        const final = await client.waitTurn(turn, setPending, 8, 500);
        if (final.state === "failed") setError(final.reply ?? "That didn't work.");
      } catch (e) {
        setError(`${e instanceof Error ? e.message : String(e)} The turn may still have run; its answer shows here when the core is back.`);
      }
      setPending(null);
      load();
      onChanged();
    },
    [client, load, onChanged],
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

  const openAsks = asks.filter((a) => (threadView ? a.thread === threadView.id : active ? a.thread === active : a.thread === null));
  const steps = pending?.steps ?? [];
  const live = pending?.live ?? null;
  const latest = steps.length ? steps[steps.length - 1].text : null;
  const doing = live?.doing ?? null;
  const thought = live?.thought ?? null;
  const partial = live?.partial?.trim() ? live.partial : null;
  const headline = partial ? "Writing" : (doing ?? (elapsed < 2 ? "Thinking" : latest ? "Working" : "Thinking"));
  const shown = showSteps ? steps : steps.slice(-3);
  const workingNote = pending ? (
    <div className="msg msg--ai msg--working" role="status" aria-live="polite">
      <div className="working__head">
        <span className="working__pulse" aria-hidden="true" />
        <span className="shimmer">{headline}</span>
        <span className="working__dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <span className="faint working__time">{elapsed} s</span>
        <Button size="sm" variant="ghost" onClick={() => { if (pending.id) void client.stopTurn(pending.id).catch(() => undefined); }}>
          Stop
        </Button>
      </div>
      {steps.length ? (
        <ul className="stepline" aria-label="Steps so far">
          {shown.map((s, i) => (
            <li key={`${s.at}-${i}`} className={s.kind === "failed" ? "stepline__failed" : "stepline__done"}>
              {s.kind === "failed" ? <X size={12} aria-label="failed" /> : <Check size={12} aria-label="done" />} {s.text}
            </li>
          ))}
          {steps.length > 3 ? (
            <li>
              <button type="button" className="working__steps" aria-expanded={showSteps} onClick={() => setShowSteps((v) => !v)}>
                {showSteps ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />} {showSteps ? "fewer" : `all ${steps.length} steps`}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
      {partial ? (
        <div className="working__partial">
          <Rich text={partial} />
        </div>
      ) : thought ? (
        <p className="working__thought">{thought}</p>
      ) : null}
    </div>
  ) : null;
  const chats = convos.filter((c) => c.kind === "chat");
  const activeConvo = chats.find((c) => c.id === active) ?? null;

  return (
    <aside className={layout === "page" ? "assist assist--page" : "assist"} aria-label="Assistant">
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
            <b style={{ fontWeight: 500 }}>{activeConvo ? activeConvo.title : "Assistant"}</b>
            <div className="assist__ctx">{activeConvo ? `${activeConvo.scope} · ${CONVO_STATE[activeConvo.state] ?? activeConvo.state}` : scopeName}</div>
          </div>
          <span style={{ marginLeft: "auto" }} />
          {activeConvo && activeConvo.state !== "working" ? (
            <Button size="sm" variant="ghost" title="Close this conversation; what it learned stays" onClick={() => void client.closeConversation(activeConvo.id).then(() => { setActive(null); load(); onChanged(); })}>
              Done
            </Button>
          ) : null}
          {layout === "panel" ? <IconButton label="Close the assistant" icon={<ChevronRight />} onClick={() => onClose?.()} /> : null}
        </div>
      )}
      {layout === "panel" && !threadView && (chats.length > 1 || (chats.length === 1 && chats[0].id !== active)) ? (
        <div className="convstrip" role="tablist" aria-label="Live conversations">
          {chats.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={c.id === active} className={`convchip${c.id === active ? " convchip--active" : ""}${c.state === "waiting" ? " convchip--needs" : ""}`} title={`${c.scope}: ${c.title}${c.question ? ` · asked: ${c.question}` : ""}`} onClick={() => { setThreadView(null); setActive(c.id); }}>
              <span className={`convchip__dot convchip__dot--${c.state}`} aria-hidden="true" />
              <span className="convchip__scope">{c.scope}</span>
              <span className="convchip__title">{c.title}</span>
            </button>
          ))}
          <button type="button" className="convchip convchip--new" title="A new conversation here" onClick={() => void client.newConversation(module?.id ?? null, "New conversation").then((c) => { setThreadView(null); setActive(c.id); load(); })}>
            +
          </button>
        </div>
      ) : null}
      <div className="assist__body" ref={body} onScroll={onScroll}>
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
            {!pending
              ? groupAsks(openAsks).map((group) =>
                  group.length > 1 ? (
                    <AskGroup key={group[0].id} asks={group} client={client} onAnswered={(turn) => { load(); void follow(turn); }} />
                  ) : (
                    <AskCard key={group[0].id} ask={group[0]} client={client} onAnswered={(turn) => { load(); void follow(turn); }} />
                  ),
                )
              : null}
          </>
        ) : (
          <>
            {threads.filter((t) => t.kind !== "chat").map((t) => {
              return (
                <div key={t.id} className="creation-wrap">
                  <button type="button" className="creation" onClick={() => void client.thread(t.id).then(setThreadView)}>
                    <h3 className="creation__title">
                      {t.title}
                      <span className={`badge badge--${t.state === "waiting" ? "waiting" : "running"}`}>{THREAD_STATE[t.state] ?? t.state}</span>
                    </h3>
                    <span className="faint">
                      {t.kind === "build" && t.state === "working"
                        ? `Building in the background · ${t.step_count ?? 0} steps · open it to watch`
                        : t.state === "working"
                            ? "Alpha is working on this now"
                            : t.state === "waiting"
                              ? "Waiting for your answer · open it to reply here"
                              : "Its own thread · open it to talk about this work"}
                    </span>
                    {t.state === "working" && t.live?.doing ? <span className="faint thread__last">… {t.live.doing}</span> : t.state === "working" && t.steps?.length ? <span className="faint thread__last">{t.steps[t.steps.length - 1].kind === "failed" ? "✗" : "✓"} {t.steps[t.steps.length - 1].text}</span> : null}
                  </button>
                </div>
              );
            })}
            {module ? (
              <div className="msg msg--ai">
                I'm looking at <b>{moduleWords(module)}</b>{module.children?.length ? " and what it holds" : ""}. Ask about it, tell me to add or change something, or log to it.
              </div>
            ) : null}
            {!turns.length && !module ? <div className="msg msg--ai">Tell me what to keep track of, ask about anything I hold, or say what to look up. "Log two eggs", "find back-end roles on We Work Remotely", "read my job search folder".</div> : null}
            {turns.map((e) => (
              <Message key={e.id} e={e} asks={openAsks} />
            ))}
            {workflows.map((w) => (
              <WorkflowCard key={w.id} workflow={w} client={client} onDecided={() => { load(); onChanged(); }} />
            ))}
            {actions
              .filter((a) => a.state === "proposed" || a.state === "running" || a.state === "approved" || a.state === "failed")
              // A failed attempt is history once Alpha proposed the same thing again.
              .filter((a) => a.state !== "failed" || !actions.some((b) => b.id !== a.id && b.title === a.title && b.created_at > a.created_at))
              .map((a) => (
                <ActionCard key={a.id} action={a} client={client} compact onDecided={() => { load(); onChanged(); }} />
              ))}
            {!pending
              ? groupAsks(openAsks).map((group) =>
                  group.length > 1 ? (
                    <AskGroup key={group[0].id} asks={group} client={client} onAnswered={(turn) => { load(); void follow(turn); }} />
                  ) : (
                    <AskCard key={group[0].id} ask={group[0]} client={client} onAnswered={(turn) => { load(); void follow(turn); }} />
                  ),
                )
              : null}
          </>
        )}
        {workingNote}
        {loadError ? <Trouble onRetry={load}>Couldn't load the conversation: {loadError}</Trouble> : null}
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
          <Button size="sm" variant="primary" disabled={!text.trim() || Boolean(pending)} onClick={() => void send(text)}>
            Send
          </Button>
        </div>
        <div className="composer__row">
          <span>Uses your Claude subscription</span>
          <span style={{ marginLeft: "auto" }}>⏎ to send</span>
        </div>
      </div>
    </aside>
  );
}
