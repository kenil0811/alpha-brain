/**
 * Second Brain's graph (the owner, 12 Oct: one Obsidian-like graph of everything): every thing
 * in the platform a node, every relation the data holds a line. `graphOf` starts from `brainOf`
 * (you, projects, collections, records, people, organisations, facts, goals, agents, skills) and
 * adds what it leaves out: a suggested fact as a hypothesis, goals tied to their project,
 * automations and connections. `around` is Obsidian's local graph (what is within n links of a
 * node); `place` lays it out with a force simulation run to rest.
 */
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import type { Client, Intelligence, WorkGraph } from "../../core/client";
import { brainOf, type BrainEdge, type BrainNode, type TableRecords } from "./collect";

export type GraphKind = BrainNode["kind"] | "hypothesis" | "automation" | "connection";
export type GNode = Omit<BrainNode, "kind"> & { kind: GraphKind };
export type GEdge = BrainEdge;
export interface Graph {
  nodes: GNode[];
  edges: GEdge[];
}

/** The kinds in the legend, in its order, with their plain names. */
export const KINDS: { kind: GraphKind; label: string }[] = [
  { kind: "you", label: "You" },
  { kind: "module", label: "Projects" },
  { kind: "collection", label: "Collections" },
  { kind: "record", label: "Records" },
  { kind: "person", label: "People" },
  { kind: "organisation", label: "Organisations" },
  { kind: "fact", label: "Facts" },
  { kind: "hypothesis", label: "Hypotheses" },
  { kind: "goal", label: "Goals" },
  { kind: "agent", label: "Agents" },
  { kind: "automation", label: "Automations" },
  { kind: "skill", label: "Skills" },
  { kind: "connection", label: "Connections" },
];

/** The world map this window last asked a core for: opening Second Brain again shows it; Refresh asks again. */
const caches = new WeakMap<Client, WorkGraph>();
export const cachedWorld = (client: Client) => caches.get(client) ?? null;
export const keepWorld = (client: Client, world: WorkGraph) => void caches.set(client, world);

export function graphOf(world: WorkGraph | null, data: Pick<Intelligence, "knowledge" | "skills" | "automations" | "hands" | "connections">, tables: TableRecords[] = []): Graph {
  const brain = brainOf(world, data, tables);
  const nodes = new Map<string, GNode>(brain.nodes.map((n) => [n.id, n.kind === "fact" && n.waiting ? { ...n, kind: "hypothesis" } : n]));
  const edges = [...brain.edges];
  const keys = new Set(edges.map((e) => (e.from < e.to ? `${e.from}|${e.to}` : `${e.to}|${e.from}`)));
  const link = (from: string, to: string) => {
    const key = from < to ? `${from}|${to}` : `${to}|${from}`;
    if (from !== to && nodes.has(from) && nodes.has(to) && !keys.has(key)) {
      keys.add(key);
      edges.push({ from, to });
    }
  };
  const home = (module: string | null | undefined) => (module && nodes.has(`module:${module}`) ? `module:${module}` : "you");
  // goals: the world's (by id) or Intelligence's, each to its project or to you
  const worldGoals = new Map((world?.nodes ?? []).filter((n) => n.kind === "goal").map((n) => [n.id, n]));
  for (const g of data.knowledge.goals) {
    const id = `goal:${g.id}`; // the world names a goal the same way
    if (!nodes.has(id)) nodes.set(id, { id, kind: "goal", title: g.text, detail: g.state });
    link(id, home(g.module));
  }
  for (const [id, n] of worldGoals) {
    if (!nodes.has(id)) nodes.set(id, { id, kind: "goal", title: n.title });
    link(id, home(n.module));
  }
  for (const a of data.automations) {
    const id = `automation:${a.id}`;
    nodes.set(id, { id, kind: "automation", title: a.title, open: { kind: "automation", id: a.id } });
    link(id, home(a.module));
  }
  for (const c of data.connections) {
    const id = `connection:${c.id}`;
    nodes.set(id, { id, kind: "connection", title: c.target || c.connector, detail: c.connector, open: { kind: "connection", id: c.id } });
    link(id, "you");
  }
  return { nodes: [...nodes.values()], edges };
}

/** The people and organisations a project's work names (`named in` the project, or a row in one
 *  of its collections): whose facts belong to the project until the core ties facts to one (G11). */
export function subjectsOf(world: WorkGraph | null, module: string, tables: string[]): Set<string> {
  const here = new Set([`module:${module}`, ...tables.map((t) => `table:${t}`)]);
  const out = new Set<string>();
  for (const e of world?.edges ?? []) if ((e.kind === "named in" || e.kind === "row in") && e.from.startsWith("entity:") && here.has(e.to)) out.add(e.from);
  return out;
}

/** Each node's neighbours. */
export function neighbours(graph: Graph): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>(graph.nodes.map((n) => [n.id, new Set()]));
  for (const e of graph.edges) {
    out.get(e.from)?.add(e.to);
    out.get(e.to)?.add(e.from);
  }
  return out;
}

/** The ids within `depth` links of `id` (the local graph), itself included. */
export function around(graph: Graph, id: string, depth: number): Set<string> {
  const near = neighbours(graph);
  let ring = new Set([id]);
  const seen = new Set(ring);
  for (let d = 0; d < depth; d++) {
    const next = new Set<string>();
    for (const n of ring) for (const m of near.get(n) ?? []) if (!seen.has(m)) next.add(m);
    for (const n of next) seen.add(n);
    ring = next;
  }
  return seen;
}

/** What shows: the kinds not hidden, inside the local graph when there is one, without nodes
 *  that link to nothing when orphans are off, and the edges between what is left. */
export function visible(graph: Graph, o: { hidden?: Set<GraphKind>; only?: Set<string> | null; orphans?: boolean }): Graph {
  const keep = new Set(graph.nodes.filter((n) => !o.hidden?.has(n.kind) && (!o.only || o.only.has(n.id))).map((n) => n.id));
  let edges = graph.edges.filter((e) => keep.has(e.from) && keep.has(e.to));
  if (o.orphans === false) {
    const linked = new Set(edges.flatMap((e) => [e.from, e.to]));
    for (const id of [...keep]) if (!linked.has(id)) keep.delete(id);
    edges = edges.filter((e) => keep.has(e.from) && keep.has(e.to));
  }
  return { nodes: graph.nodes.filter((n) => keep.has(n.id)), edges };
}

/** Nodes whose title or detail has the words (case and accents aside). */
export function search(graph: Graph, words: string): GNode[] {
  const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  const q = fold(words.trim());
  if (!q) return [];
  return graph.nodes.filter((n) => fold(`${n.title} ${n.detail ?? ""}`).includes(q));
}

export type Placed = Record<string, { x: number; y: number }>;

/** Positions for every node: a force layout (repulsion, springs along the links, a light pull to
 *  the middle) run to rest at once, starting from where nodes were so a redraw keeps its shape.
 *  Seeded on a spiral (no randomness), so the same graph lays out the same way. */
export function place(graph: Graph, from: Placed = {}): Placed {
  type N = SimulationNodeDatum & { id: string };
  const nodes: N[] = graph.nodes.map((n, i) => {
    const was = from[n.id];
    const a = i * 2.39996; // the golden angle
    const r = 12 * Math.sqrt(i + 1);
    return { id: n.id, x: was?.x ?? Math.cos(a) * r, y: was?.y ?? Math.sin(a) * r };
  });
  const links = graph.edges.map((e) => ({ source: e.from, target: e.to }));
  const sim = forceSimulation<N>(nodes)
    .force("link", forceLink<N, { source: string; target: string }>(links).id((d) => d.id).distance(40).strength(0.5))
    .force("charge", forceManyBody<N>().strength(-60).distanceMax(400))
    .force("collide", forceCollide<N>(8))
    .force("x", forceX<N>(0).strength(0.04))
    .force("y", forceY<N>(0).strength(0.04))
    .stop();
  // ponytail: a fixed number of steps; thousands of records take a moment, a worker when that hurts
  sim.tick(Object.keys(from).length ? 60 : 240);
  return Object.fromEntries(nodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
}
