/**
 * The Second Brain as one picture: what Alpha knows, drawn inside an egg (the companion's own
 * shape). `brainOf` gathers the nodes and links from what the core already gives (the world map,
 * Intelligence and each collection's records): the person, their projects, each project's
 * collections and every record in them, facts, people and organisations, goals, and the agents
 * and skills that work for them. Only links the data holds are drawn: you to your top projects,
 * a project to the one it sits in, a collection to its project, a record to its collection, to
 * the records its relation fields point at and to the person or organisation it is.
 *
 * `layEgg` places them: a small force layout (repulsion between near pairs, springs along the
 * links, a light pull to the yolk) whose every step keeps each node inside the shell. Records
 * stay out of the force layout (thousands of them would stall it): each collection takes room
 * for its records and they sit on a sunflower around it. It is deterministic (no randomness),
 * so the same brain draws the same way twice.
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
  for (const n of world?.nodes ?? []) if (n.kind === "table") collection(n.id, n.title, n.module, n.subtitle);
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

// ---- the shell ----
/** The drawing's own units; the SVG scales them to the room it has. */
export const EGG = { width: 600, height: 760 } as const;
const CX = 300;
const CY = 390;
const A = 270; // half the width at its widest
const B = 360; // half the height
const TAPER = 0.16; // wider at the bottom, like the companion
const PAD = 4;
/** Where the person sits: the yolk, a little below the middle. */
export const YOLK = { x: CX, y: CY + 30 };

/** Half the egg's width at `t` (-1 the top, 1 the bottom), for half-axes `a` and `b`. */
function halfWidth(t: number, a: number): number {
  return a * Math.sqrt(Math.max(0, 1 - t * t)) * (1 + TAPER * t);
}

/** Whether a point is inside the shell. */
export function insideEgg(x: number, y: number): boolean {
  const t = (y - CY) / B;
  return Math.abs(t) <= 1 && Math.abs(x - CX) <= halfWidth(t, A) + 1e-6;
}

/** The outline as an SVG path. */
export const EGG_PATH = (() => {
  const steps = 72;
  const pts: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = -1 + (2 * i) / steps;
    pts.push(`${(CX + halfWidth(t, A)).toFixed(1)} ${(CY + t * B).toFixed(1)}`);
  }
  for (let i = steps - 1; i > 0; i -= 1) {
    const t = -1 + (2 * i) / steps;
    pts.push(`${(CX - halfWidth(t, A)).toFixed(1)} ${(CY + t * B).toFixed(1)}`);
  }
  return `M ${pts.join(" L ")} Z`;
})();

/** Pull a node of radius `r` back inside: it lives in an egg shrunk by its radius. */
function clamp(p: { x: number; y: number }, r: number) {
  const a = A - r - PAD;
  const b = B - r - PAD;
  const t = Math.max(-0.999, Math.min(0.999, (p.y - CY) / b));
  p.y = CY + t * b;
  const hw = halfWidth(t, a);
  p.x = Math.max(CX - hw, Math.min(CX + hw, p.x));
}

const RADIUS: Record<BrainKind, number> = { you: 18, module: 11, collection: 7, record: 2, agent: 13, skill: 6, person: 6, organisation: 6, goal: 6, fact: 4.5 };

export function radiusOf(node: BrainNode, degree: number): number {
  const base = RADIUS[node.kind];
  return node.kind === "module" || node.kind === "person" || node.kind === "organisation" ? base + Math.min(5, Math.sqrt(degree)) : base;
}

/** The zoom from which a node's name is written under it (hover always writes it): the first
 * layers at once, the deeper ones as the person zooms in. */
export const LABEL_AT: Record<BrainKind, number> = { you: 1, module: 1, agent: 1, collection: 1.6, goal: 2.2, person: 2.2, organisation: 2.2, skill: 2.2, fact: 3, record: 4 };
/** How many records of a collection draw before zooming in; the rest show from `RECORDS_ALL_AT`. */
export const RECORD_SAMPLE = 200;
export const RECORDS_ALL_AT = 2.5;

/** `zoom`: the zoom from which the node shows (a record beyond its collection's sample);
 * `more`: on a collection, how many of its records wait for that zoom. */
export type Placed = Record<string, { x: number; y: number; r: number; zoom?: number; more?: number }>;

/** Settle the brain inside the egg. `from` keeps nodes that were already placed where they were. */
export function layEgg(brain: Brain, from: Placed = {}): Placed {
  const list = brain.nodes.filter((node) => node.kind !== "record");
  const n = list.length;
  const index = new Map(list.map((node, i) => [node.id, i]));
  const recordsOf = new Map<string, BrainNode[]>();
  for (const node of brain.nodes) if (node.kind === "record") (recordsOf.get(node.collection ?? "you") ?? recordsOf.set(node.collection ?? "you", []).get(node.collection ?? "you")!).push(node);
  const degree = new Array<number>(n).fill(0);
  const links = brain.edges.flatMap((e) => {
    const i = index.get(e.from);
    const j = index.get(e.to);
    if (i === undefined || j === undefined) return [];
    degree[i] += 1;
    degree[j] += 1;
    return [[i, j] as const];
  });
  const r = list.map((node, i) => radiusOf(node, degree[i]));
  // Records share out most of the egg: `gap` apart on a sunflower, so a collection takes the
  // room of a disc around it (`body`), which the layout keeps clear and inside the shell.
  const records = brain.nodes.length - n;
  const gap = Math.max(1.4, Math.min(10, Math.sqrt((Math.PI * A * B * 0.4) / Math.max(1, records))));
  const dot = Math.max(0.7, Math.min(2.6, gap * 0.28));
  const turn = gap / Math.sqrt(Math.PI);
  const body = list.map((node, i) => {
    const count = recordsOf.get(node.id)?.length ?? 0;
    return count ? r[i] + 3 + dot + turn * Math.sqrt(count) : r[i];
  });
  // Seeds: where a node was, else on a sunflower spiral through the egg.
  const p = list.map((node, i) => {
    if (node.id === "you") return { ...YOLK };
    const was = from[node.id];
    if (was) return { x: was.x, y: was.y };
    const angle = i * 2.39996;
    const reach = Math.sqrt((i + 0.5) / n) * 0.8;
    return { x: CX + Math.cos(angle) * A * reach, y: CY + Math.sin(angle) * B * reach };
  });
  p.forEach((q, i) => clamp(q, body[i]));

  // The ideal spacing: the egg shared out evenly, but never so wide that a small brain is
  // pushed against the shell.
  const k = Math.min(70, Math.sqrt((Math.PI * A * B * 0.7) / Math.max(1, n)));
  // ponytail: every pair every step (O(n²)) over everything but records; fewer steps for a big
  // brain keep it near a second at two thousand nodes. A quadtree (Barnes–Hut) past that.
  const ticks = Math.max(60, Math.min(300, Math.round(4e7 / (n * n + 1))));
  let temp = A * 0.3;
  const cool = temp / ticks;
  const dx = new Float64Array(n);
  const dy = new Float64Array(n);
  for (let tick = 0; tick < ticks; tick += 1) {
    dx.fill(0);
    dy.fill(0);
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        let vx = p[i].x - p[j].x;
        let vy = p[i].y - p[j].y;
        let d2 = vx * vx + vy * vy;
        const room = body[i] + body[j] + 8;
        if (d2 > Math.max(3.5 * k, room) ** 2) continue; // far apart: no push, so clusters are not driven into the shell
        if (d2 < 0.01) {
          vx = ((i * 7 + j) % 5) - 2 || 1;
          vy = ((i + j * 3) % 5) - 2 || 1;
          d2 = vx * vx + vy * vy;
        }
        const f = ((k * k) / d2) * (d2 < room * room ? 3 * Math.max(1, room / k) : 1);
        dx[i] += vx * f;
        dy[i] += vy * f;
        dx[j] -= vx * f;
        dy[j] -= vy * f;
      }
    }
    for (const [i, j] of links) {
      const vx = p[i].x - p[j].x;
      const vy = p[i].y - p[j].y;
      const f = Math.sqrt(vx * vx + vy * vy) / k;
      dx[i] -= vx * f;
      dy[i] -= vy * f;
      dx[j] += vx * f;
      dy[j] += vy * f;
    }
    for (let i = 0; i < n; i += 1) {
      if (list[i].id === "you") continue;
      dx[i] -= (p[i].x - YOLK.x) * 0.008 * k;
      dy[i] -= (p[i].y - YOLK.y) * 0.008 * k;
      const len = Math.hypot(dx[i], dy[i]);
      if (len > 0) {
        const step = Math.min(len, temp);
        p[i].x += (dx[i] / len) * step;
        p[i].y += (dy[i] / len) * step;
      }
      clamp(p[i], body[i]);
    }
    temp = Math.max(1, temp - cool);
  }
  const out: Placed = {};
  list.forEach((node, i) => (out[node.id] = { x: p[i].x, y: p[i].y, r: r[i] }));
  // The records on a sunflower around their collection; past the sample, every `stride`-th
  // draws at once and the rest wait for a closer look, so the sample spreads over the disc.
  for (const [cid, recs] of recordsOf) {
    const c = out[cid] ?? out.you;
    const stride = Math.ceil(recs.length / RECORD_SAMPLE);
    recs.forEach((node, j) => {
      const angle = j * 2.39996;
      const reach = c.r + 3 + dot + turn * Math.sqrt(j + 0.5);
      const q = { x: c.x + Math.cos(angle) * reach, y: c.y + Math.sin(angle) * reach };
      clamp(q, dot);
      out[node.id] = { ...q, r: dot, zoom: j % stride === 0 ? undefined : RECORDS_ALL_AT };
    });
    if (stride > 1) c.more = recs.length - Math.ceil(recs.length / stride);
  }
  return out;
}
