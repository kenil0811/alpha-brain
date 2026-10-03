import { describe, expect, it } from "vitest";
import type { WorkGraph } from "../../core/client";
import { shape, signature } from "./shape";

const graph: WorkGraph = {
  at: "2026-10-03T21:00:00+00:00",
  nodes: [
    { id: "module:m1", kind: "module", title: "Deals", module: "m1" },
    { id: "table:deals", kind: "table", title: "Deal listings", module: "m1", rows: 10 },
    { id: "skill:brokers", kind: "skill", role: "read", title: "brokers", name: "brokers", state: "ok" },
    { id: "skill:run_deals", kind: "skill", role: "run", title: "run deals", name: "run_deals", module: "m1" },
    { id: "automation:a1", kind: "automation", title: "Daily deals", module: "m1", state: "on" },
    { id: "source:s1", kind: "source", title: "Brokers site", subtitle: "https://brokers.com/list", state: "working", module: "m1" },
    { id: "source:s2", kind: "source", title: "Walled site", subtitle: "https://walled.com", state: "needs_signin", module: "m1" },
    { id: "skill:gmail_draft", kind: "skill", role: "act", title: "gmail draft", name: "gmail_draft" },
    { id: "connection:c1", kind: "connection", title: "brokers.com", subtitle: "browser", state: "connected" },
  ],
  edges: [
    { from: "table:deals", to: "module:m1", kind: "in" },
    { from: "automation:a1", to: "skill:run_deals", kind: "runs" },
    { from: "skill:run_deals", to: "skill:brokers", kind: "runs", order: 1 },
    { from: "skill:brokers", to: "table:deals", kind: "reads into" },
    { from: "source:s1", to: "skill:brokers", kind: "read by" },
    { from: "source:s2", to: "module:m1", kind: "in" },
    { from: "connection:c1", to: "skill:brokers", kind: "signed in at" },
  ],
};

describe("the map's shape", () => {
  it("folds a source with a reader into the reader and keeps the ones nothing reads", () => {
    const s = shape(graph);
    const ids = s.nodes.map((n) => n.id);
    expect(ids).not.toContain("source:s1");
    expect(ids).toContain("source:s2");
    const reader = s.nodes.find((n) => n.id === "skill:brokers")!;
    expect(reader.sources).toEqual([{ title: "Brokers site", url: "https://brokers.com/list", state: "working" }]);
    expect(s.edges.some((e) => e.kind === "read by")).toBe(false);
  });

  it("gives every node a home: the module it belongs with, inferred along its work", () => {
    const home = Object.fromEntries(shape(graph).nodes.map((n) => [n.id, n.home]));
    expect(home["skill:brokers"]).toBe("m1");
    expect(home["skill:run_deals"]).toBe("m1");
    expect(home["automation:a1"]).toBe("m1");
    expect(home["source:s2"]).toBe("m1");
    expect(home["skill:gmail_draft"]).toBe("");
    expect(home["connection:c1"]).toBe("");
    expect(shape(graph).homes).toEqual(["m1", ""]);
  });

  it("signs a graph by its facts, so a refresh that changed nothing is known as such", () => {
    const same = signature({ ...graph, at: "later" });
    expect(same).toBe(signature(graph));
    const broke = { ...graph, nodes: graph.nodes.map((n) => (n.id === "skill:brokers" ? { ...n, state: "broken" } : n)) };
    expect(signature(broke)).not.toBe(signature(graph));
    const decided = { ...graph, edges: [...graph.edges, { from: "skill:brokers", to: "table:deals", kind: "related" as const, state: "accepted" as const, fact: "f1" }] };
    const pending = { ...graph, edges: [...graph.edges, { from: "skill:brokers", to: "table:deals", kind: "related" as const, state: "suggested" as const, fact: "f1" }] };
    expect(signature(decided)).not.toBe(signature(pending));
  });
});
