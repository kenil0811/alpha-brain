import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { projectIcon, suggestedIcon } from "./moduleIcons";

describe("a project's icon", () => {
  it("comes from its name first, then its goal, and is never a table by default", () => {
    expect(suggestedIcon("Deals", null)).toBe("briefcase");
    expect(suggestedIcon("Food log", null)).toBe("food");
    expect(suggestedIcon("Zephyr", "Plan my trips abroad")).toBe("target"); // "plan" in the goal
    expect(suggestedIcon("Zephyr", "Weekend flights")).toBe("plane");
    expect(suggestedIcon("Zephyr", null)).toBeNull();
  });

  it("is the person's pick when there is one, else the first letter", () => {
    const picked = render(<>{projectIcon("music", "Deals", null, 20)}</>);
    expect(picked.container.querySelector("svg")).not.toBeNull();
    const letter = render(<>{projectIcon(undefined, "zephyr", null, 20)}</>);
    expect(letter.container.querySelector(".modletter")?.textContent).toBe("Z");
  });
});
