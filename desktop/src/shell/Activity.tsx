/**
 * Activity: what Alpha did, what it read, what you changed, newest first and grouped by day;
 * search finds anything that happened. Each row opens to what it touched.
 */
import { useEffect, useMemo, useState } from "react";
import type { Client, JournalEntry } from "../core/client";
import { dayLabel, when } from "../modules/format";

const SHOWN = new Set(["did", "changed", "made", "saw", "failed", "noticed", "proposed", "asked", "answered", "checked"]);

function badge(e: JournalEntry): { cls: string; words: string } {
  if (e.kind === "failed") return { cls: "badge--failed", words: "Failed" };
  if (e.kind === "asked" || e.kind === "proposed") return { cls: "badge--waiting", words: "Waiting" };
  if (e.actor === "person") return { cls: "", words: "You" };
  if (e.kind === "saw") return { cls: "badge--running", words: "Read" };
  if (e.kind === "checked") return { cls: (e.data as { agree?: boolean }).agree ? "badge--succeeded" : "badge--failed", words: "Checked" };
  return { cls: "badge--succeeded", words: "Done" };
}

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
      <span className="faint">{new Date(e.at).toLocaleString()}</span>
    </div>
  );
}

export function Activity({ client, version }: { client: Client; version: number; onChanged: () => void }) {
  const [rows, setRows] = useState<JournalEntry[] | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "alpha" | "you" | "failed">("all");
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      client
        .activity({ q: q.trim() || undefined, limit: 300 })
        .then(setRows)
        .catch(() => setRows([]));
    }, 200);
    return () => clearTimeout(t);
  }, [client, q, version]);
  const shown = useMemo(
    () =>
      (rows ?? []).filter(
        (e) => SHOWN.has(e.kind) && (filter === "all" || (filter === "you" ? e.actor === "person" : filter === "failed" ? e.kind === "failed" : e.actor !== "person")),
      ),
    [rows, filter],
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
          {(["all", "alpha", "you", "failed"] as const).map((f) => (
            <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "alpha" ? "Alpha" : f === "you" ? "You" : "Failed"}
            </button>
          ))}
        </div>
        <div className="runs">
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
                <button type="button" className="item item--btn" aria-expanded={open === e.id} onClick={() => setOpen((o) => (o === e.id ? null : e.id))}>
                  <span className="item__when num">{when(e.at)}</span>
                  <span className={`badge ${b.cls}`}>{b.words}</span>
                  <span className="item__body">
                    <b>{e.snippet ? <span dangerouslySetInnerHTML={{ __html: e.snippet.replace(/</g, "&lt;").replace(/\[/g, "<mark>").replace(/\]/g, "</mark>") }} /> : e.text}</b>
                  </span>
                </button>
                {open === e.id ? <Details e={e} /> : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
