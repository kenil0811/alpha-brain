# Working in alpha-brain

Alpha is an agentic second brain (see `README.md`). This file is the standing rule for every
session that touches this repository, so that any new session can pick up from the docs alone.

## Docs and code stay in sync, every session

The docs are the memory of the project, in three places with three jobs (shape decided with
Kenil on 3 October 2026, after the checkpoint found the old shape true but unusable):

1. **`docs/STATE.md`** — the current state, one page, **rewritten** (never appended) before a
   session ends: what is built against the design's order of work, what runs for real, what is
   wrong, the pending list in order, and the numbers from `just stats`. A new session reads it
   first.
2. **`docs/log/`** — the dated history, one file per entry, **appended** and never rewritten:
   what a session built, what ran for real and what it found (commits, journeys, measurements,
   failures). Say "proven by tests only" when nothing ran for real; "it ran" is not "it works".
   `docs/log/README.md` lists the entries.
3. **`docs/design/alpha-second-brain-design.md`** — the intent, with a status box (built /
   differs / not built) under each section. Change the box when a change alters a section's
   state; never add prose about what was built there (that is the log). A decision taken with
   Kenil goes into §11 as a new Qn row, numbered in order, with the date and the failure or
   reason behind it. `build-plan.md` holds what does not change by the day (toolchain facts,
   the first slice's shape, what to port, open engineering questions).

Concretely, a session that changes code is not finished until, in the same commit or the one
right after it: the log has its entry, `STATE.md` is rewritten, and any design box whose
section changed is changed too.

4. **A change to how Alpha behaves is judged by the journeys**, not by tests alone:
   `just journeys` (all) or `just journeys <name>` runs the real journeys in `journeys/` on a
   copy of the world and writes `docs/journeys/<stamp>.md`; the log entry cites the report. A
   journey that fails after a change is a regression until shown otherwise.
5. **Numbers are measured, never carried.** `just stats` prints the test, tool, journey, commit
   and line counts and the lint state; `STATE.md` and the log quote it, never memory. If
   `just lint` is not clean, say so.
6. **README.md** — when the layout, the commands or the data directory change.
7. **Memory** — the auto-memory under `~/.claude/projects/-Users-kenil-Desktop-dev-alpha/memory/`
   gets a dated line in the relevant file (vision, direction, feedback, state) and `MEMORY.md`
   is kept as a one-line index. Memory holds what the repo can't (why, what Kenil said, what is
   open); the repo holds what is.

## Starting a session

Read in this order: `docs/STATE.md` → the design's status boxes for the sections you will touch
→ the newest two or three entries in `docs/log/` → `git log --since=<the date in STATE.md>`.
If the log is newer than `STATE.md`, rewrite `STATE.md` first.

## How we write code (the long form is `CONTRIBUTING.md`)

- Nothing per use case, no site or app knowledge in the platform; mechanisms, not prompts
  (a wall lives in the code where the effect happens, and a prompt only repeats it); no knobs
  and no caps on work (a threshold is a judgement of a failure, named as such); every value
  with its provenance; the journal verbatim and never deleted; plain words wherever a person
  or the model reads (`Problem` for "cannot", the log for internal detail).
- Layout: `world/` (the store, one module per kind of thing) ← `context/` ← `runtime/` ←
  `mcp/` and `api/`; the app talks to the core only through `desktop/src/core/client.ts`.
  Imports go one way; an import inside a function is a smell.
- The store: one logical change is one transaction (`with store.tx() as db`), including the
  read it depends on; a state change is a conditional write; no transaction inside another;
  migrations idempotent; hot queries indexed and proven with the query plan; every new table
  in `purge.py`.
- Tools: a `@tool` method whose docstring is the model's whole instruction, named
  `<thing>_<verb>`, raising `Problem`, journaling what it did, checking the gates in code.
- Tests: mechanisms by unit tests with fake runners (never the network, a browser or the real
  model; waits with deadlines, never fixed sleeps); behaviour by journeys; acceptance by a
  real run. Lint, types and both test suites clean at every commit.

## Rules that bind the code (decided with Kenil; details in the design)

- Nothing per use case; the platform knows no domain. Never site- or app-specific logic in the
  platform; Alpha's know-how (skills: readers, procedures, pipelines) is never patched by hand —
  ask Kenil.
- Plan first by mechanism: lasting things are made only inside an approved plan's build.
- No limits, quotas or technical knobs; the person stops what isn't going anywhere.
- Known, assumed or asked: every value has a source, or is estimated and says so, or is asked.
- Removal deletes everything related; the journal is never deleted.
- Acceptance is a real run in the person's own app or world, never a test or an API call alone.
- A copy of a world for a check is made with SQLite's backup, never `cp`, and a core started
  for a check runs `alpha serve --no-background`.

## Toolchain

`uv` (Python 3.13.9), Node from `/opt/homebrew/opt/node@24/bin` (the default Node is broken),
pnpm 10, Tauri 2.11.6. `just test`, `just lint`, `just test-desktop`, `just journeys`, `just app`,
`just stats`. The model route is the Claude Code CLI on Kenil's subscription; `claude` must be
signed in from the default config home and `USER` must be set. Keep `desktop/src-tauri/Cargo.lock`.

## UI, rules and bugs (from Alpha)

@AGENTS.md
