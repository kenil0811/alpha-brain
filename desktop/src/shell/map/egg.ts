/**
 * The Second Brain as one picture: what Alpha knows, drawn inside an egg (the companion's own
 * shape). `brainOf` gathers the nodes and links from what the core already gives (the world map
 * and Intelligence): the person, their modules, facts, people and organisations, goals, and the
 * agents and skills that work for them. Only links the data holds are drawn; a table folds into
 * its module, so a person who is a row in a table links to that table's module.
 *
 * `layEgg` places them: a small force layout (repulsion between near pairs, springs along the
 * links, a light pull to the yolk) whose every step keeps each node inside the shell. It is
 * deterministic (no randomness), so the same brain draws the same way twice.
 */
import type { Intelligence, WorkGraph } from "../../core/client";
import { humanize } from "../../modules/format";
import { agentsFrom } from "../agents";
import type { Surface } from "../Rail";

export type BrainKind = "you" | "module" | "agent" | "skill" | "person" | "organisation" | "goal" | "fact";

export interface BrainNode {
  id: string;
  kind: BrainKind;
  title: string;
  /** A short word under the title: a fact's predicate, a goal's state. */
  detail?: string;
  /** The page a click opens; none for a node that is shown beside the egg instead. */
  open?: Surface;
  /** A fact or a link Alpha suggested and the person hasn't decided yet. */
  waiting?: boolean;
  /** The agent's id, for its face. */
  agent?: string;
}
export interface BrainEdge {
  from: string;
  to: string;
  waiting?: boolean;
}
export interface Brain {
  nodes: BrainNode[];
  edges: BrainEdge[];
}

export function brainOf(world: WorkGraph | null, data: Pick<Intelligence, "knowledge" | "skills" | "automations" | "hands">): Brain {
  const nodes = new Map<string, BrainNode>();
  const edges = new Map<string, BrainEdge>();
  const add = (n: BrainNode) => nodes.set(n.id, n);
  const link = (from: string, to: string, waiting?: boolean) => {
    if (from === to || !nodes.has(from) || !nodes.has(to)) return;
    const key = from < to ? `${from}|${to}` : `${to}|${from}`;
    if (!edges.has(key)) edges.set(key, { from, to, waiting: waiting || undefined });
  };
  add({ id: "you", kind: "you", title: "You" });

  const tableModule = new Map<string, string>();
  const modules: Record<string, string> = {};
  for (const n of world?.nodes ?? []) {
    if (n.kind === "module" && n.module) {
      modules[n.module] = n.title;
      add({ id: n.id, kind: "module", title: n.title, open: { kind: "module", id: n.module } });
    } else if ((n.kind === "person" || n.kind === "organisation") && n.entity) {
      add({ id: n.id, kind: n.kind, title: n.title, open: { kind: "entity", id: n.entity } });
    } else if (n.kind === "goal") {
      add({ id: n.id, kind: "goal", title: n.title });
    } else if (n.kind === "table" && n.module) {
      tableModule.set(n.id, `module:${n.module}`);
    }
  }
  for (const e of world?.edges ?? []) {
    const to = tableModule.get(e.to) ?? e.to;
    if (e.kind === "in" || e.kind === "of" || e.kind === "named in" || e.kind === "row in") link(e.from, to);
    else if (e.kind === "related") link(e.from, to, e.state === "suggested");
  }

  for (const f of data.knowledge.facts) {
    if (f.predicate === "related_to") continue; // a link, drawn above
    const id = `fact:${f.id}`;
    const waiting = f.state === "suggested";
    add({ id, kind: "fact", title: f.value, detail: humanize(f.predicate), waiting: waiting || undefined });
    link(id, f.subject === "person" ? "you" : f.subject, waiting);
  }

  for (const a of agentsFrom(data, modules)) {
    const id = `agent:${a.id}`;
    add({ id, kind: "agent", title: a.name, open: { kind: "agent", id: a.id }, agent: a.id });
    if (a.module) link(id, `module:${a.module}`);
    for (const s of a.skills) {
      const sid = `skill:${s.name}`;
      add({ id: sid, kind: "skill", title: s.description || humanize(s.name), open: { kind: "skill", name: s.name } });
      link(id, sid);
      if (s.module) link(sid, `module:${s.module}`);
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

const RADIUS: Record<BrainKind, number> = { you: 18, module: 11, agent: 13, skill: 6, person: 6, organisation: 6, goal: 6, fact: 4.5 };

export function radiusOf(node: BrainNode, degree: number): number {
  const base = RADIUS[node.kind];
  return node.kind === "module" || node.kind === "person" || node.kind === "organisation" ? base + Math.min(5, Math.sqrt(degree)) : base;
}

export type Placed = Record<string, { x: number; y: number; r: number }>;

/** Settle the brain inside the egg. `from` keeps nodes that were already placed where they were. */
export function layEgg(brain: Brain, from: Placed = {}): Placed {
  const list = brain.nodes;
  const n = list.length;
  const index = new Map(list.map((node, i) => [node.id, i]));
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
  // Seeds: where a node was, else on a sunflower spiral through the egg.
  const p = list.map((node, i) => {
    if (node.id === "you") return { ...YOLK };
    const was = from[node.id];
    if (was) return { x: was.x, y: was.y };
    const angle = i * 2.39996;
    const reach = Math.sqrt((i + 0.5) / n) * 0.8;
    return { x: CX + Math.cos(angle) * A * reach, y: CY + Math.sin(angle) * B * reach };
  });
  p.forEach((q, i) => clamp(q, r[i]));

  // The ideal spacing: the egg shared out evenly, but never so wide that a small brain is
  // pushed against the shell.
  const k = Math.min(70, Math.sqrt((Math.PI * A * B * 0.7) / Math.max(1, n)));
  // ponytail: every pair every step (O(n²)); fewer steps for a big brain keep it near a
  // second at two thousand nodes. A quadtree (Barnes–Hut) if brains grow past that.
  const ticks = Math.max(60, Math.min(300, Math.round(4e7 / (n * n + 1))));
  const reach2 = (3.5 * k) ** 2;
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
        if (d2 > reach2) continue; // far apart: no push, so clusters are not driven into the shell
        if (d2 < 0.01) {
          vx = ((i * 7 + j) % 5) - 2 || 1;
          vy = ((i + j * 3) % 5) - 2 || 1;
          d2 = vx * vx + vy * vy;
        }
        const room = r[i] + r[j] + 8;
        const f = ((k * k) / d2) * (d2 < room * room ? 3 : 1);
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
      clamp(p[i], r[i]);
    }
    temp = Math.max(1, temp - cool);
  }
  const out: Placed = {};
  list.forEach((node, i) => (out[node.id] = { x: p[i].x, y: p[i].y, r: r[i] }));
  return out;
}
