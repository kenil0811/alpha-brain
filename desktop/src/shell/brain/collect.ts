/**
 * What Second Brain's graph draws (`model.ts` adds the rest). `brainOf` gathers the nodes and links from what the core already gives (the world map,
 * Intelligence and each collection's records): the person, their projects, each project's
 * collections and every record in them, facts, people and organisations, goals, and the agents
 * and skills that work for them. Only links the data holds are drawn: you to your top projects,
 * a project to the one it sits in, a collection to its project, a record to its collection, to
 * the records its relation fields point at and to the person or organisation it is.
 */
import type { Intelligence, RecordRow, TableDesc, WorkGraph } from "../../core/client";
import { titleFieldOf } from "../../modules/fields";
import { humanize } from "../../modules/format";
import { agentsFrom } from "../agents";
import type { Surface } from "../Rail";

export type BrainKind = "you" | "module" | "collection" | "record" | "agent" | "skill" | "person" | "organisation" | "goal" | "fact";

export interface BrainNode {
  id: string;
  kind: BrainKind;
  title: string;
  /** A short word under the title: a fact's predicate, a goal's state, a record's collection. */
  detail?: string;
  /** The page a click opens; none for a node that is shown beside the egg instead. */
  open?: Surface;
  /** A fact or a link Alpha suggested and the person hasn't decided yet. */
  waiting?: boolean;
  /** The agent's id, for its face. */
  agent?: string;
  /** A record's collection node, which it sits around. */
  collection?: string;
  /** How much it stands for (a collection's rows, an organisation's people): drawn larger. */
  size?: number;
}
export interface BrainEdge {
  from: string;
  to: string;
  waiting?: boolean;
  /** A record to its own collection: drawn quieter, since the cluster already says it. */
  spoke?: boolean;
}
export interface Brain {
  nodes: BrainNode[];
  edges: BrainEdge[];
}
/** A collection and its records, as `client.table` gives them. */
export type TableRecords = { table: TableDesc; records: RecordRow[] };

export function brainOf(world: WorkGraph | null, data: Pick<Intelligence, "knowledge" | "skills" | "automations" | "hands">, tables: TableRecords[] = []): Brain {
  const nodes = new Map<string, BrainNode>();
  const edges = new Map<string, BrainEdge>();
  const add = (n: BrainNode) => nodes.set(n.id, n);
  const link = (from: string, to: string, more: Omit<BrainEdge, "from" | "to"> = {}) => {
    if (from === to || !nodes.has(from) || !nodes.has(to)) return;
    const key = from < to ? `${from}|${to}` : `${to}|${from}`;
    if (!edges.has(key)) edges.set(key, { from, to, waiting: more.waiting || undefined, spoke: more.spoke || undefined });
  };
  add({ id: "you", kind: "you", title: "You" });

  const modules: Record<string, string> = {};
  const homeOf = (module: string | null | undefined) => (module ? `module:${module}` : "you");
  const collection = (id: string, title: string, module: string | null | undefined, detail?: string) => {
    add({ id, kind: "collection", title, detail, open: module ? { kind: "module", id: module } : undefined });
    link(id, homeOf(module));
  };
  for (const n of world?.nodes ?? []) {
    if (n.kind === "module" && n.module) {
      modules[n.module] = n.title;
      add({ id: n.id, kind: "module", title: n.title, open: { kind: "module", id: n.module } });
    } else if ((n.kind === "person" || n.kind === "organisation") && n.entity) {
      add({ id: n.id, kind: n.kind, title: n.title, open: { kind: "entity", id: n.entity } });
    } else if (n.kind === "goal") {
      add({ id: n.id, kind: "goal", title: n.title });
    }
  }
  for (const n of world?.nodes ?? []) {
    if (n.kind !== "table") continue;
    collection(n.id, n.title, n.module, n.subtitle);
    if (typeof n.rows === "number") nodes.get(n.id)!.size = n.rows;
  }
  const nested = new Set<string>();
  for (const e of world?.edges ?? []) {
    if (e.kind === "in" && e.from.startsWith("module:") && e.to.startsWith("module:")) nested.add(e.from);
    if (e.kind === "in" || e.kind === "of" || e.kind === "named in" || e.kind === "row in") link(e.from, e.to);
    else if (e.kind === "related") link(e.from, e.to, { waiting: e.state === "suggested" });
  }
  for (const id of Object.keys(modules)) if (!nested.has(`module:${id}`)) link(`module:${id}`, "you");

  for (const f of data.knowledge.facts) {
    if (f.predicate === "related_to") continue; // a link, drawn above
    const id = `fact:${f.id}`;
    const waiting = f.state === "suggested";
    add({ id, kind: "fact", title: f.value, detail: humanize(f.predicate), waiting: waiting || undefined });
    link(id, f.subject === "person" ? "you" : f.subject, { waiting });
  }

  for (const a of agentsFrom(data, modules)) {
    const id = `agent:${a.id}`;
    add({ id, kind: "agent", title: a.name, open: { kind: "agent", id: a.id }, agent: a.id });
    link(id, a.module ? `module:${a.module}` : "you");
    for (const s of a.skills) {
      const sid = `skill:${s.name}`;
      add({ id: sid, kind: "skill", title: s.description || humanize(s.name), open: { kind: "skill", name: s.name } });
      link(id, sid);
      if (s.module) link(sid, `module:${s.module}`);
    }
  }
  return withRecords({ nodes: [...nodes.values()], edges: [...edges.values()] }, tables);
}

/** The brain with each collection's records as dots: an edge to its collection, to the records
 * its relation fields point at, and to the person or organisation it is. */
export function withRecords(brain: Brain, tables: TableRecords[]): Brain {
  if (!tables.length) return brain;
  const nodes = new Map(brain.nodes.map((n) => [n.id, n]));
  const edges = new Map(brain.edges.map((e) => [e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`, e]));
  const add = (n: BrainNode) => nodes.has(n.id) || nodes.set(n.id, n);
  const link = (from: string, to: string, spoke?: boolean) => {
    if (from === to || !nodes.has(from) || !nodes.has(to)) return;
    const key = from < to ? `${from}|${to}` : `${to}|${from}`;
    if (!edges.has(key)) edges.set(key, { from, to, spoke: spoke || undefined });
  };
  // Every record a dot around its collection; its links once all of them are known.
  for (const { table, records } of tables) {
    const cid = `table:${table.name}`;
    if (!nodes.has(cid)) {
      add({ id: cid, kind: "collection", title: table.title, open: table.module ? { kind: "module", id: table.module } : undefined });
      link(cid, table.module ? `module:${table.module}` : "you");
    }
    const tf = titleFieldOf(table.fields, table.title_field);
    for (const r of records) {
      const title = tf ? r.values[tf] : undefined;
      add({ id: `record:${table.name}:${r.id}`, kind: "record", title: title === null || title === undefined || title === "" ? "Untitled" : String(title), detail: table.title, collection: cid, open: table.module ? { kind: "record", module: table.module, table: table.name, id: r.id } : undefined });
    }
  }
  for (const { table, records } of tables) {
    const related = table.fields.filter((f) => f.relation);
    for (const r of records) {
      const rid = `record:${table.name}:${r.id}`;
      link(rid, `table:${table.name}`, true);
      if (r.entity) link(rid, `entity:${r.entity}`);
      for (const f of related) {
        const v = r.values[f.name];
        for (const to of Array.isArray(v) ? v : v === null || v === undefined || v === "" ? [] : [v]) link(rid, `record:${f.relation}:${String(to)}`);
      }
    }
  }
  return { nodes: [...nodes.values()], edges: [...edges.values()] };
}
