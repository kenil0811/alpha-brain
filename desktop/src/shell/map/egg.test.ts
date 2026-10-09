import { describe, expect, it } from "vitest";
import type { Fact, Intelligence, RecordRow, TableDesc, WorkGraph } from "../../core/client";
import { brainOf, insideEgg, layEgg, RECORD_SAMPLE, RECORDS_ALL_AT, stepToward, YOLK, type Brain } from "./egg";

const fact = (id: string, over: Partial<Fact> = {}): Fact => ({ id, subject: "person", predicate: "home_city", value: id, valid_from: "", valid_to: null, recorded_at: "", source: "stated", why: null, confidence: 1, state: "accepted", ...over });

describe("the egg", () => {
  it("keeps every node, all of its circle, inside the shell", () => {
    const brain: Brain = { nodes: [{ id: "you", kind: "you", title: "You" }], edges: [] };
    for (let i = 0; i < 160; i += 1) {
      brain.nodes.push({ id: `n${i}`, kind: i % 9 === 0 ? "module" : i % 3 === 0 ? "person" : "fact", title: `${i}` });
      if (i % 2) brain.edges.push({ from: `n${i}`, to: i % 4 === 1 ? "you" : `n${i - 1}` });
    }
    const at = layEgg(brain);
    for (const { x, y, r } of Object.values(at)) {
      expect(Number.isFinite(x) && Number.isFinite(y)).toBe(true);
      for (const [px, py] of [[x - r, y], [x + r, y], [x, y - r], [x, y + r]]) expect(insideEgg(px, py)).toBe(true);
    }
    expect(at.you).toMatchObject(YOLK); // the person stays at the yolk
    expect(layEgg(brain)).toEqual(at); // the same brain draws the same way
  });

  it("draws only real links: you to a project, a collection to its project, a fact to its subject, a person to the collection they are a row in", () => {
    const world: WorkGraph = {
      at: "",
      nodes: [
        { id: "you", kind: "you", title: "You" },
        { id: "module:m1", kind: "module", title: "Deals", module: "m1" },
        { id: "table:t", kind: "table", title: "Deals", module: "m1" },
        { id: "entity:p1", kind: "person", title: "Ada", entity: "p1" },
        { id: "entity:p2", kind: "person", title: "Bob", entity: "p2" },
      ],
      edges: [
        { from: "table:t", to: "module:m1", kind: "in" },
        { from: "entity:p1", to: "table:t", kind: "row in", count: 2 },
      ],
    };
    const data = { knowledge: { facts: [fact("Berlin"), fact("tea", { state: "suggested" })], notes: [], goals: [] }, skills: [], automations: [], hands: [] } as unknown as Intelligence;
    const brain = brainOf(world, data);
    const pairs = brain.edges.map((e) => [e.from, e.to].sort().join(" "));
    expect(pairs.filter((p) => !p.includes("agent:"))).toEqual(["module:m1 table:t", "entity:p1 table:t", "module:m1 you", "fact:Berlin you", "fact:tea you"]);
    expect(brain.edges.find((e) => e.from === "fact:tea")?.waiting).toBe(true);
    expect(brain.nodes.find((n) => n.id === "entity:p2")?.open).toEqual({ kind: "entity", id: "p2" });
    expect(brain.nodes.some((n) => n.id === "agent:alpha")).toBe(true);
  });

  const row = (id: string, values: Record<string, unknown>, entity?: string): RecordRow => ({ id, revision: 1, values, created_at: "", updated_at: "", provenance: {}, entity });
  const desc = (name: string, title: string, fields: TableDesc["fields"]): TableDesc => ({ name, title, module: "m1", title_field: "name", fields, records: 0 });
  const world: WorkGraph = {
    at: "",
    nodes: [
      { id: "you", kind: "you", title: "You" },
      { id: "module:m1", kind: "module", title: "Deals", module: "m1" },
      { id: "table:deals", kind: "table", title: "Deals", module: "m1" },
      { id: "entity:o1", kind: "organisation", title: "Acme", entity: "o1" },
    ],
    edges: [{ from: "table:deals", to: "module:m1", kind: "in" }],
  };
  const none = { knowledge: { facts: [], notes: [], goals: [] }, skills: [], automations: [], hands: [] } as unknown as Intelligence;

  it("makes every record a dot linked to its collection, to the records it relates to and to the organisation it is", () => {
    const tables = [
      { table: desc("deals", "Deals", [{ name: "name", kind: "text" }, { name: "buyer", kind: "relation", relation: "firms" }]), records: [row("d1", { name: "Big sale", buyer: "f1" }), row("d2", { name: "", buyer: ["f1", "gone"] })] },
      { table: desc("firms", "Firms", [{ name: "name", kind: "text" }]), records: [row("f1", { name: "Acme" }, "o1")] },
    ];
    const brain = brainOf(world, none, tables);
    const d1 = brain.nodes.find((n) => n.id === "record:deals:d1");
    expect(d1).toMatchObject({ kind: "record", title: "Big sale", collection: "table:deals", open: { kind: "record", module: "m1", table: "deals", id: "d1" } });
    expect(brain.nodes.find((n) => n.id === "record:deals:d2")?.title).toBe("Untitled");
    expect(brain.nodes.find((n) => n.id === "table:firms")?.kind).toBe("collection"); // a collection the world map missed
    const pairs = brain.edges.map((e) => [e.from, e.to].sort().join(" "));
    for (const p of ["record:deals:d1 table:deals", "record:deals:d2 table:deals", "record:firms:f1 table:firms", "module:m1 table:firms", "record:deals:d1 record:firms:f1", "record:deals:d2 record:firms:f1", "entity:o1 record:firms:f1"]) expect(pairs).toContain(p);
    expect(pairs.some((p) => p.includes("gone"))).toBe(false); // a relation to a record that isn't there draws nothing
    expect(brain.edges.find((e) => e.from === "record:deals:d1" && e.to === "table:deals")?.spoke).toBe(true);
  });

  it("puts records around their collection inside the shell, and samples a big collection until zoomed in", () => {
    const many = Array.from({ length: 1000 }, (_, i) => row(`r${i}`, { name: `R${i}` }));
    const brain = brainOf(world, none, [{ table: desc("deals", "Deals", [{ name: "name", kind: "text" }]), records: many }]);
    const at = layEgg(brain);
    const recs = many.map((r) => at[`record:deals:${r.id}`]);
    for (const { x, y, r } of recs) for (const [px, py] of [[x - r, y], [x + r, y], [x, y - r], [x, y + r]]) expect(insideEgg(px, py)).toBe(true);
    const shown = recs.filter((p) => !p.zoom).length;
    expect(shown).toBeLessThanOrEqual(RECORD_SAMPLE);
    expect(recs.every((p) => !p.zoom || p.zoom === RECORDS_ALL_AT)).toBe(true);
    expect(at["table:deals"].more).toBe(1000 - shown);
  });
});

describe("the arrow keys in the egg", () => {
  const at = { a: { x: 0, y: 0, r: 1 }, right: { x: 10, y: 1, r: 1 }, far: { x: 40, y: 0, r: 1 }, up: { x: 0, y: -10, r: 1 } };
  it("moves to the neighbour that way, then to anything that way, else nowhere", () => {
    expect(stepToward("a", ["far", "up"], Object.keys(at), at, "ArrowRight")).toBe("far");
    expect(stepToward("a", ["up"], Object.keys(at), at, "ArrowRight")).toBe("right");
    expect(stepToward("a", [], Object.keys(at), at, "ArrowUp")).toBe("up");
    expect(stepToward("a", [], Object.keys(at), at, "ArrowLeft")).toBeNull();
  });
});
