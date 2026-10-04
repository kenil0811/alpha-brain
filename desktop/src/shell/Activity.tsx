/**
 * Activity, where the Chief of Staff's bell goes: first what the bell counts (what waits on you,
 * and automations whose last run failed), then what Alpha did, what it read, what you changed,
 * newest first and grouped by day; search finds anything that happened. Each row opens to what
 * it touched.
 */
import { useEffect, useMemo, useState } from "react";
import type { Attention, Client, JournalEntry } from "../core/client";
import { Search } from "lucide-react";
import { dayLabel, when } from "../modules/format";
import { InfoTip, PageHeader, useToast } from "../ui";
import { Need } from "./Home";

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

export function Activity({ client, version, onChanged }: { client: Client; version: number; onChanged: () => void }) {
  const [rows, setRows] = useState<JournalEntry[] | null>(null);
  const [attention, setAttention] = useState<Attention | null>(null);
  const toast = useToast();
  useEffect(() => {
    client.attention().then(setAttention, () => setAttention(null));
  }, [client, version]);
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
      <PageHeader title={<>Activity <InfoTip text="What Alpha read, made and changed, and what you did." /></>} />
      {attention?.count ? (
        <div className="section section--first">
          <div className="section__head">
            <h2>Needs you</h2>
            <span className="faint">{attention.count}</span>
          </div>
          <div className="needs">
            {attention.failed.map((f) => (
              <article key={f.id} className="card need">
                <div className="need__head">
                  <h3>{f.title}</h3>
                  {f.error ? <InfoTip text={f.error} /> : null}
                </div>
                <p className="because">Failed last time{f.at ? `, ${when(f.at)}` : ""}</p>
                <div className="row">
                  <button type="button" className="btn btn--primary" onClick={() => void client.runAutomation(f.id).then(() => { toast.show("Running it again."); onChanged(); }, (e: unknown) => toast.show(e instanceof Error ? e.message : String(e)))}>
                    Run it again
                  </button>
                </div>
              </article>
            ))}
            {attention.needs_you.map((item) => (
              <Need key={item.id} item={item} client={client} onDone={(words) => { toast.show(words); onChanged(); }} />
            ))}
          </div>
        </div>
      ) : null}
      <div className="section">
        <div className="card toolbar toolbar--page toolbar--activity">
          <div className="search search--wide">
            <Search size={14} aria-hidden="true" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search activity" aria-label="Search activity" />
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
