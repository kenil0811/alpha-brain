# Slice 1 of Q53: kits — export without data, install empty, update in place

A proposal, 16 October 2026, for the first slice of Q53 (`shipping-and-kits-proposal.md` §5,
§6, §12). Nothing here is built. The channel is slice 2 and connector slots are slice 3; this
slice gives them the thing they carry and the rule they apply.

## 1. What a kit is, in code

A kit is one module's definition with nothing of anyone's data, as one folder:

```
<name>/
  kit.yaml           kit: 1 (the format), name, title, version (an integer, 1, 2, 3…), about
                     (the module's goal), changes (what this version changed, plain words),
                     requires: {alpha: ">=0.1"}, inside: (a parent module's name, optional),
                     needs: [{sign_in: linkedin.com}, {key: census_api_key, why: …}],
                     uses: [] (connectors; empty until slice 3), tables: {<key>: <table name>}
  tables/<key>.json  one per table: title, title_field, identity, the fields exactly as the
                     world's `collections.schema` holds them (ids, labels, kinds, choices,
                     relations by table key, units, required)
  settings.json      the settings table's rows as definitions: key, label, unit, origin, why,
                     and the default value when its origin is not "you"; a "you" value never
                     travels: the key stays with an empty value and `supply: true`
  page.json          the workflow page's body and words (its latest version), when the module
                     has one; a module made before §12 (Network) has none, and that is allowed
  WORKFLOW.md  workflow.json  parts.yaml  parts/  documents/  requirements.txt
                     the workspace as the build left it, minus inputs/, PROGRESS.md, .venv and
                     .git; requirements.txt written by the export from the venv when the build
                     left none (`.venv/bin/pip freeze`)
  skills/<name>.json one per reader, procedure and pipeline the module uses: kind, site, url,
                     description, when_to_use, script, to_end, whole, effect, steps, verify,
                     fields; never health, last run, counts or versions. notes.md beside it when
                     the skill has a site-notes page
  agents/<id>.json   description, name, goal, schedule, may, done, skill; brief.md (the brief
                     page as the default brief, as config/briefs/ does for built-in agents).
                     Never notes, runs, decisions, cursor, thread
  sources.json       title, url, reader per source; no status
  views.json         the saved lists of the module's tables, when any
```

What never goes in: rows (`records`, `record_versions`), the person's settings values, sign-ins
(`connections`, `browser/`), runs, health, notes and decisions, the journal, `inputs/`, the
venv, `PROGRESS.md`, preferences (colours, sidebar), the module's own page (`module:<name>`),
goals. The export refuses to write a kit while any text in it contains a name, an email address
or a profile URL from the exporting world's entities, facts about the person, or connection
targets, and says which file and which string. The page's answers and example items are blanked
by code before the scan. No model pass in this slice.

## 2. Ownership: two tables, no new columns

```sql
CREATE TABLE kits (
    id TEXT PRIMARY KEY,          -- k_…
    name TEXT NOT NULL UNIQUE,    -- the kit's name
    title TEXT NOT NULL,
    version INTEGER NOT NULL,
    module TEXT NOT NULL,         -- the module it made or adopted
    channel TEXT,                 -- null in this slice
    base_commit TEXT,             -- the workspace commit of this version's tree
    installed_at TEXT NOT NULL, updated_at TEXT NOT NULL, from_path TEXT
);
CREATE TABLE kit_things (
    kit TEXT NOT NULL REFERENCES kits(id),
    kind TEXT NOT NULL,           -- table | field | setting | part | template | skill | agent | source | view | page
    ref TEXT NOT NULL,            -- table name; table.field; settings key; part id; documents/<file>; skill name; agent id; url; view id; 'page'
    base_hash TEXT NOT NULL,      -- sha256 of the thing's definition as this kit installed it
    kit_hash TEXT,                -- the hash the current kit version carries (differs from base when kept)
    state TEXT NOT NULL,          -- managed | differs | dropped
    dropped_in INTEGER,           -- the kit version that dropped it
    PRIMARY KEY (kit, kind, ref)
);
```

A thing's **hash** is the sha256 of its definition, canonical JSON: a table's schema entry; a
field's dict; a setting's key, label, unit, origin, why and default; a part's or template's
file bytes; a skill's kind, site, url, description, when_to_use, script, to_end, whole, effect,
steps, verify, fields; an agent's description, name, goal, schedule, may, done, skill and brief
body; a source's title, url, reader; a view's config; the page's body and words. **Changed since
install** is `hash(now) != base_hash`, computed when asked, never stored as a flag, so a thing
changed and changed back is untouched again. Both tables go into `purge.py`: a module's removal
deletes its kit's rows; the journal keeps the line.

Three states the window shows, from these two tables and the hash: **managed** ("From the
LinkedIn Network kit, version 1"), **differs** ("Changed from the kit", with Keep mine / Take the
kit's), and nothing for the person's own. Values are never things: rows, settings values with
origin "you", runs, health, notes, decisions.

## 3. Export: `alpha kit export <module> --to <dir>`

By code, no model, reading the world only: the module row; every table of the module with its
schema (relation fields rewritten to table keys); the settings table's rows as definitions; the
workflow page of the module if any; the workspace files listed above (with `requirements.txt`
made from the venv when missing); the skills the module uses, found the way `purge.py` finds
them (`_readers_of`: the readers its sources name, the readers its agents' pipelines call, and
the pipelines themselves) plus the procedures its agents' pipelines call; its agents with their
brief pages; its sources; its views. Then the scan (§1), and `kit.yaml` written with `needs`
derived from the sources' sites and the settings with `supply: true`. Nothing in the world
changes. `--adopt` additionally records the module as from this kit at version 1 with every
base hash equal to the current hash, so Kenil's own Network reads "From the LinkedIn Network
kit, version 1" and takes later versions like a client's.

## 4. Install: `alpha kit install <dir> [--inside <module>]`

Checks first, each a plain refusal: `kit: 1`; `requires.alpha` against the core's version; the
module name free; every `uses` connector present (none in this slice); every skill name free or
already owned by this kit; the format of every file. Then:

1. **The files**: the workspace is made under `modules/<new id>/` from the kit's tree
   (`workflow.json` rewritten with the real table names, as the build writes it), with the
   build's `.gitignore`, `git init` and one commit "Installed <title>, version 1" tagged `kit-v1`;
   `base_commit` is that commit.
2. **The world, one transaction**: the module (inside the parent if named); each table with its
   schema verbatim, relations resolved to the new names, journaled as the build journals a
   table; the settings table (the build's six fields) with a row per definition, value from the
   kit where it has one, empty with its why where `supply: true`; the page as a `workflows` row
   in state `built`, version 1, with its `workflow_versions` row; each skill saved with
   health `untried` and `source` "kit:<name>@1", its notes page written; each agent created
   (`Agents.create`, state on; its brief page written from `brief.md`); each source added with
   status `not_built` (its first run sets `needs_signin` or `working`, as today); the views; the
   `kits` row and one `kit_things` row per thing with its base hash; the journal: "Installed
   <title> (version 1)", actor alpha, with the kit's name, version and path in its data.
3. **After**: the templates registered as the build registers them (`Files.take`, origin
   "template"); the venv built in the background with the app's own Python
   (`$ALPHA_PYTHON -m venv .venv; .venv/bin/pip install -r requirements.txt`), its state on the
   module page ("Setting up the parts…", "Ready", or "The parts could not be set up: <why>" with
   Try again); then `parts.run_due` once the venv is ready.

A failure in step 2 leaves nothing: the transaction rolls back and the folder from step 1 is
removed; the journal gets "Could not install <title>: <why>". A failure in step 3 leaves the
module installed with the problem on its page.

**Needs.** A new route `GET /api/needs` lists what installed kits still lack: a sign-in per site
in `needs` with no `connections` row for it, and every setting with `supply: true` and an empty
value, each with its why. The first-run card ("Set Alpha up to start") shows them as rows after
the account and the browser (Sign in… opens the sign-in window as Settings › Reads with does; a
key row opens the module's settings), and stays until they are met or skipped; Home's "Needs
you" shows the same rows while any remain. Nothing is pre-filled.

## 5. Update: `alpha kit update <dir>`

The same kit name, a higher version, against the `kits` row. For every thing, three hashes:
base (as installed), now (the world), new (the kit). Untouched means now = base.

| Kind | New in the kit | In both | Dropped from the kit |
|---|---|---|---|
| table | created as in §4 | fields handled below; title relabelled if untouched | stays; `kit_things.state = dropped`, shown "no longer in the workflow" on the module page |
| field | added, optional, empty; `parts.retry` fills what it can | the id never changes; the label and choices follow the kit if untouched, else kept | stays, marked `dropped`; shown so, hidden from new lists by default; deleting it is the person's, by hand, when field deletion exists (it does not today) |
| setting | row added with the kit's default and origin | default applied only where the row is untouched (now = base) and origin is not "you"; the person's value stays | row stays, marked dropped |
| part, template, parts.yaml, requirements.txt | added | **a git three-way merge**: the kit's tree committed on the `kit` branch as `kit-v<n>` (parent `kit-v<n-1>`), then `git merge kit-v<n>` into the workspace's branch; a clean merge is taken; a conflicted file keeps the workspace's version, gets the kit's beside it as `<file>.kit` (dpkg's `.dpkg-dist`, RPM's `.rpmnew`), and is marked `differs` | the file stays, marked dropped; the part's entry leaves `parts.yaml` only if untouched |
| skill | saved, untried | replaced when untouched (saved by "kit", health `untried`, the old version kept in `skill_versions`); kept and marked `differs` when the person's Alpha changed it, the kit's version held in `.kit/pending/skills/<name>.json` for Take | kept, marked dropped |
| agent | created, on | description, schedule, may, done and brief follow the kit if untouched; else kept and marked | paused and marked dropped, never deleted |
| source | added | title and reader follow the kit | kept, marked dropped |
| page | the kit's, as version 1 | a new `workflows` version (the old kept): structure merged by id (steps, keeps, settings, documents: the kit's additions in, the person's additions kept), words the kit's if untouched else the person's; both changed on one step → the person's, marked | — |

Then: the venv rebuilt when `requirements.txt` changed; `kits.version`, `base_commit` and every
taken thing's `base_hash` set to the new; a kept thing keeps its old base, `kit_hash` the new,
state `differs`; the journal: "Updated <title> from version 1 to 2: <the kit's changes>", with
the kept things named. **Keep mine / Take the kit's** (`POST /api/kits/{id}/things/take` and
`/keep`) work per thing: Take writes the kit's version (`git checkout kit-v<n> -- <file>`, or the
pending skill saved, or the agent fields set) and moves the base; Keep leaves it and records the
choice so the mark goes quiet until the next version changes it again. Doc's merge is not in this
slice: Doc has no file-merge task yet; when it does, it becomes the third button.

**Rollback and back.** The world's part is one transaction; the merge runs on a temporary branch
and fast-forwards only when the transaction committed; on failure `git reset --hard` to the
pre-update commit and the journal says why. `alpha kit back <module> <version>` restores the
workspace (`git revert` of the merge commit), the page (its previous `workflows` version) and
the replaced skills (`Skills.restore`), and leaves tables, fields and settings as they are: the
schema only grew. A name a kit dropped is **reserved**: a later version reusing a dropped table,
field, setting, part or skill name is refused at the check.

## 6. Where the code goes

| Where | What |
|---|---|
| `core/alpha/world/kits.py` | the two tables' store: `Kits` (create, get, of_module, bump, record things, states, hashes), the canonical hashing of each kind, `remove_module` for `purge.py` |
| `core/alpha/world/store.py` | the two tables in `SCHEMA`, idempotent as the rest |
| `core/alpha/world/purge.py` | `Kits.remove_module(db, mid)` in `remove_module`; the `.kit/` folder goes with the workspace |
| `core/alpha/runtime/kits.py` | export (the gather, the scan, the write), install (the checks, the files, the transaction, the after), update (the three hashes, the rules, the merge), back, adopt; the venv set-up reusing `workspace.run_script`'s walls |
| `core/alpha/config/limits.toml` | the venv set-up's deadline, with its why (a judgement of a failure, not a cap) |
| `core/alpha/api/kits.py` | `GET /api/kits`, `POST /api/kits/install {path}`, `POST /api/kits/update {path}`, `GET /api/modules/{id}/kit` (origin, version, the differs and dropped lists, the venv state), `POST /api/kits/{id}/things/take|keep`, `GET /api/needs`; registered in `server.py` |
| `core/alpha/cli.py` | `kit export|install|update|back|list` |
| `desktop/src/core/client.ts` | the calls above and their types |
| `desktop/src/modules/ModulePage.tsx` | the origin line under the title; a "From the kit" section: the differs list with Keep mine / Take the kit's, the dropped list, the venv state with Try again |
| `desktop/src/shell/Settings.tsx` | a Kits card: installed kits with version and date; "Install a kit…" and "Update from a kit…" (a folder picker, the path sent) |
| `desktop/src/App.tsx` | the first-run card's needs rows, from `/api/needs` |
| `desktop/src/shell/SkillPage.tsx` | "From the <kit> kit, version n" or "Changed from the kit" on a skill |
| `README.md` | the data directory's `modules/<id>/.kit/` and the commands; `docs/` as CLAUDE.md requires |

Nothing in `connectors/` (the hands) changes. Nothing per use case: a kit is any module.

## 7. How it is proven

**Tests** (`core/tests/test_kits.py`, fake world, no model): export → install into an empty
world gives equal schemas, settings definitions, skills (health untried), agents (on), sources,
page, and the workspace files; a "you" value never travels; the scan refuses a kit naming a
person; install refuses a taken module name, a taken skill name owned by no kit, a wrong
format and a core too old; update adds a field, applies a default only where untouched, keeps a
changed part and writes `<file>.kit`, keeps a changed skill with its pending copy, marks a dropped
field and refuses its name in a later version, keeps a changed brief, makes a new page version
with the person's steps kept; a failing transaction leaves no module and no folder; `back`
restores the workspace, the page and a replaced skill; `remove_module` deletes both tables'
rows; purge leaves the journal. Lint, mypy strict and the desktop tests clean.

**A journey**, `kit_round_trip`, on a copy of Kenil's world (SQLite backup, never `cp`): export
Network, install it into a fresh scratch world under its own `ALPHA_HOME`, and check the table,
the reader (untried), the agent (on), the source (not built) and the needs (a LinkedIn sign-in)
are there and no row is.

**The acceptance**, real, on his say: in that fresh world, sign in to LinkedIn with his account;
the reader runs untried → ok; the LinkedIn Connections agent's first run ends with a verdict and
rows. Then version 2: in the staging copy, one change by chat to Network (a field added), export
again, update the fresh world, its rows kept, the new field filled by `parts.retry` where a part
fills it (here none; the field appears empty). Then the conflict case: the fresh world's reader
repaired locally before a version 3 that changes it: kept, marked, Take works.

**For parts, templates and settings**, his world holds no module with a workspace today (the
car wash module is gone; its folder `modules/m_12ac0a8738be/` is still on disk, an orphan to
remove), so the proof is the `workflow_build` journey's module in its scratch world: exported,
installed into another fresh world, the venv built, a part run on one row, then a version 2
with a part changed on both sides.

## 8. Questions

1. Export by the CLI only in this slice (we export in our staging worlds); the window gets
   install, update and the marks. Recommendation: yes; a menu entry comes when a person needs it.
2. Settings: a value whose origin is "you" never travels; values of other origins travel as
   defaults and apply only where untouched. Recommendation: yes.
3. Field ids never change (labels may); a field or table dropped by a kit stays, marked, and
   deleting it by hand is a later slice, since field deletion does not exist today.
   Recommendation: yes.
4. On a conflict, this slice offers Keep mine and Take the kit's, with the kit's version kept
   beside (`<file>.kit`, a pending skill copy); Doc's merge waits for Doc's file-merge task.
   Recommendation: yes.
5. A kit's agents start on; a run before its sign-in exists ends with "needs your sign-in" on
   its page, and nothing retries on a clock. Or paused until the sign-in exists?
   Recommendation: on.
6. A reader's site-notes page travels with the kit, after the names scan. Recommendation: yes.
7. The acceptance as §7: Network from a copy of your world into a fresh one, your LinkedIn
   sign-in there on your say; parts from the `workflow_build` journey's module. And the orphan
   car wash folder removed. OK?
8. One new module per layer (`world/kits.py`, `runtime/kits.py`, `api/kits.py`), two tables, no
   new columns anywhere. Recommendation: yes.
