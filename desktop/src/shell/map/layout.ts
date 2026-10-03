/**
 * The map's layout: a force simulation (d3-force) that clusters by home. Each module has an
 * anchor on a ring around the centre; everything that belongs with it is drawn toward that
 * anchor, so a module's tables, readers, automations and leftover sources gather as one
 * readable cluster; what has no module sits at the centre. Links still pull a run skill
 * between its automation and its readers, and a reader next to the table it feeds. Pure of
 * the window: the worker runs it off the main thread, a test or a window without workers runs
 * it here.
 */
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import type { GraphEdge } from "../../core/client";
import type { ShapedNode } from "./shape";

export interface MapNode extends SimulationNodeDatum, ShapedNode {
  r: number;
  pinned?: boolean;
}
export interface MapEdge extends SimulationLinkDatum<MapNode> {
  kind: GraphEdge["kind"];
  order?: number;
  count?: number;
  provenance?: string;
}
export type Positions = Record<string, { x: number; y: number; pinned?: boolean }>;
export type Anchors = Record<string, { x: number; y: number }>;

/** How big a node draws: modules largest, then what has the most in it or runs the most. */
export function radiusOf(node: ShapedNode): number {
  switch (node.kind) {
    case "module":
      return 34;
    case "table":
      return 19 + Math.min(10, Math.log10(1 + (node.rows ?? 0)) * 3);
    case "skill":
      return node.role === "run" ? 21 : 15 + Math.min(8, Math.sqrt(node.runs ?? 0));
    case "automation":
      return 20;
    case "connection":
      return 17;
    default:
      return 11;
  }
}

/** Where each home's cluster gathers: the modules on a ring, the rest at the centre. */
export function anchorsFor(homes: string[], width: number, height: number): Anchors {
  const modules = homes.filter(Boolean);
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * (modules.length > 3 ? 0.36 : 0.28);
  const out: Anchors = { "": { x: cx, y: cy } };
  modules.forEach((id, i) => {
    const angle = -Math.PI / 2 + (i / modules.length) * Math.PI * 2;
    out[id] = { x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius };
  });
  return out;
}

const DISTANCE: Record<GraphEdge["kind"], number> = { in: 120, runs: 85, "reads into": 85, tells: 95, "read by": 60, "signed in at": 110, feeds: 120 };
const STRENGTH: Record<GraphEdge["kind"], number> = { in: 0.08, runs: 0.55, "reads into": 0.45, tells: 0.25, "read by": 0.6, "signed in at": 0.12, feeds: 0.2 };

/** Nodes for the simulation, starting from where they were (or near their home) and keeping their pins. */
export function toMapNodes(nodes: ShapedNode[], anchors: Anchors, from: Positions = {}): MapNode[] {
  return nodes.map((n) => {
    const r = radiusOf(n);
    const was = from[n.id];
    const home = anchors[n.home] ?? anchors[""];
    const seed = was ?? { x: home.x + (Math.random() - 0.5) * 80, y: home.y + (Math.random() - 0.5) * 80 };
    const node: MapNode = { ...n, r, x: seed.x, y: seed.y, pinned: was?.pinned };
    if (was?.pinned) {
      node.fx = was.x;
      node.fy = was.y;
    }
    return node;
  });
}

export function toMapEdges(edges: GraphEdge[], nodes: MapNode[]): MapEdge[] {
  const ids = new Set(nodes.map((n) => n.id));
  return edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => ({ source: e.from, target: e.to, kind: e.kind, order: e.order, count: e.count, provenance: e.source }));
}

export function makeSimulation(nodes: MapNode[], edges: MapEdge[], anchors: Anchors): Simulation<MapNode, MapEdge> {
  const homeOf = (d: MapNode) => anchors[d.home] ?? anchors[""];
  return forceSimulation<MapNode, MapEdge>(nodes)
    .force("link", forceLink<MapNode, MapEdge>(edges).id((d) => d.id).distance((e) => DISTANCE[e.kind]).strength((e) => STRENGTH[e.kind]))
    .force("charge", forceManyBody<MapNode>().strength((d) => -160 - d.r * 7))
    .force("collide", forceCollide<MapNode>((d) => d.r + 16).iterations(2))
    .force("homeX", forceX<MapNode>((d) => homeOf(d).x).strength((d) => (d.kind === "module" ? 0.5 : 0.11)))
    .force("homeY", forceY<MapNode>((d) => homeOf(d).y).strength((d) => (d.kind === "module" ? 0.5 : 0.11)))
    .alphaDecay(0.03)
    .alphaMin(0.02);
}

/** Run the simulation to rest at once (no worker: a test, or a window without them). */
export function settle(simulation: Simulation<MapNode, MapEdge>, ticks = 300): void {
  simulation.stop();
  simulation.tick(ticks);
}

export function positionsOf(nodes: MapNode[]): Positions {
  const out: Positions = {};
  for (const n of nodes) out[n.id] = { x: n.x ?? 0, y: n.y ?? 0, pinned: n.pinned || undefined };
  return out;
}
