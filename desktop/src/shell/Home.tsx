/**
 * Home: what needs the person (questions Alpha asked, things it proposes, facts waiting for a
 * yes), what's coming up, and their modules. Nothing here is decoration: each card is something
 * to answer or open.
 */
import { useEffect, useState } from "react";
import { AskGroup, WorkflowCard } from "../assistant/AssistantPanel";
import type { Ask, Client, Home as HomeData, JournalEntry, NeedItem } from "../core/client";
import { when } from "../modules/format";
import { ActionCard } from "./ActionCard";
import type { Surface } from "./Rail";
import { Badge, Button, IconButton } from "../ui";
import { ModuleIcon, ArrowRight, Check, X, Eye } from "../ui/icons";

/** Questions asked in one turn are one card with one Answer; everything else stands alone. */
export function groupNeeds(items: NeedItem[]): NeedItem[][] {
  const groups: NeedItem[][] = [];
  const byTurn = new Map<string, NeedItem[]>();
  items.forEach((item) => {
    const key = item.kind === "ask" && item.turn ? item.turn : null;
    const found = key ? byTurn.get(key) : undefined;
    if (found) found.push(item);
    else {
      const group = [item];
      if (key) byTurn.set(key, group);
      groups.push(group);
    }
  });
  return groups;
}

function askOf(item: NeedItem): Ask {
  return { id: item.id, text: item.text, at: item.at, options: item.options ?? [], thread: null, module: item.module ?? null, turn: item.turn ?? null };
}

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

/** Today's failures, newest first: the journal's `failed` entries since local midnight. */
export function failedToday(entries: JournalEntry[], now = new Date()): JournalEntry[] {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return entries.filter((e) => e.kind === "failed" && new Date(e.at).getTime() >= midnight).sort((a, b) => b.at.localeCompare(a.at));
}

/** The failures the person cleared from Home. Only Home forgets them: Activity keeps every one. */
const DISMISSED = "home_dismissed";

/** One thing that didn't work: when, what, why, and what can be done about it. Try again starts
 *  an automation's run again; Open goes where the journal says it happened; Dismiss clears it
 *  from Home. */
function Failure({ e, client, onGo, onOpenThread, onDismiss, onDone }: { e: JournalEntry; client: Client; onGo: (s: Surface) => void; onOpenThread: (id: string) => void; onDismiss: () => void; onDone: (words: string) => void }) {
  const [busy, setBusy] = useState(false);
  const automation = typeof e.data.automation === "string" ? e.data.automation : null;
  const reason = [e.data.error, e.data.why].find((r): r is string => typeof r === "string" && r.trim() !== "" && !e.text.includes(r));
  const open = automation ? () => onGo({ kind: "automation", id: automation }) : e.thread ? () => onOpenThread(e.thread!) : e.module ? () => onGo({ kind: "module", id: e.module! }) : null;
  async function again() {
    if (!automation) return;
    setBusy(true);
    try {
      await client.runAutomation(automation);
      onDone("Running it again; it reports in Activity.");
    } catch (err) {
      onDone(`Couldn't start it again: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="item">
      <span className="item__when num">{timeOf(e.at)}</span>
      <div className="item__body">
        <b>{e.text}</b>
        {reason ? <div className="item__sub">{reason}</div> : null}
      </div>
      {automation ? (
        <Button size="sm" variant="primary" disabled={busy} onClick={() => void again()}>
          Try again
        </Button>
      ) : null}
      {open ? (
        <Button size="sm" onClick={open}>
          Open
        </Button>
      ) : null}
      <IconButton size="sm" label="Dismiss" title="Clear it from Home; Activity keeps it" icon={<X size={14} />} onClick={onDismiss} />
    </div>
  );
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
  if (item.kind === "workflow" && item.workflow) {
    return <WorkflowCard workflow={item.workflow} client={client} onDecided={() => onDone("Noted.")} />;
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
              <Button key={o} disabled={busy} onClick={() => void act(() => client.answerAsk(item.id, o), "Answered.")}>
                {o}
              </Button>
            ))
          ) : (
            <>
              <input className="need__input" value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Your answer" aria-label="Your answer" />
              <Button variant="primary" type="submit" disabled={busy || !answer.trim()}>
                Answer
              </Button>
            </>
          )}
          <Button variant="ghost" disabled={busy} onClick={() => void act(() => client.dismissAsk(item.id), "Dismissed.")}>
            Dismiss
          </Button>
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
          <Button variant="primary" disabled={busy} onClick={() => void act(() => client.decideProposal(item.id, true), "On it. Alpha is doing that now.")}>
            Yes, do it
          </Button>
          <Button variant="ghost" disabled={busy} onClick={() => void act(() => client.decideProposal(item.id, false), "Noted. It won't come back.")}>
            Not now
          </Button>
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
        <Button variant="primary" disabled={busy} onClick={() => void act(() => client.decideFact(item.id, true), "Remembered.")}>
          Yes, remember it
        </Button>
        <Button variant="ghost" disabled={busy} onClick={() => void act(() => client.decideFact(item.id, false), "Forgotten.")}>
          No
        </Button>
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
  // today's failures, asked of the journal by kind; the count comes with the summary
  const failedCount = home?.failed_today ?? 0;
  const [failures, setFailures] = useState<JournalEntry[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => {
    if (!failedCount) {
      setFailures([]);
      return;
    }
    let live = true;
    Promise.all([client.activity({ kind: "failed", limit: failedCount }), client.preference(DISMISSED).catch(() => ({ value: [] }))])
      .then(([rows, pref]) => {
        if (!live) return;
        setFailures(failedToday(rows));
        setDismissed(Array.isArray(pref.value) ? pref.value.filter((v): v is string => typeof v === "string") : []);
      })
      .catch(() => live && setFailures([])); // the tile still says how many, and Activity has them
    return () => {
      live = false;
    };
  }, [client, version, failedCount]);
  /** Clears failures from Home. Only today's ids are kept, so the list never grows. */
  const dismiss = (ids: string[]) => {
    const today = new Set(failures.map((f) => f.id));
    const next = [...new Set([...dismissed, ...ids])].filter((id) => today.has(id));
    setDismissed(next);
    client.setPreference(DISMISSED, next).catch((e: unknown) => setToast(`Couldn't remember that: ${e instanceof Error ? e.message : String(e)}`));
  };
  const shownFailures = failures.filter((f) => !dismissed.includes(f.id));

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
          <div className="tile__sub">{home.failed_today ? `${home.failed_today} didn't work${shownFailures.length ? ", below" : "; see Activity"}` : "Things Alpha read, made and changed"}</div>
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
            {groupNeeds(home.needs_you).map((group) =>
              group.length > 1 ? (
                <article key={group[0].id} className="card need">
                  <h3>Alpha asked {group.length} questions</h3>
                  <p className="because">
                    <b>Asked</b> {when(group[0].at)}, because the answers change what it builds.
                  </p>
                  <AskGroup asks={group.map(askOf)} client={client} onAnswered={() => { setToast("Answered."); onChanged(); }} />
                </article>
              ) : (
                <Need key={group[0].id} item={group[0]} client={client} onDone={(words) => { setToast(words); onChanged(); }} />
              ),
            )}
          </div>
        </div>
      ) : null}

      {shownFailures.length ? (
        <section className="section" aria-label="Didn't work today">
          <div className="section__head">
            <h2>Didn't work today</h2>
            <span className="faint">{shownFailures.length === 1 ? "1 thing" : `${shownFailures.length} things`}, newest first</span>
            <div className="section__right">
              <Button size="sm" variant="ghost" title="Clear them from Home; Activity keeps them" onClick={() => dismiss(shownFailures.map((f) => f.id))}>
                Clear all
              </Button>
            </div>
          </div>
          <div className="card list">
            {shownFailures.map((e) => (
              <Failure key={e.id} e={e} client={client} onGo={onGo} onOpenThread={onOpenThread} onDismiss={() => dismiss([e.id])} onDone={(words) => { setToast(words); onChanged(); }} />
            ))}
          </div>
        </section>
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
                          {s.kind === "failed" ? <X size={12} aria-label="failed" /> : s.kind === "saw" ? <Eye size={12} aria-label="read" /> : <Check size={12} aria-label="done" />} {s.text}
                        </li>
                      ))}
                    </ul>
                  ) : t.state === "working" ? (
                    <div className="item__sub">Starting…</div>
                  ) : null}
                </div>
                <Button size="sm" onClick={() => onOpenThread(t.id)}>
                  Open
                </Button>
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
          {home.modules.filter((m) => !m.parent).map((m) => (
            <div key={m.id} className="card modcard">
              <div className="modcard__top">
                <div className="modcard__ico" aria-hidden="true">
                  <ModuleIcon size={18} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <h3>{m.name}</h3>
                  <div className="faint">
                    {m.children?.length ? `${m.children.length} ${m.children.length === 1 ? "module" : "modules"} inside · ` : ""}
                    {m.tables.length} {m.tables.length === 1 ? "table" : "tables"} · {m.records} {m.records === 1 ? "row" : "rows"}
                  </div>
                </div>
                <Badge tone="good" style={{ marginLeft: "auto" }}>
                  Active
                </Badge>
              </div>
              <p>{m.goal ?? m.last_text ?? "Nothing in it yet."}</p>
              <div className="modcard__foot">
                <span>{m.last_at ? `Last change ${when(m.last_at)}` : ""}</span>
                <Button size="sm" onClick={() => onGo({ kind: "module", id: m.id })}>
                  Open
                </Button>
              </div>
            </div>
          ))}
          <div className="card modcard modcard--new">
            <div className="eyebrow">New</div>
            <b>Describe what you want</b>
            <p>"Track what I eat", "watch We Work Remotely for back-end roles", "read my job search folder". Alpha sets it up and grows it as you use it.</p>
            <button type="button" className="linkbtn" style={{ color: "var(--primary)", fontWeight: 500 }} onClick={onNew}>
              Start a new module <ArrowRight size={14} aria-hidden="true" />
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
              <Button onClick={() => onAsk("I want to track what I eat")}>Track what I eat</Button>
              <Button onClick={() => onGo({ kind: "intelligence", tab: "connections" })}>Connect a folder or my calendar</Button>
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
