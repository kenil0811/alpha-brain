/**
 * Intelligence › Skills as a table (13 Oct, Q42 section 7a; the feature from pull request #5, the
 * view main's own): every skill Alpha keeps as a row of the one data view (`DataPage` with rows it
 * is handed), so the column menus, search, sorting, grouping and colours work as on a module's
 * table. Read-only: a skill is Alpha's know-how and changes only by asking Alpha (the capability
 * model). The row's › opens the skill's own page.
 */
import type { RecordRow, Skill, TableDesc } from "../../core/client";
import type { HeldRows } from "../../modules/DataPage";
import { humanize } from "../../modules/format";

/** What each kind of skill is, in the words the table shows. */
export const SKILL_KIND: Record<Skill["kind"], string> = { read: "Reader", act: "Action", run: "Run" };
/** A skill's health in main's words (the skill page says the same). */
export const SKILL_HEALTH: Record<Skill["health"], string> = { ok: "Working", broken: "Being repaired", untried: "Not tried yet" };

/** The table's columns: names the window keeps its layout under (`alpha.page.intel_skills`). */
export function skillsTable(skills: Skill[], modules: Record<string, string>): TableDesc {
  const moduleNames = [...new Set(skills.map((s) => (s.module ? (modules[s.module] ?? null) : null)).filter((m): m is string => Boolean(m)))].sort();
  return {
    name: "intel_skills",
    title: "Skills",
    module: null,
    title_field: "skill",
    records: skills.length,
    readonly: true,
    fields: [
      { name: "skill", kind: "text", label: "Name" },
      { name: "kind", kind: "choice", label: "Kind", choices: Object.values(SKILL_KIND) },
      // only when some skill belongs to a module: a column of dashes says nothing
      ...(moduleNames.length ? [{ name: "module", kind: "choice", label: "Module", choices: moduleNames }] : []),
      { name: "site", kind: "text", label: "Site" },
      { name: "does", kind: "text", label: "What it does" },
      { name: "health", kind: "status", label: "Health", choices: Object.values(SKILL_HEALTH), done_choices: [SKILL_HEALTH.ok] },
      { name: "last_run", kind: "datetime", label: "Last run" },
      { name: "last_read", kind: "number", label: "Rows last read", unit: "rows" },
    ],
  };
}

/** One skill as a row; its id is the skill's name, which its page opens by. */
export function skillRow(s: Skill, modules: Record<string, string>): RecordRow {
  return {
    id: s.name,
    revision: s.version,
    created_at: s.updated_at,
    updated_at: s.updated_at,
    provenance: {},
    values: {
      skill: humanize(s.name),
      kind: SKILL_KIND[s.kind],
      module: s.module ? (modules[s.module] ?? null) : null,
      site: s.site,
      does: s.description,
      health: SKILL_HEALTH[s.health],
      last_run: s.last_run_at,
      last_read: s.kind === "read" ? s.last_count : null,
    },
  };
}

/** The rows, from what Intelligence already read of the core (it reads again on every change,
 *  so a repair shows at once). */
export function skillsHeld(skills: Skill[], modules: Record<string, string>): HeldRows {
  return {
    load: () => Promise.resolve(skills.map((s) => skillRow(s, modules))),
    words: "Changed by asking Alpha",
    colours: { tint: null, values: { health: { [SKILL_HEALTH.ok]: "good", [SKILL_HEALTH.broken]: "bad", [SKILL_HEALTH.untried]: "gray" } }, rules: {} },
  };
}
