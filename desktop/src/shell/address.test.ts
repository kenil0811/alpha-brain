import { describe, expect, it } from "vitest";
import { pathFor, surfaceFromPath } from "./address";

describe("addresses", () => {
  it("round-trip every surface", () => {
    for (const s of [
      { kind: "home" }, { kind: "activity" }, { kind: "people" }, { kind: "entity", id: "e_1" },
      { kind: "module", id: "m_de9c" }, { kind: "intelligence" }, { kind: "intelligence", tab: "skills" }, { kind: "settings" }, { kind: "settings", section: "shortcuts" },
      { kind: "skill", name: "linkedin_connections" }, { kind: "automation", id: "a_1" },
      { kind: "intelligence", tab: "connections", item: "c_1" }, { kind: "intelligence", tab: "knowledge", item: "f_1" },
      { kind: "intelligence", tab: "knowledge", item: "standing-instructions" }, { kind: "intelligence", tab: "skills", item: "hand:browser" },
    ] as const) {
      expect(surfaceFromPath(`#${pathFor(s)}`)).toEqual(s);
    }
  });
  it("ignore what they do not know", () => {
    expect(surfaceFromPath("")).toBeNull();
    expect(surfaceFromPath("#/nowhere")).toBeNull();
    expect(surfaceFromPath("#/m")).toBeNull();
    expect(surfaceFromPath("#/people/e%201")).toEqual({ kind: "entity", id: "e 1" });
    expect(surfaceFromPath("#/intelligence/skills/hand%3Abrowser")).toEqual({ kind: "intelligence", tab: "skills", item: "hand:browser" });
    expect(surfaceFromPath("#/intelligence/skills/lumen_jobs")).toEqual({ kind: "skill", name: "lumen_jobs" });
  });
});
