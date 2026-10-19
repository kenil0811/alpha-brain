/**
 * People & Companies: everyone and everything Alpha keeps as an entity, and a page for each
 * (design §3.7, point 2). The page is Alpha's wiki page about them (editable), their facts
 * (accepted, or suggested with a yes or no), who else might be the same, and everything in the
 * journal that involves them.
 */
import { useEffect, useRef, useState } from "react";
import type { Client, Entity, EntityDetail, FileItem } from "../core/client";
import { dayText, initials, when } from "../modules/format";
import { factOrigin } from "./facts";
import { sourceWords } from "./CardBits";
import { Button, Badge, Trouble } from "../ui";
import { ArrowLeft } from "../ui/icons";
import { say } from "../core/client";
import { FilesView } from "../modules/FilesView";

export function People({ client, version, onOpen }: { client: Client; version: number; onOpen: (id: string) => void }) {
  const [people, setPeople] = useState<Entity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [q, setQ] = useState("");
  useEffect(() => {
    let live = true;
    client
      .people(q.trim() || undefined)
      .then((rows) => {
        if (!live) return;
        setPeople(rows);
        setError(null);
      })
      .catch((e: unknown) => live && setError(say(e)));
    return () => {
      live = false;
    };
  }, [client, q, version, tick]);
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
              <span className="people__line muted">{[e.organisation_names, e.summary || e.last_text || keysLine(e)].filter(Boolean).join(" · ") || "Nothing known yet."}</span>
              <span className="faint people__when">{lately(e)}</span>
            </button>
          ))}
        </div>
      </div>
    ) : null;
  return (
    <div className="page">
        {error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't load People & Companies: {error}</Trouble> : null}
      <div className="modhead">
        <div className="modhead__title">
          <h1>People &amp; Companies</h1>
          <span className="faint">Everyone Alpha has come across: from your connections, your mail, and what you tell it.</span>
        </div>
        <div className="search people__search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find someone…" aria-label="Find a person or company" />
        </div>
      </div>
      {people === null ? <p className="empty">Loading…</p> : null}
      {people && !people.length ? <p className="empty">{q ? "Nobody by that name." : "Nobody yet. Connect your mail or LinkedIn, or mention someone to Alpha."}</p> : null}
      {group("People", persons)}
      {group("Companies and organisations", orgs)}
    </div>
  );
}

/** How lately, in plain numbers (P8): "3 in 90 days · last 18 Oct", else when Alpha last
 *  came across them, or an organisation's people. */
function lately(e: Entity): string {
  if (e.kind !== "person" && e.member_count) return `${e.member_count} ${e.member_count === 1 ? "person" : "people"}`;
  if (e.last_contact) return `${e.in_90_days ? `${e.in_90_days} in 90 days · ` : ""}last ${dayText(new Date(e.last_contact))}`;
  return e.last_at ? when(e.last_at) : "";
}

function keysLine(e: Entity): string {
  // an organisation's name kept as its key (P8) is its name, not a way to reach it
  return Object.entries(e.keys ?? {})
    .filter(([k]) => k !== "orgname")
    .flatMap(([, v]) => v)
    .slice(0, 2)
    .join(" · ");
}

export function EntityPage({ client, id, version, onBack, onOpen, onChanged, onOpenTask }: { client: Client; id: string; version: number; onBack: () => void; onOpen: (id: string) => void; onChanged: () => void; onOpenTask?: (id: string) => void }) {
  const [entity, setEntity] = useState<EntityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
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
        setError(null);
        if (!editing) setBody(e.page?.body ?? "");
      })
      .catch((e: unknown) => live && setError(say(e)));
    return () => {
      live = false;
    };
  }, [client, id, version, tick, editing]);
  if (!entity) {
    return (
      <div className="page">
        {error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't open this page: {error}</Trouble> : <p className="empty">Loading…</p>}
      </div>
    );
  }
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
              {Object.entries(entity.keys ?? {}).filter(([k]) => k !== "orgname").flatMap(([k, values]) => values.map((v) => (
                <Badge key={`${k}:${v}`} tone="gray" title={k}>
                  {v}
                </Badge>
              )))}
            </div>
          </div>
        </div>
      </div>

      <EntityLinks entity={entity} client={client} onOpen={onOpen} onChanged={refresh} />
      <EntityContact entity={entity} />

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

      {entity.tasks?.length ? (
        <div className="section">
          <div className="section__head">
            <h2>Tasks</h2>
            <span className="faint">what you promised them and what they owe you</span>
          </div>
          <div className="card list">
            {entity.tasks.map((t) => (
              <button key={t.id} type="button" className="list__row" onClick={() => onOpenTask?.(t.id)}>
                <span>{t.title}</span>
                <span className="faint">{t.owner === "person" ? "you promised" : `${entity.name.split(" ")[0]} owes you`}{t.due ? ` · by ${t.due}` : ""}</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
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

      <EntityFiles client={client} entity={entity} version={version} onChanged={onChanged} />

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

/** The files kept about a person or company (13 Oct, slice 2 B11): added with the button or
 *  dropped on the section, listed with their dates, opened, shown in Finder or deleted. */
function EntityFiles({ client, entity, version, onChanged }: { client: Client; entity: EntityDetail; version: number; onChanged: () => void }) {
  const [files, setFiles] = useState<FileItem[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [tick, setTick] = useState(0);
  const picker = useRef<HTMLInputElement>(null);
  useEffect(() => {
    client
      .entityFiles(entity.id)
      .then(setFiles)
      .catch((e: unknown) => setNote(say(e)));
  }, [client, entity.id, version, tick]);
  async function added(list: File[]) {
    if (!list.length) return;
    try {
      const out = await client.addFiles(list, { about: entity.id });
      setNote(`Added ${out.documents.map((d) => d.title).join(", ")}.`);
      setTick((t) => t + 1);
      onChanged();
    } catch (e) {
      setNote(`Couldn't add ${list.map((f) => f.name).join(", ")}: ${say(e)}`);
    }
  }
  return (
    <div
      className={`section${dragging ? " section--drop" : ""}`}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); void added(Array.from(e.dataTransfer.files ?? [])); }}
    >
      <div className="section__head">
        <h2>Files</h2>
        <span className="faint">About {entity.name}; drop files here or add them</span>
        <span className="section__right">
          <Button size="sm" onClick={() => picker.current?.click()}>
            Add files
          </Button>
        </span>
        <input ref={picker} type="file" multiple style={{ display: "none" }} aria-hidden="true" tabIndex={-1} onChange={(e) => { const list = Array.from(e.target.files ?? []); e.target.value = ""; void added(list); }} />
      </div>
      {note ? <p className={`notice${note.startsWith("Couldn") ? "" : " notice--ok"}`} role="status">{note}</p> : null}
      {files && files.length ? (
        <div className="intel__table">
          <FilesView client={client} files={files} tableKey={`files_${entity.id}`} onChanged={() => { setTick((t) => t + 1); onChanged(); }} />
        </div>
      ) : files ? (
        <div className="card">
          <p className="empty">No files about {entity.name} yet.</p>
        </div>
      ) : null}
    </div>
  );
}

/** Where someone belongs and where they came from (P8): their organisations (by an email
 *  domain, a company's name or the person's word; an ended one faint), an organisation's
 *  people, the sources that named them, and who was merged into them, each with Unmerge. */
function EntityLinks({ entity, client, onOpen, onChanged }: { entity: EntityDetail; client: Client; onOpen: (id: string) => void; onChanged: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const orgs = entity.organisations ?? [];
  const members = entity.members ?? [];
  const merged = entity.merged ?? [];
  // where they came from: the sources that named them, and the tables they are rows of
  const sources = Array.from(new Set([...(entity.sources ?? []).map((s) => sourceWords(s.source)), ...(entity.rows ?? []).map((r) => `a row of ${r.collection}`)]));
  if (!orgs.length && !members.length && !merged.length && !sources.length) return null;
  const how = (by: string[]) => by.map((b) => (b.startsWith("domain:") ? `email at ${b.slice(7)}` : b === "company" ? "company named" : b)).join(", ");
  return (
    <div className="section">
      <div className="section__head">
        <h2>{entity.kind === "organisation" ? "People here" : "Belongs to"}</h2>
        {sources.length ? <span className="faint">from {sources.join(", ")}</span> : null}
      </div>
      <div className="card list">
        {orgs.map((o) => (
          <div key={o.id} className={o.ended_at ? "list__row faint" : "list__row"}>
            <button type="button" className="people__name linkbtn" onClick={() => onOpen(o.id)}>
              {o.name}
            </button>
            <span className="muted">{how(o.by)}{o.ended_at ? ` · until ${o.ended_at.slice(0, 10)}` : ""}</span>
          </div>
        ))}
        {members.map((m) => (
          <div key={m.id} className="list__row">
            <button type="button" className="people__name linkbtn" onClick={() => onOpen(m.id)}>
              {m.name}
            </button>
            <span className="muted">{keysLine(m)}</span>
          </div>
        ))}
        {merged.map((m) => (
          <div key={m.id} className="list__row">
            <span>
              Merged in: <b>{m.name}</b>
            </span>
            <span className="muted">{keysLine(m)}</span>
            <span className="section__right">
              <Button
                size="sm"
                onClick={() => {
                  setError(null);
                  void client.unmerge(m.id).then(onChanged, (e: unknown) => setError(say(e)));
                }}
              >
                Unmerge
              </Button>
            </span>
          </div>
        ))}
      </div>
      {error ? <p className="notice">{error}</p> : null}
    </div>
  );
}

/** When the person last had to do with them and how often lately (P8): meetings and the rows
 *  of tables whose rows are interactions, counted by code, in plain numbers; each recent one
 *  listed with its date. No score. */
function EntityContact({ entity }: { entity: EntityDetail }) {
  const c = entity.contact;
  const list = entity.interactions ?? [];
  if (!c || (!c.last && !list.length)) return null;
  const channel = (name: string, n: number) => (name === "meeting" ? `${n} ${n === 1 ? "meeting" : "meetings"}` : `${n} in ${name}`);
  const words = [
    c.total ? `${c.channels.map((x) => channel(x.channel, x.count)).join(", ")} in the last ${c.days} days` : `Nothing in the last ${c.days} days`,
    c.last ? `last on ${dayText(new Date(c.last))}` : "",
    c.you || c.them ? `you started ${c.you}, they started ${c.them}` : "",
  ].filter(Boolean);
  return (
    <div className="section">
      <div className="section__head">
        <h2>Contact</h2>
        <span className="faint">{words.join(" · ")}</span>
      </div>
      {list.length ? (
        <div className="card list">
          {list.slice(0, 12).map((i) => (
            <div key={`${i.ref}-${i.at}`} className="list__row">
              <span className="faint">{dayText(new Date(i.at))}</span>
              <span>{i.title || (i.channel === "meeting" ? "A meeting" : i.channel)}</span>
              <span className="muted">{i.channel === "meeting" ? "meeting" : i.channel}{i.started_by ? ` · ${i.started_by === "you" ? "you wrote" : "they wrote"}` : ""}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
