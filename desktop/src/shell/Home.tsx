/**
 * Home: what needs the person (questions Alpha asked, things it proposes, facts waiting for a
 * yes), what's coming up, and their modules. Nothing here is decoration: each card is something
 * to answer or open.
 */
import { useEffect, useState } from "react";
import { AskCard, AskGroup, WorkflowCard } from "../assistant/AssistantPanel";
import type { Ask, Client, Home as HomeData, JournalEntry, NeedItem, Thread } from "../core/client";
import { dayLabel, when } from "../modules/format";
import { ActionCard } from "./ActionCard";
import type { Surface } from "./Rail";
import { Badge, Button, Confirm, IconButton } from "../ui";
import { ArrowRight, X } from "../ui/icons";
import { ModuleGlyph } from "./moduleIcons";
import { say } from "../core/client";

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
  return { id: item.id, text: item.text, at: item.at, options: item.options ?? [], thread: null, module: item.module ?? null, turn: item.turn ?? null, choose: item.choose, hint: item.hint };
}

function greeting(): string {
  const hour = new Date().getHours();
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

/** A moment on Home, absolute like everywhere (section 9b): "13 Oct, 14:30". */
const timeOf = (iso: string) => when(iso);

/** This Mac's midnight today. */
const midnight = (now = new Date()) => new Date(now.getFullYear(), now.getMonth(), now.getDate());

/** Today's failures, newest first: the journal's `failed` entries since local midnight. */
export function failedToday(entries: JournalEntry[], now = new Date()): JournalEntry[] {
  const from = midnight(now).getTime();
  return entries.filter((e) => e.kind === "failed" && new Date(e.at).getTime() >= from).sort((a, b) => b.at.localeCompare(a.at));
}

/** The failures the person cleared from Home. Only Home forgets them: Activity keeps every one. */
const DISMISSED = "home_dismissed";

/** How the latest try went, in words: "Trying again…", "Worked when tried again, 13 Oct, 21:52". */
export function triedWords(tried: NonNullable<JournalEntry["tried"]>): string {
  if (tried.state === "running") return "Trying again…";
  if (tried.state === "worked") return `Worked when tried again, ${when(tried.at)}`;
  return `Tried again ${when(tried.at)}; it failed again${tried.words ? `: ${tried.words}` : ""}`;
}

/** One thing that didn't work: when, what, why, and what can be done about it. Try again redoes
 *  exactly what failed (the core says what that is; an action on a site asks first) and the card
 *  then says how it went; Open goes to the entry's own page; Dismiss clears it from Home. */
function Failure({ e, client, onGo, onDismiss, onDone }: { e: JournalEntry; client: Client; onGo: (s: Surface) => void; onDismiss: () => void; onDone: (words: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [asking, setAsking] = useState(false);
  const reason = [e.data.error, e.data.why].find((r): r is string => typeof r === "string" && r.trim() !== "" && !e.text.includes(r));
  const again = e.again?.how ? e.again : null;
  const tried = e.tried ?? null;
  const offer = again !== null && tried?.state !== "running" && tried?.state !== "worked";
  async function tryAgain() {
    setBusy(true);
    try {
      await client.tryAgain(e.id);
      onDone("Trying again; the card says how it went.");
    } catch (err) {
      onDone(`Couldn't try again: ${say(err)}`);
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
        {tried ? <div className={`item__sub${tried.state === "worked" ? " item__sub--ok" : ""}`}>{triedWords(tried)}</div> : e.again?.blocked ? <div className="item__sub">{e.again.blocked}</div> : null}
      </div>
      {offer ? (
        <Button size="sm" variant="primary" disabled={busy} title={again.words} onClick={() => (again.asks ? setAsking(true) : void tryAgain())}>
          Try again
        </Button>
      ) : null}
      <Button size="sm" onClick={() => onGo({ kind: "entry", id: e.id })}>
        Open
      </Button>
      <IconButton size="sm" label="Dismiss" title="Clear it from Home; Activity keeps it" icon={<X size={14} />} onClick={onDismiss} />
      {again?.asks ? (
        <Confirm open={asking} title="Try it again?" action="Try again" onConfirm={() => { setAsking(false); void tryAgain(); }} onCancel={() => setAsking(false)}>
          {again.words} It acts on the site for real, as when you approved it.
        </Confirm>
      ) : null}
    </div>
  );
}

function Need({ item, client, onDone }: { item: NeedItem; client: Client; onDone: (words: string) => void }) {
  const [busy, setBusy] = useState(false);
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
  if (item.kind === "workflow" && item.workflow) {
    return <WorkflowCard workflow={item.workflow} client={client} onDecided={() => onDone("Noted.")} />;
  }
  if (item.kind === "ask") {
    // The one question card (the conversation's slice 2), here as on the Assistant page.
    return <AskCard ask={askOf(item)} client={client} onAnswered={() => onDone("Answered.")} />;
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

/** A work item's state in words (harness §7). */
const ITEM_STATE: Record<string, string> = { open: "Open", working: "Working", needs_you: "Needs you", done: "Done", stopped: "Stopped" };

/** Home's lanes (harness §7): Needs you · Working · Done today, newest first in each; the
 *  core sends the items not over and the ones done or stopped today. */
export function laneThreads(items: Thread[], now = new Date()): [string, Thread[]][] {
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const lanes: Record<string, Thread[]> = { "Needs you": [], Working: [], "Done today": [] };
  items.forEach((t) => {
    const over = t.state === "done" || t.state === "stopped";
    if (t.state === "needs_you") lanes["Needs you"].push(t);
    else if (!over) lanes.Working.push(t);
    else if (new Date(t.updated_at).getTime() >= midnight) lanes["Done today"].push(t);
  });
  return Object.entries(lanes).filter(([, rows]) => rows.length);
}

/** The kinds of Scout's picks, in words (Q48). */
const PICK_WORDS: Record<string, string> = { coming_up: "Coming up", pattern: "A pattern", link: "Links", follow_up: "Follow-up", by_hand: "By hand" };

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
      .catch((e: unknown) => setError(say(e)));
  }, [client, version]);
  // today's failures, asked of the journal by kind since local midnight (D9); the count comes with the summary
  const failedCount = home?.failed_today ?? 0;
  const [failures, setFailures] = useState<JournalEntry[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  useEffect(() => {
    if (!failedCount) {
      setFailures([]);
      return;
    }
    let live = true;
    Promise.all([client.activity({ kind: "failed", since: midnight().toISOString(), limit: 500 }), client.preference(DISMISSED).catch(() => ({ value: [] }))])
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
    client.setPreference(DISMISSED, next).catch((e: unknown) => setToast(`Couldn't remember that: ${say(e)}`));
  };
  const shownFailures = failures.filter((f) => !dismissed.includes(f.id));

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const date = dayLabel(new Date());
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

      {home.picks.length ? (
        <section className="section" aria-label="Scout's picks">
          <div className="section__head">
            <h2>Scout's picks</h2>
            <span className="faint">Worth your attention today; take or leave each</span>
          </div>
          <div className="card list">
            {home.picks.map((p) => (
              <div key={p.id} className="item">
                <span className={`badge ${p.less_sure ? "" : "badge--running"}`}>{p.less_sure ? "Less sure" : PICK_WORDS[p.kind] ?? p.kind}</span>
                <div className="item__body">
                  <b>{p.title}</b>
                  <div className="item__sub">
                    {p.what} {p.why ? <span className="faint">· {p.why}</span> : null}
                  </div>
                  <div className="item__sub faint">On a Take: {p.action}</div>
                </div>
                <Button size="sm" variant="primary" onClick={() => void client.decideProposal(p.id, true).then((r) => { if (r.open) onGo({ kind: "intelligence", tab: "map" }); setToast(r.turn ? "On it. Alpha is doing that now." : "Opened."); onChanged(); })}>
                  Take
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void client.decideProposal(p.id, false).then(() => { setToast("Left it."); onChanged(); })}>
                  Not now
                </Button>
              </div>
            ))}
          </div>
        </section>
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
              <Failure key={e.id} e={e} client={client} onGo={onGo} onDismiss={() => dismiss([e.id])} onDone={(words) => { setToast(words); onChanged(); }} />
            ))}
          </div>
        </section>
      ) : null}

      {home.threads.length ? (
        <div className="section">
          <div className="section__head">
            <h2>Alpha is working on</h2>
            <span className="faint">One card per piece of work; the steps are behind Open</span>
          </div>
          <div className="lanes">
            {laneThreads(home.threads).map(([lane, rows]) => (
              <section key={lane} aria-label={lane}>
                <div className="lane__head">{lane}</div>
                <div className="card list">
                  {rows.map((t) => (
                    <div key={t.id} className="item item--thread">
                      <span className={`badge badge--${t.state === "needs_you" ? "waiting" : t.state === "working" ? "running" : "good"}`}>{ITEM_STATE[t.state] ?? t.state}</span>
                      <div className="item__body">
                        <b>{t.title}</b>
                        {t.state === "working" && (t.live?.doing || t.live?.thought) ? (
                          <div className="thread__now">
                            <span className="working__pulse" aria-hidden="true" />
                            <span className="shimmer">{t.live?.doing ?? "Thinking"}</span>
                          </div>
                        ) : (
                          <div className="item__sub">{t.last_line ?? t.steps?.[t.steps.length - 1]?.text ?? (t.state === "working" ? "Starting…" : t.state === "needs_you" ? "Waiting for your answer above" : "Started")}</div>
                        )}
                        <div className="item__sub faint">started {when(t.created_at)}{t.last_at && t.last_at !== t.created_at ? ` · last ${when(t.last_at)}` : ""}</div>
                      </div>
                      <Button size="sm" onClick={() => onOpenThread(t.id)}>
                        Open
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
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
                  <ModuleGlyph client={client} id={m.id} name={m.name} size={18} />
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
