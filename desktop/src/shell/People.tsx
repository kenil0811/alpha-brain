/**
 * People & Companies: everyone and everything Alpha keeps as an entity, and a page for each
 * (design §3.7, point 2). The page is Alpha's wiki page about them (editable), their facts
 * (accepted, or suggested with a yes or no), who else might be the same, and everything in the
 * journal that involves them.
 */
import { useEffect, useState } from "react";
import type { Client, Entity, EntityDetail } from "../core/client";
import { initials, when } from "../modules/format";
import { factOrigin } from "./facts";
import { Badge, Button, InfoTip } from "../ui";
import { PageHeader } from "../ui/PageHeader";
import { ArrowLeft } from "../ui/icons";

export function People({ client, version, onOpen }: { client: Client; version: number; onOpen: (id: string) => void }) {
  const [people, setPeople] = useState<Entity[] | null>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    let live = true;
    client
      .people(q.trim() || undefined)
      .then((rows) => live && setPeople(rows))
      .catch(() => live && setPeople([]));
    return () => {
      live = false;
    };
  }, [client, q, version]);
  const persons = (people ?? []).filter((e) => e.kind === "person");
  const orgs = (people ?? []).filter((e) => e.kind !== "person");
  const group = (title: string, rows: Entity[]) =>
    rows.length ? (
      <div className="section">
        <div className="section__head">
          <h2>{title}</h2>
          <span className="faint">{rows.length}</span>
        </div>
        <div className="card list">
          {rows.map((e) => (
            <button key={e.id} type="button" className="list__row people__row" onClick={() => onOpen(e.id)}>
              <span className="people__avatar" aria-hidden="true">
                {initials(e.name)}
              </span>
              <span className="people__name">{e.name}</span>
              <span className="people__line muted">{e.summary || e.last_text || keysLine(e) || "Nothing known yet."}</span>
              <span className="faint people__when">{e.last_at ? when(e.last_at) : ""}</span>
            </button>
          ))}
        </div>
      </div>
    ) : null;
  return (
    <div className="page">
      <PageHeader
        title={<>People &amp; Companies <InfoTip text="Everyone Alpha has come across: from your connections, your mail, and what you tell it." /></>}
        right={
          <div className="search people__search">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find someone…" aria-label="Find a person or company" />
          </div>
        }
      />
      {people === null ? <p className="empty">Loading…</p> : null}
      {people && !people.length ? <p className="empty">{q ? "Nobody by that name." : "Nobody yet. Connect your mail or LinkedIn, or mention someone to Alpha."}</p> : null}
      {group("People", persons)}
      {group("Companies and organisations", orgs)}
    </div>
  );
}

function keysLine(e: Entity): string {
  return Object.values(e.keys ?? {})
    .flat()
    .slice(0, 2)
    .join(" · ");
}

export function EntityPage({ client, id, version, onBack, onOpen, onChanged }: { client: Client; id: string; version: number; onBack: () => void; onOpen: (id: string) => void; onChanged: () => void }) {
  const [entity, setEntity] = useState<EntityDetail | null>(null);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    client
      .entity(id)
      .then((e) => {
        if (!live) return;
        setEntity(e);
        if (!editing) setBody(e.page?.body ?? "");
      })
      .catch(() => live && setEntity(null));
    return () => {
      live = false;
    };
  }, [client, id, version, tick, editing]);
  if (!entity) return <div className="page"><p className="empty">Loading…</p></div>;
  const refresh = () => {
    setTick((n) => n + 1);
    onChanged();
  };
  const save = () => {
    void client.writeNote(`entity:${entity.id}`, entity.name, body).then(() => {
      setEditing(false);
      refresh();
    });
  };
  const accepted = entity.facts.filter((f) => f.state === "accepted");
  const suggested = entity.facts.filter((f) => f.state === "suggested");
  return (
    <div className="page">
      <Button size="sm" onClick={onBack}>
        <ArrowLeft size={14} aria-hidden="true" /> People &amp; Companies
      </Button>
      <div className="modhead" style={{ marginTop: 12 }}>
        <span className="people__avatar people__avatar--big" aria-hidden="true">
          {initials(entity.name)}
        </span>
        <div className="modhead__title">
          <div style={{ minWidth: 0 }}>
            <h1>{entity.name}</h1>
            <div className="faint">
              {entity.kind === "person" ? "Person" : "Organisation"}
              {entity.aliases.length ? ` · also ${entity.aliases.join(", ")}` : ""}
            </div>
            <div className="row" style={{ marginTop: 6 }}>
              {Object.entries(entity.keys ?? {}).flatMap(([k, values]) => values.map((v) => (
                <Badge key={`${k}:${v}`} tone="gray" title={k}>
                  {v}
                </Badge>
              )))}
            </div>
          </div>
        </div>
      </div>

      <div className="section">
        <div className="section__head">
          <h2>Page</h2>
          <span className="faint">Alpha's page about {entity.name.split(" ")[0]}; yours to edit.</span>
          <div className="section__right">
            {editing ? (
              <>
                <Button size="sm" variant="primary" onClick={save}>
                  Save
                </Button>
                <Button size="sm" onClick={() => { setEditing(false); setBody(entity.page?.body ?? ""); }}>
                  Cancel
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => setEditing(true)}>
                {entity.page ? "Edit" : "Write"}
              </Button>
            )}
          </div>
        </div>
        <div className="card card--pad">
          {editing ? (
            <textarea className="note__edit" rows={10} value={body} onChange={(e) => setBody(e.target.value)} aria-label={`Edit the page about ${entity.name}`} placeholder={`Who ${entity.name} is to you, how you know them, what is going on.`} />
          ) : entity.page ? (
            <div className="people__page">{entity.page.body}</div>
          ) : (
            <p className="muted" style={{ fontSize: "var(--text-md)" }}>No page yet. Alpha writes one as it learns about {entity.name}; you can start it.</p>
          )}
        </div>
      </div>

      <div className="section">
        <div className="section__head">
          <h2>Facts</h2>
        </div>
        {!entity.facts.length ? <p className="empty">Nothing recorded yet.</p> : null}
        {accepted.length ? (
          <dl className="intel__facts">
            {accepted.map((f) => (
              <div key={f.id}>
                <dt>{f.predicate.replace(/_/g, " ")}</dt>
                <dd>
                  {f.value}
                  <div className="faint">{factOrigin(f)}</div>
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
        {suggested.length ? (
          <div className="needs" style={{ marginTop: 12 }}>
            {suggested.map((f) => (
              <div key={f.id} className="card card--pad row">
                <span>
                  Alpha thinks <b>{f.predicate.replace(/_/g, " ")}</b> is <b>{f.value}</b>
                  <span className="faint"> · {factOrigin(f)}</span>
                </span>
                <span className="section__right">
                  <Button size="sm" variant="primary" onClick={() => void client.decideFact(f.id, true).then(refresh)}>
                    Yes
                  </Button>
                  <Button size="sm" onClick={() => void client.decideFact(f.id, false).then(refresh)}>
                    No
                  </Button>
                </span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      {entity.maybe_same.length ? (
        <div className="section">
          <div className="section__head">
            <h2>Might be the same</h2>
            <span className="faint">Same name, no shared email or address. Alpha never merges on a name alone.</span>
          </div>
          <div className="card list">
            {entity.maybe_same.map((m) => (
              <div key={m.id} className="list__row">
                <button type="button" className="people__name" style={{ background: "none", border: 0, padding: 0, textAlign: "left" }} onClick={() => onOpen(m.id)}>
                  {m.name}
                </button>
                <span className="muted">{keysLine(m) || m.last_text || ""}</span>
                <span className="section__right">
                  <Button size="sm" onClick={() => void client.merge(entity.id, m.id).then(refresh)}>
                    Same person
                  </Button>
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="section">
        <div className="section__head">
          <h2>Everything with {entity.name.split(" ")[0]}</h2>
          <span className="faint">{entity.timeline.length ? `${entity.timeline.length} in the journal` : ""}</span>
        </div>
        {!entity.timeline.length ? <p className="empty">Nothing in the journal names them yet.</p> : null}
        <div className="card list">
          {entity.timeline.map((e) => (
            <div key={e.id} className="list__row">
              <span className="faint people__when">{when(e.at)}</span>
              <Badge tone={e.kind === "failed" ? "bad" : e.actor === "person" ? "info" : "gray"}>{e.kind}</Badge>
              <span className="people__line">{e.text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
