import { describe, expect, it } from "vitest";
import type { Fact, Intelligence, WorkGraph } from "../../core/client";
import { around, graphOf, groups, overview, place, search, subjectsOf, visible, type GNode } from "./model";

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

describe("the overview", () => {
  // Network holds Connections; six people are rows in it, at three organisations
  const n = (id: string, kind: GNode["kind"], title = id): GNode => ({ id, kind, title });
  const people = ["p1", "p2", "p3", "p4", "p5", "p6"];
  const at: Record<string, string> = { p1: "acme", p2: "acme", p3: "acme", p4: "bigco", p5: "bigco", p6: "solo" };
  const g = {
    nodes: [n("you", "you"), n("module:net", "module", "Network"), { ...n("table:connections", "collection", "Connections"), size: 6 }, n("acme", "organisation", "Acme"), n("bigco", "organisation", "BigCo"), n("solo", "organisation", "Solo Ltd"), ...people.map((p) => n(p, "person")), n("record:connections:r1", "record"), n("fact:f1", "fact", "Likes tea"), n("fact:f2", "fact", "Wants a house"), n("ada", "person", "Ada")],
    edges: [
      { from: "module:net", to: "you" },
      { from: "table:connections", to: "module:net" },
      ...people.flatMap((p) => [{ from: p, to: at[p] }, { from: p, to: "table:connections" }]),
      { from: "record:connections:r1", to: "table:connections" },
      { from: "fact:f1", to: "p1" },
      { from: "fact:f2", to: "you" },
      { from: "ada", to: "module:net" },
    ],
  };

  it("keeps projects and what sits in them, never each record or person, and facts about one person go with them", () => {
    const o = overview(g);
    const ids = o.nodes.map((x) => x.id);
    expect(ids).not.toContain("p1");
    expect(ids).not.toContain("record:connections:r1");
    expect(ids).not.toContain("fact:f1");
    expect(ids).toEqual(expect.arrayContaining(["you", "module:net", "table:connections", "fact:f2", "ada"])); // Ada is named in the project, not a row
  });

  it("draws the organisations that hold more than one person beside the collection their people are in, the rest as one node", () => {
    const o = overview(g);
    expect(o.nodes.find((x) => x.id === "acme")).toMatchObject({ detail: "3 people", size: 3 });
    expect(o.nodes.find((x) => x.id === "bigco")).toMatchObject({ detail: "2 people" });
    expect(o.nodes.find((x) => x.id === "solo")).toBeUndefined();
    expect(o.nodes.find((x) => x.id === "orgs:more")).toMatchObject({ title: "1 more organization", detail: "1 person" });
    expect(o.edges).toEqual(expect.arrayContaining([{ from: "acme", to: "table:connections" }, { from: "orgs:more", to: "table:connections" }]));
  });

  it("groups a project with what is in it and what hangs off that", () => {
    const o = overview(g);
    const placed = { "module:net": { x: 0, y: 0 }, "table:connections": { x: 30, y: 0 }, acme: { x: 60, y: 0 }, you: { x: -100, y: 0 } };
    expect(groups(o, placed)).toEqual([{ id: "module:net", x: 30, y: 0, r: 48 }]); // around their middle
  });
});
