/**
 * The map's layout off the main thread: the page never stalls while the simulation settles,
 * however many nodes. Messages in: start (the shaped graph, the anchors, where things were),
 * update (a refreshed graph: what is still there keeps its place, what is new starts near its
 * home, the rest settles gently), drag (a node held at a point; it stays pinned there when
 * let go), release, unpin, shake. Messages out: tick (every node's position), end.
 */
import { makeSimulation, positionsOf, toMapEdges, toMapNodes, type Anchors, type MapEdge, type MapNode, type Positions } from "./layout";
import type { GraphEdge } from "../../core/client";
import type { ShapedNode } from "./shape";
import type { Simulation } from "d3-force";

export type ToWorker =
  | { type: "start"; nodes: ShapedNode[]; edges: GraphEdge[]; anchors: Anchors; from: Positions }
  | { type: "update"; nodes: ShapedNode[]; edges: GraphEdge[]; anchors: Anchors }
  | { type: "drag"; id: string; x: number; y: number }
  | { type: "release"; id: string }
  | { type: "unpin"; id: string }
  | { type: "shake" };
export type FromWorker = { type: "tick" | "end"; positions: Positions; alpha: number };

const port = globalThis as unknown as { postMessage(message: FromWorker): void; addEventListener(type: "message", handler: (e: MessageEvent<ToWorker>) => void): void };

let simulation: Simulation<MapNode, MapEdge> | null = null;
let nodes: MapNode[] = [];
let frame = 0;

function begin(next: MapNode[], edges: MapEdge[], anchors: Anchors, alpha: number) {
  simulation?.stop();
  nodes = next;
  simulation = makeSimulation(nodes, edges, anchors).alpha(alpha);
  frame = 0;
  simulation.on("tick", () => {
    frame += 1;
    if (frame % 2 === 0) port.postMessage({ type: "tick", positions: positionsOf(nodes), alpha: simulation?.alpha() ?? 0 });
  });
  simulation.on("end", () => port.postMessage({ type: "end", positions: positionsOf(nodes), alpha: 0 }));
}

port.addEventListener("message", (e) => {
  const message = e.data;
  if (message.type === "start") {
    const next = toMapNodes(message.nodes, message.anchors, message.from);
    begin(next, toMapEdges(message.edges, next), message.anchors, Object.keys(message.from).length ? 0.4 : 1);
    return;
  }
  if (message.type === "update") {
    const next = toMapNodes(message.nodes, message.anchors, positionsOf(nodes));
    begin(next, toMapEdges(message.edges, next), message.anchors, 0.3);
    return;
  }
  if (!simulation) return;
  const node = "id" in message ? nodes.find((n) => n.id === message.id) : undefined;
  if (message.type === "drag" && node) {
    node.fx = message.x;
    node.fy = message.y;
    node.pinned = true;
    if (simulation.alphaTarget() === 0) simulation.alphaTarget(0.25).restart();
  } else if (message.type === "release") {
    simulation.alphaTarget(0);
    if (simulation.alpha() < 0.01) port.postMessage({ type: "end", positions: positionsOf(nodes), alpha: 0 });
  } else if (message.type === "unpin" && node) {
    node.fx = null;
    node.fy = null;
    node.pinned = false;
    simulation.alpha(0.3).restart();
  } else if (message.type === "shake") {
    for (const n of nodes) {
      n.fx = null;
      n.fy = null;
      n.pinned = false;
      n.vx = (n.vx ?? 0) + (Math.random() - 0.5) * 60;
      n.vy = (n.vy ?? 0) + (Math.random() - 0.5) * 60;
    }
    simulation.alpha(0.7).restart();
  }
});
