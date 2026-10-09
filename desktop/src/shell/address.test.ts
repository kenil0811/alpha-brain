import { describe, expect, it } from "vitest";
import { pathFor, surfaceFromPath } from "./address";

describe("addresses", () => {
  it("round-trip every surface", () => {
    for (const s of [
      { kind: "home" }, { kind: "people" }, { kind: "entity", id: "e_1" },
      { kind: "module", id: "m_de9c" }, { kind: "intelligence" }, { kind: "intelligence", tab: "skills" }, { kind: "intelligence", tab: "activity" }, { kind: "settings" },
      { kind: "skill", name: "linkedin_connections" }, { kind: "automation", id: "a_1" }, { kind: "agent", id: "ag_1" },
    ] as const) {
      expect(surfaceFromPath(`#${pathFor(s)}`)).toEqual(s);
    }
  });
  it("keep the old Activity address and remembered place working: both open Intelligence › Activity", () => {
    expect(surfaceFromPath("#/activity")).toEqual({ kind: "intelligence", tab: "activity" });
    expect(pathFor({ kind: "activity" })).toBe("/intelligence/activity");
  });
  it("ignore what they do not know", () => {
    expect(surfaceFromPath("")).toBeNull();
    expect(surfaceFromPath("#/nowhere")).toBeNull();
    expect(surfaceFromPath("#/m")).toBeNull();
    expect(surfaceFromPath("#/people/e%201")).toEqual({ kind: "entity", id: "e 1" });
  });
});
