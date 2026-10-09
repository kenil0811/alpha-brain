import { describe, expect, it } from "vitest";
import type { Automation, Skill } from "../core/client";
import { ALPHA_AGENT, agentsFrom } from "./agents";

const skill = (name: string, module: string | null) => ({ name, module }) as Skill;
const auto = (id: string, module: string | null) => ({ id, module }) as Automation;

describe("agents", () => {
  it("is Alpha, plus one runner for each module that has automations", () => {
    const agents = agentsFrom(
      { hands: [], skills: [skill("read_deals", "m1"), skill("linkedin", null), skill("food", "m2")], automations: [auto("a1", "m1"), auto("a2", null)] },
      { m1: "Deals", m2: "Food" },
    );
    expect(agents.map((a) => a.id)).toEqual([ALPHA_AGENT, "m1"]);
    expect(agents[1].name).toBe("Deals runner");
    expect(agents[1].skills.map((s) => s.name)).toEqual(["read_deals"]);
    // a skill of a module without a runner stays with Alpha
    expect(agents[0].skills.map((s) => s.name)).toEqual(["linkedin", "food"]);
    expect(agents[0].automations.map((a) => a.id)).toEqual(["a2"]);
  });
});
