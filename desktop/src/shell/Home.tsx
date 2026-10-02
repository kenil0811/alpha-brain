/**
 * Home: what needs the person (questions Alpha asked, things it proposes, facts waiting for a
 * yes), what's coming up, and their modules. Nothing here is decoration: each card is something
 * to answer or open.
 */
import { useEffect, useState } from "react";
import type { Client, Home as HomeData, NeedItem } from "../core/client";
import { when } from "../modules/format";
import { ActionCard } from "./ActionCard";
import type { Surface } from "./Rail";

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

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
      <article className="card need">
        <h3>{item.text}</h3>
        <p className="because">
          <b>Alpha asked</b> {when(item.at)}, because the answer changes what it builds.
        </p>
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
        {error ? <p className="notice">{error}</p> : null}
      </article>
    );
  }
  if (item.kind === "proposal") {
    return (
      <article className="card need">
        <h3>{item.text}</h3>
        {item.why ? (
          <p className="because">
            <b>Because</b> {item.why}
          </p>
        ) : null}
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
      <h3>Is this right? {item.text.replace(/_/g, " ")}</h3>
      {item.why ? (
        <p className="because">
          <b>Alpha noticed</b> {item.why}
        </p>
      ) : null}
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
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    client
      .home()
      .then((h) => {
        setHome(h);
        setError(null);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [client, version]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const date = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  if (!home) {
    return (
      <div className="page">
        <div className="eyebrow">{date}</div>
        <h1>{greeting()}</h1>
        {error ? <p className="notice">{error}</p> : <p className="muted">Loading…</p>}
      </div>
    );
  }
  const next = home.coming_up[0];
  return (
    <div className="page">
      <div className="eyebrow">{date}</div>
      <h1>{greeting()}</h1>
      <div className="today">
        <div className="card tile">
          <div className="tile__lab">Needs you</div>
          <div className="tile__big num">{home.needs_you.length}</div>
          <div className="tile__sub">{home.needs_you.length ? "Questions and suggestions below" : "Nothing waiting on you"}</div>
        </div>
        <div className="card tile">
          <div className="tile__lab">Done today</div>
          <div className="tile__big num">{home.ran_today}</div>
          <div className="tile__sub">{home.failed_today ? `${home.failed_today} didn't work; see Activity` : "Things Alpha read, made and changed"}</div>
        </div>
        <div className="card tile">
          <div className="tile__lab">Coming up</div>
          <div className="tile__big">{next ? timeOf(next.starts_at) : "—"}</div>
          <div className="tile__sub">{next ? next.title : home.coming_up.length === 0 ? "Nothing on your calendar, or it isn't connected" : ""}</div>
        </div>
      </div>

      {home.needs_you.length ? (
        <div className="section" style={{ marginTop: 0 }}>
          <div className="section__head">
            <h2>Needs you</h2>
            <span className="faint">Alpha never sends anything or acts for you without a yes</span>
          </div>
          <div className="needs">
            {home.needs_you.map((item) => (
              <Need key={item.id} item={item} client={client} onDone={(words) => { setToast(words); onChanged(); }} />
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
              <div key={t.id} className="item item--thread">
                <span className={`badge badge--${t.state === "waiting" ? "waiting" : "running"}`}>{t.state === "working" ? "Working" : t.state === "waiting" ? "Needs you" : "Open"}</span>
                <div className="item__body">
                  <b>{t.title}</b>
                  <div className="item__sub">
                    {t.state === "working" ? `${t.step_count ?? 0} steps so far` : t.state === "waiting" ? "Waiting for your answer above" : "Started"} · started {when(t.created_at)}
                    {t.last_at && t.state === "working" ? ` · last ${when(t.last_at)}` : ""}
                  </div>
                  {t.state === "working" && (t.live?.doing || t.live?.thought) ? (
                    <div className="thread__now">
                      <span className="working__pulse" aria-hidden="true" />
                      <span className="shimmer">{t.live?.doing ?? "Thinking"}</span>
                      {t.live?.thought ? <span className="faint"> · {t.live.thought.slice(0, 140)}</span> : null}
                    </div>
                  ) : null}
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
            <span className="faint">From your calendar</span>
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
          <h2>Your modules</h2>
          <span className="faint">Made from what you asked for; each grows as you use it</span>
        </div>
        <div className="modgrid">
          {home.modules.map((m) => (
            <div key={m.id} className="card modcard">
              <div className="modcard__top">
                <div className="modcard__ico" aria-hidden="true">
                  ▦
                </div>
                <div style={{ minWidth: 0 }}>
                  <h3>{m.name}</h3>
                  <div className="faint">
                    {m.tables.length} {m.tables.length === 1 ? "table" : "tables"} · {m.records} {m.records === 1 ? "row" : "rows"}
                  </div>
                </div>
                <span className="pill pill--good" style={{ marginLeft: "auto" }}>
                  Active
                </span>
              </div>
              <p>{m.goal ?? m.last_text ?? "Nothing in it yet."}</p>
              <div className="modcard__foot">
                <span>{m.last_at ? `Last change ${when(m.last_at)}` : ""}</span>
                <button type="button" className="btn btn--sm" onClick={() => onGo({ kind: "module", id: m.id })}>
                  Open
                </button>
              </div>
            </div>
          ))}
          <div className="card modcard modcard--new">
            <div className="eyebrow">New</div>
            <b>Describe what you want</b>
            <p>"Track what I eat", "watch We Work Remotely for back-end roles", "read my job search folder". Alpha sets it up and grows it as you use it.</p>
            <button type="button" className="linkbtn" style={{ color: "var(--primary)", fontWeight: 500 }} onClick={onNew}>
              Start a new module →
            </button>
          </div>
        </div>
      </div>
      {home.modules.length === 0 ? (
        <div className="section">
          <div className="card card--pad">
            <div className="eyebrow">First steps</div>
            <p style={{ marginTop: 6 }}>Tell Alpha one thing you keep track of, or connect something it can read.</p>
            <div className="row" style={{ marginTop: 10 }}>
              <button type="button" className="btn" onClick={() => onAsk("I want to track what I eat")}>Track what I eat</button>
              <button type="button" className="btn" onClick={() => onGo({ kind: "intelligence", tab: "connections" })}>Connect a folder or my calendar</button>
            </div>
          </div>
        </div>
      ) : null}
      {toast ? (
        <div className="toast" role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
