/**
 * Home: what needs the person (actions waiting for a yes, questions Alpha asked, things it
 * proposes, facts to confirm), what's coming up, and their projects. Nothing here is
 * decoration: each card is something to answer or open.
 */
import { useEffect, useState } from "react";
import type { Client, Home as HomeData, NeedItem, PendingAction } from "../core/client";
import { humanize, when } from "../modules/format";
import { InfoTip, PageHeader, useToast } from "../ui";
import { FirstSteps } from "./FirstSteps";
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

/** What deciding did, in one line: the core's own outcome, never a guess. */
export function outcomeWords(a: PendingAction): string {
  if (a.state === "rejected") return "Not done. Nothing was sent.";
  if (a.state === "expired") return "Expired without a decision.";
  if (a.state === "unavailable") return `Approved, but it can't be done${a.result?.error ? `: ${a.result.error}` : ""}.`;
  if (a.result?.error) return `Tried once and it failed: ${a.result.error}`;
  return "Done.";
}

function evidence(a: PendingAction): string {
  const what = Object.entries(a.payload)
    .slice(0, 4)
    .map(([k, v]) => `${humanize(k)}: ${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join("; ");
  return `${humanize(a.kind)} through ${a.connector}, proposed ${when(a.created_at)}${a.expires_at ? `, expires ${when(a.expires_at)}` : ""}.${what ? ` Exactly: ${what}.` : ""} It runs once, only if you approve.`;
}

function Pending({ action, client, onDone }: { action: PendingAction; client: Client; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [decided, setDecided] = useState<PendingAction | null>(null);
  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    try {
      setDecided(await (approve ? client.approvePending(action.id) : client.rejectPending(action.id)));
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="card need" aria-label={action.summary}>
      <div className="need__head">
        <h3>{action.summary}</h3>
        <InfoTip content={evidence(action)} label="Why Alpha is asking" />
      </div>
      {decided ? (
        <p className={decided.state === "approved" && !decided.result?.error ? "notice notice--ok" : "notice notice--quiet"} role="status">
          {outcomeWords(decided)}
        </p>
      ) : (
        <div className="row">
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void decide(true)}>
            Approve
          </button>
          <button type="button" className="btn btn--ghost" disabled={busy} onClick={() => void decide(false)}>
            Not now
          </button>
        </div>
      )}
      {error ? <p className="notice" role="alert">{error}</p> : null}
    </article>
  );
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
          <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void act(() => client.decideProposal(item.id, true), "On it. Alpha is doing that now.")}>
            Yes, do it
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

export function Home({ client, version, onGo, onChanged, onAsk, onNew }: { client: Client; version: number; onGo: (s: Surface) => void; onChanged: () => void; onAsk: (text: string) => void; onNew: () => void }) {
  const [home, setHome] = useState<HomeData | null>(null);
  const [pending, setPending] = useState<PendingAction[]>([]);
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
    // A decided card stays on screen with its result line; only new ones are added.
    client
      .pending()
      .then((list) => setPending((shown) => [...shown.filter((a) => !list.some((b) => b.id === a.id)), ...list]))
      .catch(() => undefined);
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
  // A pending action's question is shown once, as its own card.
  const asks = new Set(pending.map((a) => a.asked));
  const needs = home.needs_you.filter((item) => !(item.kind === "ask" && asks.has(item.id)));
  const waiting = needs.length + pending.length;
  return (
    <div className="page">
      {header}
      <FirstSteps client={client} onStart={onAsk} />
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
            {pending.map((a) => (
              <Pending key={a.id} action={a} client={client} onDone={onChanged} />
            ))}
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
              <div key={t.id} className="item">
                <span className={`badge badge--${t.state === "waiting" ? "waiting" : "running"}`}>{t.state === "working" ? "Working" : t.state === "waiting" ? "Needs you" : "Open"}</span>
                <div className="item__body">
                  <b>{t.title}</b>
                  <div className="item__sub">{t.state === "working" ? "Researching and building now" : t.state === "waiting" ? "Waiting for your answer above" : "Started"} · {when(t.created_at)}</div>
                </div>
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
            <div key={m.id} className="card modcard">
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
