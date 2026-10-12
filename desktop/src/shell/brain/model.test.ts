import { describe, expect, it } from "vitest";
import type { Fact, Intelligence, WorkGraph } from "../../core/client";
import { around, graphOf, place, search, subjectsOf, visible } from "./model";

const fact = (id: string, over: Partial<Fact> = {}): Fact => ({ id, subject: "person", predicate: "likes", value: id, valid_from: "", valid_to: null, recorded_at: "", source: "stated", why: null, confidence: 1, state: "accepted", ...over });
const world: WorkGraph = { at: "", nodes: [{ id: "module:m1", kind: "module", title: "Deals", module: "m1" }, { id: "goal:g1", kind: "goal", title: "Close ten", module: "m1" }], edges: [{ from: "goal:g1", to: "module:m1", kind: "in" }] };
const data = {
  hands: [],
  skills: [],
  automations: [{ id: "a1", title: "Morning check", module: "m1" }],
  connections: [{ id: "c1", connector: "calendar", target: "Work calendar", status: "connected", config: {}, last_sync: null, last_error: null }],
  knowledge: { facts: [fact("tea"), fact("coffee", { state: "suggested" }), fact("loner", { subject: "entity:nobody" })], notes: [], goals: [{ id: "g1", text: "Close ten", state: "active", module: "m1", since: "" }] },
} as unknown as Intelligence;

describe("Second Brain's graph", () => {
  it("has every kind: a suggested fact as a hypothesis, goals on their project, automations and connections", () => {
    const g = graphOf(world, data);
    const kind = (id: string) => g.nodes.find((n) => n.id === id)?.kind;
    expect(kind("fact:coffee")).toBe("hypothesis");
    expect(kind("fact:tea")).toBe("fact");
    expect(kind("automation:a1")).toBe("automation");
    expect(kind("connection:c1")).toBe("connection");
    expect(g.nodes.filter((n) => n.id === "goal:g1")).toHaveLength(1); // the world's and Intelligence's goal are one
    const linked = (a: string, b: string) => g.edges.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));
    expect(linked("goal:g1", "module:m1")).toBe(true);
    expect(linked("automation:a1", "module:m1")).toBe(true);
    expect(linked("connection:c1", "you")).toBe(true);
  });

  it("finds what is within n links, hides kinds and orphans, and searches titles", () => {
    const g = graphOf(world, data);
    expect([...around(g, "goal:g1", 1)].sort()).toEqual(["goal:g1", "module:m1"]);
    expect(around(g, "goal:g1", 2).has("you")).toBe(true);
    const noFacts = visible(g, { hidden: new Set(["fact"]) });
    expect(noFacts.nodes.some((n) => n.kind === "fact")).toBe(false);
    expect(noFacts.edges.every((e) => !e.from.startsWith("fact:tea") && !e.to.startsWith("fact:tea"))).toBe(true);
    expect(visible(g, { orphans: false }).nodes.some((n) => n.id === "fact:loner")).toBe(false); // its subject isn't in the graph
    expect(search(g, "morning").map((n) => n.id)).toEqual(["automation:a1"]);
  });

  it("lays the same graph out the same way, every node placed", () => {
    const g = graphOf(world, data);
    const a = place(g);
    expect(Object.keys(a).sort()).toEqual(g.nodes.map((n) => n.id).sort());
    expect(place(g)).toEqual(a);
  });
});

describe("a project's second brain", () => {
  it("is about whom its work names: named in the project, or a row in one of its collections", () => {
    const w: WorkGraph = { at: "", nodes: [], edges: [{ from: "entity:a", to: "module:m1", kind: "named in" }, { from: "entity:b", to: "table:deals", kind: "row in" }, { from: "entity:c", to: "module:m2", kind: "named in" }] };
    expect([...subjectsOf(w, "m1", ["deals"])].sort()).toEqual(["entity:a", "entity:b"]);
  });
});
