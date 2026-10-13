/**
 * Network: everyone and every organisation Alpha keeps as an entity, and a page for each
 * (design §3.7, point 2). A switch in the header shows People or Organizations, one at a time
 * (9 Oct, Vikas: it was "People & Companies"). The page is Alpha's wiki page about them (editable), their facts
 * (accepted, or suggested with a yes or no), who else might be the same, and everything in the
 * journal that involves them. Both pages open with the shared page header (the UI rulebook §5):
 * the serif title, and a back link on a person's page; sections are cards (9 Oct, the pages phase).
 * Each side is the one data view in the one page layout (`DataFrame`, 9 Oct, the owner): the table
 * fills the first screen, then Files (into Alpha's world: no route ties a file to Network),
 * Intelligence (the latest with each) and Governance (Allowed and Denied, then what it keeps).
 */
import { useEffect, useMemo, useState } from "react";
import { say } from "../core/client";
import type { Client, Entity, EntityDetail, ModuleCard, RecordRow, TableDesc } from "../core/client";
import { DataFrame } from "../modules/DataFrame";
import { DataPage } from "../modules/DataPage";
import { memorySource } from "../modules/source";
import { initials, when } from "../modules/format";
import { BackLink } from "./BackLink";
import { FactRow } from "./FactRow";
import { GovernanceCard } from "../modules/ModuleSections";
import { Button, Badge, HeaderSwitch, PageHeader, SectionCard, Trouble } from "../ui";
import { BuildingIcon, ICON_SM, PeopleIcon, Table2 } from "../ui/icons";

/** People, Organizations, or one of the Network project's own tables (by name). */
type Side = string;
/** A parent sits to the right of what it holds (12 Oct, the owner): the project's tables (a row
 *  is a person), then People, then Organizations. */
const SIDES = [
  { id: "people", label: "People", icon: <PeopleIcon size={ICON_SM} /> },
  { id: "orgs", label: "Organizations", icon: <BuildingIcon size={ICON_SM} /> },
];

export function Network({ client, version, onOpen, onOpenRecord, onChanged = () => undefined, onAsk }: { client: Client; version: number; onOpen: (id: string) => void; onOpenRecord?: (module: string, table: string, id: string) => void; onChanged?: () => void; onAsk?: (text: string) => void }) {
  const [people, setPeople] = useState<Entity[] | null>(null);
  // Network as a project (A6): the tables merged into it ("LinkedIn connections") are its own
  const [project, setProject] = useState<ModuleCard | null>(null);
  const [table, setTable] = useState<TableDesc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [side, setSide] = useState<Side>("people");
  useEffect(() => {
    let live = true;
    client
      .people()
      .then((rows) => {
        if (!live) return;
        setPeople(rows);
        setError(null);
      })
      .catch((e: unknown) => live && setError(say(e)));
    return () => {
      live = false;
    };
  }, [client, version, tick]);
  useEffect(() => {
    let live = true;
    Promise.resolve()
      .then(() => client.modules())
      .then((all) => live && setProject(all.find((m) => m.network) ?? null))
      .catch(() => undefined); // without it Network is People and Organizations
    return () => {
      live = false;
    };
  }, [client, version]);
  const own = (project?.tables ?? []).map((t) => `table:${t.name}`); // never the same id as People or Organizations
  useEffect(() => {
    setTable(null);
    if (!own.includes(side)) return;
    let live = true;
    client
      .table(side.slice("table:".length))
      .then((t) => {
        if (!live) return;
        setTable(t.table);
        setError(null);
      })
      .catch((e: unknown) => live && setError(say(e)));
    return () => {
      live = false;
    };
  }, [client, side, own.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps
  const sides = [...(project?.tables ?? []).map((t) => ({ id: `table:${t.name}`, label: t.title, icon: <Table2 size={ICON_SM} /> })), ...SIDES];
  const source = useMemo(() => networkSource(client, side === "orgs" ? "orgs" : "people"), [client, side]);
  // a project's table here is a table of people
  const rows = (people ?? []).filter((e) => (side !== "orgs") === (e.kind === "person"));
  const noun = side === "orgs" ? "organizations" : "people";
  return (
    <DataFrame
      client={client}
      scope={NETWORK_SCOPE}
      name="Network"
      onChanged={onChanged}
      header={<PageHeader centre={<HeaderSwitch label="Network" items={sides} value={side} onChange={setSide} />} />}
      notice={error ? <Trouble onRetry={() => setTick((n) => n + 1)}>Couldn't load Network: {error}</Trouble> : null}
      data={(upload) =>
        own.includes(side) ? (
          table ? <DataPage key={side} client={client} table={table} version={version + tick} onChanged={onChanged} onAsk={onAsk} onAddFiles={upload} onOpenRecord={(t, id) => onOpenRecord?.(project!.id, t, id)} /> : <p className="faint">Loading…</p>
        ) : (
          <DataPage key={side} client={client} source={source} version={version + tick} onChanged={onChanged} onAsk={onAsk} onAddFiles={upload} onOpenRecord={(_k, id) => onOpen(id)} />
        )
      }
      intelligence={
        <SectionCard title="Intelligence" info={`The latest Alpha has with each of these ${noun}.`}>
          {rows.some((e) => e.last_text) ? (
            <div className="list">
              {rows.filter((e) => e.last_text).map((e) => (
                <div key={e.id} className="list__row">
                  <span className="faint people__when">{e.last_at ? when(e.last_at) : ""}</span>
                  <button type="button" className="linkbtn people__name" onClick={() => onOpen(e.id)}>
                    {e.name}
                  </button>
                  <span className="people__line" title={e.last_text ?? undefined} data-truncate-ok>{e.last_text}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="faint">Nothing heard yet.</p>
          )}
        </SectionCard>
      }
      governance={
        <GovernanceCard client={client} moduleId={NETWORK_SCOPE}>
          <div className="subsecs">
            <div className="subsec">
              <div className="subsec__head">
                <h4 className="subsec__title">What it keeps</h4>
              </div>
              <p className="faint">
                {people ? `${people.filter((e) => e.kind === "person").length} people and ${people.filter((e) => e.kind !== "person").length} organizations, in Alpha's world on this Mac.` : "Loading…"}
              </p>
            </div>
          </div>
        </GovernanceCard>
      }
    />
  );
}

const NETWORK_SCOPE = "network";
const NETWORK_FIXED = "Alpha adds people and organizations as it meets them in what it reads; ask in the panel to add or change one.";

/** People or Organizations as the one data view's source (9 Oct, the owner: the same table as
 *  every project, with every view, filter and dropdown). Read only: entities change through Alpha. */
function networkSource(client: Client, side: "people" | "orgs") {
  return memorySource({
    client,
    key: `network.${side}`,
    title: side === "people" ? "People" : "Organizations",
    titleField: "name",
    fields: [
      { name: "name", kind: "text", label: "Name" },
      side === "people" ? { name: "at", kind: "text", label: "Organization" } : { name: "members", kind: "number", label: "People" },
      { name: "about", kind: "text", label: "About" },
      { name: "last_heard", kind: "datetime", label: "Last heard" },
    ],
    rows: async () => {
      const all = await client.people();
      const names = new Map(all.map((e) => [e.id, e.name]));
      return all
        .filter((e) => (side === "people") === (e.kind === "person"))
        .sort((a, b) => (side === "orgs" ? (b.members ?? 0) - (a.members ?? 0) : 0)) // the largest organisations first
        .map((e): RecordRow => ({ id: e.id, revision: 1, created_at: e.last_at ?? "", updated_at: e.last_at ?? "", provenance: {}, values: { name: e.name, ...(side === "people" ? { at: (e.at ?? []).map((id) => names.get(id) ?? "").filter(Boolean).join(", ") || null } : { members: e.members ?? 0 }), about: e.summary || keysLine(e), last_heard: e.last_at ?? null } }));
    },
    rowIcon: (row) => (
      <span className="people__avatar" aria-hidden="true">
        {initials(String(row.values.name ?? ""))}
      </span>
    ),
    editable: () => NETWORK_FIXED,
    reasons: { add: NETWORK_FIXED, edit: NETWORK_FIXED, remove: NETWORK_FIXED },
  });
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
      .catch((e: unknown) => live && setError(say(e)));
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
    work.then(refresh).catch((e: unknown) => setProblem(say(e)));
  };
  const save = () => {
    setProblem(null);
    void client
      .writeNote(`entity:${entity.id}`, entity.name, body)
      .then(() => {
        setEditing(false);
        refresh();
      })
      .catch((e: unknown) => setProblem(say(e)));
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
            <SectionCard title="Might be the same" info="Same name, nothing else shared; never merged on a name alone.">
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

          <SectionCard title={`Everything with ${first}`} actions={entity.timeline.length ? <Badge tone="gray">{entity.timeline.length}</Badge> : undefined}>
            {entity.timeline.length ? null : <p className="faint">None yet.</p>}
            <div className="list">
              {entity.timeline.map((e) => (
                <div key={e.id} className="list__row">
                  <span className="faint people__when">{when(e.at)}</span>
                  <Badge tone={e.kind === "failed" ? "bad" : e.actor === "person" ? "info" : "gray"}>{e.kind}</Badge>
                  <span className="people__line" title={e.text} data-truncate-ok>{e.text}</span>
                </div>
              ))}
            </div>
          </SectionCard>
        </div>
      </div>
    </>
  );
}
