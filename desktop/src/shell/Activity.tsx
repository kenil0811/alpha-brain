/**
 * Activity: what Alpha did, what it read, what you changed, newest first and grouped by day;
 * search finds anything that happened. Each row opens its own page (slice 2 D12); Show earlier
 * goes back a page at a time, as far as the journal goes; Failed asks the core for failures
 * only, so none is missed on a busy day.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { Client, DecisionCard, JournalEntry } from "../core/client";
import { dayLabel, when } from "../modules/format";
import { Button, Trouble } from "../ui";
import { say } from "../core/client";
import { DECISION } from "./CardBits";
import type { Surface } from "./Rail";

const PAGE = 300;

const SHOWN = new Set(["did", "changed", "made", "saw", "failed", "noticed", "proposed", "asked", "answered", "checked"]);

export function badge(e: JournalEntry): { cls: string; words: string } {
  if (e.kind === "failed") return { cls: "badge--failed", words: "Failed" };
  if (e.kind === "asked" || e.kind === "proposed") return { cls: "badge--waiting", words: "Waiting" };
  if (e.actor === "person") return { cls: "", words: "You" };
  if (e.kind === "saw") return { cls: "badge--running", words: "Read" };
  if (e.kind === "checked") return { cls: (e.data as { agree?: boolean }).agree ? "badge--succeeded" : "badge--failed", words: "Checked" };
  return { cls: "badge--succeeded", words: "Done" };
}

export function Activity({ client, version, onGo }: { client: Client; version: number; onChanged: () => void; onGo: (s: Surface) => void }) {
  const [rows, setRows] = useState<JournalEntry[] | null>(null);
  const [end, setEnd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "alpha" | "you" | "failed" | "decisions">("all");
  // Decisions (P3): every card, what it asked and how it was decided
  const [cards, setCards] = useState<DecisionCard[] | null>(null);
  useEffect(() => {
    if (filter !== "decisions") return;
    client
      .decisions()
      .then((r) => {
        setCards(r);
        setError(null);
      })
      .catch((e: unknown) => setError(say(e)));
  }, [client, filter, version, tick]);
  const [loading, setLoading] = useState(false);
  const kind = filter === "failed" ? "failed" : undefined;
  useEffect(() => {
    const t = setTimeout(() => {
      client
        .activity({ q: q.trim() || undefined, limit: PAGE, kind })
        .then((r) => {
          setRows(r);
          setError(null);
        })
        .catch((e: unknown) => setError(say(e)));
    }, 200);
    return () => clearTimeout(t);
  }, [client, q, kind, tick]);
  // Something new: the newest page again, kept in front of the earlier pages already shown.
  const seen = useRef(version);
  useEffect(() => {
    if (seen.current === version || q.trim()) return;
    seen.current = version;
    client
      .activity({ limit: PAGE, kind })
      .then((r) => setRows((prev) => (prev ? [...r, ...prev.filter((p) => !r.some((x) => x.id === p.id))] : r)))
      .catch(() => undefined); // the next change tries again; what is shown stays
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);
  // a new search or filter starts from the newest again
  useEffect(() => setEnd(false), [q, kind]);
  const all = rows ?? [];
  const showEarlier = () => {
    const oldest = all[all.length - 1];
    if (!oldest) return;
    setLoading(true);
    client
      .activity({ limit: PAGE, kind, before: oldest.id })
      .then((r) => {
        setRows((prev) => [...(prev ?? []), ...r]);
        setEnd(r.length < PAGE);
      })
      .catch((e: unknown) => setError(say(e)))
      .finally(() => setLoading(false));
  };
  const shown = useMemo(
    () =>
      all.filter(
        (e) => SHOWN.has(e.kind) && (filter === "all" || (filter === "you" ? e.actor === "person" : filter === "failed" ? e.kind === "failed" : e.actor !== "person")),
      ),
    [all, filter],
  );
  let lastDay = "";
  return (
    <div className="page">
      <div className="home__head">
        <h1>Activity</h1>
        <span className="muted">What Alpha read, made and changed, and what you did</span>
      </div>
      <div style={{ marginTop: 18 }}>
        <div className="card toolbar toolbar--page" style={{ borderRadius: 12, marginBottom: 8 }}>
          <div className="search" style={{ maxWidth: "none" }}>
            <span aria-hidden="true">⌕</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search everything that happened" aria-label="Search activity" />
          </div>
          {(["all", "alpha", "you", "failed", "decisions"] as const).map((f) => (
            <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "alpha" ? "Alpha" : f === "you" ? "You" : f === "failed" ? "Failed" : "Decisions"}
            </button>
          ))}
        </div>
        {filter === "decisions" ? (
          <div className="runs">
            {error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't load Decisions: {error}</Trouble> : null}
            {cards === null ? <p className="empty">Loading…</p> : null}
            {cards && !cards.length ? <p className="empty">Nothing has waited on you yet.</p> : null}
            {(cards ?? []).map((c) => {
              const d = DECISION[c.state];
              return (
                <button key={c.id} type="button" className="item item--btn" onClick={() => onGo({ kind: "entry", id: c.id })}>
                  <span className="item__when num">{when(c.decided_at ?? c.created_at)}</span>
                  <span className={`badge ${d.cls}`}>{d.words}</span>
                  <span className="item__body">
                    <b>{c.text}</b>
                    <span className="faint item__sub">
                      {[c.from.by ? `drafted by ${c.from.by}` : null, c.reason, c.answer && c.state === "answered" ? `“${c.answer}”` : null].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
        <div className="runs" style={filter === "decisions" ? { display: "none" } : undefined}>
          {error && filter !== "decisions" ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't load Activity: {error}</Trouble> : null}
          {rows === null ? <p className="empty">Loading…</p> : null}
          {rows && !shown.length ? <p className="empty">{q ? "Nothing matches." : "Nothing has happened yet."}</p> : null}
          {shown.map((e) => {
            const day = dayLabel(e.at);
            const head = day !== lastDay ? (
              <div key={`d-${e.id}`} className="day">
                {day}
              </div>
            ) : null;
            lastDay = day;
            const b = badge(e);
            return (
              <div key={e.id}>
                {head}
                <button type="button" className="item item--btn" onClick={() => onGo({ kind: "entry", id: e.id })}>
                  <span className="item__when num">{when(e.at)}</span>
                  <span className={`badge ${b.cls}`}>{b.words}</span>
                  <span className="item__body">
                    <b>{e.snippet ? <span dangerouslySetInnerHTML={{ __html: e.snippet.replace(/</g, "&lt;").replace(/\[/g, "<mark>").replace(/\]/g, "</mark>") }} /> : e.text}</b>
                  </span>
                </button>
              </div>
            );
          })}
          {rows && !q.trim() && rows.length >= PAGE && !end ? (
            <div className="row" style={{ justifyContent: "center", padding: 12 }}>
              <Button size="sm" disabled={loading} onClick={showEarlier}>
                {loading ? "Loading…" : "Show earlier"}
              </Button>
            </div>
          ) : null}
          {end ? <p className="empty">That's everything, back to the first entry.</p> : null}
        </div>
      </div>
    </div>
  );
}
