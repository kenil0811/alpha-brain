# Modules as workflows, piece 2: the build from the page (11 October 2026)

The yes on "Your workflow" (piece 1, `2026-10-11-workflow-page.md`) now builds the module.

## Built

- **By code, before the model** (`runtime/workflow_build.py`): the module from the page's
  title and purpose; one table per thing kept (fields with kinds mapped from the page's
  words, a relation field per "linked to"; the thing's key as the name, prefixed by the
  module when taken); the Settings table with every setting, its value, unit, origin and
  why; the workspace with `WORKFLOW.md`, `workflow.json` (the page, structured, with the
  table names), `PROGRESS.md`, `parts/`, `documents/`, under git. Idempotent: a stopped build
  continued finds everything made once.
- **By the model, one walled session** (`BUILD_RULES`): a part for every step Alpha does,
  declared in `parts.yaml` with its contract (what it reads, what it fills, when it runs:
  when a row arrives, when asked, after another part; what it reaches); a Markdown template
  per document; every part tried on one real input with the command exactly as the core
  runs it, the output in `PROGRESS.md`; a commit. The hosts the sandbox allows come from
  what the page's steps reach (`hosts_of`: "Census ACS (api.census.gov)"). Never a field of
  its own for a source: the core keeps the source of every value.
- **Parts** (`runtime/parts.py`): the core runs a part for one row with the row's values and
  the module's settings as JSON on stdin, under the profile with Alpha's proxy as the one
  road out; the part answers values with their sources, or problems; the core writes the
  values into the row with the source and date of each in the row's provenance, per field,
  and a problem where it could not, never a guess. Parts that run when a row arrives are run
  by the scheduler on every tick and kick and right after the app adds a row; a part after
  another waits until that one filled its fields; a row a part failed on twice is left alone
  with the problem on it; the runner goes round after round until nothing is due. When asked,
  a part runs from the thing's page (`/api/modules/{m}/parts/{part}/run`).
- **The thing's page**: each value shows where it came from and when; a field a part could
  not fill shows why; buttons for the parts that run when asked, and "Try again" for a part
  that failed. The settings table is a table: the person edits a threshold there.
- A stuck build (STUCK: in the reply, or a failed run) stops and waits for the person's
  continue (`/api/workflows/{id}/resume`, `workflow_resume`, "Continue building" on the card).
- The suite: `agree_workflow` (the yes, then the build settled), `add_row` (a thing added as
  the person would, by the field they type into, then the parts due), `module` and
  `row_filled` checks (values with sources, named problems, parts waiting on earlier parts,
  never silent gaps); a failed run keeps its copy of the world for reading.

**Checked.** The page becoming a module with the right tables, relation and settings; the
session's workspace and hosts; parts filling a row through the core with per-field sources,
the chain in one call, a part that cannot fill leaving a named problem and giving up after
two tries, a part run when asked, a stuck build waiting for continue and resuming without
making anything twice, the scheduler building an agreed page, strict reading of a part's
output. 266 core tests, 87 desktop, lint and typecheck clean.

**Run for real** (journey `workflow_build`, five runs, the last `../journeys/2026-10-11-1635.md`,
passed in 951 s). The ask with the job in it, "start fresh" when Alpha asked whether to
replace the old screener, then the yes: the build made `car_wash_site_screenings` and
`settings` (7 settings) and four chained parts (traffic gate when a row arrives → households
gate → score → memo) in 546 s; 1600 S Lamar added as the person would: the traffic gate filled
37,900 AADT from a TxDOT count station one metre away, with its source and date on the row;
the households gate stopped with a problem naming the fix (a free Census key); the score and
the memo wait on it. The earlier runs taught: the suite must find a thing by the field the
person types into, not a name; parts must run round after round; a field of a part waiting on
another is waiting, not silent.

## Left

- The person's acceptance: their own flow once in the app, then a change by chat.
- The Census key: the page should ask for it as a setting with an empty value the person
  fills, so the households gate works the day the key arrives; today the part reads it from
  settings or the environment, depending on the run.
- Documents: templates are kept as documents of the module; drafting an instance from a
  template with a row's values, and its page, are not built (the last build put the memo on
  the row as a field instead).
- The evaluator through the pages (§12, step 3) is not built: the suite's checks stand in
  for it in the journey; in the app, the build reports and the person judges.
- The library across modules; the model's tools seeing a module's own things by name.
