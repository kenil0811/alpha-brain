/**
 * What the map draws, shaped from what the core gives: sources that a working reader reads
 * fold into that reader (the reader's card lists them), so only the sources nothing reads yet
 * stay as dots of their own, the ones worth seeing; every node gets a home (the module it
 * belongs with, inferred for readers from the table they feed), which the layout clusters by;
 * and the "in" edges are kept for neighbourhoods but not drawn, because the clusters show it.
 */
import type { GraphEdge, GraphNode, WorkGraph } from "../../core/client";

export interface Shaped {
  nodes: ShapedNode[];
  edges: GraphEdge[];
  /** Module ids in a stable order, each a cluster; "" is the cluster of what has no module. */
  homes: string[];
}

export interface ShapedNode extends GraphNode {
  /** The module this clusters with; "" when none. */
  home: string;
  /** For a reader: the sources it reads, folded in. */
  sources?: { title: string; url?: string; state?: string }[];
}

export function shape(graph: WorkGraph): Shaped {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  // Sources with a working reader fold into the reader.
  const folded = new Set<string>();
  const sourcesOf = new Map<string, ShapedNode["sources"]>();
  for (const e of graph.edges) {
    if (e.kind !== "read by") continue;
    const source = byId.get(e.from);
    if (!source || source.kind !== "source") continue;
    folded.add(source.id);
    (sourcesOf.get(e.to) ?? sourcesOf.set(e.to, []).get(e.to)!)!.push({ title: source.title, url: source.subtitle, state: source.state });
  }
  const kept = graph.nodes.filter((n) => !folded.has(n.id));
  const keptIds = new Set(kept.map((n) => n.id));
  const edges = graph.edges.filter((e) => keptIds.has(e.from) && keptIds.has(e.to));

  // Homes: a module's own, else inferred along the edges that say where a thing's work goes.
  const home = new Map<string, string>();
  for (const n of kept) if (n.module) home.set(n.id, n.module);
  const settle = (id: string, via: string) => {
    if (!home.has(id) && home.has(via)) home.set(id, home.get(via)!);
  };
  for (let pass = 0; pass < 3; pass += 1) {
    for (const e of edges) {
      if (e.kind === "reads into" || e.kind === "tells") settle(e.from, e.to);
      if (e.kind === "runs") {
        settle(e.to, e.from);
        settle(e.from, e.to);
      }
    }
  }
  const nodes: ShapedNode[] = kept.map((n) => ({ ...n, home: n.kind === "module" ? n.module ?? "" : home.get(n.id) ?? "", sources: sourcesOf.get(n.id) }));
  const homes = [...new Set(nodes.map((n) => n.home))].filter(Boolean).sort((a, b) => (byId.get(`module:${a}`)?.title ?? a).localeCompare(byId.get(`module:${b}`)?.title ?? b));
  return { nodes, edges, homes: [...homes, ""] };
}

/** A stable signature of a graph's facts, to tell a refresh that changed nothing from one that did. */
export function signature(graph: WorkGraph): string {
  const nodes = graph.nodes.map((n) => `${n.id}|${n.state ?? ""}|${n.rows ?? ""}|${n.runs ?? ""}|${n.failed ?? ""}|${n.subtitle ?? ""}`).sort();
  const edges = graph.edges.map((e) => `${e.from}>${e.to}:${e.kind}:${e.count ?? ""}`).sort();
  return `${nodes.join("\n")}\n${edges.join("\n")}`;
}
