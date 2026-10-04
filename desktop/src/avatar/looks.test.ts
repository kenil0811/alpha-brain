import { describe, expect, it } from "vitest";
import { ANIMALS, DEFAULT_LOOK, furOf, normaliseLook, shade } from "./looks";

describe("the look", () => {
  it("is the default when nothing is stored", () => {
    expect(normaliseLook(null)).toEqual(DEFAULT_LOOK);
    expect(normaliseLook(undefined)).toEqual(DEFAULT_LOOK);
    expect(normaliseLook("panda")).toEqual(DEFAULT_LOOK);
  });

  it("keeps what is valid and fills the rest", () => {
    const look = normaliseLook({ animal: "fox", suit: "#123456", accessories: ["spectacles", "bowtie"] });
    expect(look).toEqual({ ...DEFAULT_LOOK, animal: "fox", suit: "#123456", accessories: ["bowtie", "spectacles"] });
  });

  it("takes the default for an animal or colour it does not know", () => {
    const look = normaliseLook({ animal: "dragon", suit: "red", shirt: "#GGGGGG", tie: "#ABCDEF", accessories: ["cape", "scarf", "scarf"], fur: 12 });
    expect(look).toEqual({ ...DEFAULT_LOOK, tie: "#abcdef", fur: null, accessories: ["scarf"] });
  });

  it("wears any mix of accessories, none too", () => {
    expect(normaliseLook({ accessories: [] }).accessories).toEqual([]);
    expect(normaliseLook({ accessories: ["spectacles", "scarf", "bowtie", "tie"] }).accessories).toEqual(["tie", "bowtie", "scarf", "spectacles"]);
  });

  it("moves a look kept with neckwear and glasses onto accessories", () => {
    expect(normaliseLook({ neckwear: "tie", glasses: false }).accessories).toEqual(["tie"]);
    expect(normaliseLook({ neckwear: "bow", glasses: true }).accessories).toEqual(["bowtie", "spectacles"]);
    expect(normaliseLook({ neckwear: "none", glasses: true }).accessories).toEqual(["spectacles"]);
    expect(normaliseLook({ neckwear: "none" }).accessories).toEqual([]);
    expect(normaliseLook({ animal: "fox" }).accessories).toEqual(["tie"]);
    // A list already kept wins over the old fields; the old fields are not carried on.
    const look = normaliseLook({ neckwear: "bow", glasses: true, accessories: ["scarf"] });
    expect(look.accessories).toEqual(["scarf"]);
    expect(look).not.toHaveProperty("neckwear");
    expect(look).not.toHaveProperty("glasses");
  });

  it("has three sizes, medium unless the person chose another", () => {
    expect(normaliseLook({ size: "large" }).size).toBe("large");
    expect(normaliseLook({ size: "huge" }).size).toBe("medium");
    expect(normaliseLook({}).size).toBe("medium");
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
