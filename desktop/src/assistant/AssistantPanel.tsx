/**
 * The conversation beside the workspace: one stream, scoped by the page (a message sent from a
 * module's page is about that module), with Alpha's threads as cards that open into their own
 * view. The companion is the same stream.
 */
import { type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import type { Client, JournalEntry, ModuleCard, Thread, Turn } from "../core/client";
import { when } from "../modules/format";
import { MicButton, useSpeech } from "../shell/voice";

function Message({ e }: { e: JournalEntry }) {
  if (e.kind === "said") return <div className="msg msg--user">{e.text}</div>;
  return (
    <div className={`msg msg--ai${e.kind === "failed" ? " msg--failed" : ""}`}>
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
}) {
  const [turns, setTurns] = useState<JournalEntry[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [pending, setPending] = useState<Turn | null>(null);
  const [text, setText] = useState("");
  const [threadView, setThreadView] = useState<(Thread & { journal: JournalEntry[] }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
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

  if (!open) {
    return (
      <button type="button" className="btn btn--primary assist__fab" onClick={() => onOpen(true)}>
        Ask Alpha
      </button>
    );
  }
  const working = pending ? (
    <div className="msg msg--ai msg--working" role="status">
      Working on it… <span className="faint">{elapsed} s</span>
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
            {threads.map((t) => (
              <button key={t.id} type="button" className="creation" onClick={() => void client.thread(t.id).then(setThreadView)}>
                <h3 className="creation__title">
                  {t.title}
                  <span className={`badge badge--${t.state === "waiting" ? "waiting" : "running"}`}>{t.state === "open" ? "Open" : t.state}</span>
                </h3>
                <span className="faint">Its own thread · open it to talk about this work</span>
              </button>
            ))}
            {module ? (
              <div className="msg msg--ai">
                I'm looking at <b>{module.name}</b>. Ask about it, tell me to add or change something, or log to it.
              </div>
            ) : null}
            {!turns.length && !module ? <div className="msg msg--ai">Tell me what to keep track of, ask about anything I hold, or say what to look up. "Log two eggs", "find back-end roles on We Work Remotely", "read my job search folder".</div> : null}
            {turns.map((e) => (
              <Message key={e.id} e={e} />
            ))}
          </>
        )}
        {working}
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
