/**
 * Home: a header like every page's — the greeting and date on the left, the next event on the right
 * (the owner, 11 Oct) — then a grid of cards (the owner, 12 Oct; the UI rulebook §11): the one
 * place where what matters now shows. Each card has a purpose, written as its title; every item
 * has its action; cards have one of three fixed heights and fill the width, most urgent first
 * (`homeCards.ts` decides which cards and how big). Extra items fold into "N more", which opens
 * the card's page; Needs you's page is `NeedsPage` (every proposal in full).
 *
 * Each part loads on its own (9 Oct): today from `/api/home`, the projects from `/api/modules`,
 * the goals from `/api/intelligence`. A part that cannot load says so with Try again; the rest
 * still shows.
 */
import { useEffect, useState, type ReactNode } from "react";
import { PlanPieces, PlanQuestions, defaultAnswers, defaultDecisions } from "../assistant/AssistantPanel";
import { say } from "../core/client";
import type { Client, Goal, Home as HomeData, JournalEntry, ModuleCard, NeedItem } from "../core/client";
import { dayLabel, dayText, timeText, when } from "../modules/format";
import { ActionCard } from "./ActionCard";
import { homeCards, type HomeCard } from "./homeCards";
import { ModuleGlyph } from "./moduleIcons";
import type { Surface } from "./Rail";
import { Button, IconButton, InfoTip, ListRow, Notice, PageHeader, SectionCard, Trouble } from "../ui";
import { ArrowRight, ActivityIcon, Check, FolderOpen, ICON, ICON_SM, ModuleIcon, PlusIcon, X } from "../ui/icons";

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** One thing that needs the person: a question, a proposal, a suggested fact or an action. */
export function Need({ item, client, onDone }: { item: NeedItem; client: Client; onDone: (words: string) => void }) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>(() => defaultAnswers(item.kind === "proposal" ? (item.questions ?? []) : []));
  const [decisions, setDecisions] = useState<Record<string, string>>(() => defaultDecisions(item.kind === "proposal" ? (item.pieces ?? []) : []));
  const [error, setError] = useState<string | null>(null);
  async function act(work: () => Promise<unknown>, words: string) {
    setBusy(true);
    setError(null);
    try {
      await work();
      onDone(words);
    } catch (e) {
      setError(say(e));
    } finally {
      setBusy(false);
    }
  }
  if (item.kind === "action" && item.action) {
    return <ActionCard action={item.action} client={client} onDecided={(note) => { onDone(note); }} />;
  }
  if (item.kind === "ask") {
    return (
      <article className="today__item">
        <h4 className="today__ask">{item.text}</h4>
        <p className="because faint">{when(item.at)}</p>
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (answer.trim()) void act(() => client.answerAsk(item.id, answer.trim()), "Answered."); }}>
          {item.options?.length ? (
            item.options.map((o) => (
              <Button key={o} disabled={busy} onClick={() => void act(() => client.answerAsk(item.id, o), "Answered.")}>
                {o}
              </Button>
            ))
          ) : (
            <>
              <input className="textfield today__input" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer" aria-label="Your answer" />
              <Button variant="primary" type="submit" disabled={busy || !answer.trim()}>
                Answer
              </Button>
            </>
          )}
          <Button variant="ghost" disabled={busy} onClick={() => void act(() => client.dismissAsk(item.id), "Dismissed.")}>
            Dismiss
          </Button>
        </form>
        {error ? <Notice tone="bad">{error}</Notice> : null}
      </article>
    );
  }
  if (item.kind === "proposal") {
    const questions = item.questions ?? [];
    const pieces = item.pieces ?? [];
    const decided = questions.length || pieces.length;
    return (
      <article className="today__item">
        <h4 className="today__ask">{item.text}</h4>
        {item.why ? (
          <p className="because">
            <b>Because</b> {item.why}
          </p>
        ) : null}
        {pieces.length ? <PlanPieces pieces={pieces} decisions={decisions} onChange={setDecisions} /> : null}
        {questions.length ? <PlanQuestions questions={questions} answers={answers} onChange={setAnswers} /> : null}
        <div className="row">
          <Button variant="primary" disabled={busy} onClick={() => void act(() => (item.plan && decided ? client.approvePlan(item.plan, questions.length ? answers : undefined, pieces.length ? decisions : undefined) : client.decideProposal(item.id, true)), item.plan ? "Approved. Building it now; it reports in the conversation." : "Approved. Alpha is doing that now.")}>
            Approve
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void act(() => client.decideProposal(item.id, false), "Declined. It won't come back.")}>
            Decline
          </Button>
        </div>
        {error ? <Notice tone="bad">{error}</Notice> : null}
      </article>
    );
  }
  return (
    <article className="today__item">
      <h4 className="today__ask">Is this right? {item.text.replace(/_/g, " ")}</h4>
      {item.why ? (
        <p className="because">
          <b>Alpha noticed</b> {item.why}
        </p>
      ) : null}
      <div className="row">
        <Button variant="primary" disabled={busy} onClick={() => void act(() => client.decideFact(item.id, true), "Remembered.")}>
          Remember
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void act(() => client.decideFact(item.id, false), "Forgotten.")}>
          Forget
        </Button>
      </div>
      {error ? <Notice tone="bad">{error}</Notice> : null}
    </article>
  );
}

/** Today's failures, newest first: the journal's `failed` entries since local midnight. */
export function failedToday(entries: JournalEntry[], now = new Date()): JournalEntry[] {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return entries.filter((e) => e.kind === "failed" && new Date(e.at).getTime() >= midnight);
}

/** One line of a card: what it is (one line, the whole text on hover), a detail, its actions. */
function Item({ title, detail, onOpen, children }: { title: string; detail?: string; onOpen?: () => void; children?: ReactNode }) {
  return (
    <li className="hitem">
      <div className="hitem__text">
        {onOpen ? (
          <button type="button" className="hitem__title hitem__title--open" title={title} onClick={onOpen}>
            {title}
          </button>
        ) : (
          <span className="hitem__title" title={title}>
            {title}
          </span>
        )}
        {detail ? <span className="hitem__detail" title={detail}>{detail}</span> : null}
      </div>
      {children ? <div className="hitem__acts">{children}</div> : null}
    </li>
  );
}

/** Runs one action of a card and reports it in a sentence (or the error, in plain words). */
function useAct(onDone: (words: string) => void) {
  const [busy, setBusy] = useState(false);
  return {
    busy,
    act: async (work: () => Promise<unknown>, words: string) => {
      setBusy(true);
      try {
        await work();
        onDone(words);
      } catch (e) {
        onDone(say(e));
      } finally {
        setBusy(false);
      }
    },
  };
}

/** A need on a card: answered in place when it fits one line (a yes/no, a short choice, a guess
 *  to check); otherwise Review opens Needs you, where it shows in full. */
function NeedLine({ item, client, onDone, onReview }: { item: NeedItem; client: Client; onDone: (words: string) => void; onReview: () => void }) {
  const { busy, act } = useAct(onDone);
  const detail = [item.why, when(item.at)].filter(Boolean).join(" · ");
  if (item.kind === "fact")
    return (
      <Item title={`Is this right? ${item.text.replace(/_/g, " ")}`} detail={item.why ?? undefined}>
        <IconButton size="sm" label="Approve" icon={<Check size={ICON_SM} />} disabled={busy} onClick={() => void act(() => client.decideFact(item.id, true), "Remembered.")} />
        <IconButton size="sm" label="Reject" icon={<X size={ICON_SM} />} disabled={busy} onClick={() => void act(() => client.decideFact(item.id, false), "Forgotten.")} />
      </Item>
    );
  if (item.kind === "ask" && item.options?.length && item.options.length <= 2)
    return (
      <Item title={item.text} detail={detail}>
        {item.options.map((o) => (
          <Button key={o} size="sm" disabled={busy} onClick={() => void act(() => client.answerAsk(item.id, o), "Answered.")}>
            {o}
          </Button>
        ))}
      </Item>
    );
  if (item.kind === "proposal" && !item.plan && !item.questions?.length && !item.pieces?.length)
    return (
      <Item title={item.text} detail={detail}>
        <Button size="sm" variant="primary" disabled={busy} onClick={() => void act(() => client.decideProposal(item.id, true), "Approved. Alpha is doing that now.")}>
          Approve
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(() => client.decideProposal(item.id, false), "Declined. It won't come back.")}>
          Decline
        </Button>
      </Item>
    );
  return (
    <Item title={item.kind === "action" && item.action ? item.text || "Alpha wants to act for you" : item.text} detail={detail}>
      <Button size="sm" variant="primary" onClick={onReview}>
        {item.kind === "ask" ? "Answer" : "Review"}
      </Button>
    </Item>
  );
}

/** A failure on a card: what it was (opens its entry), when and why, with Open and Try again
 *  where the journal says what it touched (an agent's run reruns; a conversation or a project opens). */
function FailureLine({ e, client, onGo, onOpenThread, onDone }: { e: JournalEntry; client: Client; onGo: (s: Surface) => void; onOpenThread: (id: string) => void; onDone: (words: string) => void }) {
  const { busy, act } = useAct(onDone);
  const automation = typeof e.data.automation === "string" ? e.data.automation : null;
  const reason = [e.data.error, e.data.why].find((r): r is string => typeof r === "string" && r.trim() !== "" && !e.text.includes(r));
  const open = automation ? () => onGo({ kind: "automation", id: automation }) : e.thread ? () => onOpenThread(e.thread!) : e.module ? () => onGo({ kind: "module", id: e.module! }) : null;
  return (
    <Item title={e.text} detail={[timeText(new Date(e.at)), reason].filter(Boolean).join(" · ")} onOpen={() => onGo({ kind: "entry", id: e.id })}>
      {automation ? (
        <Button size="sm" variant="primary" disabled={busy} onClick={() => void act(() => client.runAutomation(automation), "Running it again; it reports in Activity.")}>
          Try again
        </Button>
      ) : null}
      {open ? (
        <Button size="sm" onClick={open}>
          Open
        </Button>
      ) : null}
    </Item>
  );
}

/** One card: its objective as the title, the items, and "N more" to its page. */
function Card({ card, onGo, children }: { card: HomeCard; onGo: (s: Surface) => void; children: ReactNode }) {
  return (
    <section className={`card hcard hcard--${card.size}${card.wide ? " hcard--wide" : ""}`} aria-label={card.objective} data-card={card.kind}>
      <h3 className="hcard__title" title={card.objective}>
        {card.objective}
      </h3>
      {children}
      {card.more && card.opens ? (
        <Button size="sm" variant="ghost" className="hcard__more" onClick={() => onGo(card.opens!)}>
          {card.more} more <ArrowRight size={ICON_SM} aria-hidden="true" />
        </Button>
      ) : null}
    </section>
  );
}

const NOTHING_YET: HomeData = { date: "", needs_you: [], ran_today: 0, failed_today: 0, modules: [], loose_tables: [], coming_up: [], threads: [], brief: null };

export function Home({ setup, client, version, onGo, onChanged, onAsk, onNew, onOpenThread }: { setup?: ReactNode; client: Client; version: number; onGo: (s: Surface) => void; onChanged: () => void; onAsk: (text: string) => void; onNew: () => void; onOpenThread: (id: string) => void }) {
  const [home, setHome] = useState<HomeData | null>(null);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [homeTick, setHomeTick] = useState(0);
  const [modules, setModules] = useState<ModuleCard[] | null>(null);
  const [modulesError, setModulesError] = useState<string | null>(null);
  const [modulesTick, setModulesTick] = useState(0);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [failures, setFailures] = useState<JournalEntry[]>([]);
  const failedCount = home?.failed_today ?? 0;
  // ponytail: the newest 300 entries; a day with more than that names only its latest failures
  useEffect(() => {
    if (!failedCount) {
      setFailures([]);
      return;
    }
    let live = true;
    client
      .activity({ limit: 300 })
      .then((rows) => live && setFailures(failedToday(rows)))
      .catch(() => live && setFailures([])); // the count still says how many
    return () => {
      live = false;
    };
  }, [client, version, failedCount]);
  useEffect(() => {
    let live = true;
    client
      .home()
      .then((h) => {
        if (!live) return;
        setHome(h);
        setHomeError(null);
      })
      .catch((e: unknown) => live && setHomeError(say(e)));
    return () => {
      live = false;
    };
  }, [client, version, homeTick]);
  useEffect(() => {
    let live = true;
    client
      .modules()
      .then((m) => {
        if (!live) return;
        setModules(m);
        setModulesError(null);
      })
      .catch((e: unknown) => live && setModulesError(say(e)));
    return () => {
      live = false;
    };
  }, [client, version, modulesTick]);
  useEffect(() => {
    let live = true;
    // goals are one card among many: without them Home still shows the rest
    Promise.resolve(client.intelligence?.())
      .then((i) => live && setGoals(i?.knowledge.goals ?? []))
      .catch(() => live && setGoals([]));
    return () => {
      live = false;
    };
  }, [client, version]);

  const date = dayLabel(home?.date ?? new Date().toISOString());
  const next = home?.coming_up[0];
  const done = (words: string) => {
    setMessage(words);
    onChanged();
  };
  // the projects show even while today's summary can't load
  const cards = homeCards({ home: home ?? NOTHING_YET, failures, goals, modules: modules ?? [] });
  const urgent = cards.some((c) => c.kind !== "project" && c.kind !== "done" && c.kind !== "goals");

  function body(card: HomeCard): ReactNode {
    switch (card.kind) {
      case "needs":
      case "hypotheses":
        return (
          <ul className="hcard__items">
            {card.items.map((item) => (
              <NeedLine key={item.id} item={item} client={client} onDone={done} onReview={() => onGo({ kind: "needs" })} />
            ))}
          </ul>
        );
      case "failed":
        return (
          <ul className="hcard__items">
            {card.items.map((e) => (
              <FailureLine key={e.id} e={e} client={client} onGo={onGo} onOpenThread={onOpenThread} onDone={done} />
            ))}
          </ul>
        );
      case "today":
        return (
          <ul className="hcard__items">
            {card.items.map((e) => {
              const at = e.all_day ? "All day" : timeText(new Date(e.starts_at));
              return (
                <Item key={e.id} title={e.title} detail={[at, e.location].filter(Boolean).join(" · ")}>
                  <Button size="sm" onClick={() => onAsk(`Help me get ready for "${e.title}" (${at} today).`)}>
                    Prepare
                  </Button>
                </Item>
              );
            })}
          </ul>
        );
      case "working":
        return (
          <ul className="hcard__items">
            {card.items.map((t) => (
              <Item key={t.id} title={t.title} detail={t.state === "working" ? (t.live?.doing ?? `${t.step_count ?? 0} steps`) : t.state === "waiting" ? "Needs you" : when(t.created_at)}>
                <Button size="sm" variant={t.state === "waiting" ? "primary" : undefined} onClick={() => onOpenThread(t.id)}>
                  Open
                </Button>
              </Item>
            ))}
          </ul>
        );
      case "goals":
        return (
          <ul className="hcard__items">
            {card.items.map((g) => (
              <Item key={g.id} title={g.text} detail={g.module ? (modules ?? []).find((m) => m.id === g.module)?.name : undefined}>
                <Button size="sm" onClick={() => onAsk(`What's the next step toward my goal "${g.text}"?`)}>
                  Next step
                </Button>
              </Item>
            ))}
          </ul>
        );
      case "done":
        return (
          <div className="hcard__number">
            <span className="hcard__big">{card.count.toLocaleString()}</span>
            <span className="hcard__unit">{card.count === 1 ? "thing done today" : "things done today"}</span>
            <Button size="sm" className="hcard__act" onClick={() => onGo({ kind: "activity" })}>
              See all
            </Button>
          </div>
        );
      case "project": {
        const m = card.items[0];
        return (
          <div className="hcard__project">
            <span className="hcard__ico" aria-hidden="true">
              <ModuleGlyph id={m.id} name={m.name} goal={m.goal} size={ICON} />
            </span>
            <span className="hcard__detail" title={m.last_text ?? m.goal ?? ""}>
              {[`${m.records} ${m.records === 1 ? "record" : "records"}`, m.last_text ?? m.goal].filter(Boolean).join(" · ")}
            </span>
            <Button size="sm" className="hcard__act" aria-label={`Open ${m.name}`} onClick={() => onGo({ kind: "module", id: m.id })}>
              Open
            </Button>
          </div>
        );
      }
    }
  }

  return (
    <>
      <PageHeader
        left={<div className="home__head"><span className="home__greeting serif">{greeting()}</span><span className="home__date">{date}</span></div>}
        right={
          next ? (
            <div className="home__next">
              <span className="home__nextwhen">{next.all_day ? `${dayText(new Date(next.starts_at))}, all day` : `${dayText(new Date(next.starts_at))}, ${timeText(new Date(next.starts_at))}`}</span>
              <span className="home__nexttitle">{next.title}</span>
            </div>
          ) : home ? (
            <span className="home__next home__next--none">No events coming up <InfoTip text="From the calendar connected in Intelligence › Connections." /></span>
          ) : undefined
        }
      />
      <div className="page page--home">
        {setup}
        {homeError ? <Trouble onRetry={() => setHomeTick((n) => n + 1)}>Couldn't load today's summary: {homeError}</Trouble> : null}
        {modulesError ? <Trouble onRetry={() => setModulesTick((n) => n + 1)}>Couldn't load your projects: {modulesError}</Trouble> : null}
        {!home && !homeError ? <p className="faint">Loading today…</p> : null}
        {message ? <Notice>{message}</Notice> : null}
        {home && !urgent ? <p className="today__quiet">Nothing needs you right now.</p> : null}
        <div className="hgrid">
          {cards.map((c) => (
            <Card key={c.id} card={c} onGo={onGo}>
              {body(c)}
            </Card>
          ))}
          {modules ? (
            <section className="card hcard hcard--s hcard--new" aria-label="New project">
              <h3 className="hcard__title">Start something new</h3>
              <div className="hcard__project">
                <span className="hcard__ico" aria-hidden="true">
                  <PlusIcon size={ICON} />
                </span>
                <span className="hcard__detail">A project for anything you want to track</span>
                <Button size="sm" className="hcard__act" aria-label="Start a new project" onClick={onNew}>
                  New project
                </Button>
              </div>
            </section>
          ) : null}
        </div>

        {modules && modules.length === 0 ? (
          <SectionCard title="First steps">
            <ListRow icon={<ModuleIcon size={ICON} />} title="Track what I eat" controls={<Button size="sm" onClick={() => onAsk("I want to track what I eat")}>Start</Button>} />
            <ListRow icon={<FolderOpen size={ICON} />} title="Connect a folder or my calendar" controls={<Button size="sm" onClick={() => onGo({ kind: "intelligence", tab: "connections" })}>Open <ArrowRight size={ICON_SM} aria-hidden="true" /></Button>} />
            <ListRow icon={<ActivityIcon size={ICON} />} title="Describe something new" controls={<Button size="sm" onClick={onNew}>Start</Button>} />
          </SectionCard>
        ) : null}
      </div>
    </>
  );
}

/** Needs you, in full (Home's card opens it): every question, proposal, guess and action. */
export function NeedsPage({ client, version, onChanged }: { client: Client; version: number; onChanged: () => void }) {
  const [home, setHome] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    client
      .home()
      .then((h) => live && (setHome(h), setError(null)))
      .catch((e: unknown) => live && setError(say(e)));
    return () => {
      live = false;
    };
  }, [client, version, tick]);
  const needs = home?.needs_you ?? [];
  return (
    <>
      <PageHeader title="Needs you" />
      <div className="page page--needs">
        {error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't load what needs you: {error}</Trouble> : null}
        {message ? <Notice>{message}</Notice> : null}
        {home && !needs.length ? <p className="today__quiet">Nothing needs you right now.</p> : null}
        {needs.length ? (
          <div className="card today">
            {needs.map((item) => (
              <Need key={item.id} item={item} client={client} onDone={(words) => { setMessage(words); onChanged(); }} />
            ))}
          </div>
        ) : null}
      </div>
    </>
  );
}
