/**
 * Home: a single centred column with no page header bar (the UI rulebook §11). A heading block
 * (today's date and a greeting), **one Today card** (what needs the person, what Alpha
 * did, what is coming up, and what Alpha is working on), the modules as cards that open, and,
 * for a new workspace only, a few first steps. Nothing here is decoration: each card is
 * something to answer or open, and words only where the thing does not say itself (9 Oct,
 * Vikas: no subtitles, no icons in the tiles, each number with its label beside it).
 *
 * Each part loads on its own (9 Oct): the Today card from `/api/home`, the module cards from
 * `/api/modules`. A part that cannot load says what went wrong and offers Try again; the rest of
 * the page still shows.
 */
import { useEffect, useState } from "react";
import type { Client, Home as HomeData, ModuleCard, NeedItem } from "../core/client";
import { dayLabel, dayText, timeText, when } from "../modules/format";
import { ActionCard } from "./ActionCard";
import { ModuleGlyph } from "./moduleIcons";
import { OpenCard } from "./OpenCard";
import type { Surface } from "./Rail";
import { Badge, Button, InfoTip, ListRow, MetricTile, Notice, SectionCard, Trouble } from "../ui";
import { ArrowRight, ActivityIcon, Check, Eye, FolderOpen, ICON, ICON_SM, ModuleIcon, PlusIcon, Zap, X } from "../ui/icons";

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** One thing that needs the person: a question, a proposal, a suggested fact or an action. */
function Need({ item, client, onDone }: { item: NeedItem; client: Client; onDone: (words: string) => void }) {
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function act(work: () => Promise<unknown>, words: string) {
    setBusy(true);
    setError(null);
    try {
      await work();
      onDone(words);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
    return (
      <article className="today__item">
        <h4 className="today__ask">{item.text}</h4>
        {item.why ? (
          <p className="because">
            <b>Because</b> {item.why}
          </p>
        ) : null}
        <div className="row">
          <Button variant="primary" disabled={busy} onClick={() => void act(() => client.decideProposal(item.id, true), item.plan ? "Approved. Building it now; it reports in the conversation." : "Approved. Alpha is doing that now.")}>
            Approve
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void act(() => client.decideProposal(item.id, false), "Vetoed. It won't come back.")}>
            Veto
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

export function Home({ client, version, onGo, onChanged, onAsk, onNew, onOpenThread }: { client: Client; version: number; onGo: (s: Surface) => void; onChanged: () => void; onAsk: (text: string) => void; onNew: () => void; onOpenThread: (id: string) => void }) {
  const [home, setHome] = useState<HomeData | null>(null);
  const [homeError, setHomeError] = useState<string | null>(null);
  const [homeTick, setHomeTick] = useState(0);
  const [modules, setModules] = useState<ModuleCard[] | null>(null);
  const [modulesError, setModulesError] = useState<string | null>(null);
  const [modulesTick, setModulesTick] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    client
      .home()
      .then((h) => {
        if (!live) return;
        setHome(h);
        setHomeError(null);
      })
      .catch((e: unknown) => live && setHomeError(e instanceof Error ? e.message : String(e)));
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
      .catch((e: unknown) => live && setModulesError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [client, version, modulesTick]);

  const date = dayLabel(home?.date ?? new Date().toISOString());
  const next = home?.coming_up[0];
  const needs = home?.needs_you ?? [];
  const top = (modules ?? []).filter((m) => !m.parent);

  return (
    <div className="page page--home">
      <header className="home__hero">
        <div className="eyebrow">{date}</div>
        <h1 className="home__greeting">{greeting()}</h1>
      </header>

      <section className="card today" aria-label="Today">
        {homeError ? <Trouble onRetry={() => setHomeTick((n) => n + 1)}>Couldn't load today's summary: {homeError}</Trouble> : null}
        {!home && !homeError ? <p className="faint">Loading today's summary…</p> : null}
        {home ? (
          <>
            <div className="today__tiles">
              <MetricTile label="Needs you" value={needs.length} attention={needs.length > 0} basis="" />
              <MetricTile label="Done today" value={home.ran_today} basis={home.failed_today ? `${home.failed_today} didn't work` : ""} attention={home.failed_today > 0} />
              <MetricTile label="Coming up" value={next ? (next.all_day ? "All day" : timeText(new Date(next.starts_at))) : "None"} basis={next ? `${dayText(new Date(next.starts_at))} · ${next.title}` : "Calendar empty or not connected"} />
            </div>

            {message ? <Notice>{message}</Notice> : null}

            {needs.length ? (
              <div className="today__part">
                <h3 className="today__title">
                  Needs you <InfoTip text="Alpha never sends anything or acts for you without a yes." />
                </h3>
                {needs.map((item) => (
                  <Need key={item.id} item={item} client={client} onDone={(words) => { setMessage(words); onChanged(); }} />
                ))}
              </div>
            ) : (
              <p className="today__quiet">Nothing needs you right now.</p>
            )}

            {home.threads.length ? (
              <div className="today__part">
                <h3 className="today__title">Alpha is working on</h3>
                {home.threads.map((t) => (
                  <ListRow
                    key={t.id}
                    icon={<Zap size={ICON} />}
                    title={t.title}
                    description={
                      <>
                        {t.state === "working" ? `${t.step_count ?? 0} steps · ` : ""}
                        {when(t.created_at)}
                      </>
                    }
                    controls={
                      <>
                        <Badge tone={t.state === "waiting" ? "warn" : "info"}>{t.state === "working" ? "Working" : t.state === "waiting" ? "Needs you" : "Open"}</Badge>
                        <Button size="sm" onClick={() => onOpenThread(t.id)}>
                          Open
                        </Button>
                        <Button size="sm" variant="ghost" disabledReason="Stop it from its conversation: open it and press Stop there.">
                          Stop
                        </Button>
                      </>
                    }
                  >
                    {t.state === "working" && (t.live?.doing || t.live?.thought) ? (
                      <div className="thread__now">
                        <span className="working__pulse" aria-hidden="true" />
                        <span>{t.live?.doing ?? "Thinking"}</span>
                        {t.live?.thought ? <span className="faint"> · {t.live.thought.slice(0, 140)}</span> : null}
                      </div>
                    ) : null}
                    {t.steps?.length ? (
                      <ul className="stages thread__live" aria-label="What Alpha did lately">
                        {t.steps.map((s, i) => (
                          <li key={`${s.at}-${i}`} className={s.kind === "failed" ? "notice" : ""}>
                            {s.kind === "failed" ? <X size={ICON_SM} aria-label="failed" /> : s.kind === "saw" ? <Eye size={ICON_SM} aria-label="read" /> : <Check size={ICON_SM} aria-label="done" />} {s.text}
                          </li>
                        ))}
                      </ul>
                    ) : t.state === "working" ? (
                      <div className="lrow__desc">Starting…</div>
                    ) : null}
                  </ListRow>
                ))}
              </div>
            ) : null}
          </>
        ) : null}
      </section>

      <section className="home__modules" aria-label="Your modules">
        <h2 className="sectitle">Modules</h2>
        {modulesError ? <Trouble onRetry={() => setModulesTick((n) => n + 1)}>Couldn't load your modules: {modulesError}</Trouble> : null}
        {!modules && !modulesError ? <p className="faint">Loading modules…</p> : null}
        <div className="modgrid">
          {top.map((m) => (
            <OpenCard
              key={m.id}
              icon={<ModuleGlyph id={m.id} size={ICON} />}
              name={m.name}
              description={m.goal ?? ""}
              meta={[`${m.records} ${m.records === 1 ? "record" : "records"}`, m.children?.length ? `${m.children.length} inside` : ""].filter(Boolean).join(" · ")}
              onOpen={() => onGo({ kind: "module", id: m.id })}
            />
          ))}
          <OpenCard dashed icon={<PlusIcon size={ICON} />} name="New" description="" openLabel="Start a new module" onOpen={onNew} />
        </div>
      </section>

      {modules && modules.length === 0 ? (
        <SectionCard title="First steps">
          <ListRow icon={<ModuleIcon size={ICON} />} title="Track what I eat" controls={<Button size="sm" onClick={() => onAsk("I want to track what I eat")}>Start</Button>} />
          <ListRow icon={<FolderOpen size={ICON} />} title="Connect a folder or my calendar" controls={<Button size="sm" onClick={() => onGo({ kind: "intelligence", tab: "connections" })}>Open <ArrowRight size={ICON_SM} aria-hidden="true" /></Button>} />
          <ListRow icon={<ActivityIcon size={ICON} />} title="Describe something new" controls={<Button size="sm" onClick={onNew}>Start</Button>} />
        </SectionCard>
      ) : null}
    </div>
  );
}
