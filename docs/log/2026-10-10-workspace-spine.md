# Modules as programs, slice 1: the spine (10 October 2026, Q38)

Kenil chose the order ("that order works") and the metro for the first real milestone ("go
with Austin for M0"). Slice 1 is the spine: a workspace Alpha codes in, the walls, the three
artifacts, one milestone per session judged by an evaluator, the module's own tables shown
read-only in the app. The design stages as pages, the report, settings and map pages, jobs as
agents and exports are slices 2–4.

## Built

- **The workspace** (`runtime/workspace.py`): `modules/<module id>/` under Alpha's home with
  `DESIGN.md` (the plan's text and what was decided), `milestones.json`, `PROGRESS.md`,
  `inputs/`, under git with one commit per milestone; `modules.workspace` records it; removal
  deletes it (`purge.py`).
- **The walls**: a build run is Claude Code with `Bash, Read, Edit, Write, Glob, Grep` plus
  Alpha's tools, WebSearch and `WebFetch(domain:…)` per allowed host, driven by `--settings`
  JSON (`sandbox_settings`): Claude Code's own sandbox enabled, no unsandboxed fallback, fail
  if unavailable, writes only in the workspace (never `milestones.json`, `inputs/`, `.git`
  hooks and config), reads denied for the person's secrets and Alpha's world folder, network
  only to the design's hosts plus what a Python build needs (PyPI, DuckDB's extensions),
  secrets denied from the environment; `permissions.blockReadsOutsideWorkingDirectories`.
  `TurnRequest.workspace`/`hosts`, `turn.ask(workspace=…)`. A script the core runs itself
  (the self-test) runs under `sandbox-exec` with a deny-default profile and no network at all
  (`run_script`), probed on this Mac: a write outside the workspace and an outbound request
  were refused; DuckDB ran.
- **Plans as programs** (`world/plans.py`): `milestones` (id, title, what, checks of kinds
  `selftest`, `rows`, `query`, `file`, `provenance`; `passes`, `attempts`, `why`) and `hosts`
  (hostnames only) on `plan_propose`; the research rules ask for the design in its stages, the
  milestones and the hosts when the thing computes, screens, scores or maps.
- **The milestone loop** (`runtime/milestones.py`): `run_build` dispatches a plan with
  milestones to it. Each session: the module made if the plan has none, the workspace made,
  the next unpassed milestone built with `MILESTONE_RULES` (read the three artifacts and the
  git log first, smoke-check the previous milestone, Python in `.venv` from Alpha's own
  interpreter, GeoParquet per layer with `provenance.json`, `module.duckdb` for the tables the
  person opens with `source` and `method` beside every scored value, `selftest.py` with no
  network, a refused host is a constraint not a retry, commit, append to `PROGRESS.md`, say
  STUCK: when blocked). Then the evaluator: the checks by code (the self-test under the
  no-network profile, rows, a query in a band, a file, a layer's provenance), then a judging
  run with a skeptical brief reading the checks' results, the end of `PROGRESS.md`, the git
  log and the builder's words; pass needs both; only the evaluator flips `passes` (in the plan
  and in `milestones.json`, committed). A passed milestone stops the build with "ready to look
  at … say continue" (the existing resume); the last one finishes the plan. A failed check sends
  the finding into the thread for the next session; three fails on one milestone is stuck and
  the build stops saying so.
- **The module's own tables** (`world/modtables.py`): `module.duckdb`'s tables listed on the
  module's page beside the world's tables as `<module id>:<table>`, described from their
  columns, read-only (`readonly: true`; the table page hides Add, quick entry, editing and
  removal and says "Built by the module · read-only"); `/api/tables/{name}` and
  `/records/{rid}` serve them. `duckdb==1.5.6` is a core dependency.
- **The plan card** lists a program plan's milestones with their ticks.

**Checked.** Core: milestones and hosts cleaned and refused when wrong; the walled run's
tools and settings (and that a plain run is unchanged); a script under the profile (writes
outside the workspace and the network refused, exit codes through); a milestone built by a
fake builder that makes a real DuckDB table, a parquet layer with provenance, a self-test and
a commit, then judged for real (the self-test under `sandbox-exec`), the plan stopped as ready
to look at, the module's table read through the app read-only with its row, the person's
continue building M1 to done, removal taking the workspace; a failing self-test sending the
finding back twice then stuck on the third; a judge that says no failing a milestone whose
checks passed; a builder that says STUCK stopping the build; each check's words. 254 core
tests, 85 desktop, ruff, mypy strict and typecheck clean. **Not yet run for real:** M0 of the
car wash ask on Kenil's Mac is the acceptance of this slice; the app is rebuilt for it.

## Left (slice 1's own)

- `srt` is not shipped: an unattended build's file and fetch tools are policy-walled, not
  OS-walled, until it is; the proxy ports for Alpha's own journaling proxy need a CLI pin bump
  to ≥2.1.285 (the build's requests are journaled only as WebFetch `saw` lines today).
- The model's tools (`collection_describe`, `records_query`) do not see a module's own tables
  yet; the person does, on the module's page.
- A program plan's module is made at the first build from the plan's title; the research pass
  does not yet ask which existing module it extends.
- DuckDB's extension files are not yet shipped with the app (`just ship`); a build on a fresh
  Mac would fetch them from `extensions.duckdb.org`, which the walls allow.
