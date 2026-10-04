import { describe, expect, it } from "vitest";
import type { Fact } from "../core/client";
import { factOrigin } from "./facts";

const fact = (extra: Partial<Fact>): Fact => ({ id: "f", subject: "person", predicate: "lives_in", value: "Lisbon", valid_from: "", valid_to: null, recorded_at: "", source: "stated", why: null, confidence: 0.95, state: "accepted", ...extra });

describe("where a fact came from", () => {
  it("says who, how and from which words", () => {
    expect(factOrigin(fact({}))).toBe("You said so");
    expect(factOrigin(fact({ source: "turn:j_1", state: "suggested", confidence: 0.6, why: "I think I'll like the food" }))).toBe("Zazoo noticed it — “I think I'll like the food”");
    expect(factOrigin(fact({ source: "turn:j_1", confidence: 0.9, why: "I moved to Lisbon" }))).toBe("From your own words — “I moved to Lisbon”");
    expect(factOrigin(fact({ source: "ocado.com" }))).toBe("From ocado.com");
  });
});
