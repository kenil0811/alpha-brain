import { describe, expect, it } from "vitest";
import { ANIMALS, DEFAULT_LOOK, furOf, normaliseLook, shade } from "./looks";

describe("the look", () => {
  it("is the default when nothing is stored", () => {
    expect(normaliseLook(null)).toEqual(DEFAULT_LOOK);
    expect(normaliseLook(undefined)).toEqual(DEFAULT_LOOK);
    expect(normaliseLook("panda")).toEqual(DEFAULT_LOOK);
  });

  it("keeps what is valid and fills the rest", () => {
    const look = normaliseLook({ animal: "fox", suit: "#123456", neckwear: "bow", glasses: true });
    expect(look).toEqual({ ...DEFAULT_LOOK, animal: "fox", suit: "#123456", neckwear: "bow", glasses: true });
  });

  it("takes the default for an animal or colour it does not know", () => {
    const look = normaliseLook({ animal: "dragon", suit: "red", shirt: "#GGGGGG", tie: "#ABCDEF", neckwear: "scarf", glasses: "yes", fur: 12 });
    expect(look).toEqual({ ...DEFAULT_LOOK, tie: "#abcdef", fur: null });
  });

  it("draws the chosen fur, else the animal's own, and the panda as painted", () => {
    expect(furOf(DEFAULT_LOOK)).toBeNull();
    expect(furOf({ ...DEFAULT_LOOK, animal: "fox" })).toBe(ANIMALS.find((a) => a.id === "fox")!.fur);
    expect(furOf({ ...DEFAULT_LOOK, animal: "fox", fur: "#aabbcc" })).toBe("#aabbcc");
  });

  it("shades a colour towards black or white", () => {
    expect(shade("#808080", -0.5)).toBe("#404040");
    expect(shade("#000000", 1)).toBe("#ffffff");
    expect(shade("#ff0000", 0)).toBe("#ff0000");
  });
});
