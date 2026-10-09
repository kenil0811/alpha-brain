/**
 * The agents Intelligence lists (the UI rulebook §12), derived from what the core already says
 * and nothing more: **Alpha**, the assistant, and, for each module that has automations, **that
 * module's runner**. An agent is its skills and its automations; the core keeps no separate
 * record of one. (9 Oct, the pages phase.)
 */
import type { Automation, Intelligence, Skill } from "../core/client";

export const ALPHA_AGENT = "alpha";

export interface Agent {
  id: string;
  name: string;
  description: string;
  /** The module this agent runs, or null for Alpha. */
  module: string | null;
  skills: Skill[];
  automations: Automation[];
}

const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function agentsFrom(data: Pick<Intelligence, "skills" | "automations" | "hands">, modules: Record<string, string>): Agent[] {
  const runners = [...new Set(data.automations.map((a) => a.module).filter((m): m is string => Boolean(m)))].sort((a, b) => (modules[a] ?? a).localeCompare(modules[b] ?? b));
  const alpha: Agent = {
    id: ALPHA_AGENT,
    name: "Alpha",
    description: `The assistant: answers you, reads and does what you ask, with ${count(data.hands.length, "built-in hand", "built-in hands")} and the skills it has learned.`,
    module: null,
    skills: data.skills.filter((s) => !s.module || !runners.includes(s.module)),
    automations: data.automations.filter((a) => !a.module),
  };
  const per = runners.map((m): Agent => {
    const name = modules[m] ?? "A module";
    const automations = data.automations.filter((a) => a.module === m);
    return {
      id: m,
      name: `${name} runner`,
      description: `Runs ${name}'s ${count(automations.length, "automation", "automations")} on its own, with the skills that module uses.`,
      module: m,
      skills: data.skills.filter((s) => s.module === m),
      automations,
    };
  });
  return [alpha, ...per];
}
