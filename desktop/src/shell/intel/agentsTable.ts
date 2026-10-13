/**
 * Intelligence › Agents as a table (13 Oct, Q42 section 7c; the feature from pull request #5, the
 * view main's own): Alpha first ("Alpha — your assistant", whose row opens the Assistant), then
 * every automation (Q33: an agent's process, with a goal and a verdict per run judged by code),
 * each a row of the one data view wearing its agent's face. The switch and Run now sit at the
 * start of an automation's row; its › opens its page, where its look is picked.
 */
import type { Automation, RecordRow, TableDesc } from "../../core/client";
import type { Colours } from "../../modules/views/engine";
import { ALPHA_AGENT } from "../AgentFace";
import { VERDICT } from "../Automations";

export const AGENT_STATE = { running: "Running now", on: "On", off: "Off" } as const;
export const NOT_JUDGED = "Not judged yet";

export function agentsTable(automations: Automation[], modules: Record<string, string>): TableDesc {
  const moduleNames = [...new Set(automations.map((a) => (a.module ? modules[a.module] : undefined)).filter((m): m is string => Boolean(m)))].sort();
  return {
    name: "intel_agents",
    title: "Agents",
    module: null,
    title_field: "agent",
    records: automations.length + 1,
    readonly: true,
    fields: [
      { name: "agent", kind: "text", label: "Agent" },
      { name: "goal", kind: "text", label: "What it is for" },
      { name: "when", kind: "text", label: "When it runs" },
      { name: "state", kind: "status", label: "State", choices: Object.values(AGENT_STATE), done_choices: [AGENT_STATE.on] },
      { name: "next_run", kind: "datetime", label: "Next run" },
      { name: "last_run", kind: "datetime", label: "Last run" },
      { name: "verdict", kind: "status", label: "Last verdict", choices: [...Object.values(VERDICT).map((v) => v.words), NOT_JUDGED], done_choices: [VERDICT.succeeded.words] },
      { name: "why", kind: "text", label: "Why" },
      // only when an agent belongs to a module: a column of dashes says nothing
      ...(moduleNames.length ? [{ name: "module", kind: "choice", label: "Module", choices: moduleNames }] : []),
    ],
  };
}

const row = (id: string, values: Record<string, unknown>, at = ""): RecordRow => ({ id, revision: 1, values, created_at: at, updated_at: at, provenance: {} });

/** Alpha's own row: the assistant, which answers whenever the person asks. */
export const alphaRow = (): RecordRow => row(ALPHA_AGENT, { agent: "Alpha — your assistant", goal: "Answers you, keeps your modules and asks before acting", when: "When you ask", state: null, next_run: null, last_run: null, verdict: null, why: null, module: null });

export function automationRow(a: Automation, modules: Record<string, string>): RecordRow {
  return row(
    a.id,
    {
      agent: a.title,
      goal: a.goal ?? null,
      when: a.when,
      state: a.running ? AGENT_STATE.running : a.enabled ? AGENT_STATE.on : AGENT_STATE.off,
      next_run: a.enabled ? a.next_run_at : null,
      last_run: a.last_run_at,
      verdict: a.last_verdict ? VERDICT[a.last_verdict].words : a.last_run_at ? NOT_JUDGED : null,
      why: a.last_why ?? (a.last_error ? `Didn't work: ${a.last_error}` : null),
      module: a.module ? (modules[a.module] ?? null) : null,
    },
    a.last_run_at ?? "",
  );
}

export const AGENT_COLOURS: Colours = {
  tint: null,
  values: {
    state: { [AGENT_STATE.running]: "info", [AGENT_STATE.on]: "good", [AGENT_STATE.off]: "gray" },
    verdict: { [VERDICT.succeeded.words]: "good", [VERDICT.partial.words]: "warn", [VERDICT.failed.words]: "bad", [NOT_JUDGED]: "gray" },
  },
  rules: {},
};
