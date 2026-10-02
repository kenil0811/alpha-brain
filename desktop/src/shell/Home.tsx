/**
 * Home: what needs the person (actions waiting for a yes, questions Alpha asked, things it
 * proposes, facts to confirm), what's coming up, and their projects. Nothing here is
 * decoration: each card is something to answer or open.
 */
import { useEffect, useState } from "react";
import type { Client, Home as HomeData, NeedItem } from "../core/client";
import { when } from "../modules/format";
import { isOwnClick } from "../dataviews/cells";
import { InfoTip, PageHeader, useToast } from "../ui";
import { ActionCard } from "./ActionCard";
import { projectIcon } from "./projectIcons";
import type { Surface } from "./Rail";

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function ago(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function Need({ item, client, onDone }: { item: NeedItem; client: Client; onDone: (words: string) => void }) {
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
      <article className="card need">
        <h3>{item.text}</h3>
        <p className="because">Alpha asked {when(item.at)}</p>
        <form className="row" onSubmit={(e) => { e.preventDefault(); if (answer.trim()) void act(() => client.answerAsk(item.id, answer.trim()), "Answered."); }}>
          {item.options?.length ? (
            item.options.map((o) => (
              <button key={o} type="button" className="btn" disabled={busy} onClick={() => void act(() => client.answerAsk(item.id, o), "Answered.")}>
                {o}
              </button>
            ))
          ) : (
            <>
              <input className="need__input" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer" aria-label="Your answer" />
              <button type="submit" className="btn btn--primary" disabled={busy || !answer.trim()}>
                Answer
              </button>
            </>
          )}
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void act(() => client.dismissAsk(item.id), "Dismissed.")}>
            Dismiss
          </button>
        </form>
        {error ? <p className="notice" role="alert">{error}</p> : null}
      </article>
    );
  }
  if (item.kind === "proposal") {
    return (
      <article className="card need">
        <div className="need__head">
          <h3>{item.text}</h3>
          {item.why ? <InfoTip content={item.why} label="Why Alpha suggests this" /> : null}
        </div>
        <div className="row">
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void act(() => client.decideProposal(item.id, true), item.plan ? "Building it now. It reports in the conversation." : "On it. Alpha is doing that now.")}>
            {item.plan ? "Build it" : "Yes, do it"}
          </button>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void act(() => client.decideProposal(item.id, false), "Noted. It won't come back.")}>
            Not now
          </button>
        </div>
        {error ? <p className="notice">{error}</p> : null}
      </article>
    );
  }
  return (
    <article className="card need">
      <div className="need__head">
        <h3>Is this right? {item.text.replace(/_/g, " ")}</h3>
        {item.why ? <InfoTip content={item.why} label="What Alpha noticed" /> : null}
      </div>
      <div className="row">
        <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void act(() => client.decideFact(item.id, true), "Remembered.")}>
          Yes, remember it
        </button>
        <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void act(() => client.decideFact(item.id, false), "Forgotten.")}>
          No
        </button>
      </div>
      {error ? <p className="notice">{error}</p> : null}
    </article>
  );
}

export function Home({ client, version, onGo, onChanged, onAsk, onNew, onOpenThread }: { client: Client; version: number; onGo: (s: Surface) => void; onChanged: () => void; onAsk: (text: string) => void; onNew: () => void; onOpenThread: (id: string) => void }) {
  const [home, setHome] = useState<HomeData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  useEffect(() => {
    client
      .home()
      .then((h) => {
        setHome(h);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [client, version]);

  const date = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const header = (
    <PageHeader
      title={
        <>
          {greeting()} <InfoTip content="Open a project to work with its records, or describe a new one." label="About this page" />
        </>
      }
      right={<span className="muted">{date}</span>}
    />
  );
  if (!home) {
    return (
      <div className="page">
        {header}
        {error ? (
          <p className="notice" role="alert">
            Projects could not be loaded: {error}
          </p>
        ) : (
          <p className="muted">Loading projects…</p>
        )}
      </div>
    );
  }
  const next = home.coming_up[0];
  const needs = home.needs_you;
  const waiting = needs.length;
  return (
    <div className="page">
      {header}
      <div className="today" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <div className="card tile">
          <div className="tile__lab">Projects</div>
          <div className="tile__big num">{home.modules.length}</div>
          <div className="tile__sub">{home.modules.length ? "Ready to use on this Mac" : "Describe what you want to make the first one"}</div>
        </div>
        <div className="card tile">
          <div className="tile__lab">
            Ran today <InfoTip content="Things Alpha read, made and changed today." label="About ran today" />
          </div>
          <div className="tile__big num">{home.ran_today}</div>
          <div className="tile__sub">{home.failed_today ? `${home.failed_today} didn't work` : home.ran_today ? `${home.ran_today} finished fine` : "Nothing has run yet today"}</div>
        </div>
        <div className="card tile">
          <div className="tile__lab">Needs you</div>
          <div className="tile__big num">{waiting}</div>
          <div className="tile__sub">
            {waiting ? (
              <button type="button" className="linkbtn linkbtn--primary" onClick={() => document.getElementById("needs-you")?.scrollIntoView({ behavior: "smooth" })}>
                See what
              </button>
            ) : (
              "Nothing is waiting on you"
            )}
          </div>
        </div>
        <div className="card tile">
          <div className="tile__lab">Coming up</div>
          <div className="tile__big">{next ? timeOf(next.starts_at) : "—"}</div>
          <div className="tile__sub">{next ? next.title : "Nothing on your calendar"}</div>
        </div>
      </div>

      {waiting ? (
        <div className="section section--first" id="needs-you">
          <div className="section__head">
            <h2>Needs you</h2>
            <InfoTip content="Alpha never sends anything or acts for you without a yes." label="About needs you" />
          </div>
          <div className="needs">
            {needs.map((item) => (
              <Need key={item.id} item={item} client={client} onDone={(words) => { toast.show(words); onChanged(); }} />
            ))}
          </div>
        </div>
      ) : null}

      {home.threads.length ? (
        <div className="section">
          <div className="section__head">
            <h2>Alpha is working on</h2>
          </div>
          <div className="card list">
            {home.threads.map((t) => (
              <div key={t.id} className="item item--thread item--open" onClick={(e) => isOwnClick(e) && onOpenThread(t.id)}>
                <span className={`badge badge--${t.state === "waiting" ? "waiting" : "running"}`}>{t.state === "working" ? "Working" : t.state === "waiting" ? "Needs you" : "Open"}</span>
                <div className="item__body">
                  <b>{t.title}</b>
                  <div className="item__sub">
                    {t.state === "working" ? `${t.step_count ?? 0} steps so far` : t.state === "waiting" ? "Waiting for your answer above" : "Started"} · started {when(t.created_at)}
                    {t.last_at && t.state === "working" ? ` · last ${when(t.last_at)}` : ""}
                  </div>
                  {t.steps?.length ? (
                    <ul className="stages thread__live" aria-label="What Alpha did lately">
                      {t.steps.map((s, i) => (
                        <li key={`${s.at}-${i}`} className={s.kind === "failed" ? "notice" : ""}>
                          {s.kind === "failed" ? "✗" : s.kind === "saw" ? "👁" : "✓"} {s.text}
                        </li>
                      ))}
                    </ul>
                  ) : t.state === "working" ? (
                    <div className="item__sub">Starting…</div>
                  ) : null}
                </div>
                <button type="button" className="btn btn--sm" onClick={() => onOpenThread(t.id)}>
                  Open
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {home.coming_up.length ? (
        <div className="section">
          <div className="section__head">
            <h2>Coming up</h2>
          </div>
          <div className="card list">
            {home.coming_up.map((e) => (
              <div key={e.id} className="item">
                <span className="item__when num">{e.all_day ? "All day" : timeOf(e.starts_at)}</span>
                <div className="item__body">
                  <b>{e.title}</b>
                  {e.attendees.length ? <div className="item__sub">with {e.attendees.map((a) => a.name ?? a.email).slice(0, 4).join(", ")}</div> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="section">
        <div className="section__head">
          <h2>Your projects</h2>
          <InfoTip content="Made from what you asked for; each grows as you use it." label="About projects" />
          <div className="section__right">
            <button type="button" className="linkbtn linkbtn--primary" onClick={() => onGo({ kind: "activity" })}>
              See all activity
            </button>
          </div>
        </div>
        <div className="modgrid">
          {home.modules.map((m) => {
            const Icon = projectIcon(m);
            return (
            // A click anywhere on the card opens the project; the button is its keyboard way in.
            <div key={m.id} className="card modcard modcard--open" onClick={(e) => isOwnClick(e) && onGo({ kind: "module", id: m.id })}>
              <div className="modcard__top">
                <div className="modcard__ico" aria-hidden="true">
                  <Icon size={18} />
                </div>
                <div className="modcard__name">
                  <h3>
                    {m.name}
                    {m.goal ? <> <InfoTip content={m.goal} label={`About ${m.name}`} /></> : null}
                  </h3>
                  <div className="faint">
                    {m.tables.length} {m.tables.length === 1 ? "table" : "tables"} · {m.records} {m.records === 1 ? "row" : "rows"}
                  </div>
                </div>
              </div>
              <p className="modcard__line">{m.last_text ?? "Nothing in it yet."}</p>
              <div className="modcard__foot">
                <span>{m.last_at ? `Last change ${when(m.last_at)}` : `Made ${ago(m.created_at)}`}</span>
                <button type="button" className="linkbtn linkbtn--primary" aria-label={`Open ${m.name}`} onClick={() => onGo({ kind: "module", id: m.id })}>
                  Open project →
                </button>
              </div>
            </div>
            );
          })}
          <div className="card modcard modcard--new">
            <div className="need__head">
              <b>New project</b>
              <InfoTip content={'"Track what I eat", "watch We Work Remotely for back-end roles", "read my job search folder". Alpha sets it up and grows it as you use it.'} label="Examples" />
            </div>
            <button type="button" className="linkbtn linkbtn--primary" onClick={onNew}>
              Start a new project →
            </button>
          </div>
        </div>
      </div>
      {home.modules.length === 0 ? (
        <div className="section">
          <div className="card card--pad stack">
            <p className="page__line">Tell Alpha one thing you keep track of, or connect something it can read.</p>
            <div className="row">
              <button type="button" className="btn" onClick={() => onAsk("I want to track what I eat")}>Track what I eat</button>
              <button type="button" className="btn" onClick={() => onGo({ kind: "intelligence", tab: "connections" })}>Connect a folder or my calendar</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
