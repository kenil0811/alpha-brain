import { describe, expect, it } from "vitest";
import type { Fact, Intelligence, WorkGraph } from "../../core/client";
import { brainOf, insideEgg, layEgg, YOLK, type Brain } from "./egg";

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

  it("draws only real links: a fact to its subject, a person to the module of the table they are a row in", () => {
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
    expect(pairs).toEqual(["entity:p1 module:m1", "fact:Berlin you", "fact:tea you"]);
    expect(brain.edges.find((e) => e.from === "fact:tea")?.waiting).toBe(true);
    expect(brain.nodes.find((n) => n.id === "entity:p2")?.open).toEqual({ kind: "entity", id: "p2" });
    expect(brain.nodes.some((n) => n.id === "agent:alpha")).toBe(true);
  });
});
