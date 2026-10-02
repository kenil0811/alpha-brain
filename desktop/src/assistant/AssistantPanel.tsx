/**
 * Chief of Staff, beside the workspace. Chats (sessions) belong to the place they were opened
 * in, a project or global; the panel opens the one last used there (App keeps `alpha.sessions`),
 * "+ New chat" starts a fresh one and the empty state lists earlier ones. With no chat chosen,
 * global is the one continuous conversation, with Alpha's threads as cards that open here. A
 * project being made talks in its own thread; on its page the chat only points to the page,
 * where the questions, options, plan and build show. The companion is the same conversation.
 */
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronLeft, Plus } from "lucide-react";
import type { Action, AttachmentWire, Client, JournalEntry, ModuleCard, Plan, Session, Thread, Turn } from "../core/client";
import { when } from "../modules/format";
import { ActionCard } from "../shell/ActionCard";
import { ConnectCard } from "../shell/models";
import { usePushToTalk } from "../shell/ptt";
import { MicButton, useSpeech } from "../shell/voice";
import { AttachMenu, AttachmentChips, sentAttachments, useAttachments } from "./AttachMenu";
import { useComposerDrop, usePasteAttachments } from "./attachments";
import { Button, CollapseToggleButton, IconButton } from "../ui";
import { ZazooIcon } from "../ui/ZazooIcon";

const THREAD_STATE: Record<string, string> = { open: "Open", working: "Working", waiting: "Needs you", done: "Done" };
const EXAMPLES = [
  "Track what I eat and how much, with calories, history and trends",
  "Keep a reading list with what I thought of each book",
  "Keep a list of job openings I find and what I did about each",
];
/** What the chat says instead of a creation reply while the page shows it. */
const ON_PAGE: Record<string, string> = {
  asking: "Questions and options are on the page.",
  proposing: "Questions and options are on the page.",
  planned: "The plan is on the page.",
};

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

function Message({ e, onPage }: { e: JournalEntry; onPage: boolean }) {
  if (e.kind === "said")
    return (
      <div className="msg msg--user">
        <AttachmentChips items={sentAttachments(e.data)} />
        {e.text}
      </div>
    );
  const stage = typeof e.data.creation_stage === "string" ? e.data.creation_stage : null;
  if (onPage && stage && ON_PAGE[stage] && e.kind === "replied") return <div className="msg msg--ai convo__pointer">{ON_PAGE[stage]}</div>;
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

/** Where the panel's chat stands: the global conversation (`undefined`), a fresh chat that
 *  starts with the next message (`null`), or a chat or thread by id. */
export type ChatChoice = string | null | undefined;

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
  cardsOnPage = false,
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
  /** A message typed somewhere else (the blank project's "Describe your project"), sent here
   *  as if typed, into `thread`; `id` changes once per message. */
  sendNow?: { text: string; id: number; thread?: string } | null;
  /** The page beside the chat shows the project being made: the chat only points to it. */
  cardsOnPage?: boolean;
}) {
  const [own, setOwn] = useState<ChatChoice>(undefined);
  const chat = onThread ? thread : own;
  const choose = onThread ?? setOwn;
  const [turns, setTurns] = useState<JournalEntry[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [earlier, setEarlier] = useState<Session[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [pending, setPending] = useState<Turn | null>(null);
  const [text, setText] = useState("");
  const [threadView, setThreadView] = useState<(Thread & { journal: JournalEntry[] }) | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [failures, setFailures] = useState(0);
  // A message whose model isn't connected yet: the card connects it, then it goes again.
  const [connect, setConnect] = useState<{ provider: string; text: string; kind?: "sign_in" | "key"; reason?: string } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  // P2: what is attached to the next message (the composer's + menu, a drop or a paste).
  const composer = useRef<HTMLFormElement>(null);
  const attach = useAttachments(client);
  const drop = useComposerDrop(attach.add, composer);
  const paste = usePasteAttachments(attach.add);
  const moduleId = module?.id ?? null;
  const making = module?.creation && module.creation.stage !== "done" ? module.creation : null;

  const load = useCallback(() => {
    const work: Promise<unknown>[] = [
      client.conversation(moduleId).then((c) => {
        setTurns(c.turns);
        setThreads(c.threads);
        setPlans(c.plans ?? []);
        setActions(c.actions ?? []);
      }),
      client.sessions(moduleId).then((all) => setEarlier(all.slice(0, 8))),
    ];
    if (typeof chat === "string") work.push(client.thread(chat).then(setThreadView));
    Promise.all(work)
      .then(() => setFailures(0))
      .catch((e: unknown) => {
        // A chat that can't be opened any more (archived elsewhere, another data folder) resets.
        if (typeof chat === "string" && e instanceof Error && /no thread/i.test(e.message)) choose(moduleId ? null : undefined);
        else setFailures((n) => n + 1);
      });
  }, [client, chat, moduleId, choose]);
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
  useEffect(() => {
    if (!pending) return;
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [pending]);

  const send = useCallback(
    async (sentence: string, into?: string) => {
      const clean = sentence.trim();
      if (!clean || pending) return;
      setText("");
      autoGrow(input.current);
      setError(null);
      setElapsed(0);
      const attachments = attach.wire();
      attach.clear();
      try {
        // The first message of a fresh chat opens it, in this place.
        let threadId = into ?? (typeof chat === "string" ? chat : null);
        if (!threadId && (chat === null || moduleId)) {
          threadId = (await client.createSession(clean, moduleId)).id;
          choose(threadId);
        }
        if (threadId) setThreadView((v) => (v && v.id === threadId ? { ...v, journal: [...v.journal, local(clean, threadId, attachments)] } : v));
        else setTurns((all) => [...all, local(clean, null, attachments)]);
        const final = await client.askAndWait(clean, { module: threadId ? null : moduleId, thread: threadId, attachments }, setPending);
        if (final.state === "needs_connect" && final.provider) setConnect({ provider: final.provider, text: clean, kind: final.connect_kind ?? undefined, reason: final.reply });
        else if (final.state === "failed") setError(final.reply ?? "That didn't work.");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setPending(null);
        load();
        onChanged();
      }
    },
    [client, chat, choose, moduleId, pending, load, onChanged, attach],
  );
  const sentNow = useRef<number | null>(null);
  useEffect(() => {
    if (!sendNow || sentNow.current === sendNow.id || pending) return;
    sentNow.current = sendNow.id;
    void send(sendNow.text, sendNow.thread);
  }, [sendNow, pending, send]);

  // Words spoken are added after whatever was already typed.
  const typedBefore = useRef("");
  const speech = useSpeech((final, interim) => setText(`${typedBefore.current} ${final} ${interim}`.replace(/\s+/g, " ").trim()));
  const toggleMic = () => {
    if (!speech.listening) typedBefore.current = text;
    speech.toggle();
  };
  // Hold Fn (or the shortcut chosen in Settings) to talk; letting go stops listening.
  usePushToTalk(
    useCallback(() => {
      typedBefore.current = text;
      speech.start();
    }, [speech, text]),
    useCallback(() => speech.stop(), [speech]),
  );
  const key = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (speech.listening) speech.stop();
      void send(text);
    }
  };

  const steps = pending?.steps ?? [];
  const workingNote = pending ? (
    <div className="msg msg--ai msg--working" role="status">
      <div className="row msg__working">
        <span>
          Working on it… <span className="faint">{clock(elapsed)}</span>
        </span>
        <Button size="sm" variant="ghost" onClick={() => void client.cancelTurn(pending.id).catch(() => undefined)}>
          Stop
        </Button>
      </div>
      {steps.length ? (
        <ul className="stages">
          {steps.slice(-8).map((s, i) => (
            <li key={`${s.at}-${i}`} className="stages__done">
              ✓ {s.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  ) : null;

  const isCreation = Boolean(threadView && making && threadView.id === making.thread);
  const onPage = cardsOnPage && isCreation;
  const label = threadView && !isCreation ? threadView.title : scopeName;
  const fresh = chat === null || (chat === undefined && (Boolean(moduleId) || !turns.length));
  const requests = (module?.threads ?? []).filter((t) => t.kind !== "topic");
  return (
    <aside className="assist__panel" aria-label="Chief of Staff">
      <div className="assist__head">
        {threadView && threadView.kind !== "topic" && !isCreation ? (
          <IconButton aria-label="Back to the conversation" title="Back" size="sm" onClick={() => choose(moduleId ? null : undefined)}>
            <ChevronLeft size={16} />
          </IconButton>
        ) : (
          <CollapseToggleButton side="right" collapsed={false} controls="panel-right" onClick={onCollapse} />
        )}
        <div className="assist__title">
          <ZazooIcon size={32} />
          <div className="assist__titletext">
            <b className="assist__name">Chief of Staff</b>
            <span className="assist__ctx" title={label}>
              {threadView && threadView.kind !== "topic" && !isCreation ? `Thread · ${THREAD_STATE[threadView.state] ?? threadView.state}` : label}
            </span>
          </div>
        </div>
        <div className="assist__headend">
          {!fresh && !isCreation ? (
            <IconButton aria-label="New chat" title="New chat" size="sm" onClick={() => choose(null)}>
              <Plus size={16} />
            </IconButton>
          ) : null}
          {headerEnd}
        </div>
      </div>
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
                <Message key={e.id} e={e} onPage={onPage} />
              ) : threadView.kind !== "topic" && !isCreation ? (
                <div key={e.id} className="faint thread__step">
                  {when(e.at)} · {e.text}
                </div>
              ) : null,
            )}
            {!threadView.journal.some((e) => e.kind === "said") ? (
              <div className="msg msg--ai">{isCreation && making?.stage === "new" ? "What do you want to accomplish with this new project?" : threadView.kind === "topic" ? "What's on your mind?" : "Nothing in this thread yet."}</div>
            ) : null}
          </>
        ) : fresh ? (
          <>
            <div className="msg msg--ai">
              {module ? (
                <>
                  I'm looking at <b>{module.name}</b>. Ask about it, tell me to run something, or describe what to change or add and Alpha changes it in place. Everything already saved in it is kept.
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
            {earlier.length || (!module && turns.length) ? (
              <nav aria-label="Earlier sessions" className="recent">
                <h3 className="recent__title">Earlier sessions</h3>
                <ul>
                  {!module && turns.length ? (
                    <li>
                      <button type="button" className="recent__item" onClick={() => choose(undefined)}>
                        <span className="recent__text">Your conversation with Alpha</span>
                        <span className="recent__state">{when(turns[turns.length - 1].at)}</span>
                      </button>
                    </li>
                  ) : null}
                  {earlier.map((s) => (
                    <li key={s.id}>
                      <button type="button" className="recent__item" onClick={() => choose(s.id)}>
                        <span className="recent__text">{s.title || "Untitled session"}</span>
                        <span className={s.state === "working" ? "recent__state recent__state--busy" : "recent__state"}>{s.state === "working" ? "Working" : when(s.updated_at)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </nav>
            ) : null}
          </>
        ) : (
          <>
            {threads.map((t) => {
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
              <Message key={e.id} e={e} onPage={false} />
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
        {failures >= 2 ? (
          <p className="notice notice--quiet" role="status">
            Lost contact with Alpha's runtime for a moment. Reconnecting…
          </p>
        ) : null}
        {connect ? (
          <ConnectCard
            client={client}
            provider={connect.provider}
            kind={connect.kind}
            reason={connect.reason}
            onConnected={() => {
              const again = connect.text;
              setConnect(null);
              void send(again);
            }}
            onCancel={() => {
              setText(connect.text);
              setConnect(null);
            }}
          />
        ) : null}
        {error && !(threadView?.journal ?? turns).some((e) => e.kind === "failed" && e.text === error) ? (
          <p className="notice" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <form
        ref={composer}
        className="composer"
        onDrop={drop.onDrop}
        onDragOver={drop.onDragOver}
        onPaste={paste}
        onSubmit={(e) => {
          e.preventDefault();
          if (speech.listening) speech.stop();
          void send(text);
        }}
      >
        <AttachmentChips items={attach.items} onRemove={attach.remove} />
        <div className="composer__box">
          <AttachMenu client={client} thread={threadView?.id ?? null} onAdd={attach.add} />
          <textarea
            ref={input}
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              autoGrow(e.currentTarget);
            }}
            onKeyDown={key}
            placeholder={threadView && threadView.kind !== "topic" && !isCreation ? "Reply…" : "Ask…"}
            aria-label="Message Alpha"
          />
          <MicButton listening={speech.listening} supported={speech.supported} onToggle={toggleMic} small />
          <IconButton aria-label="Send" title="Replies use the model chosen in Settings → Models · Enter to send, Shift+Enter for a new line" type="submit" className="composer__send" disabled={!text.trim() || Boolean(pending)}>
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

function local(text: string, thread: string | null, attachments: AttachmentWire[] = []): JournalEntry {
  return { id: `local-${Date.now()}`, at: new Date().toISOString(), kind: "said", actor: "person", text, data: attachments.length ? { attachments } : {}, module: null, thread, entity_ids: [], source: null };
}

/** m:ss, the way the creation page counts too. */
export function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
