import { describe, expect, it } from "vitest";
import type { Ask } from "../core/client";
import { withoutCarded } from "./AssistantPanel";

const ask = (text: string, turn: string, derived = true): Ask => ({ id: "j_a", text, at: "", options: [], thread: null, module: null, turn, derived });

describe("a reply whose question became a card", () => {
  it("shows the words before the question, or nothing when it was only the question", () => {
    expect(withoutCarded("Logged it. Daily or weekly?", [ask("Daily or weekly?", "t_1")], "t_1")).toBe("Logged it.");
    expect(withoutCarded("What did you have for lunch?", [ask("What did you have for lunch?", "t_1")], "t_1")).toBeNull();
    expect(withoutCarded("Daily or weekly?", [ask("Daily or weekly?", "t_2")], "t_1")).toBe("Daily or weekly?");
    expect(withoutCarded("Daily or weekly?", [ask("Daily or weekly?", "t_1", false)], "t_1")).toBe("Daily or weekly?");
  });
});
