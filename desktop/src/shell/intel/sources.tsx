/**
 * Intelligence's lists as data sources (9 Oct): agents (automations, Q33), skills, connections and
 * facts, each drawn by the one data view (`DataPage`), so each has views, filters, sorting and
 * the person's own lists (kept in `PREF.windowLists` by `memorySource`). Rows are asked of the
 * core afresh on every load, so an edit shows as saved. Only what the core can change is
 * editable: an automation's on/off and a suggested fact's state; the rest says why not.
 */
import type { Client, Connection, Fact, Intelligence, RecordRow } from "../../core/client";
import { memorySource, type DataSource } from "../../modules/source";
import { sourceWords } from "../FactRow";
import { AgentAvatar } from "../AgentAvatar";
import { VERDICT } from "../Automations";

const NEEDS_CORE = "needs Alpha's core";
const rec = (id: string, values: Record<string, unknown>, at = ""): RecordRow => ({ id, revision: 1, values, created_at: at, updated_at: at, provenance: {} });

/** Agents (Q33): every automation is an agent's process, with a goal and a verdict per run judged
 *  by code; each row wears the companion chosen for that agent. */
export function automationsSource(client: Client, modules: Record<string, string>): DataSource {
  return memorySource({
    client,
    key: "intel.automations",
    title: "Agents",
    titleField: "title",
    fields: [
      { name: "title", kind: "text", label: "Agent" },
      { name: "goal", kind: "text", label: "Goal" },
      { name: "verdict", kind: "status", label: "Last verdict", choices: ["Succeeded", "Partial", "Failed", "Not judged yet"], done_choices: ["Succeeded"] },
      { name: "when", kind: "text", label: "When" },
      { name: "on", kind: "bool", label: "On" },
      { name: "last_run", kind: "datetime", label: "Last run" },
      { name: "next_run", kind: "datetime", label: "Next run" },
      { name: "result", kind: "status", label: "Last result", choices: ["Running", "Worked", "Didn't work", "Not run yet"], done_choices: ["Worked"] },
      { name: "module", kind: "text", label: "Project" },
    ],
    rows: async () =>
      (await client.intelligence()).automations.map((a) =>
        rec(a.id, { title: a.title, goal: a.goal ?? "", verdict: a.last_verdict ? VERDICT[a.last_verdict].words : "Not judged yet", when: a.when, on: a.enabled, last_run: a.last_run_at, next_run: a.next_run_at, result: a.running ? "Running" : a.last_error ? "Didn't work" : a.last_run_at ? "Worked" : "Not run yet", module: a.module ? (modules[a.module] ?? a.module) : "" }),
      ),
    edit: async (row, values) => {
      const keys = Object.keys(values);
      if (keys.length !== 1 || keys[0] !== "on") throw new Error(`Only On can change here; changing the rest ${NEEDS_CORE}. Ask Alpha in the panel.`);
      await client.switchAutomation(row.id, values.on === true || values.on === "true");
      return { ...row, values: { ...row.values, on: values.on === true || values.on === "true" }, revision: row.revision + 1 };
    },
    rowIcon: (row) => <AgentAvatar client={client} agent={row.id} size={20} label={String(row.values.title)} />,
    editable: (_row, field) => (field.name === "on" ? null : `Only On changes here; the rest ${NEEDS_CORE}.`),
    reasons: { add: "Ask Alpha to keep something current.", remove: `Deleting an automation ${NEEDS_CORE}.` },
  });
}

const SKILL_KIND = { read: "Reads", act: "Does", run: "Runs" } as const;
const SKILL_HEALTH = { ok: "Working", broken: "Being repaired", untried: "Not tried yet" } as const;
/** Built-in hands (files, browser, calendar) ride along as rows of kind "Built in"; they have no page. */
export const BUILT_IN = "hand:";
export function skillsSource(client: Client, modules: Record<string, string>): DataSource {
  return memorySource({
    client,
    key: "intel.skills",
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
      return [
        ...d.skills.map((s) => rec(s.name, { description: s.description, kind: SKILL_KIND[s.kind], used_by: s.site ?? (s.module ? (modules[s.module] ?? s.module) : "Alpha"), health: SKILL_HEALTH[s.health], last_run: s.last_run_at, updated: s.updated_at || null }, s.updated_at)),
        ...d.hands.map((h) => rec(`${BUILT_IN}${h.name}`, { description: h.description ? `${h.title}: ${h.description}` : h.title, kind: "Built in", used_by: "Alpha", health: "Working", last_run: null, updated: null })),
      ];
    },
    reasons: { edit: `Editing a skill ${NEEDS_CORE}; open it and ask Alpha to change it.`, add: "Ask Alpha to learn something new.", remove: `Deleting a skill ${NEEDS_CORE}.` },
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
    reasons: { edit: `Changing a connection ${NEEDS_CORE}; open it to read again or delete it.`, add: "Add one below.", remove: "Open it to delete it; it says what goes with it first." },
  });
}

/** The facts Second Brain lists ("related_to" links are the map's, not facts to read). */
export const shownFacts = (d: Pick<Intelligence, "knowledge">): Fact[] => d.knowledge.facts.filter((f) => f.predicate !== "related_to");
export function factsSource(client: Client): DataSource {
  return memorySource({
    client,
    key: "intel.facts",
    title: "Facts",
    titleField: "value",
    fields: [
      { name: "value", kind: "text", label: "Fact" },
      { name: "predicate", kind: "text", label: "What" },
      { name: "subject", kind: "text", label: "About" },
      { name: "state", kind: "status", label: "State", choices: ["suggested", "accepted", "rejected"], done_choices: ["accepted"] },
      { name: "source", kind: "text", label: "Source" },
      { name: "added", kind: "datetime", label: "Added" },
    ],
    rows: async () => shownFacts(await client.intelligence()).map((f) => rec(f.id, { value: f.value, predicate: f.predicate.replace(/_/g, " "), subject: f.subject, state: f.state, source: sourceWords(f), added: f.recorded_at }, f.recorded_at)),
    edit: async (row, values) => {
      const keys = Object.keys(values);
      const to = values.state;
      if (keys.length !== 1 || keys[0] !== "state") throw new Error("To correct a fact, tell Alpha in the panel.");
      if (row.values.state !== "suggested") throw new Error(`Changing a decided fact ${NEEDS_CORE}.`);
      if (to !== "accepted" && to !== "rejected") throw new Error("A fact waiting for you can be accepted or rejected.");
      await client.decideFact(row.id, to === "accepted");
      return { ...row, values: { ...row.values, state: to }, revision: row.revision + 1 };
    },
    editable: (row, field) => (field.name !== "state" ? "To correct a fact, tell Alpha in the panel." : row.values.state !== "suggested" ? `Changing a decided fact ${NEEDS_CORE}.` : null),
    reasons: { add: "Tell Alpha in the panel.", remove: `Forgetting a fact here ${NEEDS_CORE}; open it to forget one waiting for you.` },
  });
}
