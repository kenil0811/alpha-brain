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
    nodes.set(id, { ...nodes.get(id), id, kind: "goal", title: g.text, detail: g.state, open: { kind: "goal", id: g.id } });
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

/** The largest organisations drawn on their own in the overview; the rest are one group.
 *  ponytail: a fixed count, chosen to keep the picture readable; a zoom-dependent count if asked. */
export const BIG_ORGS = 24;

/**
 * The overview (12 Oct, the owner: "show modules and the next layer in them, grouped; for
 * Network, large organizations that hold most people, without clutter"): projects and what sits
 * directly in them, never each record or person. A collection stands for its rows; people fold
 * (when they are rows or at one) into the organisations they are at, the largest drawn on their own beside the collection
 * their people are rows in, the rest as one "more organizations" node. Facts about one person
 * go with that person. "Show every record and person" draws the whole graph instead.
 */
const peopleWord = (n: number) => (n === 1 ? "1 person" : `${n.toLocaleString()} people`);

export function overview(graph: Graph): Graph {
  const near = neighbours(graph);
  const kind = new Map(graph.nodes.map((n) => [n.id, n.kind]));
  const people = graph.nodes.filter((n) => n.kind === "person").map((n) => n.id);
  // who is at each organisation, and the collections its people are rows in
  const members = new Map<string, number>();
  const homes = new Map<string, Map<string, number>>();
  for (const p of people) {
    const orgs = [...(near.get(p) ?? [])].filter((id) => kind.get(id) === "organisation");
    const tables = [...(near.get(p) ?? [])].filter((id) => kind.get(id) === "collection");
    for (const o of orgs) {
      members.set(o, (members.get(o) ?? 0) + 1);
      const h = homes.get(o) ?? new Map<string, number>();
      for (const t of tables) h.set(t, (h.get(t) ?? 0) + 1);
      homes.set(o, h);
    }
  }
  const ranked = [...members.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const big = new Set(ranked.slice(0, BIG_ORGS).map(([id]) => id));
  // a person a collection or an organisation stands for folds into it; one named only in a
  // project's work stays, as that project's next layer
  const folded = (id: string) => [...(near.get(id) ?? [])].some((x) => kind.get(x) === "collection" || kind.get(x) === "organisation");
  const dropped = new Set(graph.nodes.filter((n) => n.kind === "record" || (n.kind === "person" && folded(n.id)) || (n.kind === "organisation" && members.has(n.id) && !big.has(n.id))).map((n) => n.id));
  const nodes: GNode[] = [];
  for (const n of graph.nodes) {
    if (dropped.has(n.id)) continue;
    // a fact about one person or record goes with them
    if ((n.kind === "fact" || n.kind === "hypothesis") && [...(near.get(n.id) ?? [])].every((id) => dropped.has(id)) && near.get(n.id)?.size) continue;
    nodes.push(big.has(n.id) ? { ...n, size: members.get(n.id), detail: peopleWord(members.get(n.id)!) } : n);
  }
  const keep = new Set(nodes.map((n) => n.id));
  const edges = graph.edges.filter((e) => keep.has(e.from) && keep.has(e.to));
  const home = (o: string) => [...(homes.get(o) ?? new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  for (const o of big) {
    const h = home(o);
    if (h && keep.has(h)) edges.push({ from: o, to: h });
  }
  const rest = [...members.keys()].filter((o) => !big.has(o));
  if (rest.length) {
    const ppl = new Set(people.filter((p) => [...(near.get(p) ?? [])].some((id) => kind.get(id) === "organisation" && !big.has(id))));
    // beside the collection most of these people are rows in
    const tally = new Map<string, number>();
    for (const o of rest) for (const [t, n] of homes.get(o) ?? []) tally.set(t, (tally.get(t) ?? 0) + n);
    const h = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
    nodes.push({ id: "orgs:more", kind: "organisation", title: `${rest.length.toLocaleString()} more organization${rest.length === 1 ? "" : "s"}`, detail: peopleWord(ppl.size), size: ppl.size, open: { kind: "people" } });
    if (h && keep.has(h)) edges.push({ from: "orgs:more", to: h });
  }
  return { nodes, edges };
}

/** Each project's group: the project and what is linked to it directly, with what hangs off
 *  that (an organisation beside a collection), drawn as one soft circle behind them. */
export function groups(graph: Graph, at: Placed): { id: string; x: number; y: number; r: number }[] {
  const near = neighbours(graph);
  const kind = new Map(graph.nodes.map((n) => [n.id, n.kind]));
  const out = [];
  for (const m of graph.nodes) {
    if (m.kind !== "module" || !at[m.id]) continue;
    const inner = [...(near.get(m.id) ?? [])].filter((id) => kind.get(id) !== "module" && kind.get(id) !== "you");
    const outer = inner.flatMap((id) => [...(near.get(id) ?? [])].filter((x) => x !== m.id && (kind.get(x) === "organisation" || kind.get(x) === "record")));
    // around the middle of the project and what it holds, so the circle is no larger than they are
    const pts = [m.id, ...inner, ...outer].filter((id) => at[id]).map((id) => at[id]);
    const c = { x: pts.reduce((s, p) => s + p.x, 0) / pts.length, y: pts.reduce((s, p) => s + p.y, 0) / pts.length };
    const r = Math.max(...pts.map((p) => Math.hypot(p.x - c.x, p.y - c.y)));
    if (inner.length) out.push({ id: m.id, x: Math.round(c.x), y: Math.round(c.y), r: Math.round(r + 18) });
  }
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
  const sizes = new Map(graph.nodes.map((n) => [n.id, n.size ?? 0]));
  const sim = forceSimulation<N>(nodes)
    .force("link", forceLink<N, { source: string; target: string }>(links).id((d) => d.id).distance(40).strength(0.5))
    .force("charge", forceManyBody<N>().strength(-60).distanceMax(400))
    // room for a node's size and its name beneath it
    .force("collide", forceCollide<N>((d) => 10 + Math.min(12, Math.sqrt(sizes.get(d.id) ?? 0) / 2)))
    .force("x", forceX<N>(0).strength(0.04))
    .force("y", forceY<N>(0).strength(0.04))
    .stop();
  // ponytail: a fixed number of steps; thousands of records take a moment, a worker when that hurts
  sim.tick(Object.keys(from).length ? 60 : 240);
  return Object.fromEntries(nodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]));
}
