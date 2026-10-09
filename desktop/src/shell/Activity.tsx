/**
 * Activity: what Alpha did, what it read, what you changed, newest first and grouped by day;
 * search finds anything that happened. Each row opens to what it touched. It opens from the bell
 * beside the workspace name, in a small panel over the page, so it is compact and draws no header
 * of its own (9 Oct, Vikas: it left Intelligence). Search comes first. With `onOpen` (the bell,
 * Intelligence) an entry opens its own page, `#/activity/<id>` (`ActivityPage`, 9 Oct, the owner:
 * every element has a page); without it, it unfolds in place.
 */
import { humanize } from "../modules/format";
import { useEffect, useMemo, useState } from "react";
import type { Client, JournalEntry } from "../core/client";
import { dayLabel, when } from "../modules/format";
import { Badge, Trouble, type Tone } from "../ui";
import { ICON_SM, SearchIcon } from "../ui/icons";

const SHOWN = new Set(["did", "changed", "made", "saw", "failed", "noticed", "proposed", "asked", "answered", "checked"]);

export function badge(e: JournalEntry): { tone: Tone; words: string } {
  if (e.kind === "failed") return { tone: "bad", words: "Failed" };
  if (e.kind === "asked" || e.kind === "proposed") return { tone: "warn", words: "Waiting" };
  if (e.actor === "person") return { tone: "gray", words: "You" };
  if (e.kind === "saw") return { tone: "info", words: "Read" };
  if (e.kind === "checked") return { tone: (e.data as { agree?: boolean }).agree ? "good" : "bad", words: "Checked" };
  return { tone: "good", words: "Done" };
}

/** What an entry recorded beyond its sentence, one plain line each. */
export function detailLines(e: JournalEntry): string[] {
  const data = e.data as Record<string, unknown>;
  const lines: string[] = [];
  if (typeof data.url === "string") lines.push(`Page: ${data.url}${data.signed_in ? " (signed in)" : ""}`);
  if (typeof data.path === "string") lines.push(`File: ${data.path}`);
  if (data.values && typeof data.values === "object") lines.push(`Values: ${Object.entries(data.values as Record<string, unknown>).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join(", ")}`);
  if (data.before && data.after) {
    const said = (v: unknown) => (v === null || v === undefined || v === "" ? "empty" : typeof v === "object" ? JSON.stringify(v) : String(v));
    const before = data.before as Record<string, unknown>, after = data.after as Record<string, unknown>;
    for (const k of Object.keys({ ...before, ...after })) lines.push(`${humanize(k)}: ${said(before[k])} → ${said(after[k])}`);
  }
  if (typeof data.why === "string") lines.push(`Because: ${data.why}`);
  if (typeof data.error === "string") lines.push(`What went wrong: ${data.error}`);
  if (e.source) lines.push(`Source: ${e.source.replace("connector:", "")}`);
  return lines;
}

function Details({ e }: { e: JournalEntry }) {
  const lines = detailLines(e);
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
      <span className="faint">{when(e.at)}</span>
    </div>
  );
}

export function Activity({ client, version, onOpen }: { client: Client; version: number; onChanged?: () => void; onOpen?: (id: string) => void }) {
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
    <div className="activity">
      <div>
        <div className="activity__bar">
          <div className="search activity__search">
            <SearchIcon size={ICON_SM} aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search" aria-label="Search activity" />
          </div>
          {(["all", "alpha", "you", "failed"] as const).map((f) => (
            <button key={f} type="button" className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {f === "all" ? "All" : f === "alpha" ? "Alpha" : f === "you" ? "You" : "Failed"}
            </button>
          ))}
        </div>
        <div className="runs">
          {error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't load Activity: {error}</Trouble> : null}
          {rows === null && !error ? <p className="empty">Loading Activity…</p> : null}
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
                <button type="button" className="item item--btn" aria-expanded={onOpen ? undefined : open === e.id} onClick={() => (onOpen ? onOpen(e.id) : setOpen((o) => (o === e.id ? null : e.id)))}>
                  <span className="item__when num">{when(e.at)}</span>
                  <Badge tone={b.tone}>{b.words}</Badge>
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
