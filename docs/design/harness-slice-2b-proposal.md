# Harness, slice 2b: the fifteen tools, skills as directories, the form of a skill

*A proposal, 17 October 2026, late night, for Kenil's yes before any code. The second half of
slice 2 (`harness-slice-2-proposal.md`; 2a built and accepted the same night). After 2a the
person gets what they asked for; 2b gives the model the hands the design describes, and makes
what it keeps readable and editable as files.*

## What this slice is for

Today the model has 72 narrow tools, each a door with its own shape and words; a reader is a
row of JavaScript in the `skills` table that only `reader_run` can run; a procedure is a row of
recorded steps; Doc repairs rows; nothing the person can open as text. The design's §4 and §6
replace that with about fifteen generic tools, skills as Agent Skills directories the model
writes and the person can read, and the permission callback as the one gate. This slice is
that, in four steps that each leave the suite green.

## What changes

1. **Skills as directories (§6, §6.1).** A module gets `skills/<name>/SKILL.md` (frontmatter:
   `name`, `description`, `site`, `form: by reading | by script`, `check` for a by-script skill)
   and `scripts/`. A reader becomes `scripts/read.js` with the page it reads in its `SKILL.md`;
   a procedure becomes `SKILL.md` steps; a pipeline's run skill becomes the agent's steps (it
   already is). A migration writes every row of `skills` and `skill_versions` out as files
   under the module's directory (or `skills/` at Alpha's home for the ones with no module), the
   versions as git commits of that directory; the tables stay until the next slice reads
   nothing from them, then drop. `world/skills.py` becomes the reader of the directories
   (`Skills.get/all/find/save/ran/versions/restore` keep their signatures; `save` writes files
   and commits; `restore` checks out a version). Doc edits the files. The window's skill page
   shows the `SKILL.md` text, editable, the form beside it, Versions from git.
2. **The fifteen tools (§4)** in place of the 72, behind the same in-process server:
   `world_query` (read SQL over a view per table, `rows_<name>`, with the JSON values as
   columns; the journal, facts, people, documents as they are), `world_write` (rows in and out
   with provenance, upsert by key, seen/gone), `world_shape` (make or change a table, a field,
   a link, who the rows are), `world_file`, `ask_person`, `tell_person`, `skill_keep`,
   `skill_run`, `agent_keep`, `schedule_keep`, `act_outward`, `browser_open/read/script/act`
   (the names and `[ref_N]` semantics of Anthropic's `browser_toolset`, over our driver), plus
   the SDK's own web search and fetch. Every old tool maps onto one of these; the mapping is in
   the log. The prompt (`turn.md`) and the briefs rewritten to the new names; `plain_tool`'s
   words for the window the same.
3. **The permission callback as the gate (§8).** Turns run in `permission_mode="default"` with
   `can_use_tool`; `allowed_tools` holds everything but `act_outward` and the deletes of the
   person's own entries; those reach the callback, which asks through the window's card (the
   `actions` machinery of Q24, kept) and answers when the person does; `defer` for a yes that
   outlives a restart. The journal line for every call moves to a `PreToolUse` hook; the
   agents' write wall too.
4. **The CLI route goes.** `claude_cli.py`, `[engine] route`, `ALPHA_ENGINE`, the stdio MCP
   server (`alpha mcp`) and the Codex route's dead branches; `TurnRequest` and `RunResult` move
   to `engine.py`. The SDK's `SandboxSettings` for a module's scripts (a by-script skill runs in
   it).

## What stays the same

The world's tables and their pages; the window apart from the skill page and the mapped words;
the five agents; the scheduler; the journeys' sentences (their checks follow the tools).

## How it is judged

- Tests: the tool tests rewritten to the fifteen (same behaviours, new names); the skills
  store's tests over directories; the migration on a copy of Kenil's world (every skill a file,
  every version a commit, `Skills.all()` the same list before and after).
- Journeys: the full suite on a copy, and the first-day set on a fresh world, all green.
- Acceptance: Kenil opens a skill's page and reads it as text; edits one line; his LinkedIn
  sync's Monday run uses the file.

## Order and size

The four steps in order, a commit each, about four to five days: the skills migration (1, the
riskiest: his readers must keep working), the tools (2, the largest), the callback (3), the
removal (4). Each step leaves `just test`, `just lint` and the first-day journeys green; the
app is restarted after 1 and after 2 for a look.

## Questions for Kenil

1. The reader of his LinkedIn sync becomes a file on disk under its module; its Monday run then
   reads the file. Is a day of risk there acceptable now, or should the migration wait until
   after the first Monday run has proved itself?
2. `world_query` lets the model write SQL over the person's tables. Reads only, by the
   connection's mode; is that the right breadth, or should it stay within one table at a time?
