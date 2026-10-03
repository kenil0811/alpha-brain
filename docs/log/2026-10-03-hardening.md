# The hardening day (3 October 2026, evening)

The checkpoint's second item: the model boundary and the store, made mechanisms where the
three reviews found hope. Each change is small and has a test (`core/tests/test_hardening.py`
and the tests it touched); nothing changes what Alpha does for the person, only what happens
when something goes wrong or two things happen at once.

**The model boundary (`runtime/claude_cli.py`).**

- **A silent run is ended.** A run that produces no stream event (a thought, a tool call, a
  result) for ten minutes is killed and comes back as "No answer came back: the model's run
  went silent and was ended." This is a judgement of silence, not a cap on duration (Q18): a
  run that keeps working is never cut. Before, a hung CLI held an HTTP worker thread (routing
  ran inside the request) and, through a repair, the scheduler's whole tick.
- **Each kind of run has a key of its own.** A turn registers under its turn and thread, as
  before; a check, a noticing pass or a judge registers under `<kind>:<turn>:<random>`. Before,
  all of them shared the turn's id, so a noticing run could overwrite the turn's live progress
  on the panel, and stopping a turn stopped whichever run had registered last.
- **Every run is strict about MCP.** An independent or judging run now gets an empty MCP
  configuration with `--strict-mcp-config`, so nothing from the person's own Claude Code
  configuration loads into Alpha's runs. A turn gets Alpha's world, as before.
- **Internal detail stays in the log.** A run that returns nothing says "No answer came back
  from the model." (or the signed-out message when that is the cause) and logs the CLI's last
  lines; the person and the journal no longer see a stderr tail.

**The turn runner (`api/server.py`).**

- **Routing is off the request path.** The companion's sentence comes back at once as a turn in
  state `routing`; the worker places it (by structure, or the judge, a model run) and either
  runs it or leaves the turn in state `asked` with the choices. The app's wait loop and the
  companion follow `routing` like `running`.
- The after-turn hook (the build kick) runs inside a try; finished turns older than an hour
  leave the turn table; an internal failure reads "Alpha hit a problem it couldn't recover
  from; the details are in its log."

**The store.**

- **`collections.upsert` is one transaction**, and the existing keys are read inside it, so two
  runs saving the same list at once (a build and an automation) cannot both add a row for one
  key, and a crash leaves the table as it was. Entity links happen after the commit. A test
  saves one list from three threads at once: 40 rows, 40 keys.
- **Journal indexes** on `(kind, at)`, `json_extract(data, '$.turn')` and
  `json_extract(data, '$.ask')`: the reply of a turn, the answer to a question and entries by
  kind no longer scan the table (checked with the query plan).
- `write_note` and `entities.resolve` do their lookup and write under one lock (no duplicate
  page or entity from a race); `plans.recent` compares a cutoff in the rows' own ISO form (it
  compared against SQLite's space-separated `datetime()` before, off by up to a day).
- **A crashed build waits before it is restarted**, 30 s then doubling to ten minutes, instead
  of respawning at once for ever; a run that merely ended before its work did still carries on
  at once. `Scheduler.settled` runs under the lock.

**What ran.** `just test`: 173 core tests in about 12 s (the silence test takes four);
`just lint` clean; desktop typecheck and tests clean; the app rebuilt. Journeys:
`memory_correction` and `memory_old_fact`, 2 of 2 (`docs/journeys/2026-10-03-1425.md`), with the
judge checks answering in 4.5 s each under the strict, empty MCP configuration.

**Not done from the review's list (next):** splitting `tools.py` and `server.py`; one
`site_of`, one name rule, one proposal-answer helper; a schema version so migrations run once
from the core only; `records_fts` by triggers; the pre-pack budget per section; the desktop's
four (core supervision, polling paused when hidden, every failure shown, path checks).
