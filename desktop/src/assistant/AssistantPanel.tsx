/**
 * The conversation beside the workspace: one stream, scoped by the page (a message sent from a
 * module's page is about that module), with Alpha's threads as cards that open into their own
 * view. The companion is the same stream.
 *
 * (9 Oct, the UI rulebook §9) The panel is always present: `open === false` means folded to a slim
 * strip with Alpha's avatar, never nothing. A header at the shared height (fold control, avatar and
 * name), a history picker for the live conversations (start, archive, delete), dark ink bubbles for
 * the person and light ones for Alpha with a tiny provenance line under each of Alpha's turns, and
 * a composer in its own file.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, Ask, Client, Convo, JournalEntry, ModuleCard, Plan, Thread, Turn } from "../core/client";
import { when } from "../modules/format";
import { ActionCard } from "../shell/ActionCard";
import { useSpeech } from "../shell/voice";
import { Badge, Button, Dropdown, IconButton, PageHeader, Rich, Trouble } from "../ui";
import { ArchiveIcon, ArrowLeft, Check, ChevronDown, ChevronRight, ChevronsRight, DeleteIcon, PlusIcon, RetryIcon, X } from "../ui/icons";
import { AskCard, PlanCard } from "./Cards";
import { Composer } from "./Composer";

const THREAD_STATE: Record<string, string> = { open: "Open", working: "Working", waiting: "Needs you", done: "Done" };
const CONVO_STATE: Record<string, string> = { open: "live", working: "working", waiting: "needs you", done: "closed" };

/** Alpha's mark: the one avatar, a letter on ink. */
function Mark() {
  return (
    <span className="assist__mark" aria-hidden="true">
      A
    </span>
  );
}

/** What a turn already says about itself (the journal's own fields, nothing guessed): how long it
 *  took and how many steps it ran. Who answered and which records it used are not recorded per
 *  turn, so they are not shown. */
function provenance(e: JournalEntry): string {
  const parts: string[] = [];
  if (typeof e.data.duration_ms === "number") parts.push(`${Math.max(1, Math.round(e.data.duration_ms / 1000))} s`);
  if (typeof e.data.num_turns === "number" && e.data.num_turns > 0) parts.push(e.data.num_turns === 1 ? "1 step" : `${e.data.num_turns} steps`);
  return parts.join(" · ");
}

/** One message: the person's on the right in ink; Alpha's on the left, light, with a tiny grey
 *  provenance line, status tags and Retry (which sends the person's last sentence again) under it. */
function Message({ e, onRetry }: { e: JournalEntry; onRetry?: () => void }) {
  if (e.kind === "said") return <div className="msg msg--user">{e.text}</div>;
  const fromThread = typeof e.data.from_thread === "string" ? e.data.from_thread : null;
  const failed = e.kind === "failed";
  const prov = provenance(e);
  return (
    <div className="turn">
      <div className={`msg msg--ai${failed ? " msg--failed" : ""}`}>
        {fromThread ? <div className="msg__label">From the thread · {fromThread}</div> : null}
        <Rich text={e.text} />
      </div>
      {prov || failed || onRetry ? (
        <div className="turn__meta">
          {failed ? <Badge tone="bad">Didn't finish</Badge> : null}
          {prov ? <span className="turn__prov">{prov}</span> : null}
          {onRetry ? (
            <Button size="sm" variant="ghost" icon={<RetryIcon />} onClick={onRetry}>
              Retry
            </Button>
          ) : null}
        </div>
      ) : null}
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

  const speech = useSpeech((final, interim) => {
    setText(final || interim);
  });
  // The panel is always present: folded, it is a slim strip with Alpha's avatar that opens it.
  if (!open) {
    return (
      <aside className="assist assist--folded" aria-label="Assistant, folded">
        <IconButton className="assist__strip" label="Open the assistant" icon={<Mark />} onClick={() => onOpen(true)} />
      </aside>
    );
  }
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
  const chatLabel = (c: Convo) => `${c.scope} · ${c.title}${c.state === "waiting" ? " (needs you)" : c.state === "working" ? " (working)" : ""}`;
  const archiveReason = !activeConvo ? "There is no conversation to archive yet." : activeConvo.state === "working" ? "Alpha is working in it. Stop it, or wait, then archive." : undefined;
  const archive = () => {
    if (activeConvo) void client.closeConversation(activeConvo.id).then(() => { setActive(null); load(); onChanged(); });
  };
  const startNew = () => void client.newConversation(module?.id ?? null, "New conversation").then((c) => { setThreadView(null); setActive(c.id); load(); });
  // Retry sends the person's last sentence before a turn again, through the same send; offered on
  // a turn that failed and on the latest one.
  const renderMessages = (list: JournalEntry[]) => {
    const said = list.filter((e) => e.kind === "said" || e.kind === "replied" || e.kind === "failed");
    const lastAi = [...said].reverse().find((e) => e.kind !== "said");
    return list.map((e) => {
      if (e.kind !== "said" && e.kind !== "replied" && e.kind !== "failed")
        return (
          <div key={e.id} className="faint thread__step">
            {when(e.at)} · {e.text}
          </div>
        );
      const before = e.kind === "said" ? undefined : [...said.slice(0, said.indexOf(e))].reverse().find((x) => x.kind === "said");
      const retry = before && !pending && (e.kind === "failed" || e === lastAi) ? () => void send(before.text) : undefined;
      return <Message key={e.id} e={e} onRetry={retry} />;
    });
  };
  const hint = module ? `Ask about ${module.name}, change it, or log something.` : "Ask about anything Alpha holds, or say what to keep track of.";

  return (
    <aside className="assist" aria-label="Assistant">
      <PageHeader
        left={<IconButton label="Fold the assistant" icon={<ChevronsRight />} onClick={() => onOpen(false)} />}
        centre={
          <div className="assist__who">
            <Mark />
            <div className="assist__name">
              <b>Alpha</b>
              <span className="assist__ctx">{activeConvo ? `${activeConvo.scope} · ${CONVO_STATE[activeConvo.state] ?? activeConvo.state}` : scopeName}</span>
            </div>
          </div>
        }
      />
      {threadView ? (
        <div className="assist__history">
          <Button size="sm" variant="ghost" icon={<ArrowLeft />} onClick={() => setThreadView(null)}>
            Back
          </Button>
          <div className="assist__thread">
            <b>{threadView.title}</b>
            <span className="assist__ctx">Thread · {THREAD_STATE[threadView.state]?.toLowerCase() ?? threadView.state}</span>
          </div>
        </div>
      ) : (
        <div className="assist__history">
          <Dropdown
            size="sm"
            className="assist__pick"
            label="Conversations"
            placeholder="New conversation"
            value={active ?? ""}
            options={chats.map((c) => ({ value: c.id, label: chatLabel(c) }))}
            onChange={(id) => { setThreadView(null); setActive(id); }}
          />
          <IconButton size="sm" label="New conversation" title="Start a new conversation here" icon={<PlusIcon />} onClick={startNew} />
          <IconButton size="sm" label="Archive" title="Archive this conversation: it closes, and what it learned stays" icon={<ArchiveIcon />} disabledReason={archiveReason} onClick={archive} />
          <IconButton size="sm" label="Delete" icon={<DeleteIcon />} disabledReason="Deleting a conversation isn't possible yet. Archive closes it and keeps what it learned." />
        </div>
      )}
      <div className="assist__body" ref={body}>
        {threadView ? (
          <>
            {renderMessages(threadView.journal)}
            {!threadView.journal.length ? <p className="assist__empty">Nothing in this thread yet. What you say here stays here, out of the main conversation.</p> : null}
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
              const last = t.state === "working" && t.steps?.length ? t.steps[t.steps.length - 1] : null;
              return (
                <div key={t.id} className="creation-wrap">
                  <button type="button" className="creation" onClick={() => void client.thread(t.id).then(setThreadView)}>
                    <h3 className="creation__title">
                      {t.title}
                      <Badge tone={t.state === "waiting" ? "warn" : "info"}>{THREAD_STATE[t.state] ?? t.state}</Badge>
                    </h3>
                    <span className="faint">{t.kind === "build" && t.state === "working" ? `Building in the background · ${t.step_count ?? 0} steps · open it to watch` : t.state === "working" ? "Alpha is working on this now" : t.state === "waiting" ? "Waiting for your answer · open it to reply here" : "Its own thread · open it to talk about this work"}</span>
                    {last ? (
                      <span className="faint thread__last">
                        {last.kind === "failed" ? <X size={12} aria-label="failed" /> : <Check size={12} aria-label="done" />} {last.text}
                      </span>
                    ) : null}
                  </button>
                  {build ? (
                    <Button size="sm" variant="ghost" className="creation__stop" onClick={() => void client.stopPlan(build.id).catch(() => undefined).finally(() => { load(); onChanged(); })}>
                      Stop
                    </Button>
                  ) : null}
                </div>
              );
            })}
            {!turns.length && !pending ? <p className="assist__empty">{hint}</p> : null}
            {renderMessages(turns)}
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
      <Composer
        client={client}
        module={module}
        text={text}
        onText={setText}
        onSend={() => { if (speech.listening) speech.stop(); void send(text); }}
        busy={Boolean(pending)}
        placeholder={threadView ? "Reply in this thread" : "Say what to do, ask, or log something…"}
        speech={speech}
        inputRef={input}
        onFollow={(turn) => { load(); void follow(turn); }}
      />
    </aside>
  );
}
