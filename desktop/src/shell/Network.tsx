/**
 * Network: everyone and every organisation Alpha keeps as an entity, and a page for each
 * (design §3.7, point 2). A switch in the header shows People or Organizations, one at a time
 * (9 Oct, Vikas: it was "People & Companies"). The page is Alpha's wiki page about them (editable), their facts
 * (accepted, or suggested with a yes or no), who else might be the same, and everything in the
 * journal that involves them. Both pages open with the shared page header (the UI rulebook §5):
 * the serif title, and a back link on a person's page; sections are cards (9 Oct, the pages phase).
 * Each side is a table even when empty (header row, blank rows, "+ New"), never a blank screen,
 * with Intelligence (the latest with each) and Governance (what it keeps, Always and Never) below
 * (9 Oct, Vikas). No Files: no route ties a file to Network.
 */
import { useEffect, useState } from "react";
import type { Client, Entity, EntityDetail } from "../core/client";
import { initials, when } from "../modules/format";
import { BackLink } from "./BackLink";
import { FactRow } from "./FactRow";
import { GovernanceRules } from "../modules/ModuleSections";
import { SimpleTable } from "../modules/NewProjectPage";
import { Button, Badge, HeaderSwitch, PageHeader, SectionCard, Trouble } from "../ui";
import { BuildingIcon, ICON_SM, PeopleIcon } from "../ui/icons";

type Side = "people" | "orgs";
const SIDES = [
  { id: "people" as const, label: "People", icon: <PeopleIcon size={ICON_SM} /> },
  { id: "orgs" as const, label: "Organizations", icon: <BuildingIcon size={ICON_SM} /> },
];

export function Network({ client, version, onOpen }: { client: Client; version: number; onOpen: (id: string) => void }) {
  const [people, setPeople] = useState<Entity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [q, setQ] = useState("");
  const [side, setSide] = useState<Side>("people");
  useEffect(() => {
    let live = true;
    client
      .people(q.trim() || undefined)
      .then((rows) => {
        if (!live) return;
        setPeople(rows);
        setError(null);
      })
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [client, q, version, tick]);
  const rows = (people ?? []).filter((e) => (side === "people") === (e.kind === "person"));
  const noun = side === "people" ? "people" : "organizations";
  return (
    <>
      <PageHeader
        centre={<HeaderSwitch label="Network" items={SIDES} value={side} onChange={setSide} />}
        right={
          <div className="search people__search">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find…" aria-label={`Find ${noun}`} />
          </div>
        }
      />
      <div className="page page--column">
        <div className="stack stack--wide">
          {error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't load Network: {error}</Trouble> : null}
          {people === null && !error ? <p className="faint">Loading Network…</p> : null}
          {people ? (
            <>
              <SimpleTable label={side === "people" ? "People" : "Organizations"} columns={["Name", "About", "Last heard"]} addReason={`Alpha adds ${noun} as it meets them in what it reads.`} note={q && !rows.length ? "Nothing by that name." : undefined}>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <button type="button" className="linkbtn people__name" onClick={() => onOpen(e.id)}>
                        <span className="people__avatar" aria-hidden="true">
                          {initials(e.name)}
                        </span>{" "}
                        {e.name}
                      </button>
                    </td>
                    <td className="muted">{e.summary || keysLine(e)}</td>
                    <td className="faint">{e.last_at ? when(e.last_at) : ""}</td>
                  </tr>
                ))}
              </SimpleTable>
              {rows.some((e) => e.last_text) ? (
                <SectionCard title="Intelligence" info={`The latest Alpha has with each of these ${noun}.`}>
                  <div className="list">
                    {rows.filter((e) => e.last_text).map((e) => (
                      <div key={e.id} className="list__row">
                        <span className="faint people__when">{e.last_at ? when(e.last_at) : ""}</span>
                        <span className="people__name">{e.name}</span>
                        <span className="people__line">{e.last_text}</span>
                      </div>
                    ))}
                  </div>
                </SectionCard>
              ) : null}
              <SectionCard title="Governance">
                <div className="subsecs">
                  <div className="subsec">
                    <div className="subsec__head">
                      <h4 className="subsec__title">What it keeps</h4>
                    </div>
                    <p className="faint">
                      {people.filter((e) => e.kind === "person").length} people and {people.filter((e) => e.kind !== "person").length} organizations{q ? " by that name" : ""}, in Alpha's world on this Mac.
                    </p>
                  </div>
                  <GovernanceRules client={client} moduleId="network" />
                </div>
              </SectionCard>
            </>
          ) : null}
        </div>
      </div>
    </>
  );
}

function keysLine(e: Entity): string {
  return Object.values(e.keys ?? {})
    .flat()
    .slice(0, 2)
    .join(" · ");
}

export function EntityPage({ client, id, version, onBack, onOpen, onChanged, onAsk }: { client: Client; id: string; version: number; onBack: () => void; onOpen: (id: string) => void; onChanged: () => void; onAsk?: (text: string) => void }) {
  const [entity, setEntity] = useState<EntityDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState("");
  const [tick, setTick] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
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
      .catch((e: unknown) => live && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      live = false;
    };
  }, [client, id, version, tick, editing]);
  const back = <BackLink to="Network" onClick={onBack} />;
  if (!entity) {
    return (
      <>
        <PageHeader left={back} />
        <div className="page page--column">{error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't open this page: {error}</Trouble> : <p className="faint">Loading this person or company…</p>}</div>
      </>
    );
  }
  const refresh = () => {
    setTick((n) => n + 1);
    onChanged();
  };
  const attempt = (work: Promise<unknown>) => {
    setProblem(null);
    work.then(refresh).catch((e: unknown) => setProblem(e instanceof Error ? e.message : String(e)));
  };
  const save = () => {
    setProblem(null);
    void client
      .writeNote(`entity:${entity.id}`, entity.name, body)
      .then(() => {
        setEditing(false);
        refresh();
      })
      .catch((e: unknown) => setProblem(e instanceof Error ? e.message : String(e)));
  };
  const first = entity.name.split(" ")[0];
  const accepted = entity.facts.filter((f) => f.state === "accepted");
  const suggested = entity.facts.filter((f) => f.state === "suggested");
  return (
    <>
      <PageHeader left={back} title={entity.name} />
      <div className="page page--column">
        <div className="stack stack--wide">
          <div className="entityhead">
            <span className="people__avatar people__avatar--big" aria-hidden="true">
              {initials(entity.name)}
            </span>
            <div>
              <div className="faint">
                {entity.kind === "person" ? "Person" : "Organization"}
                {entity.aliases.length ? ` · also ${entity.aliases.join(", ")}` : ""}
              </div>
              <div className="row">
                {Object.entries(entity.keys ?? {}).flatMap(([k, values]) => values.map((v) => (
                  <Badge key={`${k}:${v}`} tone="gray" title={k}>
                    {v}
                  </Badge>
                )))}
              </div>
            </div>
          </div>
          {problem ? <Trouble>Couldn't do that: {problem}</Trouble> : null}

          <SectionCard
            title="Page"
            actions={
              editing ? (
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
              )
            }
          >
            {editing ? (
              <textarea className="note__edit" rows={10} value={body} onChange={(e) => setBody(e.target.value)} aria-label={`Edit the page about ${entity.name}`} placeholder={`Who ${entity.name} is to you, how you know them, what is going on.`} />
            ) : entity.page ? (
              <div className="people__page">{entity.page.body}</div>
            ) : (
              <p className="faint">No page yet.</p>
            )}
          </SectionCard>

          <SectionCard title="Facts">
            {[...suggested, ...accepted].map((f) => (
              <FactRow key={f.id} fact={f} client={client} onChanged={refresh} onAsk={onAsk} />
            ))}
            {!entity.facts.length ? <p className="faint">None yet.</p> : null}
          </SectionCard>

          {entity.maybe_same.length ? (
            <SectionCard title="Might be the same" subtitle="Same name, nothing else shared; never merged on a name alone.">
              <div className="list">
                {entity.maybe_same.map((m) => (
                  <div key={m.id} className="list__row">
                    <button type="button" className="people__name linkbtn" onClick={() => onOpen(m.id)}>
                      {m.name}
                    </button>
                    <span className="muted">{keysLine(m) || m.last_text || ""}</span>
                    <span className="section__right">
                      <Button size="sm" onClick={() => attempt(client.merge(entity.id, m.id))}>
                        Same person
                      </Button>
                    </span>
                  </div>
                ))}
              </div>
            </SectionCard>
          ) : null}

          <SectionCard title={`Everything with ${first}`} subtitle={entity.timeline.length ? String(entity.timeline.length) : "None yet"}>
            <div className="list">
              {entity.timeline.map((e) => (
                <div key={e.id} className="list__row">
                  <span className="faint people__when">{when(e.at)}</span>
                  <Badge tone={e.kind === "failed" ? "bad" : e.actor === "person" ? "info" : "gray"}>{e.kind}</Badge>
                  <span className="people__line">{e.text}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
