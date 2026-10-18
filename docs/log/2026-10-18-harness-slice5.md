# 18 October 2026 — harness slice 5: modules as directories, and kits

The fifth slice of `../design/alpha-harness-design.md` §18 (`../design/harness-slice-5-proposal.md`;
Kenil's "yes to all" in chat, with one more sentence: "we need to make sure all components are
isolated and standalone, it needs to be a modular system"). Its §5 and §15, Q53's kits.

## What was built

- **A module is a directory** (`world/modfiles.py`, `ModuleFiles`): `modules/<id>/module.yaml`
  written from the world (name, goal, parent, each table with its fields, title field and
  identity, its saved lists, the module's skills and agents); `NOTES.md` the module's page and
  `agents/<name>.md` each agent (YAML front matter: title, schedule, state, steps or the run
  skill, what it may write, goal; the brief as the body), both ways: a file newer than the
  world whose text differs is read in (and written back canonical, so a later change in the
  world wins), otherwise the world is written out; `ALPHA.md` at the root is the standing
  instructions, both ways. Synced when a world opens and after every turn; a module removed for
  good takes its directory with it (`purge.py`). The old build files in a module's directory
  (`WORKFLOW.md`, `parts/`, …) are left and never exported.
- **Kits** (`world/kits.py`, `Kits`): `export(module)` → `<name>.alphakit/` with `kit.yaml`
  (name, version counted per export, the world it was made in, when, and `crosses`: what its
  skills and agents reach outside the module, Kenil's standalone rule made visible),
  `module.yaml`, `NOTES.md`, `skills/` (no `.git`), `agents/`, `files.sha`; never rows,
  documents or sign-ins; `--zip` on request. `install(folder)` makes the module, its tables
  empty from the yaml (fields only ever added to a table that exists), its lists, its notes, its
  skills (copied, committed in the module's repo) and its agents, **paused**, an agent's run
  skill attached rather than made twice; what was installed is remembered with each installed
  file's hash. A newer version of the same kit replaces the files whose hash is still the
  installed one and keeps the others, naming them ("Kept your versions of
  skills/wwr_backend_jobs"). `install_shipped()` installs the kits in the app's bundle
  (`<bundle>/kits/`, beside its connectors) when a live core starts, once per version.
- **The ways in**: `alpha kit export <module> [--to] [--zip]`, `alpha kit install <folder>`,
  `alpha kit list`; `POST /api/modules/{ref}/kit`, `POST /api/kits/install`, `GET /api/kits`;
  `just ship path/to/Name.alphakit …` puts kits in the bundle (`desktop/scripts/ship.sh`).
- **The suite**: steps `kit_export`, `kit_install`, `module_remove`; check `kit_installed`.

## Proven by tests

`test_modfiles`: the directory's shape, notes and agents; a page and an agent edited as
files read in and journaled; the world's change written out; ALPHA.md both ways. `test_kits`:
a kit installs the module empty in another world with its list, skills, paused agent and
notes, nothing of the data travelling; the same kit again is an update that keeps nothing
back; a module of that name not from the kit is refused; a newer kit replaces the untouched
notes and keeps the person's changed skill, named; the export names what reaches outside the
module; kits shipped in a bundle install once per version. 321 core tests; ruff and mypy
clean.

## Ran for real

`kit_roundtrip` (fresh world, Sonnet, `../journeys/2026-10-18-1252.md`, 78 s): "watch We Work
Remotely for back-end roles" made the module Job search with its table, reader and agent;
`kit_export` (v1, 4 files), `module_remove` (the module, its table and agent gone for good),
`kit_install`: Job search back with 1 table and 0 rows, 1 skill, 1 agent paused. Its first runs
found two things the unit tests had not: a YAML colon in the journey's own words, and an
installed skill still naming the module it came from in its front matter (fixed: the skill is
the new module's).

## Not in this slice

The window's two buttons (module page "Export as kit…", Settings "Install a kit…") and the
module page's notes and agents as editable text go with slice 6 (the window), where the forms
go; until then the CLI is the way. Sherlock as a subagent. A clean-up of the old build files.
