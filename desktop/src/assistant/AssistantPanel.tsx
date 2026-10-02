/**
 * The conversation beside the workspace: one stream, scoped by the page (a message sent from a
 * module's page is about that module), with Alpha's threads as cards that open into their own
 * view. The companion is the same stream.
 */
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, ChevronLeft } from "lucide-react";
import type { Client, JournalEntry, ModuleCard, Thread, Turn } from "../core/client";
import { when } from "../modules/format";
import { ConnectCard } from "../shell/models";
import { usePushToTalk } from "../shell/ptt";
import { MicButton, useSpeech } from "../shell/voice";
import { AttachMenu } from "./AttachMenu";
import { CollapseToggleButton, IconButton } from "../ui";
import { ZazooIcon } from "../ui/ZazooIcon";

const THREAD_STATE: Record<string, string> = { open: "Open", working: "Working", waiting: "Needs you", done: "Done" };

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
  onCollapse,
  scopeName,
  module,
  version,
  onChanged,
  draft,
  onDraftTaken,
}: {
  client: Client;
  onCollapse: () => void;
  scopeName: string;
  module: ModuleCard | null;
  version: number;
  onChanged: () => void;
  draft: string | null;
  onDraftTaken: () => void;
}) {
  const [turns, setTurns] = useState<JournalEntry[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [pending, setPending] = useState<Turn | null>(null);
  const [text, setText] = useState("");
  const [threadView, setThreadView] = useState<(Thread & { journal: JournalEntry[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  // A message whose model isn't connected yet: the card connects it, then it goes again.
  const [connect, setConnect] = useState<{ provider: string; text: string } | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const load = useCallback(() => {
    client
      .conversation()
      .then((c) => {
        setTurns(c.turns);
        setThreads(c.threads);
      })
      .catch(() => undefined);
  }, [client]);
  useEffect(load, [load, version]);
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
        if (final.state === "needs_connect" && final.provider) setConnect({ provider: final.provider, text: clean });
        else if (final.state === "failed") setError(final.reply ?? "That didn't work.");
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
    if (e.key === "Enter" && (e.metaKey || !e.shiftKey)) {
      e.preventDefault();
      if (speech.listening) speech.stop();
      void send(text);
    }
  };

  const steps = pending?.steps ?? [];
  const workingNote = pending ? (
    <div className="msg msg--ai msg--working" role="status">
      <div>
        Working on it… <span className="faint">{elapsed} s</span>
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

  return (
    <aside className="assist__panel" aria-label="Chief of Staff">
      <div className="assist__head">
        {threadView ? (
          <IconButton aria-label="Back to the conversation" title="Back" size="sm" onClick={() => setThreadView(null)}>
            <ChevronLeft size={16} />
          </IconButton>
        ) : (
          <CollapseToggleButton side="right" collapsed={false} controls="panel-right" onClick={onCollapse} />
        )}
        <div className="assist__title">
          {threadView ? null : <ZazooIcon size={32} />}
          <div className="assist__titletext">
            <b className="assist__name" title={threadView?.title}>
              {threadView ? threadView.title : "Chief of Staff"}
            </b>
            <span className="assist__ctx" title={scopeName}>
              {threadView ? `Thread · ${THREAD_STATE[threadView.state] ?? threadView.state}` : scopeName}
            </span>
          </div>
        </div>
      </div>
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
            {!threadView.journal.length ? <p className="assist-empty">Nothing in this thread yet.</p> : null}
          </>
        ) : (
          <>
            {threads.map((t) => (
              <button key={t.id} type="button" className="creation" title={t.state === "waiting" ? "Waiting for your answer: open it to reply here" : "Its own thread: open it to talk about this work"} onClick={() => void client.thread(t.id).then(setThreadView)}>
                <span className="creation__title">
                  <span className="creation__name">{t.title}</span>
                  <span className={`badge badge--${t.state === "waiting" ? "waiting" : "running"}`}>{THREAD_STATE[t.state] ?? t.state}</span>
                </span>
              </button>
            ))}
            {module ? (
              <div className="msg msg--ai">
                Ask about <b>{module.name}</b>, or tell me what to add or change.
              </div>
            ) : null}
            {!turns.length && !module ? <div className="msg msg--ai">Tell me what to keep track of, look up or do.</div> : null}
            {turns.map((e) => (
              <Message key={e.id} e={e} />
            ))}
          </>
        )}
        {workingNote}
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
          <textarea ref={input} rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={key} placeholder={threadView ? "Reply…" : "Ask…"} aria-label="Message Alpha" />
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
