/**
 * The map's layout off the main thread: the page never stalls while the simulation settles,
 * however many nodes. Messages in: start (the graph and the area), drag (a node held at a
 * point), release, shake. Messages out: tick (every node's position), end.
 */
import { makeSimulation, positionsOf, toMapEdges, toMapNodes, type MapEdge, type MapNode } from "./layout";
import type { GraphEdge, GraphNode } from "../../core/client";
import type { Simulation } from "d3-force";

export type ToWorker =
  | { type: "start"; nodes: GraphNode[]; edges: GraphEdge[]; width: number; height: number }
  | { type: "drag"; id: string; x: number; y: number }
  | { type: "release"; id: string }
  | { type: "shake" };
export type FromWorker = { type: "tick" | "end"; positions: Record<string, { x: number; y: number }>; alpha: number };

const port = globalThis as unknown as { postMessage(message: FromWorker): void; addEventListener(type: "message", handler: (e: MessageEvent<ToWorker>) => void): void };

let simulation: Simulation<MapNode, MapEdge> | null = null;
let nodes: MapNode[] = [];
let frame = 0;

port.addEventListener("message", (e) => {
  const message = e.data;
  if (message.type === "start") {
    simulation?.stop();
    nodes = toMapNodes(message.nodes);
    const edges = toMapEdges(message.edges, nodes);
    simulation = makeSimulation(nodes, edges, message.width, message.height);
    frame = 0;
    simulation.on("tick", () => {
      frame += 1;
      if (frame % 2 === 0) port.postMessage({ type: "tick", positions: positionsOf(nodes), alpha: simulation?.alpha() ?? 0 });
    });
    simulation.on("end", () => port.postMessage({ type: "end", positions: positionsOf(nodes), alpha: 0 }));
    return;
  }
  if (!simulation) return;
  if (message.type === "drag") {
    const node = nodes.find((n) => n.id === message.id);
    if (!node) return;
    node.fx = message.x;
    node.fy = message.y;
    if (simulation.alphaTarget() === 0) simulation.alphaTarget(0.25).restart();
  } else if (message.type === "release") {
    const node = nodes.find((n) => n.id === message.id);
    if (node) {
      node.fx = null;
      node.fy = null;
    }
    simulation.alphaTarget(0);
  } else if (message.type === "shake") {
    for (const n of nodes) {
      n.vx = (n.vx ?? 0) + (Math.random() - 0.5) * 40;
      n.vy = (n.vy ?? 0) + (Math.random() - 0.5) * 40;
    }
    simulation.alpha(0.6).restart();
  }
});
