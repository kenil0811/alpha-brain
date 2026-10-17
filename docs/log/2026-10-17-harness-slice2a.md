# 17 October 2026 — harness slice 2a: the end of the gate

The second slice of the harness design (`../design/alpha-harness-design.md` §18), its first
half (`../design/harness-slice-2-proposal.md`, Kenil's yes the same night: "keep the page as
plan mode, and run the LinkedIn journey on my say each time"). After it, Alpha makes standing
things in the conversation: the thing that stopped "keep my LinkedIn connections in sync" on
16 October is gone.

## What was built, and what was removed

- **The gate.** `Tools._gate` and `_building` deleted from `mcp/tools/base.py`; the five tools
  that called it (`reader_save`, `source_add`, `agent_create`, `module_create`,
  `collection_create`) do what they say in any turn and journal it, as they did.
- **The prompt.** `turn.md`'s rules 6 and 7 replaced by the design's §8: a standing thing is
  made in the turn, said in a line, run once, reported with when it runs next; defaults are
  picked and named (weekly on Monday, the stable key, rows that are people as people); a
  question only when the answer changes what gets made and cannot be defaulted; the page for a
  big job or "plan it first", and after a yes the work is done in the same turn.
- **The build machinery, gone:** `runtime/workflow_build.py`, `parts.py`, `proxy.py`,
  `workspace.py` (the walled session, the parts contract, the anonymous proxy, the Seatbelt
  profile for scripts), the scheduler's `builds()` and `parts()`, `workflow_resume` ("Say
  continue"), the `/api/modules/{m}/parts` routes and the parts hooks on a row added or
  changed, the Try-again branch for a part, the `workflow_build`, `repair_part` and
  `doc_diagnose` prompts, Columbo's check of a part's first row, Doc's diagnosis and repair of
  a part, the `[proxy]` and `script_timeout_s` limits, `TurnRequest.workspace` and `hosts` and
  the runners' workspace branches (the CLI route and the engine), the window's parts buttons,
  `Part` type, `parts`/`runPart`/`resumeWorkflow` calls and the "Continue building" card, the
  `workflow_build` and `workflow_interview` journeys and their tests (`test_workflow_build`,
  `test_workspace`). About 2,600 lines.
- **The page as plan mode.** `workflows` keeps `drafted`, `agreed`, `built`, `stopped`,
  `declined` (`building` is gone). `workflow_agree` accepts a drafted or a stopped page and
  tells the model to do the work in the same turn; the app's Yes (`/api/workflows/{id}/agree`)
  starts a turn of Alpha's in the page's conversation saying the same; when a turn in that
  conversation ends, `workflows.settle_after_turn` moves the agreed page to `built` (with the
  module made in the turn, `turn.module_made_by`) or to `stopped` when the person stopped it.
  The card says "Agreed. Alpha is doing it now, here in the conversation." and, for a stopped
  one, offers the yes again.
- **Sherlock.** A drafted page no longer starts a look of its own (`look` watches only an
  interview under way and `@Sherlock`), and nothing lands after a yes: `land` adds suggestions
  to a page while it is a draft and otherwise keeps them on the findings page with a line in
  Activity, never a card in the conversation. `pending_findings` and the "kept until the page
  is drafted" path went with it.
- **The 16 October bugs that went with it:** the module card counts the person's rows, never
  the settings table; the page's `words` keep real newlines (`_prose`: a model's escaped `\n`
  made real on draft and revise); the stop reason's 600-character cut and the chat not knowing
  its build stopped had no code left to live in.
- **The journeys.** `--fresh` (and a journey's own `fresh: true`): a new empty world with the
  app's browser profiles, for the first-day sentences. Two new checks, `made_since` (tables,
  readers, agents, modules the journey made, whatever Alpha named them) and `rows_since` (rows
  in the tables it made). Three new journeys for §17's first three sentences:
  `track_then_log`, `watch_from_words`, `sync_from_words` (the last reads Kenil's LinkedIn in
  Alpha's signed-in profile: on his say each time). `vague_tracker` rewritten to the new rule
  (a thin first version now; the page is for a big job).

## Proven by tests

`just stats`, 17 Oct night: core tests 313 in 26 s (15 fewer than after slice 1: the build's
and the parts' tests went with the machinery, five of Sherlock's rewritten to the interview
trigger, two removed with the landing after a yes); desktop tests 218; tools 72 (`workflow_resume`
gone); journeys 26 defined (two removed, three added, one rewritten); lines core 20,218 Python
(1,632 fewer), tests 7,968, desktop 18,904; ruff, mypy strict and the window's typecheck clean.

## Ran for real

On a fresh world with the app's sign-ins, Sonnet, the real model (`../journeys/2026-10-17-2031.md`,
`-2033.md`):
- **`track_then_log` passed, 20 s.** "track what I eat" made a Food module and a Food log table
  at once (14.3 s), said what each entry holds and that nothing was assumed about a goal; "log
  two eggs" landed a row in 6.0 s with its numbers marked as estimates and the assumed size and
  cooking said. One table, one module, one row; no question asked.
- **`watch_from_words` passed, 55 s** (after a first run in which the sentence did the right
  thing and my checks were wrong: they looked for a skill of kind `reader` where the store says
  `read`, asked for five rows of a category that holds two, and needed an agent's title the
  journey did not give). "watch We Work Remotely for back-end roles": the page read, its RSS
  feed found, a reader `wwr_backend_rss` written and run (2 rows, the two roles the category
  had), a Job search module and a table with a status and notes the checks never overwrite, an
  agent every 6 hours as steps (a read with the reader, then tell), the reply naming all of it.
  No question asked, nothing refused: on 16 October the same tools were refused everywhere.
- **`sync_from_words`** (sentence 1, Kenil's LinkedIn) waits for his say, as agreed.
- **`vague_tracker`** rewritten and not yet run on the new rule.

**Accepted in the app** (Kenil, 17 Oct, 20:02–20:19 UTC, after `just app-restart`; his word:
"its working well"). From his world's journal:
- "keep my LinkedIn connections in sync": one turn of 476 s in one thread; the reader
  `linkedin_connections` written and run to the end of his list, **1,553 rows** into the
  `linkedin_connection` table of the module left from 16 October, an agent "Every Monday at
  08:00, sync your LinkedIn connections and tell you who is new" with its next run set, the
  reply saying what is in the table and that it refreshes by itself. On 16 October the same
  sentence took 44 minutes, four threads and left no rows.
- "watch We Work Remotely for back-end roles": 45 s; a module, a table, the reader
  `wwr_backend_jobs` (the RSS feed), an agent every morning at 08:30.
- "can we add linkedin jobs as well to it? also, i want a column for salary range as well (if
  present)": 190 s; a second reader `linkedin_backend_jobs`, the first reader updated, the
  salary column added, 32 rows in the one table: a change by chat that kept his rows (the
  acceptance the car wash module never got).
- Columbo, unasked, checked the paneer row from earlier: asked once which paneer and whether
  weighed before or after frying, cited fatsecret for the fat, and corrected protein and
  calories (the Q47 flow, for real).
- One stop: "Add to linkedin_connection: vikas", stopped by him at once ("You stopped it.").

## Not done in this slice

Slice 2b: the fifteen tools, skills as directories, the form of a skill, the permission
callback path, `claude_cli.py` and `[engine] route` removed. The quieter agents (Q65) in slice
4. `world/workspaces.py` stays: it removes a module's folder on disk when the module is
deleted, and old modules still have one.
