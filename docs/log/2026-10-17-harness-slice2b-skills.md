# 17 October 2026 — harness slice 2b, step 1: skills as directories

The first of 2b's four steps (`../design/harness-slice-2b-proposal.md`, Kenil's yes the same
night: "migrate the skills now, and world_query may read across tables"). A skill is now a
directory the model writes and the person can read; what happened to it stays in the world.

## What was built

- **`world/skills.py` rewritten over files**, the `Skills` class keeping its API (`get`, `names`,
  `all`, `index`, `find`, `save`, `ran`, `versions`, `restore`, `delete`), so its callers
  (`Readers`, `Procedures`, `Agents`, the pipeline, the tools, the pre-pack, the map, the API,
  the journeys) are untouched. A skill is `skills/<name>/SKILL.md` (frontmatter: name, kind,
  description, site, url, module, when_to_use, `form`, to_end, whole, effect, source, version,
  the dates; the body: what it does, when to use it, how it runs) plus `scripts/read.js` for a
  read skill or `steps.yaml` (steps, verify, fields) for an act or run skill. It lives under its
  module's directory (`modules/<id>/skills/`) or, with no module, under `skills/` beside the
  world; the root comes from the world's own path, never the real home for a test's or a
  journey's world.
- **Versions are git.** A module's directory is the repository (the project the model owns;
  the old build's commits are already there), `skills/` its own for module-less skills. Every
  save is one commit, `<by>: <name> v<n> @<stamp>`, with the world's own stamp so a version's
  time reads the same anywhere; `versions()` is the log, `restore()` reads a commit's files back
  as a new version (an undo can be undone, as before); a removal is a commit too. Git runs with
  its own identity (`user.name=Alpha`), no global config needed.
- **State in the world.** `skill_state` (health, last problem, last run, counts) replaces the
  columns the `skills` table had; `ran()` writes it; `get()` merges file and state.
- **The migration.** On open, a world that kept its skills as rows writes them out, versions
  first and in order (each a commit, the row's version numbers kept), the state into
  `skill_state`, once, marked in `meta` (`skills_in_files`). The `skills` and `skill_versions`
  tables stay until step 4, read by nothing.
- **The rest followed:** `knowledge.py` checks a skill exists through the files (a skill's
  notes page); `purge.py` deletes skills through the store (files, history, state, notes) and
  reads readers and pipeline steps from it; the skill page's route returns the `SKILL.md` text
  and `PUT /api/skills/{name}/text` takes the person's edit as a new version, journaled as
  theirs; the window's skill page shows the file and an edit box.

## Proven by tests

313 core tests green (the older-world test now checks the files and the repository; the rest
unchanged, which is the point of keeping the API); ruff and mypy strict clean.

## Ran for real

The migration on a copy of Kenil's world (17 Oct, 20:32 UTC): five skills written
(`linkedin_connections`, `linkedin_backend_jobs`, `wwr_backend_jobs` under `skills/`; the two
run skills under their modules), each file's script and steps equal to its row, the version
numbers kept, health carried, the module `m_5e76e2f0d895`'s repository with the new commit above
the build's old ones. Then on his live world at the app's restart (below).

**On Kenil's live world** (20:34 UTC, at `just app-restart`): `meta.skills_in_files` says five
skills; `skills/linkedin_connections`, `skills/linkedin_backend_jobs`, `skills/wwr_backend_jobs`
(two commits, v1 and v2: the change by chat of the evening), the two run skills under their
modules; `skill_state` carries `linkedin_connections` ok 1,553, `wwr_backend_jobs` ok 2,
`linkedin_backend_jobs` ok 30. The Monday run of his LinkedIn sync reads the file. The window's
bundle still asked for `/parts` (a 404 in the core log) until the app was rebuilt with today's
window.

## Not done in this step

Steps 2 to 4 of 2b: the fifteen tools, the permission callback as the gate, the CLI route
removed. The `skills` and `skill_versions` tables stay until step 4, read by nothing.
