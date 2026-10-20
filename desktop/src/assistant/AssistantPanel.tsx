/**
 * The conversation beside the workspace: since section C (20 Oct 2026, Q107) the stream, one
 * place to talk. Every sentence goes to the desk (Home's session, kept open); work longer than
 * a few steps runs beside it and reports back here; nothing is opened, and no item has a box of
 * its own. Since 13 Oct (Q42 section 8): a line under each of Alpha's replies saying how long
 * it took and how many steps it ran, and Retry on a turn that didn't finish. Since 16 Oct
 * (slice 1 of `docs/design/conversation-proposal.md`): a reply is one element (`Reply`) from
 * the first words to the journal, the person's sentence is `Said`, and the Markdown is
 * rendered for real. */
import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { moduleWords, say } from "../core/client";
import type { Action, Ask, Client, JournalEntry, ModuleCard, NeedItem, Question, Turn, Workflow, Agent, Work } from "../core/client";
import { ActionCard } from "../shell/ActionCard";
import { NoWithReason } from "../shell/CardBits";
import { Need } from "../shell/Home";
import { useHoldToSend, useSpeech } from "../shell/voice";
import { Button, Card, IconButton, Trouble } from "../ui";
import { ChevronRight } from "../ui/icons";
import { AskCard, AskGroup, AskedRow, groupAsks } from "./AskCard";
import { Composer } from "./Composer";
import { Reply, Said, replyKey, turnKey } from "./Reply";
import { NowStrip, ShowTheWork, TopicChip, WorkEntry } from "./Work";
export { AskCard, AskGroup, groupAsks } from "./AskCard";
import { retryOf } from "./turnWords";
export { provenance, retryOf, withoutCarded } from "./turnWords";

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
  const decide = (yes: boolean, reason?: string) => {
    setBusy(true);
    void (yes ? client.agreeWorkflow(workflow.id, b.suggestions.length ? decisions : undefined, b.questions.length ? answers : undefined) : client.declineWorkflow(workflow.id, reason)).finally(() => {
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
            <NoWithReason disabled={busy} onNo={(reason) => decide(false, reason)} />
          </div>
        </>
      ) : workflow.state === "stopped" ? (
        <>
          <span className="faint">You stopped it before it was done; a yes picks it up again.</span>
          <div className="row" style={{ marginTop: 8 }}>
            <Button size="sm" variant="primary" disabled={busy} onClick={() => decide(true)}>
              Yes, carry on
            </Button>
          </div>
        </>
      ) : (
        <span className="faint">{workflow.state === "agreed" ? "Agreed. Alpha is doing it now, here in the conversation." : workflow.state === "built" ? "Done. Open the module to use it." : `This workflow is ${workflow.state}.`}</span>
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

/** The stream (section C, Q107): the one place to talk. The person's sentences and the desk's
 *  replies in order, the work beside the desk as one live message each (its outcome then the
 *  desk's reply, with the work's chip and "Show the work"), every card where it arose, the Now
 *  strip above the composer, and the composer, which always speaks to the desk. A chip filters
 *  the stream to one piece of work; a module's page shows the stream narrowed to it. The same
 *  thing in the side panel ("panel") and on the Assistant page ("page", wide). */
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
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [asks, setAsks] = useState<Ask[]>([]);
  const [work, setWork] = useState<Record<string, Work>>({});
  const [now, setNow] = useState<Work[]>([]);
  const [needs, setNeeds] = useState<NeedItem[]>([]);
  const [pending, setPending] = useState<Turn | null>(null);
  const [text, setText] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]);
  // the piece of work the stream is narrowed to (a chip pressed), by its thread
  const [filter, setFilter] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const body = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  // the filter shown now, for a load that resolves after it changed
  const shown = useRef<string | null>(null);
  shown.current = filter;
  // Loads overlap (a card answered, then the turn ending two seconds later): only the newest
  // one may land, else an older answer without the reply overwrites the newer (18 Oct: the
  // reply after a yes never showed until the next change).
  const loads = useRef(0);
  const load = useCallback(() => {
    const asked = filter;
    const seq = ++loads.current;
    client
      .conversation(module?.id ?? null, null, asked)
      .then((c) => {
        if (shown.current !== asked || seq !== loads.current) return; // superseded meanwhile
        setTurns(c.turns);
        setWorkflows(c.workflows ?? []);
        setActions(c.actions ?? []);
        setAsks(c.asks ?? []);
        setWork(c.work ?? {});
        setNow(c.now ?? []);
        setNeeds(c.needs ?? []);
        setLoadError(null);
      })
      .catch((e: unknown) => setLoadError(say(e)));
  }, [client, module?.id, filter]);
  useEffect(load, [load, version]);
  useEffect(() => {
    let live = true;
    client.agents().then((all) => live && setAgents(all)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [client]);
  // A page change shows the stream narrowed to that page, not to the last page's work.
  useEffect(() => {
    setFilter(null);
  }, [module?.id]);
  // A piece of work opened from elsewhere (its address, the companion): the stream narrowed to
  // it; anything else (an old item's address) opens the whole stream (C3).
  useEffect(() => {
    const id = focusConversation?.id ?? null;
    if (focusConversation) setFilter(id && work[id] ? id : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusConversation]);
  useEffect(() => {
    const id = focusThread?.id ?? null;
    if (focusThread) setFilter(id && work[id] ? id : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusThread]);
  // Alpha works on its own too (a build, a folder that changed): `version` moves when the
  // window's one poll sees a change (core/changes.ts); the panel keeps no clock of its own.
  // The view follows the newest words unless the person scrolled up to read something.
  const stick = useRef(true);
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (stick.current) body.current?.scrollTo?.({ top: body.current.scrollHeight });
  }, [turns, pending]);
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
      setTurns((all) => [...all, { id: `local-${Date.now()}`, at: new Date().toISOString(), kind: "said", actor: "person", text: clean, data: {}, module: null, thread: null, entity_ids: [], source: null }]);
      try {
        // Always the desk (section C): no routing, no item; the page's module goes with it.
        const final = await client.askAndWait(clean, { module: module?.id ?? null }, setPending, 500);
        if (final.state === "failed") setError(final.reply ?? "That didn't work.");
      } catch (e) {
        // The core stopped answering (or lost the turn): the words come back to the box.
        setError(`${say(e)} Your message is back in the box.`);
        setText((current) => current || clean);
      } finally {
        sending.current = false;
        setPending(null);
        load();
        onChanged();
      }
    },
    [client, module, pending, load, onChanged],
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

  // every open card, wherever it arose (the desk, its work, an agent's run): in the stream (C3)
  const openAsks = filter ? asks.filter((a) => a.thread === filter) : asks;
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
  // form, an answered one as a dim line), the workflow pages, the actions and the other cards
  // where they arose, the work beside the desk where it started (C3); the running turn last.
  const stamp = (iso: string) => Date.parse(iso) || 0;
  const openById = new Map(openAsks.map((a) => [a.id, a]));
  // A question is journaled while the reply is still being written: it belongs after the
  // reply of its turn, as the person reads it.
  const repliedAt = new Map(turns.filter((e) => e.kind === "replied" && typeof e.data.turn === "string").map((e) => [e.data.turn as string, stamp(e.at)]));
  // A permission card (a yes asked mid-turn) keeps its own time: the reply after it speaks of
  // it, so it reads as answered, not as still pending below the reply (18 Oct).
  const askedAt = (a: { at: string; data?: Record<string, unknown>; turn?: string | null }) => {
    const turn = typeof a.data?.turn === "string" ? a.data.turn : a.turn ?? null;
    return a.data?.permission ? stamp(a.at) : Math.max(stamp(a.at), (turn ? repliedAt.get(turn) ?? 0 : 0) + 1);
  };
  const onAnswered = (turn: Turn | null) => { load(); void follow(turn); };
  const decided = () => { load(); onChanged(); };
  const workOf = (e: JournalEntry): Work[] => {
    const named = e.data.work;
    const ids = Array.isArray(named) ? named.map(String) : typeof named === "string" ? [named] : [];
    return ids.map((id) => work[id]).filter((w): w is Work => Boolean(w));
  };
  // the work whose outcome the desk has spoken of: its live entry gives way to that reply
  const reported = new Set(turns.filter((e) => e.kind === "replied").flatMap((e) => workOf(e).map((w) => w.id)));
  const items: { at: number; node: ReactNode }[] = [];
  const inTurns = new Set<string>();
  for (const e of turns) {
    if (e.kind === "asked") {
      inTurns.add(e.id);
      if (!openById.has(e.id)) items.push({ at: askedAt(e), node: <AskedRow key={e.id} entry={e} /> });
      continue;
    }
    if (e.kind === "said") {
      items.push({ at: stamp(e.at), node: <Said key={e.id} entry={e} onEdit={!pending ? () => edit(e.text) : undefined} /> });
      continue;
    }
    if (e.kind === "did") {
      // where the desk started work: its one live message, until the desk speaks of its end
      const [w] = workOf(e);
      if (!w || reported.has(w.id)) continue;
      items.push({ at: stamp(e.at), node: <WorkEntry key={e.id} work={w} client={client} onFilter={setFilter} filtered={filter === w.id} onChanged={decided} /> });
      continue;
    }
    const again = !pending ? retryOf(e, turns) : null;
    const about = workOf(e);
    if (!about.length) {
      // keyed as the running reply was, so the element stays from the first words on
      items.push({ at: stamp(e.at), node: <Reply key={replyKey(e)} entry={e} asks={openAsks} onRetry={again ? () => void send(again) : undefined} /> });
      continue;
    }
    // the desk's words on finished work: its chip above, its steps foldable below (C3)
    items.push({
      at: stamp(e.at),
      node: (
        <div key={replyKey(e)} className="streamreply">
          <div className="streamreply__topics">
            {about.map((w) => <TopicChip key={w.id} work={w} onFilter={setFilter} on={filter === w.id} />)}
          </div>
          <Reply entry={e} asks={openAsks} onRetry={again ? () => void send(again) : undefined} />
          {about.map((w) => <ShowTheWork key={w.id} client={client} id={w.id} />)}
        </div>
      ),
    });
  }
  // the open questions, several from one turn as one form, at their time; a yes asked
  // mid-turn (a permission) shows while the turn waits on it, the rest after the turn
  {
    groupAsks(openAsks.filter((a) => !pending || a.permission)).forEach((group) =>
      items.push({ at: askedAt(group[0]), node: group.length > 1 ? <AskGroup key={group[0].id} asks={group} client={client} onAnswered={onAnswered} /> : <AskCard key={group[0].id} ask={group[0]} client={client} onAnswered={onAnswered} /> }),
    );
  }
  if (!filter) {
    workflows.forEach((w) => items.push({ at: stamp(w.created_at), node: <WorkflowCard key={`wf-${w.id}`} workflow={w} client={client} onDecided={decided} /> }));
    actions
      .filter((a) => a.state === "proposed" || a.state === "running" || a.state === "approved" || a.state === "failed")
      // A failed attempt is history once Alpha proposed the same thing again.
      .filter((a) => a.state !== "failed" || !actions.some((b) => b.id !== a.id && b.title === a.title && b.created_at > a.created_at))
      .forEach((a) => items.push({ at: stamp(a.created_at), node: <ActionCard key={`act-${a.id}`} action={a} client={client} compact onDecided={decided} /> }));
    needs.forEach((n) => items.push({ at: stamp(n.at), node: <Need key={`need-${n.id}`} item={n} client={client} onDone={decided} /> }));
  }
  items.sort((a, b) => a.at - b.at);
  const timeline = [...items.map((it) => it.node), pendingItem];
  const filtered = filter ? work[filter] ?? null : null;
  const waiting = asks.length + needs.length + actions.filter((a) => a.state === "proposed").length;

  return (
    <aside className={layout === "page" ? "assist assist--page" : "assist"} aria-label="Assistant">
      <div className="assist__head">
        <div className="assist__mark" aria-hidden="true">
          A
        </div>
        <div style={{ minWidth: 0 }}>
          <b style={{ fontWeight: 500 }}>Alpha</b>
          <div className="assist__ctx">{scopeName}</div>
        </div>
        <span style={{ marginLeft: "auto" }} />
        {layout === "panel" ? <IconButton label="Close the assistant" icon={<ChevronRight />} onClick={() => onClose?.()} /> : null}
      </div>
      {filtered ? (
        <div className="streamfilter">
          <span className="faint">Only:</span>
          <TopicChip work={filtered} onFilter={setFilter} on />
          <Button size="sm" variant="ghost" onClick={() => setFilter(null)}>
            Show everything
          </Button>
        </div>
      ) : null}
      <div className="assist__body" ref={body} onScroll={onScroll}>
        <div className="assist__content" ref={content}>
        {module && !filter ? (
          <div className="intro">
            I'm looking at <b>{moduleWords(module)}</b>{module.children?.length ? " and what it holds" : ""}. Ask about it, tell me to add or change something, or log to it.
          </div>
        ) : null}
        {!turns.length && !module && !filter ? <div className="intro">Tell me what to keep track of, ask about anything I hold, or say what to look up. "Log two eggs", "find back-end roles on We Work Remotely", "read my job search folder". Longer work runs beside us and reports back here.</div> : null}
        {timeline}
        {loadError ? <Trouble onRetry={load}>Couldn't load the conversation: {loadError}</Trouble> : null}
        {error ? (
          <p className="notice" role="alert">
            {error}
          </p>
        ) : null}
        </div>
      </div>
      <NowStrip now={now} filter={filter} onFilter={setFilter} needsYou={waiting} />
      <Composer
        text={text}
        onChange={(words) => { spoken.stop(); setText(words); }}
        onSend={() => { spoken.stop(); void send(text); }}
        onKeyDown={key}
        onFiles={(files) => void addFiles(files)}
        canSend={Boolean(text.trim()) && !pending}
        placeholder="Say what to do, ask, or log something…"
        inputRef={input}
        mentionable={mentionable}
        onMention={mention}
        mic={{ listening: speech.listening, supported: speech.supported, onToggle: speech.toggle, onHoldStart: spoken.holdStart, onHoldEnd: spoken.holdEnd }}
        due={spoken.due ? { text: spoken.due, onStop: spoken.stop } : null}
      />
    </aside>
  );
}
