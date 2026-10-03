# Checkpoint, 3 October 2026

Kenil: "take a step back and reassess: where we stand, how aligned with the vision, is
everything in good shape, are docs aligned, are we really building a good and usable
product, is it scalable and maintainable." This is that assessment, measured on the repo and
on Kenil's live world at 14:00, with three independent code reviews (core, docs, desktop)
behind it. It is blunt where the evidence is; where I could not measure, it says so.

## 1. The verdict in one paragraph

Three days of building (66 commits since 1 Oct) have produced a system that holds together:
one world store, one way in, a real write route with approvals, know-how Alpha writes and
repairs itself, automations that run without a model, a memory layer that passes 6 of 7 of its
own benchmarks, and an app Kenil uses daily. It is aligned with the vision on the things the
vision calls fundamental (generic, one world, one way in, no knobs, local, evidence, known or
asked). It is **not yet the product the vision describes**: the companion is a window, not a
mouth that speaks up; nothing proactive exists beyond an automation's "worth telling"; people
are barely a thing in the live world (20 entities against 1,551 connections); a turn takes
30 s at the median and can start five model runs. The code is sound but lopsided: two files
hold 2,300 of 11,000 lines, the desktop has three tests, and the documentation has become a
17,600-word diary that no new developer could use to find the current state in under an
hour. The reviews found four real defects, all fixed today (§9), and a backlog of hardening
that is ordinary for code this young. None of this is a crisis. All of it is the kind of debt
that decides, over the next month, whether this stays buildable by one person with agents.

## 2. Measured

| What | Number |
|---|---|
| Core Python | 10,954 lines (tools.py 1,240; server.py 1,062; collections.py 719; store.py 581; suite.py 558) |
| Tests | 166 core (3,700 lines), 3 desktop; lint and types clean |
| Desktop | 4,973 lines TS/TSX, 748 CSS, 565 Rust; driver 559 JS |
| Tools the model sees | 70 |
| Journeys | 18 defined; latest runs 6/7, 2/2, 1/1, 1/2 then 1/1 |
| Commits | 77 total at 15:00; 66 since 1 Oct (14 / 38 / 14 on 1 / 2 / 3 Oct) |
| Smells | 35 `except Exception`, 5 `type: ignore`, 0 TODO |
| Docs | design 588 lines; build-plan 1,485 lines, 17,622 words; 10 journey reports |
| Live world | 4.7 MB + 4.7 MB write-ahead log; 53 MB browser profiles; 6.7 MB action screenshots |
| Journal | 1,044 entries; 2 Oct alone: 392 reads, 163 did, 77 replies, 40 sentences from Kenil |
| Records | 2,557 (connections 1,551; deals 837; jobs 118; the rest under 30) |
| Knowledge | 20 entities, 6 facts, 6 pages (all module pages), 7 documents |
| Know-how | 28 skills (22 read, 3 act, 3 run), 5 automations (4 on), 34 sources (22 working) |
| Work | 8 plans (6 done), 12 actions (10 done, 2 declined), 0 open questions |
| Turn latency | 1 Oct median 26 s, p90 192 s; 2 Oct median 34 s, p90 186 s, max 1,354 s |
| Context per turn | 9.1k–11.7k characters (2.3k–2.9k tokens) after today's fix; before it, every pack on this world was cut at the 12,000 cap |
| Model runs per sentence | up to 5 (routing judge, the turn, the second opinion's two, noticing); a repair or a build kick adds more |
| Desktop load | about 26 requests a minute idle (18 of them the companion's), about 140 a minute while a turn runs on a table page |

What I could not measure: how much of Kenil's use goes through the companion versus the
panel (turns do not record their origin); subscription usage and rate-limit headroom; how
often a real daily run breaks once the sleep fix (§4.22) has had a week.

## 3. Against the vision, principle by principle

The design's ten principles (§1) and what the code does:

| Principle | Holds? | Evidence |
|---|---|---|
| 1 Generic | **Yes** | No domain in the platform; site vocabulary out of the hands (Q23); skills are Alpha's. |
| 2 One world | **Yes** | One SQLite file; cross-links by entity. But 0 of 2,557 rows link to an entity: the cross-linking exists as a mechanism no table in the live world uses. |
| 3 One way in | **Yes** | `turn.ask` for every sentence; conversations and routing since 3 Oct. |
| 4 Do now, deepen later | **Yes** | Plain actions at once; anything standing goes plan → yes → build (Q19). |
| 5 Reads free, writes ask | **Yes** | Actions with dry-run previews; prepare-level standing sentences (Q24). Automations cannot act outward, by code since today (§9). |
| 6 Quiet by default, proactive while away | **No** | Nothing proactive exists: no triage, no digest, no sleep-time pass, no notifications. "Worth telling" from automations is the only unprompted line. |
| 7 No knobs | **Yes** | One floor (30 min between runs, Q22); everything else behaviour. The thresholds that exist (idle close 30 min, awake 60 s, composition depth 3, pack 12,000) are mechanisms, not settings. |
| 8 Local-first | **Yes** | Only the model route leaves the Mac. Browser profiles with session cookies sit unencrypted under Application Support (53 MB). |
| 9 Evidence over cleverness | **Yes** | Verbatim journal, FTS, fixed schedules, readers kept only after a real run. |
| 10 Known, assumed or asked | **Yes** | Provenance on rows; second opinion; build trials. |

**The gap, in one sentence:** the vision's product is "a companion that becomes more useful
the longer it runs, quiet, proactive while you are away"; what exists is a very capable
workspace with a chat that answers when asked. §5's four entries: 1 built, 2 partly, 3 and 4
not started. §8's Today lane with a digest, the person page with keep-in-touch, decide-once
on recurring senders, ⌘K, Undo: not built. The memory round (§3.7) closed most of the memory
gap this week; the proactivity gap is untouched since 30 September.

## 4. Is it a good, usable product today?

**What works, for real, every day.** Four daily automations (LinkedIn connections, 15 deal
sites, 4 job boards, Gmail from one sender) run without a model and report what changed. Kenil
asks questions about his tables and gets answers from the data. Drafts and sends go out through
procedures with previews (9 sends done). Files come in and out. Builds happen in the background
with a plan first. The second opinion caught a wrong calorie count on day one.

**What makes it feel slow or brittle.**

1. **Latency.** A median turn of 30 s, a p90 of three minutes. Resumed conversations answer
   in 6 s where fresh ones take 18 s, which shows where the time goes: a fresh `claude -p`
   with a 3k-token pack, 9k characters of rules and 70 tools. A second brain that takes 30 s
   to say how much protein is left will be used less than one that takes 3 s. The fix is not
   one thing: fewer tools in the manifest, a smaller pack for small questions, the judge
   answering table questions where a rule plus Haiku can, and keeping the session warm.
2. **Cost per turn.** Up to five model runs per sentence. On a subscription this is "free"
   until it hits the rate limit; nobody has measured when. The second opinion and noticing are
   the right ideas; they need throttling by behaviour (noticing only when the turn had new
   content; the opinion only when a value was worked out, which is already so).
3. **Failure is visible but not always explained.** Yesterday's run shows the pattern: a
   sleeping Mac made a sound reader look broken, and Alpha rewrote it. Activity showed three
   failures and no cause. The desktop review adds the quieter version: 26 places where a
   failed request shows nothing, pages that say "Loading…" forever, and a rail that says
   "Alpha is running" after the core has died.
4. **People are not first-class in practice.** 20 entities, 6 facts, no page about any
   person. The People page is correct and nearly empty. Nothing links Kenil's 1,551 connections
   or the senders of his mail to people, because no reader declares its rows as people and no
   pass does it afterwards.
5. **The first-run experience is unknown.** Install, sign in to Claude, connect a site: proven
   by tests only (build-plan §4.3). Nobody but Kenil has run it, and the bundle only runs on
   this Mac (the repo path and a Homebrew path are compiled in).

**The honest usability score:** a strong internal tool for its builder; not yet something to
hand to a second person.

## 5. Is it scalable?

For its stated scope (one person, one Mac) the store is not a concern: SQLite with FTS at
1,000 journal rows a day is 365k a year, well under where it slows. What will not scale as is:

- **Hot queries scan.** The journal has no index on kind; open questions are found with a
  correlated `json_extract` scan on an endpoint the app polls; `/api/people` runs two queries
  per entity. Fine at 1,000 rows, visible at 100,000.
- **One Chrome profile per site, one run at a time.** Every LinkedIn read takes the lock;
  a 2.5-minute scroll of 1,551 connections daily is already the slowest thing in the system
  (§4.9/7: read only what is new). Ten sites with daily reads at human pace is an hour of
  browser time a day.
- **The pre-pack cap.** 12,000 characters was right with 12 sections; today's index sections
  filled it and cut the matches. Fixed by compacting, but the budget is spent, and the cut is a
  blind tail cut: the conversation, the matches and a build's brief come last and go first. A
  budget per section, with the sentence's own context first, is due.
- **Threads in one process, one connection.** Builds, automations, turns, checks and noticing
  are Python threads sharing one SQLite connection behind a lock, plus one tool-server process
  per model run opening the same file; the core review found read-modify-write sequences that
  are not atomic (two of them fixed today, §9; `upsert` still writes a transaction per row).
  Fine for one person; the first thing to change for a second.
- **The desktop polls.** About 26 requests a minute idle and 140 during a turn, never paused
  while a window is hidden; a global version counter refetches every page on any change.
- **Shipping.** The app runs Python from the repo's `.venv`, is self-signed, and signs in to
  Claude through a route that needs Anthropic's approval for a third-party app. None of this
  is a surprise (Q1, §4.3); all of it stands between "works for Kenil" and "works for anyone".

## 6. Is it maintainable?

**Good:** types and lint clean; 166 tests that run in 7 s; every slice has a journey; a
removal story (purge) that tests prove; the rule that docs and code move together; small
modules for most things; docstrings that explain why; four defects found by review today were
each fixed in under half an hour with a test, which is what the shape is for.

**Not good:**

- **Two giants.** `mcp/tools.py` (1,240 lines, 70 tools, one class) and `api/server.py`
  (1,062 lines; `create_app` alone is 644 lines of closures over the world, the scheduler and
  the turn runner, plus a module-level `_WORLD_FOR_VIEW` global). Every slice this week touched
  both. They should be packages: tools by kind of thing, routes by surface.
- **One concept, four names.** Skill, reader, procedure, pipeline: the table is one since
  today, the tool names and `World` attributes still use all four.
- **Duplication the reviews counted:** four meanings of "same site", the name regex three
  times, slug logic three times, the "answered yes/no to a proposal" journal entry six times,
  `records_fts` kept in step by hand in six places while other FTS tables use triggers.
- **Broad excepts.** 35 `except Exception`; most log and carry on, which is right for
  background work and wrong when the person is waiting for an answer that then never comes.
  Internal error text (the CLI's stderr, Node's stderr, "internal problem in X: …") reaches
  the person and the model.
- **The desktop has three tests** for 5,000 lines, no lint, and a global refetch pattern.
- **Documentation.** True but not usable as a map (§7).

## 7. Are the docs aligned?

**In substance, mostly.** The docs review checked every As built paragraph and every count
against the code: the newest sections (§4.21–§4.24) matched closely; the summary layers had
drifted one or two slices behind (README said Q1–Q21 and "read-only driver"; the design still
said the System One seam was not built, that no session is ever resumed, that the driver never
clicks, that there were five journeys; build-plan §1 stopped at 2 Oct). All of those are
corrected in this commit. The one mismatch that mattered was not drift but a claim the code
did not enforce: "no automation can write outward" rested on a prompt line; it is a code guard
now (§9).

**In form, no.** A new session reads README → As built paragraphs → §4.3 → §4.5 → §4.9 → git
log, as `CLAUDE.md` says, and the review timed that at 30–45 minutes and 600 lines before the
first line of code, because "current state" lives in four places that disagree. The design's
As built paragraphs are single 300–900-word lines with dated layers stacked inside, and
sections run 3.5, 3.6, 3.7, then 3.4. The append-only rule guarantees the drift will continue.

Three changes would fix it without losing anything, and the reviewer proposed the same shape
independently:

1. **`docs/STATE.md`**, one page, rewritten (not appended) every session: the state table,
   the pending list in order, the counts from a `just stats` recipe. The thing a new session
   reads first.
2. **The design doc holds intent only**, each section ending with a three-row box (built /
   differs / not built) and no dated layers; the As built prose moves to the log.
3. **The build plan becomes `docs/log/`**, one dated file per topic; §4.3/§4.5/§4.9 stop
   existing as sections; decisions become one numerically ordered table.

This changes the rule in `CLAUDE.md`, so it is Kenil's decision; recommended, and the first
thing to do, because every later session gets faster.

## 8. The three reviews

Each review read the code only and reported with file and line; this is the condensed
version, with what I verified marked. The full reports are in the session; the findings
below are the ones that change what we do.

**Core (maintainability and scale).** High: `claude_cli.run` has no timeout, so a hung CLI
holds an HTTP worker (routing runs inside the request) and, through `acts → perform → repair`,
blocks the scheduler's tick; action and plan state moves were read-then-write without a state
condition, so the approval route and the scheduler's catch-up could both perform one action,
a duplicate send (**verified, fixed**); `collections.upsert` snapshots keys then writes one
transaction per row, so two concurrent upserts into one table can insert the same key twice;
the build respawn after a crash has no backoff; journal hot paths (`open_asks`, `$.turn`
lookups, `/api/people`) scan the table; the pre-pack cut is a blind tail cut with the
conversation and the matches last; internal error text reaches the person; the `_move_pipelines`
rename never updated callers because it matched JSON with spaces the store never writes
(**verified, fixed**). Medium: `write_note` and `entities.resolve` check-then-insert outside
the transaction; every model run's tool server re-runs the migrations under a write lock;
`LIVE` run keys collide (check and noticing reuse the turn id, every routing judge is "judge"),
so one run's progress can be dropped or stopped by another; `Turns.state` never evicts; the
independent and judge runs do not pass `--strict-mcp-config`; `plans.recent` compares ISO
strings with a space-separated SQLite date. Tests: `cli.py` and about 20 of 58 routes have
none; five tests depend on timing; the store has no concurrency test (one added today).

**Docs (drift).** Twenty-eight concrete mismatches, listed in §7's summary and corrected;
the measured counts in the newest sections were right; the structure verdict is §7's.

**Desktop.** High: nothing supervises the core (a crash leaves the UI on a dead port, the rail
says "Alpha is running", a 60 s startup deadline that cannot fire because the read blocks);
polling never pauses while a window is hidden (the closed panel keeps its timers; hiding the
companion from the tray leaves its 10 s loop); a conversation whose turn died with the core
stays "working" forever and keeps the panel in its fast-poll mode with Done hidden
(**verified: `close_idle` skips working chats and nothing resets them at startup**). Medium:
one global `version` refetches every page's data on any change (a module page re-downloads
its whole table every 5 s during a turn); `/api/home` is fetched twice per change; 26
swallowed catches and pages stuck on "Loading…"; one failed poll ends the turn in the UI
while the core keeps running, and the typed text is gone; the composer can send twice in
its first second; row Remove has no confirmation; the host's `open_path` check uses
`starts_with` on an unresolved path (**verified**), so `..` passes; quitting mid-turn can
orphan the `claude` process; `Action.payload` is typed as strings but the server sends any,
and a non-string value throws inside the error boundary and blanks the window; `.faint` text
is 3.0:1 against the 4.5:1 minimum; Enter sends mid-composition for input-method typing;
about 103 of 405 CSS classes are dead. Tests: one file, three tests, no lint.

## 9. Found and fixed during the checkpoint

- The pre-pack was being cut at the cap on every sentence on Kenil's world: the skills index
  added today took 4,335 characters and the module page up to 4,121, and the matches went.
  Read skills are now one list by site; the module page is capped at 1,500 characters; packs
  measure 9.1k–11.7k, none cut (`5a0c918`).
- **An automation could act outward.** With a standing prepare permission, `action_propose`
  from an automation's run would approve and perform at once; the only barrier was a line in
  the run's prompt. `action_propose` and `action_approve` now refuse inside an automation,
  standing permission or not, with a test (`304474e`).
- **A duplicate send was possible.** An action's (and a plan's) state move read the state and
  wrote without a condition; the approval route and the scheduler's catch-up could both start
  one approved action. The move is one conditional write now, and a four-thread test shows
  one start (`304474e`).
- **A renamed run skill left its callers broken** (the rename-follow matched `"run": "x"`
  with a space; the store writes JSON without). Callers are parsed and rewritten (`304474e`).
- The docs' stale claims (§7) corrected.

## 10. What I would do next, in order

1. **Decide the docs' shape** (§7) and do it in one session: `STATE.md`, the log, the design
   as intent. Every later session gets faster.
2. **Harden the model boundary and the store, one day:** a timeout on `claude_cli.run` and
   routing off the request path; `upsert` as one transaction with uniqueness per collection
   and key; journal indexes on `(kind, at)` and the `$.turn` / `$.ask` lookups; backoff on
   the build respawn; unique run ids in `LIVE`; plain messages for internal errors.
3. **Split the two giants** (`tools.py`, `server.py`) into packages with no behaviour change,
   under the tests that exist; one `site_of`, one name rule, one proposal-answer helper.
4. **Make turns fast.** Measure where the 30 s goes (CLI start, tool manifest, rules, pack,
   model); cut the tools the model sees per turn (fewer, composable); keep sessions warm;
   answer table questions through the judge where a rule plus Haiku can.
5. **The desktop's four:** supervise the core from the host (and reset "working" chats at
   startup); pause polling when hidden and replace the global version counter with targeted
   refreshes; show every failure (error states with Retry, restore the typed text, confirm
   Remove); resolve paths before the folder check. Then the minimum test set the review lists.
6. **People for real.** Readers declare their rows as people (connections, senders); a pass
   links existing rows; the People page fills; cards appear for whoever is named.
7. **Proactivity, the smallest honest version.** A digest at two fixed times from what
   automations and noticing found, as cards on Home. No notifications yet (Q7).
8. **Then** the memory round's leftovers (routing journey, "move to…", noticing over reads)
   and the first-run experience on a clean Mac.
