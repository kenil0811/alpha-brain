import { describe, expect, it } from "vitest";
import { eggHalfWidth } from "./forceLayout";

describe("the second brain's egg", () => {
  it("is narrower at the top than at the bottom (SVG y grows downward)", () => {
    for (const y of [0.3, 0.6, 0.9]) expect(eggHalfWidth(-y, 100)).toBeLessThan(eggHalfWidth(y, 100));
  });
});
