/**
 * The conversation beside the workspace: one stream, scoped by the page (a message sent from a
 * module's page is about that module), with Alpha's threads as cards that open into their own
 * view. The companion is the same stream. Since 13 Oct (Q42 section 8, features from pull request
 * #5): a conversation picker always under the panel's header, a line under each of Alpha's replies
 * saying how long it took and how many steps it ran, and Retry on a turn that didn't finish.
 * Since 16 Oct (slice 1 of `docs/design/conversation-proposal.md`): a reply is one element
 * (`Reply`) from the first words to the journal, the person's sentence is `Said`, and the
 * Markdown is rendered for real.
 */
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { moduleWords, say } from "../core/client";
import type { Action, Ask, Client, Convo, JournalEntry, ModuleCard, Question, Thread, Turn, Workflow, Agent } from "../core/client";
import { when } from "../modules/format";
import { ActionCard } from "../shell/ActionCard";
import { RenameBox, useConversationActions } from "./ConversationActions";
import { useHoldToSend, useSpeech } from "../shell/voice";
import { Button, Card, IconButton, Popover, Trouble } from "../ui";
import { ChevronRight, ChevronDown, PlusIcon } from "../ui/icons";
import { AskCard, AskGroup, AskedRow, groupAsks } from "./AskCard";
import { Composer } from "./Composer";
import { Reply, Said, replyKey, turnKey } from "./Reply";
import { ThreadRow } from "./ThreadRow";
export { AskCard, AskGroup, groupAsks } from "./AskCard";
import { retryOf } from "./turnWords";
export { provenance, retryOf, withoutCarded } from "./turnWords";

const CONVO_STATE: Record<string, string> = { open: "live", working: "working", waiting: "needs you", done: "closed" };

/** The questions the workflow page asks before its build: each with its choices, Alpha's pick
 *  selected, and a line to say it another way. What is chosen goes with the yes. */
export function Questions({ questions, answers, onChange }: { questions: Question[]; answers: Record<string, string>; onChange: (answers: Record<string, string>) => void }) {
  return (
    <ol className="wfq">
      {questions.map((q, i) => {
        const key = String(i);
        const chosen = answers[key] ?? q.default ?? "";
        const custom = chosen && !q.options.includes(chosen) ? chosen : "";
        return (
          <li key={key} className="wfq__item">
            <div className="wfq__text">{q.text}</div>
            <div className="wfq__opts">
              {q.options.map((o) => (
                <Button key={o} size="sm" variant={chosen === o ? "primary" : undefined} aria-pressed={chosen === o} onClick={() => onChange({ ...answers, [key]: o })}>
                  {o}
                  {o === q.default ? <span className="wfq__pick"> · Alpha's pick</span> : null}
                </Button>
              ))}
              <input className="wfq__other" value={custom} placeholder={q.options.length ? "Or say it your way" : (q.default ? `Alpha's pick: ${q.default}` : "Your answer")} aria-label={`Your answer: ${q.text}`} onChange={(e) => onChange({ ...answers, [key]: e.target.value })} />
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
    <Card className="wfcard" aria-label={`Your workflow: ${workflow.title}`} eyebrow="Your workflow" title={workflow.title} badge={<span className="badge badge--waiting">{drafted ? `v${workflow.version}` : workflow.state}</span>}>
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
      {workflow.research ? (
        <p className="faint wf__research" role="status">
          {workflow.research.name} is looking into how others do this; a deeper look takes longer.{" "}
          <button type="button" className="linklike" aria-label={`Skip ${workflow.research.name}'s look`} onClick={() => void client.stopAgent(workflow.research!.agent).then(() => onDecided())}>
            Skip
          </button>
        </p>
      ) : null}
      {b.suggestions.length ? (
        <section className="wf__section" aria-label="Alpha suggests">
          <h4 className="wf__head">{b.suggestions.some((sg) => sg.by_name) ? "Suggestions" : "Alpha suggests"}</h4>
          <ul className="wf__list">
            {b.suggestions.map((sg) => (
              <li key={sg.id} className="wf__suggest">
                <div>
                  {sg.by_name ? <span className="badge badge--running" style={{ marginRight: 6 }}>{sg.by_name}</span> : null}
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
    </Card>
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
  const [pending, setPending] = useState<Turn | null>(null);
  const [text, setText] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [threadView, setThreadView] = useState<(Thread & { journal: JournalEntry[] }) | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [convos, setConvos] = useState<Convo[]>([]);
  const [picking, setPicking] = useState(false);
  const [renamingConvo, setRenamingConvo] = useState(false);
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
      .catch((e: unknown) => setLoadError(say(e)));
  }, [client, module?.id, active]);
  useEffect(load, [load, version]);
  // A page change shows that page's live conversation, not the one from the last page.
  useEffect(() => {
    let live = true;
    client.agents().then((all) => live && setAgents(all)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [client]);
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
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (stick.current) body.current?.scrollTo?.({ top: body.current.scrollHeight });
  }, [turns, pending, threadView]);
  // The words grow inside the reply element now, not through this state: the view follows
  // the content's height instead, so the newest words stay in view unless the person scrolled up.
  useEffect(() => {
    const el = content.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const watcher = new ResizeObserver(() => {
      if (stick.current) body.current?.scrollTo?.({ top: body.current.scrollHeight });
    });
    watcher.observe(el);
    return () => watcher.disconnect();
  }, []);
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
        setError(`${say(e)} Your message is back in the box.`);
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
        const final = await client.followOrWait(turn, setPending, 500);
        if (final.state === "failed") setError(final.reply ?? "That didn't work.");
      } catch (e) {
        setError(`${say(e)} The turn may still have run; its answer shows here when Alpha is back.`);
      }
      setPending(null);
      load();
      onChanged();
    },
    [client, load, onChanged],
  );

  // Files from the composer's plus take the route a drop takes (`/api/files`), in the page's
  // module; the turn that reads them is followed here like any other.
  const addFiles = async (files: File[]) => {
    if (!files.length) return;
    setError(null);
    try {
      const out = await client.addFiles(files, { module: module?.id ?? null });
      if (out.turn) await follow(out.turn);
      else {
        load();
        onChanged();
      }
    } catch (e) {
      setError(`Couldn't add ${files.map((f) => f.name).join(", ")}: ${say(e)}`);
    }
  };
  const speech = useSpeech((final, interim) => {
    setText(final || interim);
  });
  // the mic held: what was said goes after a moment, unless stopped (slice 2 E3)
  const spoken = useHoldToSend(speech, (said) => void send(said), setText);
  // An "@" word names the agent that answers (Q44), anywhere in the sentence (16 Oct; before,
  // only at the start): the agents whose name begins with what is typed after the last "@",
  // until a name is complete; a tap or Enter completes it, never sends.
  const atWord = /(^|\s)@([^@\n]*)$/.exec(text);
  const typedName = atWord ? atWord[2].toLowerCase() : null;
  const mentionable = typedName === null ? [] : agents.filter((a) => a.name.toLowerCase().startsWith(typedName.trimStart()) && a.name.toLowerCase() !== typedName.trimEnd());
  const mention = (a: Agent) => {
    setText(`${atWord ? text.slice(0, atWord.index + atWord[1].length) : ""}@${a.name} `);
    input.current?.focus();
  };
  const key = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && (e.metaKey || !e.shiftKey)) {
      e.preventDefault();
      if (mentionable.length) {
        mention(mentionable[0]);
        return;
      }
      if (speech.listening) speech.stop();
      spoken.stop();
      void send(text);
    }
  };

  const openAsks = asks.filter((a) => (threadView ? a.thread === threadView.id : active ? a.thread === active : a.thread === null));
  // One element per turn, from the first words to the journal (slice 1 of the conversation
  // proposal, 16 Oct): the running turn is the last item of the same list as the turns, keyed
  // by the sentence it answers, so when the reply lands the element stays and only its words
  // change. The thinking line and the steps live inside it.
  const pendingItem = pending ? (
    <Reply key={turnKey(pending)} turn={pending} elapsed={elapsed} onStop={() => { if (pending.id) void client.stopTurn(pending.id).catch(() => undefined); }} />
  ) : null;
  // Edit: the person's words back in the composer; sending them is a new turn.
  const edit = (words: string) => {
    setText(words);
    setTimeout(() => input.current?.focus(), 0);
  };
  // One timeline, in the order things happened (slice 2): the sentences and replies, the
  // questions where Alpha asked them (an open one as its card, several from one turn as one
  // form, an answered one as a dim line), the workflow pages and the actions where they were
  // proposed, the threads where they began; the running turn last. Nothing is pinned on top
  // and nothing is pushed to the bottom.
  const stamp = (iso: string) => Date.parse(iso) || 0;
  const openById = new Map(openAsks.map((a) => [a.id, a]));
  // A question is journaled while the reply is still being written: it belongs after the
  // reply of its turn, as the person reads it.
  const repliedAt = new Map(turns.filter((e) => e.kind === "replied" && typeof e.data.turn === "string").map((e) => [e.data.turn as string, stamp(e.at)]));
  const askedAt = (e: JournalEntry) => Math.max(stamp(e.at), (typeof e.data.turn === "string" ? repliedAt.get(e.data.turn) ?? 0 : 0) + 1);
  const onAnswered = (turn: Turn | null) => { load(); void follow(turn); };
  const decided = () => { load(); onChanged(); };
  const items: { at: number; node: ReactNode }[] = [];
  for (let i = 0; i < turns.length; i++) {
    const e = turns[i];
    if (e.kind === "asked") {
      if (!openById.has(e.id)) {
        items.push({ at: askedAt(e), node: <AskedRow key={e.id} entry={e} /> });
        continue;
      }
      if (pending) continue; // answered when the turn ends, as before
      const open: Ask[] = [];
      let j = i;
      while (j < turns.length && turns[j].kind === "asked" && openById.has(turns[j].id)) open.push(openById.get(turns[j++].id) as Ask);
      groupAsks(open).forEach((group) =>
        items.push({ at: askedAt(e), node: group.length > 1 ? <AskGroup key={group[0].id} asks={group} client={client} onAnswered={onAnswered} /> : <AskCard key={group[0].id} ask={group[0]} client={client} onAnswered={onAnswered} /> }),
      );
      i = j - 1;
      continue;
    }
    if (e.kind === "said") {
      items.push({ at: stamp(e.at), node: <Said key={e.id} entry={e} onEdit={!pending ? () => edit(e.text) : undefined} /> });
      continue;
    }
    const again = !pending ? retryOf(e, turns) : null;
    items.push({ at: stamp(e.at), node: <Reply key={replyKey(e)} entry={e} asks={openAsks} onRetry={again ? () => void send(again) : undefined} /> });
  }
  workflows.forEach((w) => items.push({ at: stamp(w.created_at), node: <WorkflowCard key={`wf-${w.id}`} workflow={w} client={client} onDecided={decided} /> }));
  actions
    .filter((a) => a.state === "proposed" || a.state === "running" || a.state === "approved" || a.state === "failed")
    // A failed attempt is history once Alpha proposed the same thing again.
    .filter((a) => a.state !== "failed" || !actions.some((b) => b.id !== a.id && b.title === a.title && b.created_at > a.created_at))
    .forEach((a) => items.push({ at: stamp(a.created_at), node: <ActionCard key={`act-${a.id}`} action={a} client={client} compact onDecided={decided} /> }));
  threads.filter((t) => t.kind !== "chat").forEach((t) => items.push({ at: stamp(t.created_at), node: <ThreadRow key={`th-${t.id}`} thread={t} onOpen={() => void client.thread(t.id).then(setThreadView)} /> }));
  items.sort((a, b) => a.at - b.at);
  const timeline = [...items.map((it) => it.node), pendingItem];
  const chats = convos.filter((c) => c.kind === "chat");
  const activeConvo = chats.find((c) => c.id === active) ?? null;
  const convoActions = useConversationActions(client, (what) => {
    if (what === "deleted") {
      setActive(null);
      setThreadView(null);
    }
    load();
    onChanged();
  });

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
      {layout === "panel" && !threadView ? (
        // the conversation picker (section 8a): always here, so nothing moves when a second one starts
        <div className="convpick">
          {renamingConvo && activeConvo ? (
            <RenameBox convo={activeConvo} onSave={(t) => { setRenamingConvo(false); void convoActions.rename(activeConvo, t); }} onCancel={() => setRenamingConvo(false)} />
          ) : (
          <Popover
            open={picking}
            onOpenChange={setPicking}
            label="Conversations"
            align="start"
            trigger={
              <button type="button" className="convpick__btn" aria-label={`Conversation: ${activeConvo ? activeConvo.title : "new"}. Pick another`}>
                {activeConvo ? <span className={`convchip__dot convchip__dot--${activeConvo.state}`} aria-hidden="true" /> : null}
                <span className="convpick__title">{activeConvo ? activeConvo.title : "New conversation"}</span>
                <ChevronDown size={13} aria-hidden="true" />
              </button>
            }
          >
            <div className="colmenu convpick__list">
              <div className="menu__head">Live conversations</div>
              {chats.map((c) => (
                <button key={c.id} type="button" className={`menu__item convpick__item${c.id === active ? " convpick__item--on" : ""}`} aria-current={c.id === active ? "true" : undefined} onClick={() => { setPicking(false); setThreadView(null); setActive(c.id); }}>
                  <span className={`convchip__dot convchip__dot--${c.state}`} aria-hidden="true" />
                  <span className="convpick__words">
                    <span className="convpick__title">{c.title}</span>
                    <span className="faint">
                      {c.scope}
                      {c.state === "waiting" ? " · needs you" : ""}
                    </span>
                  </span>
                </button>
              ))}
              {!chats.length ? <p className="faint convpick__none">None yet: what you say starts one.</p> : null}
              {activeConvo ? (
                <>
                  <div className="menu__head">This conversation</div>
                  <button type="button" className="menu__item" onClick={() => { setPicking(false); setRenamingConvo(true); }}>
                    Rename…
                  </button>
                  <button type="button" className="menu__item menu__item--danger" onClick={() => { setPicking(false); convoActions.askDelete(activeConvo); }}>
                    Delete…
                  </button>
                </>
              ) : null}
            </div>
          </Popover>
          )}
          <Button size="sm" variant="ghost" onClick={() => void client.newConversation(module?.id ?? null, "New conversation").then((c) => { setThreadView(null); setActive(c.id); load(); })}>
            <PlusIcon size={14} aria-hidden="true" /> New
          </Button>
        </div>
      ) : null}
      <div className="assist__body" ref={body} onScroll={onScroll}>
        <div className="assist__content" ref={content}>
        {threadView ? (
          <>
            {[
              ...threadView.journal.map((e) =>
                e.kind === "said" ? (
                  <Said key={e.id} entry={e} />
                ) : e.kind === "replied" || e.kind === "failed" ? (
                  <Reply key={replyKey(e)} entry={e} />
                ) : (
                  <div key={e.id} className="faint thread__step">
                    {when(e.at)} · {e.text}
                  </div>
                ),
              ),
              pendingItem,
            ]}
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
            {module ? (
              <div className="intro">
                I'm looking at <b>{moduleWords(module)}</b>{module.children?.length ? " and what it holds" : ""}. Ask about it, tell me to add or change something, or log to it.
              </div>
            ) : null}
            {!turns.length && !module ? <div className="intro">Tell me what to keep track of, ask about anything I hold, or say what to look up. "Log two eggs", "find back-end roles on We Work Remotely", "read my job search folder".</div> : null}
            {timeline}
          </>
        )}
        {loadError ? <Trouble onRetry={load}>Couldn't load the conversation: {loadError}</Trouble> : null}
        {convoActions.problem ? (
          <p className="notice" role="alert">
            {convoActions.problem}
          </p>
        ) : null}
        {convoActions.confirm}
        {error ? (
          <p className="notice" role="alert">
            {error}
          </p>
        ) : null}
        </div>
      </div>
      <Composer
        text={text}
        onChange={(words) => { spoken.stop(); setText(words); }}
        onSend={() => { spoken.stop(); void send(text); }}
        onKeyDown={key}
        onFiles={(files) => void addFiles(files)}
        canSend={Boolean(text.trim()) && !pending}
        placeholder={threadView ? "Reply in this thread" : "Say what to do, ask, or log something…"}
        inputRef={input}
        mentionable={mentionable}
        onMention={mention}
        mic={{ listening: speech.listening, supported: speech.supported, onToggle: speech.toggle, onHoldStart: spoken.holdStart, onHoldEnd: spoken.holdEnd }}
        due={spoken.due ? { text: spoken.due, onStop: spoken.stop } : null}
      />
    </aside>
  );
}
