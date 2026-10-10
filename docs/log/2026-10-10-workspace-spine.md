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

## Run for real (10 Oct, 15:28–15:54 UTC, Kenil's Mac)

After a clean removal of the morning's module and its facts, the research pass on "something
similar to growthfactor.ai for car washes … start with Austin … build it as a program in
milestones" proposed a program plan in 12 minutes (four looks, 95 findings; the first proposal
had no milestones and was refused by the new wall, the revision carried M0–M2 and four hosts).
Kenil approved it at 15:44 with the defaults. **M0 built in ten minutes** in the sandboxed
workspace: `pipeline.py` (390 lines, three gate functions against live endpoints),
`run_screen.py`, `selftest.py`, `settings.json`, a `.venv`, a competitors layer as GeoParquet
(51 Travis County car washes from the Comptroller's NAICS-811192 permits, batch-geocoded) with
its `provenance.json`, `module.duckdb` with a 35-column `sites` table where every value sits
beside its source URL and fetch time; four commits; `PROGRESS.md` with what it decided (the
county code 227 found by query; the zoning radius widened 75→200 m because Socrata's spatial
index misses polygons; nearest-feature logic). The evaluator passed it with the weakness named
(one row; the traffic count used lies 1.6 km from the address). The plan stopped as ready to
look at; M1 waits for Kenil's continue. The walls held: nothing was written outside the
workspace. Slice 1's acceptance is met.

## Slice 1b: what the person can do (10 Oct, evening)

Kenil, after M0: "a user has no way to testing this. What exactly are we even trying to build
here if nothing works or is testable." Right: M0 ended in a row he could open but nothing he
could do; the surfaces and jobs were sliced after the engine. Built the same evening:

- **Jobs** (`runtime/jobs.py`): a module declares what the person can do in `jobs.yaml` (id,
  title, what, inputs with name/label/kind/required, a command as a list with `{name}` for
  each input, filled as whole arguments, never through a shell). The module's page shows each
  as a form with Run (`/api/modules/{ref}/jobs/{job}`); the core runs it in the workspace
  under the profile and journals what ran and what it reached.
- **Alpha's own proxy** (`runtime/proxy.py`): the one road out for a script the core runs:
  bound to the loopback for the run, the profile allows outbound only to its port; it lets
  through the plan's hosts (exact or subdomain), refuses the rest with 403, and counts what
  was reached and refused, which the run's output ends with. HTTPS as a CONNECT tunnel, HTTP
  forwarded. `run_script(hosts=…)` sets `HTTPS_PROXY`/`HTTP_PROXY` for the script.
- **A `job` check** on milestones: the evaluator runs the declared job on a given input as
  the person would; `MILESTONE_RULES` and the research rules now say every milestone's
  user-facing action is a job and a result nobody can produce from the page is not delivered.
- For the live Car Wash Site Screener, milestone **M0B** ("Screen an address from the module's
  page", checks: the `screen` job on 3301 S Congress Ave, two rows in Sites, the self-test)
  was inserted before M1 at Kenil's yes, so the next continue delivers the form.

**Checked.** The proxy lets a listed host through and refuses another with 403, counting
both; a script under the profile reaches a local server through the proxy and is refused
elsewhere, with the network line at the end of its output; a job declared in `jobs.yaml`
listed on the module's page, refused without its input, run with an input that would be a
shell injection (it arrives as one argument), writing a row the table shows, journaled, and
the same job run by a milestone's `job` check. 258 core tests, 85 desktop, lint and
typecheck clean. The real M0B run is the acceptance.
