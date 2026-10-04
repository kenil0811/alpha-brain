/**
 * Zazoo, the conversation beside the workspace: one stream, scoped by the page (a message sent
 * from a module's page is about that module), with Zazoo's threads as cards that open into their
 * own view. The companion is the same stream. Files added by the composer's + (or dropped or
 * pasted on it) go to the core's /api/files for the page's module; a model or access per chat
 * is not something the core keeps yet, so those say they are coming soon.
 */
import { type ClipboardEvent, type DragEvent, type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { moduleWords } from "../core/client";
import type { Action, Ask, Client, Convo, JournalEntry, ModuleCard, Plan, Thread, Turn } from "../core/client";
import { when } from "../modules/format";
import { ActionCard } from "../shell/ActionCard";
import { MicButton, useSpeech } from "../shell/voice";
import { Button, IconButton, Menu, MenuHeading, MenuItem, Trouble, Rich, useComingSoon } from "../ui";
import { ChevronRight, ChevronDown, Check, X, PlusIcon, File as FileIcon, FolderOpen } from "../ui/icons";

/** The composer's +: add files, images, a folder (its files) or audio to the page's module, and
 *  Advanced (a model and access per chat: coming soon, the core runs every chat the same way). */
function AttachMenu({ onFiles }: { onFiles: (files: File[]) => void }) {
  const soon = useComingSoon();
  const pickers = useRef<Record<string, HTMLInputElement | null>>({});
  const pick = (kind: string) => pickers.current[kind]?.click();
  const input = (kind: string, accept?: string, folder?: boolean) => (
    <input
      key={kind}
      ref={(el) => {
        pickers.current[kind] = el;
        // A folder picker is a file input that takes a directory (all its files come with it).
        if (el && folder) el.setAttribute("webkitdirectory", "");
      }}
      type="file"
      multiple
      hidden
      accept={accept}
      aria-hidden="true"
      tabIndex={-1}
      onChange={(e) => {
        onFiles(Array.from(e.target.files ?? []));
        e.target.value = "";
      }}
    />
  );
  return (
    <>
      {input("files")}
      {input("images", "image/*")}
      {input("folder", undefined, true)}
      {input("audio", "audio/*")}
      <Menu align="start" trigger={<IconButton size="sm" className="composer__plus" label="Add files, images, a folder or audio" icon={<PlusIcon />} />}>
        <MenuItem onSelect={() => pick("files")}>
          <FileIcon size={14} aria-hidden="true" /> Add files
        </MenuItem>
        <MenuItem onSelect={() => pick("images")}>
          <FileIcon size={14} aria-hidden="true" /> Add images
        </MenuItem>
        <MenuItem onSelect={() => pick("folder")}>
          <FolderOpen size={14} aria-hidden="true" /> Add a folder
        </MenuItem>
        <MenuItem onSelect={() => pick("audio")}>
          <FileIcon size={14} aria-hidden="true" /> Add audio
        </MenuItem>
        <MenuHeading>Advanced</MenuHeading>
        <MenuItem onSelect={() => soon("Choosing a model for this chat")}>Model: as in Settings</MenuItem>
        <MenuItem onSelect={() => soon("Choosing access for this chat")}>Access: ask for approval</MenuItem>
      </Menu>
    </>
  );
}

/** Whether a drop or paste carries files (not just text). */
export function carriesFiles(data: DataTransfer | null): boolean {
  return Boolean(data && (data.files?.length || Array.from(data.types ?? []).includes("Files")));
}

const THREAD_STATE: Record<string, string> = { open: "Open", working: "Working", waiting: "Needs you", done: "Done" };
const CONVO_STATE: Record<string, string> = { open: "live", working: "working", waiting: "needs you", done: "closed" };

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
      <h3 className="creation__title">
        {plan.title}
        <span className="badge badge--waiting">{stopped ? "Stopped" : "Plan"}</span>
      </h3>
      <span className="faint">{stopped ? "The build stopped before it finished. It can carry on from where it stopped." : "Nothing is built until you say yes. Answer the questions above in a reply, or build it as proposed."}</span>
      <div className="row" style={{ marginTop: 8 }}>
        <Button size="sm" variant="primary" disabled={busy} onClick={() => decide(true)}>
          {stopped ? "Continue building" : "Build it"}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide(false)}>
          {stopped ? "Leave it" : "Not now"}
        </Button>
      </div>
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
    <div className="askcard" role="group" aria-label="Zazoo asks">
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
  focusConversation,
}: {
  client: Client;
  open: boolean;
  onOpen: (open: boolean) => void;
  scopeName: string;
  module: ModuleCard | null;
  version: number;
  onChanged: () => void;
  draft: { text: string; send: boolean } | null;
  onDraftTaken: () => void;
  focusThread?: { id: string; at: number } | null;
  focusConversation?: { id: string; at: number } | null;
}) {
  const [turns, setTurns] = useState<JournalEntry[]>([]);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
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
        setPlans(c.plans ?? []);
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
  useEffect(() => {
    body.current?.scrollTo?.({ top: body.current.scrollHeight });
  }, [turns, pending, threadView]);
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
        const final = await client.askAndWait(clean, { module: threadId ? null : (module?.id ?? null), thread: threadId, conversation }, setPending);
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
        const final = await client.waitTurn(turn, setPending);
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

  // Files from the +, a drop or a paste: kept by the core for the page's module, which Zazoo
  // then reads in a turn the panel follows; on a page with no module they are kept in Alpha's
  // files and the panel says so.
  const [fileNote, setFileNote] = useState<string | null>(null);
  const addFiles = useCallback(
    async (files: File[]) => {
      if (!files.length) return;
      setError(null);
      try {
        const out = await client.addFiles(files, { module: module?.id ?? null });
        const names = out.documents.map((d) => d.title).join(", ");
        setFileNote(out.turn ? `Added ${names}. Zazoo is reading ${files.length === 1 ? "it" : "them"}.` : `Kept ${names} in Alpha's files. Open a module to have Zazoo read ${files.length === 1 ? "it" : "them"} into it.`);
        onChanged();
        void follow(out.turn);
      } catch (e) {
        setError(`Couldn't add ${files.map((f) => f.name).join(", ")}: ${e instanceof Error ? e.message : String(e)}`);
      }
    },
    [client, module?.id, onChanged, follow],
  );
  useEffect(() => {
    if (!fileNote) return;
    const t = setTimeout(() => setFileNote(null), 6000);
    return () => clearTimeout(t);
  }, [fileNote]);
  const onDragOver = (e: DragEvent) => {
    if (carriesFiles(e.dataTransfer)) e.preventDefault();
  };
  const onDrop = (e: DragEvent) => {
    if (!carriesFiles(e.dataTransfer)) return;
    e.preventDefault();
    void addFiles(Array.from(e.dataTransfer.files));
  };
  const onPaste = (e: ClipboardEvent) => {
    if (!e.clipboardData.files.length) return;
    e.preventDefault();
    void addFiles(Array.from(e.clipboardData.files));
  };
  const newChat = () =>
    void client
      .newConversation(module?.id ?? null, "New conversation")
      .then((c) => {
        setThreadView(null);
        setActive(c.id);
        load();
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));

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
  const live = pending?.live ?? null;
  const latest = steps.length ? steps[steps.length - 1].text : null;
  const doing = live?.doing ?? null;
  const thought = live?.thought ?? null;
  const headline = doing ?? (elapsed < 2 ? "Thinking" : latest ? "Working" : "Thinking");
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
      {thought ? <p className="working__thought">{thought}</p> : null}
      {steps.length ? (
        <button type="button" className="working__steps" aria-expanded={showSteps} onClick={() => setShowSteps((v) => !v)}>
          {showSteps ? <ChevronDown size={13} aria-hidden="true" /> : <ChevronRight size={13} aria-hidden="true" />} {steps.length} {steps.length === 1 ? "step" : "steps"}
          {!showSteps && latest ? <span className="faint"> · {latest}</span> : null}
        </button>
      ) : null}
      {showSteps && steps.length ? (
        <ul className="stages">
          {steps.slice(-12).map((s, i) => (
            <li key={`${s.at}-${i}`} className={s.kind === "failed" ? "notice" : "stages__done"}>
              {s.kind === "failed" ? <X size={12} aria-label="failed" /> : <Check size={12} aria-label="done" />} {s.text}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  ) : null;
  const openAsks = asks.filter((a) => (threadView ? a.thread === threadView.id : active ? a.thread === active : a.thread === null));
  const chats = convos.filter((c) => c.kind === "chat");
  const activeConvo = chats.find((c) => c.id === active) ?? null;

  return (
    <aside className="assist" aria-label="Zazoo">
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
            Z
          </div>
          <div style={{ minWidth: 0 }}>
            <b style={{ fontWeight: 500 }}>Zazoo</b>
            <div className="assist__ctx">{activeConvo ? `${activeConvo.title} · ${activeConvo.scope} · ${CONVO_STATE[activeConvo.state] ?? activeConvo.state}` : scopeName}</div>
          </div>
          <span style={{ marginLeft: "auto" }} />
          {activeConvo && activeConvo.state !== "working" ? (
            <Button size="sm" variant="ghost" title="Close this conversation; what it learned stays" onClick={() => void client.closeConversation(activeConvo.id).then(() => { setActive(null); load(); onChanged(); })}>
              Done
            </Button>
          ) : null}
          <IconButton label="New chat" title="A new conversation here" icon={<PlusIcon />} onClick={newChat} />
          <IconButton label="Close Zazoo" icon={<ChevronRight />} onClick={() => onOpen(false)} />
        </div>
      )}
      {!threadView && (chats.length > 1 || (chats.length === 1 && chats[0].id !== active)) ? (
        <div className="convstrip" role="tablist" aria-label="Live conversations">
          {chats.map((c) => (
            <button key={c.id} type="button" role="tab" aria-selected={c.id === active} className={`convchip${c.id === active ? " convchip--active" : ""}${c.state === "waiting" ? " convchip--needs" : ""}`} title={`${c.scope}: ${c.title}${c.question ? ` · asked: ${c.question}` : ""}`} onClick={() => { setThreadView(null); setActive(c.id); }}>
              <span className={`convchip__dot convchip__dot--${c.state}`} aria-hidden="true" />
              <span className="convchip__scope">{c.scope}</span>
              <span className="convchip__title">{c.title}</span>
            </button>
          ))}
          <button type="button" className="convchip convchip--new" title="A new conversation here" onClick={newChat}>
            +
          </button>
        </div>
      ) : null}
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
            {!pending
              ? openAsks.map((a) => (
                  <AskCard key={a.id} ask={a} client={client} onAnswered={(turn) => { load(); void follow(turn); }} />
                ))
              : null}
          </>
        ) : (
          <>
            {threads.filter((t) => t.kind !== "chat").map((t) => {
              // A build has no time limit: the person stops it when it isn't going anywhere.
              const build = t.kind === "build" ? plans.find((p) => p.thread === t.id && (p.state === "building" || p.state === "approved")) : undefined;
              return (
                <div key={t.id} className="creation-wrap">
                  <button type="button" className="creation" onClick={() => void client.thread(t.id).then(setThreadView)}>
                    <h3 className="creation__title">
                      {t.title}
                      <span className={`badge badge--${t.state === "waiting" ? "waiting" : "running"}`}>{THREAD_STATE[t.state] ?? t.state}</span>
                    </h3>
                    <span className="faint">{t.kind === "build" && t.state === "working" ? `Building in the background · ${t.step_count ?? 0} steps · open it to watch` : t.state === "working" ? "Zazoo is working on this now" : t.state === "waiting" ? "Waiting for your answer · open it to reply here" : "Its own thread · open it to talk about this work"}</span>
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
            {module ? (
              <div className="msg msg--ai">
                I'm looking at <b>{moduleWords(module)}</b>{module.children?.length ? " and what it holds" : ""}. Ask about it, tell me to add or change something, or log to it.
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
              .filter((a) => a.state === "proposed" || a.state === "running" || a.state === "approved" || a.state === "failed")
              // A failed attempt is history once Alpha proposed the same thing again.
              .filter((a) => a.state !== "failed" || !actions.some((b) => b.id !== a.id && b.title === a.title && b.created_at > a.created_at))
              .map((a) => (
                <ActionCard key={a.id} action={a} client={client} compact onDecided={() => { load(); onChanged(); }} />
              ))}
            {!pending
              ? openAsks.map((a) => (
                  <AskCard key={a.id} ask={a} client={client} onAnswered={(turn) => { load(); void follow(turn); }} />
                ))
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
      <div className="composer" onDragOver={onDragOver} onDrop={onDrop}>
        {fileNote ? (
          <p className="faint" role="status">
            {fileNote}
          </p>
        ) : null}
        <div className="composer__box">
          <AttachMenu onFiles={(files) => void addFiles(files)} />
          <textarea ref={input} rows={1} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={key} onPaste={onPaste} placeholder={threadView ? "Reply…" : "Ask Zazoo…"} aria-label="Message Zazoo" />
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
