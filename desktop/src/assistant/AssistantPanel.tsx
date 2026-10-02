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
import type { Client, JournalEntry, ModuleCard, Session, Thread, Turn } from "../core/client";
import { when } from "../modules/format";
import { ConnectCard } from "../shell/models";
import { usePushToTalk } from "../shell/ptt";
import { MicButton, useSpeech } from "../shell/voice";
import { AttachMenu } from "./AttachMenu";
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

function Message({ e, onPage }: { e: JournalEntry; onPage: boolean }) {
  if (e.kind === "said") return <div className="msg msg--user">{e.text}</div>;
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
  sendNow?: { text: string; id: number; thread: string } | null;
  /** The page beside the chat shows the project being made: the chat only points to it. */
  cardsOnPage?: boolean;
}) {
  const [own, setOwn] = useState<ChatChoice>(undefined);
  const chat = onThread ? thread : own;
  const choose = onThread ?? setOwn;
  const [turns, setTurns] = useState<JournalEntry[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [earlier, setEarlier] = useState<Session[]>([]);
  const [pending, setPending] = useState<Turn | null>(null);
  const [text, setText] = useState("");
  const [threadView, setThreadView] = useState<(Thread & { journal: JournalEntry[] }) | null>(null);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [failures, setFailures] = useState(0);
  // A message whose model isn't connected yet: the card connects it, then it goes again.
  const [connect, setConnect] = useState<{ provider: string; text: string } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const moduleId = module?.id ?? null;
  const making = module?.creation && module.creation.stage !== "done" ? module.creation : null;

  const load = useCallback(() => {
    const work: Promise<unknown>[] = [
      client.conversation().then((c) => {
        setTurns(c.turns);
        setThreads(c.threads);
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
      try {
        // The first message of a fresh chat opens it, in this place.
        let threadId = into ?? (typeof chat === "string" ? chat : null);
        if (!threadId && (chat === null || moduleId)) {
          threadId = (await client.createSession(clean, moduleId)).id;
          choose(threadId);
        }
        if (threadId) setThreadView((v) => (v && v.id === threadId ? { ...v, journal: [...v.journal, local(clean, threadId)] } : v));
        else setTurns((all) => [...all, local(clean, null)]);
        const final = await client.askAndWait(clean, { module: threadId ? null : moduleId, thread: threadId }, setPending);
        if (final.state === "needs_connect" && final.provider) setConnect({ provider: final.provider, text: clean });
        else if (final.state === "failed") setError(final.reply ?? "That didn't work.");
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setPending(null);
        load();
        onChanged();
      }
    },
    [client, chat, choose, moduleId, pending, load, onChanged],
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
      <div>
        Working on it… <span className="faint">{clock(elapsed)}</span>
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
            {threads.map((t) => (
              <button key={t.id} type="button" className="creation" title={t.state === "waiting" ? "Waiting for your answer: open it to reply here" : "Its own thread: open it to talk about this work"} onClick={() => choose(t.id)}>
                <span className="creation__title">
                  <span className="creation__name">{t.title}</span>
                  <span className={`badge badge--${t.state === "waiting" ? "waiting" : "running"}`}>{THREAD_STATE[t.state] ?? t.state}</span>
                </span>
              </button>
            ))}
            {turns.map((e) => (
              <Message key={e.id} e={e} onPage={false} />
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
        {error ? (
          <p className="notice" role="alert">
            {error}
          </p>
        ) : null}
      </div>
      <form
        className="composer"
        onSubmit={(e) => {
          e.preventDefault();
          if (speech.listening) speech.stop();
          void send(text);
        }}
      >
        <div className="composer__box">
          <AttachMenu client={client} thread={threadView?.id ?? null} />
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

function local(text: string, thread: string | null): JournalEntry {
  return { id: `local-${Date.now()}`, at: new Date().toISOString(), kind: "said", actor: "person", text, data: {}, module: null, thread, entity_ids: [], source: null };
}

/** m:ss, the way the creation page counts too. */
export function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
