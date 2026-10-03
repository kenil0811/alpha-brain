/**
 * The map's layout: a force simulation (d3-force) over the nodes and edges the core gives.
 * Pure of the window: the worker runs it off the main thread, a test or a window without
 * workers runs it here. Modules are hubs (their members are pulled in by the "in" edges), a
 * run skill sits between its automation and its readers, readers sit by the table they feed.
 */
import { forceCenter, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, type Simulation, type SimulationLinkDatum, type SimulationNodeDatum } from "d3-force";
import type { GraphEdge, GraphNode } from "../../core/client";

export interface MapNode extends SimulationNodeDatum, GraphNode {
  r: number;
}
export interface MapEdge extends SimulationLinkDatum<MapNode> {
  kind: GraphEdge["kind"];
  order?: number;
  count?: number;
  provenance?: string;
}
export type Positions = Record<string, { x: number; y: number }>;

/** How big a node draws: modules largest, then what has the most in it or runs the most. */
export function radiusOf(node: GraphNode): number {
  switch (node.kind) {
    case "module":
      return 30;
    case "table":
      return 16 + Math.min(10, Math.log10(1 + (node.rows ?? 0)) * 3);
    case "skill":
      return node.role === "run" ? 18 : 13 + Math.min(8, Math.sqrt(node.runs ?? 0));
    case "automation":
      return 17;
    case "connection":
      return 15;
    default:
      return 10;
  }
}

const DISTANCE: Record<GraphEdge["kind"], number> = { in: 130, runs: 80, "reads into": 80, tells: 90, "read by": 55, "signed in at": 100, feeds: 120 };
const STRENGTH: Record<GraphEdge["kind"], number> = { in: 0.25, runs: 0.6, "reads into": 0.5, tells: 0.3, "read by": 0.7, "signed in at": 0.2, feeds: 0.3 };

export function toMapNodes(nodes: GraphNode[]): MapNode[] {
  return nodes.map((n) => ({ ...n, r: radiusOf(n) }));
}

export function toMapEdges(edges: GraphEdge[], nodes: MapNode[]): MapEdge[] {
  const ids = new Set(nodes.map((n) => n.id));
  return edges.filter((e) => ids.has(e.from) && ids.has(e.to)).map((e) => ({ source: e.from, target: e.to, kind: e.kind, order: e.order, count: e.count, provenance: e.source }));
}

export function makeSimulation(nodes: MapNode[], edges: MapEdge[], width: number, height: number): Simulation<MapNode, MapEdge> {
  return forceSimulation<MapNode, MapEdge>(nodes)
    .force("link", forceLink<MapNode, MapEdge>(edges).id((d) => d.id).distance((e) => DISTANCE[e.kind]).strength((e) => STRENGTH[e.kind]))
    .force("charge", forceManyBody<MapNode>().strength((d) => -200 - d.r * 8))
    .force("collide", forceCollide<MapNode>((d) => d.r + 18).iterations(2))
    .force("center", forceCenter(width / 2, height / 2))
    .force("x", forceX<MapNode>(width / 2).strength(0.035))
    .force("y", forceY<MapNode>(height / 2).strength(0.045))
    .alphaDecay(0.028);
}

/** Run the simulation to rest at once (no worker: a test, or a window without them). */
export function settle(simulation: Simulation<MapNode, MapEdge>, ticks = 300): void {
  simulation.stop();
  simulation.tick(ticks);
}

export function positionsOf(nodes: MapNode[]): Positions {
  const out: Positions = {};
  for (const n of nodes) out[n.id] = { x: n.x ?? 0, y: n.y ?? 0 };
  return out;
}
