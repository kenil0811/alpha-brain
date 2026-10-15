/**
 * One activity entry's own page (13 Oct, slice 2 D12), at `#/activity/<id>`, however old: when it
 * happened and who did it, its words, why it failed and Try again when it did (D5: the core says
 * what that redoes; an action on a site asks first), what it touched (each opening its own page),
 * what else is recorded, and the other steps of the same turn.
 */
import { useEffect, useState } from "react";
import { say, type Client, type EntryPage, type JournalEntry, type Touched } from "../core/client";
import { when } from "../modules/format";
import { Button, Confirm } from "../ui";
import { ArrowLeft } from "../ui/icons";
import { badge } from "./Activity";
import { triedWords } from "./Home";
import type { Surface } from "./Rail";

const TOUCHED: Record<Touched["kind"], string> = { module: "Module", conversation: "Conversation", agent: "Agent", skill: "Skill", record: "Row", goal: "Goal" };

/** Where a thing the entry touched opens; a conversation that isn't a chat (an agent's own
 *  thread) has no page of its own. */
function placeOf(t: Touched): Surface | null {
  switch (t.kind) {
    case "module":
      return { kind: "module", id: t.id };
    case "conversation":
      return t.chat ? { kind: "assistant", id: t.id } : null;
    case "agent":
      return { kind: "agent", id: t.id };
    case "skill":
      return { kind: "skill", name: t.id };
    case "record":
      return t.table ? { kind: "record", table: t.table, id: t.id, module: t.module ?? undefined } : null;
    case "goal":
      return { kind: "goal", id: t.id };
  }
}

/** What else the entry recorded: the page, file, values, before and after, why, the source. */
function Details({ e }: { e: JournalEntry }) {
  const data = e.data as Record<string, unknown>;
  const lines: string[] = [];
  if (typeof data.url === "string") lines.push(`Page: ${data.url}${data.signed_in ? " (signed in)" : ""}`);
  if (typeof data.path === "string") lines.push(`File: ${data.path}`);
  if (data.values && typeof data.values === "object") lines.push(`Values: ${Object.entries(data.values as Record<string, unknown>).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join(", ")}`);
  if (data.before && data.after) lines.push(`Before ${JSON.stringify(data.before)} → after ${JSON.stringify(data.after)}`);
  if (typeof data.why === "string") lines.push(`Because: ${data.why}`);
  if (typeof data.error === "string") lines.push(`What went wrong: ${data.error}`);
  if (e.source) lines.push(`Source: ${e.source.replace("connector:", "")}`);
  return (
    <div className="detail">
      {lines.length ? (
        <ul className="check">
          {lines.map((l) => (
            <li key={l}>
              <span className="m m--y">·</span>
              <span>{l}</span>
            </li>
          ))}
        </ul>
      ) : (
        <span className="faint">Nothing more recorded.</span>
      )}
    </div>
  );
}

export function ActivityEntryPage({ client, id, version, onGo, onChanged }: { client: Client; id: string; version: number; onGo: (s: Surface) => void; onChanged: () => void }) {
  const [entry, setEntry] = useState<EntryPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    client
      .activityEntry(id)
      .then((e) => {
        if (!live) return;
        setEntry(e);
        setError(null);
      })
      .catch((e: unknown) => live && setError(say(e)));
    return () => {
      live = false;
    };
  }, [client, id, version]);
  const back = (
    <Button size="sm" onClick={() => onGo({ kind: "activity" })}>
      <ArrowLeft size={14} aria-hidden="true" /> Activity
    </Button>
  );
  if (error)
    return (
      <div className="page">
        {back}
        <p className="notice" role="alert" style={{ marginTop: 12 }}>
          {error}
        </p>
      </div>
    );
  if (!entry) return <div className="page"><p className="empty">Loading…</p></div>;
  const b = badge(entry);
  const again = entry.again?.how ? entry.again : null;
  const tried = entry.tried ?? null;
  const offer = again !== null && tried?.state !== "running" && tried?.state !== "worked";
  async function tryAgain() {
    setBusy(true);
    setProblem(null);
    try {
      const now = await client.tryAgain(id);
      setEntry((e) => (e ? { ...e, again: now.again, tried: now.tried } : e));
      onChanged();
    } catch (err) {
      setProblem(`Couldn't try again: ${say(err)}`);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      {back}
      <div className="modhead" style={{ marginTop: 12 }}>
        <div className="modhead__title" style={{ display: "block" }}>
          <h1 style={entry.text.length > 140 ? { fontSize: "var(--text-lg)", lineHeight: 1.4, overflowWrap: "anywhere" } : entry.text.length > 60 ? { fontSize: "var(--text-xl)", lineHeight: 1.3 } : undefined}>{entry.text || "Forgotten"}</h1>
          <div className="row" style={{ marginTop: 6 }}>
            <span className={`badge ${b.cls}`}>{b.words}</span>
            <span className="faint">
              {entry.actor === "person" ? "You" : "Alpha"} · {when(entry.at)}
              {entry.removed ? ` · about something since removed (${entry.removed})` : ""}
            </span>
          </div>
        </div>
        {offer ? (
          <Button variant="primary" size="sm" disabled={busy} title={again.words} onClick={() => (again.asks ? setAsking(true) : void tryAgain())}>
            Try again
          </Button>
        ) : null}
      </div>
      {tried ? <p className={`notice${tried.state === "worked" ? " notice--ok" : ""}`} role="status">{triedWords(tried)}</p> : null}
      {entry.again?.blocked ? <p className="notice">{entry.again.blocked}</p> : null}
      {again && offer ? <p className="muted">Try again: {again.words}</p> : null}
      {problem ? (
        <p className="notice" role="alert">
          {problem}
        </p>
      ) : null}

      {entry.touched.length ? (
        <div className="section">
          <div className="section__head">
            <h2>What it touched</h2>
          </div>
          <div className="card list">
            {entry.touched.map((t) => {
              const place = placeOf(t);
              return (
                <div key={`${t.kind}:${t.id}`} className="item">
                  <div className="item__body">
                    <b>{t.name}</b>
                    <div className="item__sub">{TOUCHED[t.kind]}</div>
                  </div>
                  {place ? (
                    <Button size="sm" onClick={() => onGo(place)}>
                      Open
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="section">
        <div className="section__head">
          <h2>What was recorded</h2>
        </div>
        <div className="card card--pad">
          <Details e={entry} />
        </div>
      </div>

      {entry.steps.length ? (
        <div className="section">
          <div className="section__head">
            <h2>The same turn</h2>
            <span className="faint">what was asked and the other steps it took</span>
          </div>
          <div className="card list">
            {entry.steps.map((s) => {
              const sb = badge(s);
              return (
                <button key={s.id} type="button" className="item item--btn" onClick={() => onGo({ kind: "entry", id: s.id })}>
                  <span className="item__when num">{when(s.at)}</span>
                  <span className={`badge ${sb.cls}`}>{s.kind === "said" ? "Asked" : sb.words}</span>
                  <span className="item__body">
                    <b>{s.text}</b>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {again?.asks ? (
        <Confirm open={asking} title="Try it again?" action="Try again" onConfirm={() => { setAsking(false); void tryAgain(); }} onCancel={() => setAsking(false)}>
          {again.words} It acts on the site for real, as when you approved it.
        </Confirm>
      ) : null}
    </div>
  );
}
