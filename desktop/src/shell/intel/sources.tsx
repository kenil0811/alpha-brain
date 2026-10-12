/**
 * Intelligence's lists as data sources (9 Oct): agents (automations, Q33), skills, connections and
 * Second Brain's facts, goals and hypotheses, each drawn by the one data view (`DataPage`), so each has views, filters, sorting and
 * the person's own lists (kept in `PREF.windowLists` by `memorySource`). Rows are asked of the
 * core afresh on every load, so an edit shows as saved. Only what the core can change is
 * editable: an automation's on/off and a suggested fact's state; the rest says why not.
 */
import { CoreError, type Automation, type Client, type Connection, type Fact, type Goal, type Intelligence, type ModuleCard, type ModuleDetail, type RecordRow } from "../../core/client";
import { memorySource, type DataSource } from "../../modules/source";
import { sourceWords } from "../FactRow";
import { AgentAvatar } from "../AgentAvatar";
import { VERDICT } from "../Automations";
import { HypothesisButtons } from "./Hypothesis";
import { ALPHA_AGENT, agentsFrom } from "../agents";

const NOT_HERE = "can't be done from here yet";
/** A refusal the person reads as is (`say` shows a CoreError's own words). */
const refuse = (words: string) => new CoreError(words, 400);
const AGENT_FIXED = `Changing an agent ${NOT_HERE}. Open it and ask Alpha.`;
const ONLY_ON = "Only On changes here. To change the rest, ask Alpha in the panel.";
const rec = (id: string, values: Record<string, unknown>, at = ""): RecordRow => ({ id, revision: 1, values, created_at: at, updated_at: at, provenance: {} });

/** An agent's row id in Agents and automations; the rest are automations' ids. */
export const AGENT_ROW = "agent:";

/** Agents and automations, one list (9 Oct, the owner): the agents first, Alpha among them ("Alpha —
 *  your assistant") and each project's runner, each opening its agent page; then every automation
 *  (Q33: an agent's process, with a goal and a verdict per run judged by code). Each row wears
 *  the companion chosen for it. */
export function automationsSource(client: Client, modules: Record<string, string>): DataSource {
  return agentsSource(client, "intel.automations", async () => {
    const d = await client.intelligence();
    const agents = agentsFrom(d, modules).map((g) =>
      g.id === ALPHA_AGENT ? alphaRow("Answers you, keeps your projects and asks before acting") : rec(`${AGENT_ROW}${g.id}`, { title: g.name, kind: "Agent", goal: g.description, verdict: null, when: runs(g.automations.length), on: null, last_run: null, next_run: null, result: null, module: g.module ? (modules[g.module] ?? g.module) : "" }),
    );
    return [...agents, ...d.automations.map((a) => automationRow(a, modules))];
  });
}

/** A project's agents and automations (its Intelligence section): Alpha, then its automations. */
export function projectAgentsSource(client: Client, d: ModuleDetail): DataSource {
  return agentsSource(client, "project.automations", () => [alphaRow(`The assistant that works in ${d.name}`), ...d.automations.map((a) => automationRow(a, { [d.id]: d.name }))]);
}

/** An agent's own automations (its page). */
export function automationListSource(client: Client, items: Automation[], modules: Record<string, string>): DataSource {
  return agentsSource(client, "agent.automations", () => items.map((a) => automationRow(a, modules)));
}

const runs = (n: number) => `Runs ${n} automation${n === 1 ? "" : "s"}`;
const alphaRow = (goal: string) => rec(`${AGENT_ROW}${ALPHA_AGENT}`, { title: "Alpha — your assistant", kind: "Agent", goal, verdict: null, when: null, on: null, last_run: null, next_run: null, result: null, module: "" });
const automationRow = (a: Automation, modules: Record<string, string>) =>
  rec(a.id, { title: a.title, kind: "Automation", goal: a.goal ?? "", verdict: a.last_verdict ? VERDICT[a.last_verdict].words : "Not judged yet", when: a.when, on: a.enabled, last_run: a.last_run_at, next_run: a.next_run_at, result: a.running ? "Running" : a.last_error ? "Didn't work" : a.last_run_at ? "Worked" : "Not run yet", module: a.module ? (modules[a.module] ?? a.module) : "" });

function agentsSource(client: Client, key: string, rows: () => RecordRow[] | Promise<RecordRow[]>): DataSource {
  return memorySource({
    client,
    key,
    title: "Agents and automations",
    titleField: "title",
    fields: [
      { name: "title", kind: "text", label: "Name" },
      { name: "kind", kind: "choice", label: "Kind", choices: ["Agent", "Automation"] },
      { name: "goal", kind: "text", label: "Goal" },
      { name: "verdict", kind: "status", label: "Last verdict", choices: ["Succeeded", "Partial", "Failed", "Not judged yet"], done_choices: ["Succeeded"] },
      { name: "when", kind: "text", label: "When" },
      { name: "on", kind: "bool", label: "On" },
      { name: "last_run", kind: "datetime", label: "Last run" },
      { name: "next_run", kind: "datetime", label: "Next run" },
      { name: "result", kind: "status", label: "Last result", choices: ["Running", "Worked", "Didn't work", "Not run yet"], done_choices: ["Worked"] },
      { name: "module", kind: "text", label: "Project" },
    ],
    rows,
    edit: async (row, values) => {
      const keys = Object.keys(values);
      if (row.id.startsWith(AGENT_ROW)) throw refuse(AGENT_FIXED);
      if (keys.length !== 1 || keys[0] !== "on") throw refuse(ONLY_ON);
      await client.switchAutomation(row.id, values.on === true || values.on === "true");
      return { ...row, values: { ...row.values, on: values.on === true || values.on === "true" }, revision: row.revision + 1 };
    },
    rowIcon: (row) => <AgentAvatar client={client} agent={row.id.startsWith(AGENT_ROW) ? row.id.slice(AGENT_ROW.length) : row.id} size={20} label={String(row.values.title)} />,
    editable: (row, field) => (row.id.startsWith(AGENT_ROW) ? AGENT_FIXED : field.name === "on" ? null : ONLY_ON),
    reasons: { add: "Use New; Alpha asks you to approve.", remove: `Deleting an agent or automation ${NOT_HERE}. Ask Alpha in the panel.` },
  });
}

const SKILL_KIND = { read: "Reads", act: "Does", run: "Runs" } as const;
const SKILL_HEALTH = { ok: "Working", broken: "Being repaired", untried: "Not tried yet" } as const;
/** Built-in hands (files, browser, calendar) ride along as rows of kind "Built in"; each opens a
 *  simple page of its own (`HandPage`). */
export const BUILT_IN = "hand:";
export function skillsSource(client: Client, modules: Record<string, string>, only?: string[]): DataSource {
  return memorySource({
    client,
    key: only ? "agent.skills" : "intel.skills",
    title: "Skills",
    titleField: "description",
    fields: [
      { name: "description", kind: "text", label: "Skill" },
      { name: "kind", kind: "choice", label: "Kind", choices: ["Reads", "Does", "Runs", "Built in"] },
      { name: "used_by", kind: "text", label: "Used by" },
      { name: "health", kind: "status", label: "Health", choices: ["Working", "Being repaired", "Not tried yet"], done_choices: ["Working"] },
      { name: "last_run", kind: "datetime", label: "Last run" },
      { name: "updated", kind: "datetime", label: "Updated" },
    ],
    rows: async () => {
      const d = await client.intelligence();
      const skillRow = (s: Intelligence["skills"][number]) => rec(s.name, { description: s.description, kind: SKILL_KIND[s.kind], used_by: s.site ?? (s.module ? (modules[s.module] ?? s.module) : "Alpha"), health: SKILL_HEALTH[s.health], last_run: s.last_run_at, updated: s.updated_at || null }, s.updated_at);
      if (only) return d.skills.filter((s) => only.includes(s.name)).map(skillRow);
      return [
        ...d.skills.map(skillRow),
        ...d.hands.map((h) => rec(`${BUILT_IN}${h.name}`, { description: h.description ? `${h.title}: ${h.description}` : h.title, kind: "Built in", used_by: "Alpha", health: "Working", last_run: null, updated: null })),
      ];
    },
    reasons: { edit: `Editing a skill ${NOT_HERE}. Open it and ask Alpha to change it.`, add: "Ask Alpha to learn something new.", remove: `Deleting a skill ${NOT_HERE}. Ask Alpha in the panel.` },
  });
}

export const CONNECTOR_KIND: Record<string, string> = { files: "Folder", browser: "Site", calendar: "Calendar" };
export const CONNECTION_STATE: Record<Connection["status"], string> = { connected: "Working", needs_ok: "Needs your sign-in", broken: "Being repaired", off: "Off" };
export function connectionName(c: Connection): string {
  if (c.connector === "files") return c.target.split("/").slice(-2).join("/");
  if (c.connector === "calendar") return "Your calendars";
  return c.target;
}
export function connectionsSource(client: Client): DataSource {
  return memorySource({
    client,
    key: "intel.connections",
    title: "Connections",
    titleField: "name",
    fields: [
      { name: "name", kind: "text", label: "Name" },
      { name: "kind", kind: "choice", label: "Kind", choices: Object.values(CONNECTOR_KIND) },
      { name: "state", kind: "status", label: "State", choices: Object.values(CONNECTION_STATE), done_choices: ["Working"] },
      { name: "last_sync", kind: "datetime", label: "Last read" },
      { name: "problem", kind: "text", label: "Problem" },
    ],
    rows: async () => (await client.intelligence()).connections.filter((c) => c.status !== "off").map((c) => rec(c.id, { name: connectionName(c), kind: CONNECTOR_KIND[c.connector] ?? c.connector, state: CONNECTION_STATE[c.status], last_sync: c.last_sync, problem: c.last_error ?? "" })),
    reasons: { edit: "A connection doesn't change here. Open it to read again or delete it.", add: "Use Connect.", remove: "Open it to delete it; it says what goes with it first." },
  });
}

/** Facts, goals and hypotheses, one table (the owner, 12 Oct). A fact is what is known (you said
 *  it, or a source did and you accepted it); a goal is what you want; a hypothesis is what Alpha
 *  thinks is true and you haven't decided (a suggested fact). Hypothesis rows wear ✓ / ✕ on hover.
 *  `names` turns a fact's subject (`entity:<id>`) into a person's or organisation's name. */
export const TYPE = { fact: "Fact", goal: "Goal", hypothesis: "Hypothesis" } as const;
export const GOAL_ROW = "goal:";
export function knowledgeSource(client: Client, key: string, load: () => Promise<{ facts: Fact[]; goals: Goal[] }>, names: (subject: string) => string): DataSource {
  const state = (s: string) => (s === "active" ? "Active" : s === "suggested" ? "Waiting for you" : s.charAt(0).toUpperCase() + s.slice(1).replace(/_/g, " "));
  return memorySource({
    client,
    key,
    title: "Second Brain",
    titleField: "statement",
    fields: [
      { name: "statement", kind: "text", label: "Statement" },
      { name: "type", kind: "status", label: "Type", choices: Object.values(TYPE) },
      { name: "about", kind: "text", label: "About" },
      { name: "source", kind: "text", label: "Source" },
      { name: "confidence", kind: "number", label: "Confidence", unit: "%" },
      { name: "since", kind: "datetime", label: "Since" },
      { name: "state", kind: "status", label: "State", choices: ["Waiting for you", "Accepted", "Active", "Done", "Dropped", "Rejected"], done_choices: ["Done", "Dropped", "Rejected"] },
    ],
    rows: async () => {
      const { facts, goals } = await load();
      const factRows = facts
        .filter((f) => f.predicate !== "related_to")
        .map((f) =>
          rec(f.id, { statement: `${f.subject === "person" ? "You" : names(f.subject)} ${f.predicate.replace(/_/g, " ")} ${f.value}`, type: f.state === "suggested" || f.state === "rejected" ? TYPE.hypothesis : TYPE.fact, about: f.subject === "person" ? "You" : names(f.subject), source: sourceWords(f), confidence: Math.round(f.confidence * 100), since: f.valid_from || f.recorded_at, state: state(f.state) }, f.recorded_at),
        );
      const goalRows = goals.map((g) => rec(`${GOAL_ROW}${g.id}`, { statement: g.text, type: TYPE.goal, about: g.module ? names(`module:${g.module}`) : "You", source: "You said so", confidence: null, since: g.since || null, state: state(g.state) }, g.since));
      return [...factRows.filter((r) => r.values.type === TYPE.hypothesis), ...goalRows, ...factRows.filter((r) => r.values.type === TYPE.fact)];
    },
    rowButtons: (row, done) => (row.values.type === TYPE.hypothesis && row.values.state === "Waiting for you" ? <HypothesisButtons client={client} id={row.id} text={String(row.values.statement)} done={done} /> : null),
    reasons: { add: "Tell Alpha in the panel.", edit: "To correct one, tell Alpha in the panel; a hypothesis is approved or rejected with ✓ or ✕.", remove: `Forgetting ${NOT_HERE}. Reject a hypothesis with ✕, or tell Alpha in the panel.` },
  });
}

/** A project's sub-projects; each opens its project. */
export function subProjectsSource(client: Client, inside: ModuleCard[]): DataSource {
  return memorySource({
    client,
    key: "project.inside",
    title: "Sub-projects",
    titleField: "name",
    fields: [
      { name: "name", kind: "text", label: "Name" },
      { name: "about", kind: "text", label: "About" },
      { name: "collections", kind: "number", label: "Collections" },
      { name: "holds", kind: "number", label: "Sub-projects" },
    ],
    rows: () => inside.map((m) => rec(m.id, { name: m.name, about: m.goal ?? m.last_text ?? "", collections: m.tables.length, holds: m.children?.length ?? 0 })),
    reasons: { edit: "Open it to change it.", add: "Ask Alpha in the panel to make one inside this project.", remove: "Open it to delete it." },
  });
}
