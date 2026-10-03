# Contributing to Alpha

This is how the code is written, laid out, tested and documented, so that a second person or a
second agent produces work that fits. Everything here describes what the repository does
today; where a convention is aspirational it says so. Read `docs/STATE.md` first for where the
project stands, `docs/design/alpha-second-brain-design.md` for what it is trying to be, and
`CLAUDE.md` for the session rules that agents follow (this file is the long form of its "how
we write code" section).

## 1. The philosophy, in engineering terms

Alpha is an agent that keeps a person's world and acts for them. The design's ten principles
(§1 of the design) turn into these rules for code:

1. **Nothing per use case.** The platform knows no domain and no site. A calorie, a job, a
   LinkedIn page: never named in the platform. If a feature needs to know what a column means
   or how a site is laid out, that knowledge belongs to Alpha (a skill, a page, a fact in the
   world), not to the code. The test: would this line still make sense if the person tracked
   something you have never heard of?
2. **Mechanisms, not prompts.** A rule that matters is enforced in code where the effect
   happens: the plan gate refuses to make a table outside an approved build; `action_propose`
   refuses inside an automation; an action's state moves with a conditional write. A sentence
   in a prompt is guidance for the model, never the wall. When a review finds a wall that is
   only a prompt, it is a defect (the 3 Oct checkpoint found one).
3. **No knobs, no limits.** No setting the person meets, no quota, no step cap, no time limit
   on work. What bounds cost and risk is behaviour (a run that has gone silent is ended; a
   crashed build waits before it restarts; an automation runs at most every 30 minutes). Before
   adding any threshold, ask whether it is a judgement of a failure (fine) or a cap on work
   (not fine), and name it in the docstring as the former.
4. **Known, assumed or asked.** Every value Alpha writes carries where it came from
   (`provenance`: stated, looked up with a source, estimated, assumed). Code that writes a row
   without a source is wrong. Code that guesses silently is wrong.
5. **Verbatim first.** The journal is the record and is never deleted (removal tombstones it).
   Every change to the world is journaled with its actor and its turn. Derived things (pages,
   facts, summaries) sit beside the verbatim, never instead of it.
6. **The person stops things; Alpha repairs its own know-how.** Skills (readers, procedures,
   pipelines) are Alpha's: tried on a real run, kept with health, repaired by Alpha when a
   site changes. A developer never patches a reader's script by hand in a person's world. If
   Alpha's know-how is wrong, fix the mechanism that let it be wrong, or ask the owner.
7. **Plain words everywhere a person or the model reads.** Error messages, journal lines,
   tool docstrings, card text: full sentences, no identifiers, no stack traces. Internal detail
   goes to the log. `Problem` is the exception for "this cannot be done, and here is why in
   words"; anything else is a bug and is logged with the traceback.
8. **"It ran" is not "it works".** A change to how Alpha behaves is proven by a real journey
   on a copy of a real world, not by a unit test alone. Numbers in documents are measured
   (`just stats`), never remembered.

## 2. How the code is laid out

```
core/alpha/
  world/        the store and the tables, one module per kind of thing (journal, collections,
                entities, knowledge (facts, pages, goals), skills, automations, plans, actions,
                sources, modules, purge). No model, no HTTP, no browser here.
  context/      what the model is given: the pre-pack (prepack.py) and module summaries.
  runtime/      how a run happens: claude_cli (the model boundary), turn, build, pipeline,
                acting, automation (the scheduler), conversations, judge (the System One seam),
                noticing, check (the second opinion).
  mcp/          the world as tools for the model (tools.py, server.py).
  api/          the loopback HTTP API the app uses (server.py) and the turn runner.
  connectors/   the Python side of the hands: browser, files, calendar.
  journeys/     the suite that runs ../journeys/*.yaml on a copy of a world.
  cli.py        `alpha …` commands.
connectors/     the hands as Agent Skills directories (connector.yaml, SKILL.md, scripts/).
desktop/        the Tauri 2 + React app: shell/ (rail and pages), modules/ (module and table
                pages), assistant/ (the panel), avatar/ (the companion), core/ (client.ts: the
                only way to the core), src-tauri/ (the host that starts the core).
journeys/       the real journeys, YAML.
docs/           STATE.md (now), log/ (then), design/ (intent), journeys/ (reports).
```

Where a change goes:

- A new kind of thing the world holds → a module in `world/` with its table in `store.py`'s
  schema, its view function, and its purge rule (removal must take everything related).
- A new way the model can act on the world → a `@tool` method in `mcp/tools.py` (see §3.4),
  and nothing else: the API and the app read the world, they do not have tools of their own.
- A new way a run happens (a kind of background work, a judgement) → `runtime/`.
- A new surface for the person → the app, talking to the core only through `client.ts`.
- Site or app knowledge → nowhere in the repository. It is Alpha's to learn.

The dependency direction is one way: `world` ← `context` ← `runtime` ← `mcp`/`api`. A module
in `world/` never imports from `runtime/`. An import inside a function is a smell that means
the direction is wrong; it is tolerated only to break a cycle that cannot be removed today,
with a comment saying so.

**Known debt** (the 3 Oct checkpoint, `docs/log/2026-10-03-checkpoint.md`): `mcp/tools.py`
and `api/server.py` are too big and will become packages; "same site" is computed in four
places; the record search index is kept in step by hand. New code should not add to any of
these; the next slice removes them.

## 3. Conventions

### 3.1 Python

- Python 3.13, `uv`, `ruff` (line length 100, rules E F I B UP W) and `mypy --strict` on the
  package; both clean at every commit (`just lint`). Type annotations everywhere; `Any` only
  at the edges where a row or a JSON value genuinely is anything.
- Modules are nouns (`journal.py`, `skills.py`); functions are verbs; names are the words the
  design uses (a *skill*, a *turn*, a *conversation*, an *action*), never synonyms. One
  concept, one name, in code and in the person's words alike.
- A module starts with a docstring that says what the module is *for* and the decisions it
  embodies, with the design section or log entry behind them. Function docstrings explain
  why, not what the code visibly does. A comment that restates the next line is deleted.
- Dates and times are UTC ISO-8601 strings with seconds, everywhere in the store; local time
  appears only where the person reads it (`when()` helpers). Ids are `<prefix>_<12 hex>`
  (`j_` journal, `r_` record, `e_` entity, `a_` automation, `t_` thread…).
- JSON columns hold compact JSON from `store.dumps` (no spaces); never match JSON as text;
  load it, change it, dump it.

### 3.2 The store

- One SQLite file per person, WAL mode, one connection per process behind a re-entrant lock,
  `with store.tx() as db:` for every write. **One logical change is one transaction.** A
  read-then-write that must be consistent (an existence check, a state move, a batch save)
  happens inside that transaction, not around it; `BEGIN IMMEDIATE` takes the write lock at
  the start. Never open a transaction inside another: pass `db` down.
- A state change is a conditional write (`UPDATE … WHERE id = ? AND state IN (…)`), and a
  zero row count is a `Problem`. Two threads must not both be able to perform one thing.
- Schema changes go in `SCHEMA` for new tables and `ADDED_COLUMNS` for new columns; a data
  migration goes in `Store._migrate` or a method it calls, idempotent, because it runs on every
  open from every process. (A schema version is on the list; until then, every migration must
  be safe to run twice.)
- Hot queries have indexes; a new query on the journal by anything but `at`, `thread`,
  `module`, `kind` or the `$.turn` / `$.ask` expressions needs one, and `EXPLAIN QUERY PLAN`
  in a test to prove it is used.
- Deleting is tombstoning or purging; the journal is never deleted. A new table must appear in
  `purge.py` so that removing a module, a connection or a row takes everything made for it.

### 3.3 Journaling and provenance

- Every change to the world that a person could ask "why?" about is a journal entry, with the
  actor (`person` or `alpha`), the turn it came from, the module and thread, and the entities
  it names. The kinds are fixed (`journal.KINDS`); use `did` for something done, `changed` for
  a setting or a page, `made` for a lasting thing, `noticed` for something Alpha noticed,
  `failed` for a failure, `asked`/`answered` for questions. From a tool, use `Tools._did`.
- A record carries `provenance`: who wrote it, from which turn, which source, whether it was
  estimated or assumed, which reader returned it. A tool that writes rows takes `source` and
  refuses to guess.

### 3.4 Tools (what the model can do)

- A tool is a method on `Tools` decorated with `@tool`. Its docstring is the model's entire
  instruction for it: write it for the model, in plain sentences, saying when to use it, what
  each argument is, and what comes back; mention the rule it enforces. The name is
  `<thing>_<verb>` (`records_add`, `skill_read`, `action_propose`); verbs are `list`, `read`,
  `add`, `update`, `save`, `run`, `propose`, `approve`.
- A tool raises `Problem` for "cannot do that": the decorator turns it into `{"error": …}`
  for the model. It never returns a bare traceback. It journals what it did.
- A tool that makes a lasting thing checks the plan gate (`self._gate`); a tool that acts
  outward checks `self._in_automation()`. Walls live in the tool, not in the rules prompt.
- Before adding a tool, ask whether an existing one with one more argument does it; the model
  reads every tool's schema on every turn, and the count is 70 (the next slice trims it).

### 3.5 Prompts

The rules the model follows live as prose constants beside the code that runs them
(`turn.RULES`, `automation.AUTOMATION_RULES`, `judge.SYSTEM`, `noticing.RULES`). They are
guidance, numbered, in the second person, and they repeat the wall the code enforces so the
model does not try it. A rule that changes behaviour is a design decision: it goes in the log
and, when it is a principle, in the design's §11 with a Qn number. Never put a person's data or
a site's name in a rule.

### 3.6 Concurrency

Turns, builds, automations, checks and noticing run as threads in the core; each model run is
a child process with its own tool server opening the same store. Therefore: a thread never
holds the store lock across a model run or a browser job; a long operation (a backup, a
purge) is the exception and says so; the hands take turns on a sign-in profile through the
per-profile file lock in `connectors/browser.py`; a registry of running things (`LIVE`, the
scheduler's `running`) is keyed uniquely per run; and anything that can be reached from two
threads (a state move, an upsert) is written as in §3.2.

### 3.7 Errors

- `Problem(message)` for anything the caller asked for that cannot be done, in words the
  person could read. It carries no internal detail.
- A broad `except Exception` is allowed only around background work that must carry on (a
  scheduler tick, a noticing pass) and must `log.exception`. It is never used where a person
  is waiting for the result: there, the failure is returned as a plain sentence and the
  detail goes to the log (`claude_cli.parse_result` is the pattern).
- Nothing fails silently. A failed read becomes a source status; a failed run becomes a
  `failed` journal entry; a failed request becomes an error the app shows.

### 3.8 The desktop

- TypeScript strict, React function components, no state library; `core/client.ts` is the
  only module that talks to the core, with typed calls and the API's own shapes. A component
  reads the world through props or its own `client` call, never through a global.
- CSS lives in `src/styles/app.css` with `block__element` class names and `--tokens` for
  colours and type; inline styles are for one-off geometry only. Light and dark both work.
- Every button has a label; every list that updates has a role; keyboard paths exist for
  what a mouse can do (the review of 3 Oct lists the gaps; new code does not add to them).
- A failed request shows an error state with a way to retry; a poll stops when its window is
  hidden (both aspirational as of 3 Oct; see the state page's pending list).
- `pnpm typecheck` and `pnpm test` (vitest, jsdom) clean at every commit; a component with
  state gets a test.

### 3.9 The host (Rust)

`src-tauri/src/lib.rs` starts the core from the repository's `.venv`, hands it a random token
through a cleared environment, forwards its stdout, and exposes a few commands (reveal and
open a file in Alpha's own folder). A command that takes a path resolves it before checking it
is inside the data folder. The CSP allows only the loopback core and Google Fonts.

## 4. Testing

- **Unit tests** (`core/tests`, pytest, 7–12 s for the suite) prove mechanisms: the store,
  the gates, the state moves, parsing, the pre-pack's sections, routing, the scheduler. They
  use the `world` fixture (a fresh SQLite file in a temp dir) and `building(world)` for tools
  that may make lasting things. They never reach the network, a browser or the real model: a
  runner is a function `TurnRequest → RunResult`, and fakes tell the kinds apart by
  `req.kind` (`turn`, `independent`, `judge`). A test that needs time waits on a condition in
  a loop with a deadline, never a fixed sleep. A test that spawns processes uses a tiny shell
  script as the binary.
- **Journeys** (`journeys/*.yaml`, `just journeys <name>`) prove behaviour: real sentences to
  the real model on a copy of a real world, judged by a rubric and timed, with the report in
  `docs/journeys/`. A change to how Alpha behaves adds or reruns one; a journey that fails
  after a change is a regression until shown otherwise. Journeys cost subscription time: run
  the ones the change touches, and the memory set when context or memory changed.
- **Acceptance** is a real run in the person's own app or world. Tests and API calls do not
  count as "it works" in any document.

## 5. Documentation

The rule is in `CLAUDE.md`: `docs/STATE.md` rewritten every session, a dated entry in
`docs/log/`, a status box changed in the design when a section's state changes, numbers from
`just stats`. Two habits that make it cheap:

- Write the log entry as you go, not at the end: what you found, what ran, what it measured.
  It is the only record of *why* a line of code exists in a year.
- When you learn something about the Mac, the CLI, a site or a library that cost time, it goes
  in the log entry and, when it will bite again, in the relevant docstring.

## 6. Workflow

- One branch, `main`; small commits that each leave tests, lint and types clean. A commit
  subject is a sentence in plain words saying what changed and why
  ("Daily runs on a sleeping Mac: awake gate, keep-awake, side-by-side automations"), and the
  body says what was found, what ran and where it is documented. An agent adds its
  `Co-Authored-By` line.
- Definition of done for a change: the mechanism, its unit test, the journey when behaviour
  changed, the log entry, `STATE.md`, the design box if a section's state changed, the app
  rebuilt when the desktop or the core's startup changed, and a real run when the change is
  something the person will meet. Say plainly in the log what was proven by tests only.
- Before a pull request or a handoff, run `just test`, `just lint`, `just test-desktop`,
  `just stats`, and the journeys the change touches.
- Never work against a copy of a person's world made with `cp` (the write-ahead log stays
  behind and the copy is stale); use SQLite's backup, as `copy_home` does, and start a check
  core with `alpha serve --no-background` so nothing runs on its own there.

## 7. Working with agents

Most of this code was written by Claude Code sessions directed by the owner, and more will
be. What keeps that honest:

- `CLAUDE.md` is read by every session; it holds the rules and the reading order. This file
  is the long form; keep the two consistent.
- A session states what it measured and what it did not; "it ran" and "it works" are
  different sentences. A claim about a count, a pass rate or a timing is re-measured before
  it is written.
- A session that touches the owner's live world (the app's data directory) says so and never
  runs anything there that the owner did not ask for; checks happen on a backup copy with a
  background-free core.
- Decisions that bind the code are the owner's: when a change would alter a principle, a
  rule in `CLAUDE.md` or the person-facing behaviour, propose it in the log or the state
  page's pending list and wait for the yes.
