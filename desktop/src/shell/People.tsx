/**
 * People & Companies: everyone Alpha has met across sources, and one page each with what it
 * believes about them (each fact with where it came from) and a timeline across every source.
 */
import { useEffect, useState } from "react";
import type { Client, Entity, EntityDetail, Fact, JournalEntry } from "../core/client";
import { humanize, initials, when } from "../modules/format";
import type { Surface } from "./Rail";

const SOURCE_ICON: Record<string, string> = {
  "connector:calendar": "▦",
  "connector:browser": "◎",
  "connector:files": "▤",
  "connector:mail": "✉",
};

export function People({ client, version, onGo }: { client: Client; version: number; onGo: (s: Surface) => void }) {
  const [rows, setRows] = useState<Entity[] | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"person" | "organisation">("person");
  useEffect(() => {
    const t = setTimeout(() => {
      client.people(q.trim() || undefined).then(setRows).catch(() => setRows([]));
    }, 150);
    return () => clearTimeout(t);
  }, [client, q, version]);
  const shown = (rows ?? []).filter((e) => e.kind === kind);
  return (
    <div className="page">
      <div className="home__head">
        <h1>People &amp; Companies</h1>
        <span className="muted">Everyone Alpha has seen in your calendar, pages, documents and modules</span>
      </div>
      <div className="card" style={{ marginTop: 18 }}>
        <div className="toolbar toolbar--page">
          <div className="search">
            <span aria-hidden="true">⌕</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people and companies" aria-label="Search people" />
          </div>
          <button type="button" className="chip" aria-pressed={kind === "person"} onClick={() => setKind("person")}>
            People
          </button>
          <button type="button" className="chip" aria-pressed={kind === "organisation"} onClick={() => setKind("organisation")}>
            Companies
          </button>
        </div>
        <div className="list">
          {rows === null ? <p className="empty">Loading…</p> : null}
          {rows && !shown.length ? <p className="empty">Nobody yet. People appear as Alpha meets them: calendar attendees, contacts on pages it reads, names in your tables.</p> : null}
          {shown.map((e) => (
            <button key={e.id} type="button" className="item item--btn" onClick={() => onGo({ kind: "person", id: e.id })}>
              <span className={`item__ico ${e.kind === "person" ? "item__ico--person" : ""}`} aria-hidden="true">
                {e.kind === "person" ? initials(e.name) : "▣"}
              </span>
              <span className="item__body">
                <b>{e.name}</b>
                <div className="item__sub">{[Object.values(e.keys).flat()[0], e.last_text].filter(Boolean).join(" · ")}</div>
              </span>
              {e.last_at ? <span className="faint">{when(e.last_at)}</span> : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function FactChip({ fact }: { fact: Fact }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="fact">
      <button type="button" className={`chip${fact.state === "suggested" ? " chip--suggested" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {fact.value} <span className="faint">{humanize(fact.predicate)}</span>
      </button>
      {open ? (
        <div className="prov" role="dialog">
          <b>
            {humanize(fact.predicate)}: {fact.value}
          </b>
          <span>
            {fact.state === "suggested" ? "Suggested by Alpha" : "Known"} since {when(fact.valid_from)}, from {fact.source.replace(/^turn:.*/, "what you said")}
          </span>
          {fact.why ? <span>“{fact.why}”</span> : null}
        </div>
      ) : null}
    </div>
  );
}

function Timeline({ rows }: { rows: JournalEntry[] }) {
  if (!rows.length) return <p className="empty">Nothing yet.</p>;
  return (
    <div className="card list">
      {rows.map((e) => (
        <div key={e.id} className="tl">
          <span className="item__when">{when(e.at)}</span>
          <span className={`item__ico${e.actor === "alpha" && !e.source ? " item__ico--alpha" : ""}`} aria-hidden="true">
            {e.source ? (SOURCE_ICON[e.source] ?? "•") : e.actor === "alpha" ? "A" : "☺"}
          </span>
          <div className="t">
            <p>{e.text}</p>
            <span className="item__sub">{e.source ? e.source.replace("connector:", "From ") : e.actor === "person" ? "You" : "Alpha"}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function Person({ client, entityId, version, onChanged }: { client: Client; entityId: string; version: number; onGo: (s: Surface) => void; onChanged: () => void; onAsk: (text: string) => void }) {
  const [detail, setDetail] = useState<EntityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    client
      .entity(entityId)
      .then(setDetail)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [client, entityId, version]);
  if (!detail) return <div className="page">{error ? <p className="notice">{error}</p> : <p className="muted">Loading…</p>}</div>;
  const keys = Object.entries(detail.keys).flatMap(([k, vs]) => vs.map((v) => ({ k, v })));
  return (
    <div className="page">
      <div className="modhead">
        <div className="modhead__title">
          <div className="modhead__ico" aria-hidden="true" style={{ borderRadius: "50%", fontSize: 14, fontWeight: 600 }}>
            {detail.kind === "person" ? initials(detail.name) : "▣"}
          </div>
          <div style={{ minWidth: 0 }}>
            <h1>{detail.name}</h1>
            <div className="faint">{[humanize(detail.kind), ...detail.aliases.map((a) => `also “${a}”`)].join(" · ")}</div>
          </div>
        </div>
      </div>
      <div className="facts" style={{ marginBottom: 16 }}>
        {keys.map(({ k, v }) => (
          <span key={`${k}:${v}`} className="chip" title={`Alpha recognises ${detail.name} by this ${k}`}>
            {v} <span className="faint">{k}</span>
          </span>
        ))}
        {detail.facts.map((f) => (
          <FactChip key={f.id} fact={f} />
        ))}
      </div>
      {detail.maybe_same.length ? (
        <div className="card need" style={{ marginBottom: 16 }}>
          <h3>Is this the same {detail.kind === "person" ? "person" : "company"} as {detail.maybe_same.map((m) => m.name).join(", ")}?</h3>
          <p className="because">
            <b>Same name</b>, but nothing that proves it (an email, a LinkedIn page). Alpha only merges on your say-so.
          </p>
          <div className="row">
            {detail.maybe_same.map((m) => (
              <button key={m.id} type="button" className="btn btn--primary" onClick={() => void client.merge(detail.id, m.id).then(onChanged)}>
                Same as the one from {when(m.last_at ?? null) || "earlier"}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="section__head">
        <h2>Timeline</h2>
        <span className="faint">every source</span>
      </div>
      <Timeline rows={detail.timeline} />
    </div>
  );
}
