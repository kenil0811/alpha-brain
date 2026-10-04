/**
 * Activity: what Alpha did, what it read, what you changed, newest first and grouped by day;
 * search finds anything that happened. Each row opens to what it touched.
 */
import { useEffect, useMemo, useState } from "react";
import type { Client, JournalEntry } from "../core/client";
import { dayLabel, when } from "../modules/format";
import { PageHeader, Trouble } from "../ui";

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
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "alpha" | "you" | "failed">("all");
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    const t = setTimeout(() => {
      client
        .activity({ q: q.trim() || undefined, limit: 300 })
        .then((r) => {
          setRows(r);
          setError(null);
        })
        .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
    }, 200);
    return () => clearTimeout(t);
  }, [client, q, version, tick]);
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
      <PageHeader
        title="Activity"
        info="What Alpha read, made and changed, and what you did."
        right={
          <div className="toggle" role="group" aria-label="Show">
            {(["all", "alpha", "you", "failed"] as const).map((f) => (
              <button key={f} type="button" aria-selected={filter === f} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f === "all" ? "All" : f === "alpha" ? "Alpha" : f === "you" ? "You" : "Failed"}
              </button>
            ))}
          </div>
        }
      />
      <div>
        <div className="card toolbar toolbar--page" style={{ borderRadius: 12, marginBottom: 8 }}>
          <div className="search" style={{ maxWidth: "none" }}>
            <span aria-hidden="true">⌕</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search everything that happened" aria-label="Search activity" />
          </div>
        </div>
        <div className="runs">
          {error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't load Activity: {error}</Trouble> : null}
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
