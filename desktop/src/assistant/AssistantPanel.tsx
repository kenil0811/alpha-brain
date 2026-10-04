/**
 * Zazoo, beside the workspace: the place's live conversation (global, or a project's; a strip
 * switches between several), with Alpha's threads as cards that open here. The companion is the
 * same conversation. The composer's + menu is there; attaching and per-chat model and access are
 * coming soon (AttachMenu).
 */
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronDown, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Action, Ask, Client, Convo, JournalEntry, ModuleCard, Plan, Thread, Turn } from "../core/client";
import { when } from "../modules/format";
import { ActionCard } from "../shell/ActionCard";
import { AttachMenu, useComposerFiles } from "./AttachMenu";
import { MicButton, useSpeech } from "../shell/voice";
import { Button, CollapseToggleButton, IconButton, Input } from "../ui";
import { ZazooIcon } from "../ui/ZazooIcon";
import { bindingOf, matches } from "../shell/shortcuts";

const THREAD_STATE: Record<string, string> = { open: "Open", working: "Working", waiting: "Needs you", done: "Done" };
const CONVO_STATE: Record<string, string> = { open: "live", working: "working", waiting: "needs you", done: "closed" };
const EXAMPLES = [
  "Track what I eat and how much, with calories, history and trends",
  "Keep a reading list with what I thought of each book",
  "Keep a list of job openings I find and what I did about each",
];

/** The composer grows with its text up to its CSS max-height. */
function autoGrow(el: HTMLTextAreaElement | null) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
}

/** A plan Alpha proposed (nothing is built until the person says yes, here or in words), or a
 *  build that stopped before it finished (it can carry on from where it stopped). */
function PlanCard({ plan, client, onDecided }: { plan: Plan; client: Client; onDecided: () => void }) {
  const [busy, setBusy] = useState(false);
  const stopped = plan.state === "stopped";
  const decide = (yes: boolean) => {
    setBusy(true);
    // One request per decision. (Until 2 Oct evening the yes request was built eagerly, so
    // "Not now" approved and "Leave it" resumed before declining: builds ran on a no.)
    const go = () => (stopped ? client.resumePlan(plan.id) : client.approvePlan(plan.id));
    void (yes ? go() : client.declinePlan(plan.id)).finally(() => {
      setBusy(false);
      onDecided();
    });
  };
  return (
    <div className="creation plancard" aria-label={`Plan: ${plan.title}`}>
      <span className="creation__title">
        <span className="creation__name">{plan.title}</span>
        <span className="badge badge--waiting">{stopped ? "Stopped" : "Plan"}</span>
      </span>
      <div className="row plancard__actions">
        <Button size="sm" disabled={busy} onClick={() => decide(true)}>
          {stopped ? "Continue building" : "Build it"}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide(false)}>
          {stopped ? "Leave it" : "Not now"}
        </Button>
      </div>
    </div>
  );
}

/** A question Zazoo asked, as choices to tap (or words to type); the answer starts the next
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
    <div className="askcard" role="group" aria-label="Zazoo asks">
      <p className="askcard__q">{ask.text}</p>
      {ask.options.length ? (
        <div className="askcard__options">
          {ask.options.map((o) => (
            <Button key={o} variant="outline" size="sm" className="askcard__opt" disabled={busy} onClick={() => void answer(o)}>
              {o}
            </Button>
          ))}
        </div>
      ) : null}
      <form className="askcard__other" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void answer(text.trim()); }}>
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={ask.options.length ? "Or say it your way" : "Your answer"} aria-label="Your answer" disabled={busy} />
        <Button type="submit" size="sm" disabled={busy || !text.trim()}>
          Answer
        </Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => void client.dismissAsk(ask.id).then(() => onAnswered(null)).catch(() => undefined)}>
          Skip
        </Button>
      </form>
      {error ? <p className="notice">{error}</p> : null}
    </div>
  );
}

export function Message({ e }: { e: JournalEntry }) {
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

/** Where the panel's chat stands: the place's conversation (`undefined`) or a thread by id. */
export type ChatChoice = string | undefined;

export function AssistantPanel({
  client,
  onCollapse,
  scopeName,
  module,
  version,
  onChanged,
  draft,
  onDraftTaken,
  thread,
  onThread,
  headerEnd,
  sendNow,
  focusConversation,
}: {
  client: Client;
  onCollapse: () => void;
  scopeName: string;
  module: ModuleCard | null;
  version: number;
  onChanged: () => void;
  draft: string | null;
  onDraftTaken: () => void;
  /** The chat shown in this place, chosen outside the panel so it survives navigation. */
  thread?: ChatChoice;
  onThread?: (id: ChatChoice) => void;
  /** Right slot of the header (the Activity bell). */
  headerEnd?: ReactNode;
  /** A message typed somewhere else (a table's quick entry), sent here as if typed; `id`
   *  changes once per message. */
  sendNow?: { text: string; id: number } | null;
  /** A conversation opened from elsewhere (the companion's Open); `at` changes per opening. */
  focusConversation?: { id: string; at: number } | null;
}) {
  const [own, setOwn] = useState<ChatChoice>(undefined);
  const chat = onThread ? thread : own;
  const choose = onThread ?? setOwn;
  const [turns, setTurns] = useState<JournalEntry[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [asks, setAsks] = useState<Ask[]>([]);
  const [showSteps, setShowSteps] = useState(false);
  const [pending, setPending] = useState<Turn | null>(null);
  const [text, setText] = useState("");
  const [threadView, setThreadView] = useState<(Thread & { journal: JournalEntry[] }) | null>(null);
  const [opening, setOpening] = useState(false);
  // The live conversation the place's chat speaks in (a chat thread); null until the core names one.
  const [active, setActive] = useState<string | null>(null);
  const [convos, setConvos] = useState<Convo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [failures, setFailures] = useState(0);
  const body = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const moduleId = module?.id ?? null;
  const files = useComposerFiles();

  const load = useCallback(() => {
    const work: Promise<unknown>[] = [
      client.conversation(moduleId, active).then((c) => {
        setTurns(c.turns);
        setThreads(c.threads);
        setPlans(c.plans ?? []);
        setActions(c.actions ?? []);
        setAsks(c.asks ?? []);
        setConvos(c.conversations ?? []);
        if (!active && c.conversation) setActive(c.conversation.id);
      }),
    ];
    if (typeof chat === "string") work.push(client.thread(chat).then(setThreadView));
    Promise.all(work)
      .then(() => setFailures(0))
      .catch((e: unknown) => {
        // A chat that can't be opened any more (archived elsewhere, another data folder) resets.
        if (typeof chat === "string" && e instanceof Error && /no thread/i.test(e.message)) choose(undefined);
        else setFailures((n) => n + 1);
      });
  }, [client, chat, moduleId, active, choose]);
  // A page change shows that page's live conversation, not the one from the last page.
  useEffect(() => setActive(null), [moduleId]);
  useEffect(() => {
    if (!focusConversation) return;
    choose(undefined);
    setActive(focusConversation.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusConversation]);
  useEffect(() => {
    if (typeof chat !== "string") setThreadView(null);
    else if (threadView?.id !== chat) {
      setThreadView(null);
      setOpening(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chat]);
  useEffect(() => {
    if (threadView) setOpening(false);
  }, [threadView]);
  // While a thread view is open and Alpha works in it, its steps keep arriving.
  useEffect(() => {
    if (!threadView || threadView.state !== "working") return;
    const id = window.setInterval(() => void client.thread(threadView.id).then(setThreadView).catch(() => undefined), 4000);
    return () => window.clearInterval(id);
  }, [client, threadView?.id, threadView?.state]);
  useEffect(load, [load, version]);
  // Alpha works on its own too (a deepen pass, a folder that changed): look again every 5 s
  // while something is working, every 15 s otherwise.
  const working = threads.some((t) => t.state === "working") || threadView?.state === "working";
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
      autoGrow(input.current);
      const end = input.current?.value.length ?? 0;
      input.current?.setSelectionRange(end, end);
    }, 30);
  }, [draft, onDraftTaken]);
  const pendingId = pending?.id ?? null;
  useEffect(() => {
    // Keyed on the turn's id, not the polled object: the clock must not restart every second.
    if (!pendingId) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [pendingId]);

  const send = useCallback(
    async (sentence: string) => {
      const clean = sentence.trim();
      if (!clean || pending) return;
      setText("");
      autoGrow(input.current);
      setError(null);
      setElapsed(0);
      try {
        const threadId = typeof chat === "string" ? chat : null;
        if (threadId) setThreadView((v) => (v && v.id === threadId ? { ...v, journal: [...v.journal, local(clean, threadId)] } : v));
        else setTurns((all) => [...all, local(clean, null)]);
        // The place's chat always speaks in a conversation of its own: the live one, or a new one.
        let conversation = threadId ? null : active;
        if (!threadId && !conversation) {
          conversation = (await client.newConversation(moduleId, clean.slice(0, 60))).id;
          setActive(conversation);
        }
        const final = await client.askAndWait(clean, { module: threadId ? null : moduleId, thread: threadId, conversation }, setPending);
        if (final.conversation && !threadId) setActive(final.conversation.id);
        if (final.state === "failed") setError(final.reply ?? "That didn't work.");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setPending(null);
        load();
        onChanged();
      }
    },
    [client, chat, moduleId, active, pending, load, onChanged],
  );
  const sentNow = useRef<number | null>(null);
  useEffect(() => {
    if (!sendNow || sentNow.current === sendNow.id || pending) return;
    sentNow.current = sendNow.id;
    void send(sendNow.text);
  }, [sendNow, pending, send]);

  // An answered question starts a turn of its own; follow it like a sent message.
  const follow = useCallback(
    async (turn: Turn | null) => {
      if (!turn) return;
      setPending(turn);
      setElapsed(0);
      let current = turn;
      while ((current.state === "running" || current.state === "routing") && current.id) {
        const id = current.id;
        await new Promise((r) => setTimeout(r, 1000));
        current = await client.turn(id).catch(() => ({ ...current, state: "failed" as const }));
        setPending(current);
      }
      setPending(null);
      load();
      onChanged();
    },
    [client, load, onChanged],
  );

  // Words spoken are added after whatever was already typed.
  const typedBefore = useRef("");
  const speech = useSpeech((final, interim) => setText(`${typedBefore.current} ${final} ${interim}`.replace(/\s+/g, " ").trim()));
  const toggleMic = () => {
    if (!speech.listening) typedBefore.current = text;
    speech.toggle();
  };
  const key = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!e.nativeEvent.isComposing && matches(e, bindingOf("send"))) {
      e.preventDefault();
      if (speech.listening) speech.stop();
      void send(text);
    }
  };

  const steps = pending?.steps ?? [];
  const latest = steps.length ? steps[steps.length - 1].text : null;
  const thought = pending?.live?.thought ?? null;
  const headline = pending?.live?.doing ?? (elapsed < 2 || !latest ? "Thinking" : "Working");
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
        <span className="faint working__time">{clock(elapsed)}</span>
        <Button size="sm" variant="ghost" onClick={() => { if (pending.id) void client.stopTurn(pending.id).catch(() => undefined); }}>
          Stop
        </Button>
      </div>
      {thought ? <p className="working__thought">{thought}</p> : null}
      {steps.length ? (
        <button type="button" className="working__steps" aria-expanded={showSteps} onClick={() => setShowSteps((v) => !v)}>
          {showSteps ? <ChevronDown size={12} aria-hidden="true" /> : <ChevronRight size={12} aria-hidden="true" />} {steps.length} {steps.length === 1 ? "step" : "steps"}
          {!showSteps && latest ? <span className="faint"> · {latest}</span> : null}
        </button>
      ) : null}
      {showSteps && steps.length ? (
        <ul className="stages">
          {steps.slice(-12).map((s, i) => (
            <li key={`${s.at}-${i}`} className={s.kind === "failed" ? "notice" : "stages__done"}>
              {s.kind === "failed" ? "✗" : "✓"} {s.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  ) : null;
  const openAsks = asks.filter((a) => (threadView ? a.thread === threadView.id : active ? a.thread === active : a.thread === null));
  const chats = convos.filter((c) => c.kind === "chat");
  const activeConvo = threadView ? null : (chats.find((c) => c.id === active) ?? null);
  const askCards = !pending
    ? openAsks.map((a) => (
        <AskCard key={a.id} ask={a} client={client} onAnswered={(turn) => { load(); void follow(turn); }} />
      ))
    : null;

  const inThread = Boolean(threadView && threadView.kind !== "topic");
  const label = threadView ? threadView.title : scopeName;
  const fresh = chat === undefined && !turns.length;
  // The strip shows once there is more than the one live conversation; until then + sits in the header.
  const strip = !threadView && (chats.length > 1 || (chats.length === 1 && chats[0].id !== active));
  const newChat = () => void client.newConversation(moduleId, "New conversation").then((c) => { choose(undefined); setActive(c.id); load(); });
  const requests = (module?.threads ?? []).filter((t) => t.kind !== "topic" && t.kind !== "chat");
  return (
    <aside className="assist__panel" aria-label="Zazoo">
      <div className="assist__head">
        {inThread ? (
          <IconButton aria-label="Back to the conversation" title="Back" size="sm" onClick={() => choose(undefined)}>
            <ChevronLeft size={16} />
          </IconButton>
        ) : (
          <CollapseToggleButton side="right" collapsed={false} controls="panel-right" onClick={onCollapse} />
        )}
        <div className="assist__title">
          <ZazooIcon size={32} />
          <div className="assist__titletext">
            <b className="assist__name">Zazoo</b>
            <span className="assist__ctx" title={label}>
              {inThread && threadView ? `Thread · ${THREAD_STATE[threadView.state] ?? threadView.state}` : activeConvo ? `${activeConvo.title} · ${CONVO_STATE[activeConvo.state] ?? activeConvo.state}` : label}
            </span>
          </div>
        </div>
        <div className="assist__headend">
          {activeConvo && !strip ? (
            <IconButton aria-label="New chat" title="A new conversation here" size="sm" onClick={newChat}>
              <Plus size={16} />
            </IconButton>
          ) : null}
          {activeConvo && activeConvo.state !== "working" ? (
            <Button size="sm" variant="ghost" title="Close this conversation; what it learned stays" onClick={() => void client.closeConversation(activeConvo.id).then(() => { setActive(null); load(); onChanged(); })}>
              Done
            </Button>
          ) : null}
          {headerEnd}
        </div>
      </div>
      {strip ? (
        <div className="convstrip" role="tablist" aria-label="Live conversations">
          {chats.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={c.id === active} className={`convchip${c.id === active ? " convchip--active" : ""}${c.state === "waiting" ? " convchip--needs" : ""}`} title={`${c.scope}: ${c.title}${c.question ? ` · asked: ${c.question}` : ""}`} onClick={() => { choose(undefined); setActive(c.id); }}>
              <span className={`convchip__dot convchip__dot--${c.state}`} aria-hidden="true" />
              <span className="convchip__scope">{c.scope}</span>
              <span className="convchip__title">{c.title}</span>
            </button>
          ))}
          <button type="button" className="convchip convchip--new" aria-label="A new conversation here" title="A new conversation here" onClick={newChat}>
            <Plus size={14} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      <div className="assist__body" ref={body}>
        {typeof chat === "string" && !threadView ? (
          opening ? (
            <p className="faint" role="status">
              Opening the session…
            </p>
          ) : null
        ) : threadView ? (
          <>
            {threadView.journal.map((e) =>
              e.kind === "said" || e.kind === "replied" || e.kind === "failed" ? (
                <Message key={e.id} e={e} />
              ) : inThread ? (
                <div key={e.id} className="faint thread__step">
                  {when(e.at)} · {e.text}
                </div>
              ) : null,
            )}
            {!threadView.journal.some((e) => e.kind === "said") ? (
              <div className="msg msg--ai">{threadView.kind === "topic" ? "What's on your mind?" : "Nothing in this thread yet."}</div>
            ) : null}
            {askCards}
          </>
        ) : fresh ? (
          <>
            <div className="msg msg--ai">
              {module ? (
                <>
                  I'm looking at <b>{module.name}</b>. Ask about it, tell me to run something, or describe what to change or add and I change it in place. Everything already saved in it is kept.
                </>
              ) : (
                <>Tell me what you want to keep track of, automate or get done. I'll ask at most a couple of questions, then build it.</>
              )}
            </div>
            {!module ? (
              <div className="assist-empty__chips" aria-label="Examples">
                {EXAMPLES.map((example) => (
                  <Button
                    key={example}
                    variant="outline"
                    className="assist-empty__chip"
                    onClick={() => {
                      setText(example);
                      setTimeout(() => autoGrow(input.current), 0);
                    }}
                  >
                    {example}
                  </Button>
                ))}
              </div>
            ) : null}
            {requests.length ? (
              <nav aria-label="This project's requests" className="recent">
                <h3 className="recent__title">This project's requests</h3>
                <ul>
                  {requests.map((t) => (
                    <li key={t.id}>
                      <button type="button" className="recent__item" onClick={() => choose(t.id)}>
                        <span className="recent__text">{t.title}</span>
                        <span className={t.state === "working" ? "recent__state recent__state--busy" : "recent__state"}>{THREAD_STATE[t.state] ?? t.state}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
          </>
        ) : (
          <>
            {threads.filter((t) => t.kind !== "chat").map((t) => {
              // A build has no time limit: the person stops it when it isn't going anywhere.
              const build = t.kind === "build" ? plans.find((p) => p.thread === t.id && (p.state === "building" || p.state === "approved")) : undefined;
              return (
                <div key={t.id} className="creation-wrap">
                  <button type="button" className="creation" title={t.kind === "build" && t.state === "working" ? "Building in the background: open it to see each step; it reports here when done" : t.state === "waiting" ? "Waiting for your answer: open it to reply here" : "Its own thread: open it to talk about this work"} onClick={() => choose(t.id)}>
                    <span className="creation__title">
                      <span className="creation__name">{t.title}</span>
                      <span className={`badge badge--${t.state === "waiting" ? "waiting" : "running"}`}>{THREAD_STATE[t.state] ?? t.state}</span>
                    </span>
                    {t.state === "working" && t.steps?.length ? <span className="faint thread__last">{t.steps[t.steps.length - 1].kind === "failed" ? "✗" : "✓"} {t.steps[t.steps.length - 1].text}</span> : null}
                  </button>
                  {build ? (
                    <Button size="sm" variant="ghost" className="creation__stop" onClick={() => void client.stopPlan(build.id).catch(() => undefined).finally(() => { load(); onChanged(); })}>
                      Stop
                    </Button>
                  ) : null}
                </div>
              );
            })}
            {turns.map((e) => (
              <Message key={e.id} e={e} />
            ))}
            {plans
              .filter((p) => p.state === "proposed" || p.state === "stopped")
              .map((p) => (
                <PlanCard key={p.id} plan={p} client={client} onDecided={() => { load(); onChanged(); }} />
              ))}
            {actions
              .filter((a) => a.state === "proposed" || a.state === "running" || a.state === "approved" || a.state === "failed")
              // A failed attempt is history once Zazoo proposed the same thing again.
              .filter((a) => a.state !== "failed" || !actions.some((b) => b.id !== a.id && b.title === a.title && b.created_at > a.created_at))
              .map((a) => (
                <ActionCard key={a.id} action={a} client={client} compact onDecided={() => { load(); onChanged(); }} />
              ))}
            {askCards}
          </>
        )}
        {workingNote}
        {failures >= 2 ? (
          <p className="notice notice--quiet" role="status">
            Lost contact with Alpha's runtime for a moment. Reconnecting…
          </p>
        ) : null}
        {error && !(threadView?.journal ?? turns).some((e) => e.kind === "failed" && e.text === error) ? (
          <p className="notice" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <form
        className="composer"
        {...files}
        onSubmit={(e) => {
          e.preventDefault();
          if (speech.listening) speech.stop();
          void send(text);
        }}
      >
        <div className="composer__box">
          <AttachMenu />
          <textarea
            ref={input}
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              autoGrow(e.currentTarget);
            }}
            onKeyDown={key}
            placeholder={inThread ? "Reply…" : "Ask…"}
            aria-label="Message Zazoo"
          />
          <MicButton listening={speech.listening} supported={speech.supported} onToggle={toggleMic} small />
          <IconButton aria-label="Send" title="Enter to send, Shift+Enter for a new line" type="submit" className="composer__send" disabled={!text.trim() || Boolean(pending)}>
            <ArrowUp size={16} />
          </IconButton>
        </div>
        {speech.error ? (
          <div className="composer__row">
            <span className="notice" role="alert">
              {speech.error}
            </span>
          </div>
        ) : null}
      </form>
    </aside>
  );
}

function local(text: string, thread: string | null): JournalEntry {
  return { id: `local-${Date.now()}`, at: new Date().toISOString(), kind: "said", actor: "person", text, data: {}, module: null, thread, entity_ids: [], source: null };
}

/** m:ss, the way the creation page counts too. */
export function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
