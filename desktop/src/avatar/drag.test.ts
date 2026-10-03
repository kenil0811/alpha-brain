import { describe, expect, it } from "vitest";
import { moved, press, released } from "./drag";

describe("drag or click", () => {
  it("a press that barely moves is a click", () => {
    let p = press(10, 10);
    p = moved(p, 12, 11);
    expect(released(p)).toBe("click");
  });

  it("a press that moves past the slop is a drag, and stays one", () => {
    let p = press(10, 10);
    p = moved(p, 18, 10);
    expect(p.dragging).toBe(true);
    p = moved(p, 10, 10);
    expect(released(p)).toBe("drag");
  });

  it("a release with no press is nothing", () => {
    expect(released(null)).toBe("nothing");
  });
});
