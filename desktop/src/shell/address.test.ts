import { describe, expect, it } from "vitest";
import { pathFor, surfaceFromPath } from "./address";

describe("addresses", () => {
  it("round-trip every surface", () => {
    for (const s of [
      { kind: "home" }, { kind: "people" }, { kind: "entity", id: "e_1" },
      { kind: "module", id: "m_de9c" }, { kind: "record", module: "m_de9c", table: "deals", id: "r_1" }, { kind: "record", module: "m_de9c", table: "deals", id: "new" }, { kind: "intelligence" }, { kind: "intelligence", tab: "skills" }, { kind: "intelligence", tab: "activity" }, { kind: "settings" },
      { kind: "skill", name: "linkedin_connections" }, { kind: "automation", id: "a_1" }, { kind: "agent", id: "ag_1" },
    ] as const) {
      expect(surfaceFromPath(`#${pathFor(s)}`)).toEqual(s);
    }
  });
  it("keep the old Activity address and remembered place working: both open Intelligence › Activity", () => {
    expect(surfaceFromPath("#/activity")).toEqual({ kind: "intelligence", tab: "activity" });
    expect(pathFor({ kind: "activity" })).toBe("/intelligence/activity");
  });
  it("name a record's page by its module, table and id; two parts stay the module", () => {
    expect(pathFor({ kind: "record", module: "m_1", table: "deals", id: "r 1" })).toBe("/m/m_1/deals/r%201");
    expect(surfaceFromPath("#/m/m_1/deals/new")).toEqual({ kind: "record", module: "m_1", table: "deals", id: "new" });
    expect(surfaceFromPath("#/m/m_1/deals")).toEqual({ kind: "module", id: "m_1" });
  });
  it("ignore what they do not know", () => {
    expect(surfaceFromPath("")).toBeNull();
    expect(surfaceFromPath("#/nowhere")).toBeNull();
    expect(surfaceFromPath("#/m")).toBeNull();
    expect(surfaceFromPath("#/people/e%201")).toEqual({ kind: "entity", id: "e 1" });
  });
});
