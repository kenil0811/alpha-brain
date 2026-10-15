# Agents, slice A: the substrate (15 October 2026)

Q50's first slice, proposed in writing and agreed ("yes to all, for 3, you name them something
for now"): the shape every agent shares exists in the code; the five agents Kenil runs are
migrated under the same ids; "automation" leaves Alpha's words. No built-in agent appears yet:
each arrives with its own slice (Watson, Doc, Columbo, Sherlock, Scout, in that order).

## Group 1: the core (commit "Agents, slice A: the substrate in the core (Q50)")

- **Store.** `agents` (name, kind, description, goal, module, state on/paused, schedule, events,
  `may` the write list, `done`, skill, cursor, the run times) and `decisions` (who, what, why,
  alternatives, evidence, replaces, about, state); `runs.automation` became `runs.agent` with
  `trigger` and `called_by`. `world/agents.py` and `world/decisions.py` replace
  `world/automations.py`. The migration `_agents_from_automations` keeps the ids, folds an
  automation's procedure into its agent's "Brief" page above the guidelines it had, renames the
  runs column and drops the table; a world made before agents opens twice without moving twice.
- **Runtime.** `runtime/agents/`: the registry (`LOOKS`, `register`, `since_cursor`), the runner
  (one loop for every kind: the pipeline with no model, or the model with the brief, notes and
  binding decisions in front of it; `mention` for an @), the scheduler moved there with `looks()`
  on every tick and kick (the journal is the event stream, a cursor per agent). `turn.ask` takes
  `agent=`; the actor travels to the tools as `ALPHA_ACTOR` on both model routes; an agent's
  steps and reply are journaled under its id.
- **Tools.** `@tool(writes="records")` on every write tool (`WRITES` in `base.py`); the wrapper
  refuses a write outside the agent's list in plain words and keeps records writes inside the
  agent's module's tables. The in-run walls (never act outward, reading is the steps', no table
  from a first look) key on the actor or the thread. `agent_create`, `agents_list`,
  `agent_update` replace the automation tools, gated as before. `workflow_agree` records the
  person's decisions: the page and each suggestion.
- **@Name** at the start of a sentence (by structure: the name exactly, the longest first) makes
  that agent answer in the conversation as itself, with a run row (trigger `mention`).
- **Purge.** A module or a connection takes its agents' runs, pages and decisions;
  `remove_agent` for a custom agent (its runs, pages, decisions, pipeline, look; the thread
  stays; its open questions closed); a built-in kind refuses. Removal records carry `agents`.
- **Kept for group 2 on purpose:** the window's route paths (`/api/automations`), the payload
  keys it reads (`automations`, `title`, `enabled`, `guidelines`) and the map's node kind, so
  the app keeps working against this core until the window is renamed with the routes.

**Proven:** 268 core tests (7 new in `test_agents.py`: the migration, the actor, @, the write
list and the module wall, the cursor, a custom agent's removal, decisions on agree), ruff and
mypy clean; desktop 195 passed, 1 skipped; the migration on a copy of Kenil's world (five
agents under their ids, four on, Gmail paused, 22 runs kept, the old table gone); journeys
`agent_verdict` (106 s, 15 of 15 sources, no model) and `automation_self_converts` (152 s, the
LinkedIn agent as a pipeline) passed with the real model
(`docs/journeys/2026-10-15-1216.md`); `just check-desktop` 94 of 94 pages clean
(`docs/checks/2026-10-15-1217.md`). Seen in the copy: none of the five agents has a page or a
look of its own.

## Group 2: the routes and the window (commit "Agents, slice A: the routes and the window (Q50)")

- **Routes.** `/api/agents` (list), `/api/agents/{id}` (the page: brief, notes, decisions, what it
  may touch, pipeline, runs grouped by each run's start), PATCH (pause, set going, rename; each
  journaled as the person's), POST `run`, GET `removal` (the words before a delete) and DELETE
  (a custom agent; a built-in kind refuses). `/api/intelligence` and a module's card say
  `agents`; the map's nodes are `agent:<id>`; removal plans count agents. The CLI gained
  `alpha agents` and `alpha agent-rename <id> <name>`.
- **Window.** `Agent` and `AgentDetail` in `client.ts`; the Agents tab (On / Paused / Running
  now; the switch reads Pause / Set going); `AgentPage.tsx` with Rename inline, Pause / Set
  going, Run now, Ask Alpha to change this, Delete for a custom one with the removal words
  confirmed, its look, its brief (editable; "Ask Alpha to write it" or "Write it yourself"),
  its notes when it has any, "When it works, and what it may touch" in words, what it does, its
  runs, the decisions about it; the address `#/intelligence/agents/<id>` (an old `automations`
  link still opens). `@` in the composer offers the agents whose name begins with what is
  typed; a tap or Enter completes the name, never sends. Every "automation" the person reads is
  "agent" (Remove module, connections, the map, the module page).

**Proven:** 269 core tests (the rename, pause, delete routes and the CLI), 198 desktop tests
(the page's rename, pause, delete; the @ picker), ruff, mypy and typecheck clean;
`just check-desktop` 94 of 94 clean on the renamed window (`docs/checks/2026-10-15-1237.md`);
the browser pane on a copy of Kenil's world: the Agents tab with faces and names, Deal
Tracker's page, "@j" → "@Job Boards" completing on Enter, no console errors.

## The acceptance so far (15 Oct, evening)

The app was rebuilt and restarted on the new core; Kenil's real world migrated on open (the
`agents` and `decisions` tables, `automations` gone, the five agents under their ids, four on
and Gmail paused). The five were named with the CLI, journaled as his change ("you name them
something for now"): Nutrition Check-in, LinkedIn Connections, Deal Tracker, Job Boards, Gmail
from Vikas. **The real acceptance is the 07:00 runs of 16 Oct**: three agents due, each a row
with a verdict, on the substrate.

## Left

Watson (noticing as an agent: the first kind that works from the journal cursor), then Doc,
Columbo, Sherlock, Scout, each proposed in writing and proven by a journey; the agent page as the
door for a custom agent (Q50); notes written by an agent; C1 and T still to design.
