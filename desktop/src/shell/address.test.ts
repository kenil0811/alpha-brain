import { describe, expect, it } from "vitest";
import { pathFor, surfaceFromPath } from "./address";

describe("addresses", () => {
  it("round-trip every surface", () => {
    for (const s of [
      { kind: "home" }, { kind: "activity" }, { kind: "people" }, { kind: "entity", id: "e_1" },
      { kind: "module", id: "m_de9c" }, { kind: "intelligence" }, { kind: "intelligence", tab: "skills" }, { kind: "settings" },
    ] as const) {
      expect(surfaceFromPath(`#${pathFor(s)}`)).toEqual(s);
    }
  });
  it("ignore what they do not know", () => {
    expect(surfaceFromPath("")).toBeNull();
    expect(surfaceFromPath("#/nowhere")).toBeNull();
    expect(surfaceFromPath("#/m")).toBeNull();
    expect(surfaceFromPath("#/people/e%201")).toEqual({ kind: "entity", id: "e 1" });
  });
});
