# Alpha, the state

Rewritten, not appended, at the end of every session. This page is what a new session reads
first; the numbers come from `just stats`; the history is [`log/`](log/README.md); the intent is
[`design/alpha-second-brain-design.md`](design/alpha-second-brain-design.md).

**As of 3 October 2026, evening.** Last entries: the hardening day
([`log/2026-10-03-hardening.md`](log/2026-10-03-hardening.md)), the checkpoint
([`log/2026-10-03-checkpoint.md`](log/2026-10-03-checkpoint.md)), skills as one table
(§4.24), the wiki and noticing (§4.23), daily runs on a sleeping Mac (§4.22), conversations
(§4.21).

## Numbers (`just stats`, 3 Oct evening)

| | |
|---|---|
| Core tests | 173, in about 12 s; ruff and mypy strict clean |
| Desktop tests | 3, in one file; typecheck clean |
| Tools the model sees | 70 |
| Journeys | 18 defined; latest report `docs/journeys/2026-10-03-1425.md`, 2 of 2 |
| Commits | 79 total; 67 since 1 Oct 2026 |
| Lines | core 11,098 Python; tests 3,886; desktop 4,976 TS/TSX |

## What is built, against the design's order of work

| Step | State |
|---|---|
| 1. World store, MCP server, stream, companion | **Built.** One SQLite file per person; the journal verbatim with FTS; what the model saw kept per turn; 70 tools; the companion window and the 380px panel. |
| 2. Browser, files, calendar; derived pages | **Built.** Readers (read skills) kept only after a real run, health-checked, repaired by Alpha; files in and out (§4.17); calendar read-only. Reading LinkedIn's whole list daily is still the slowest thing (read only what is new: open). |
| 3. Sensors, triage, sleep-time pass, digest, Inbox | **Not started.** Nothing proactive exists beyond an automation's "worth telling". |
| 4. Entities and bi-temporal facts across sources | **Partial.** Facts bi-temporal; entities with hard keys; a page per person (§4.23); noticing after every turn; entity cards in context. But no table in Kenil's world declares its rows as people, so 1,551 connections are rows, not people (20 entities, 6 facts). |
| 5. Standing things, promotion from verified runs | **Partial.** Plan → yes → build by mechanism (§4.7); automations as pipelines (run skills) or procedures; skills one table with composition (§4.24). No ladder, no promotion from repetition. |
| 6. Pending actions and Access | **Built as actions** (§4.13, Q24): dry-run card, the person's yes, prepare-level standing sentences; automations cannot act outward, by code (checkpoint). No Access page; no Undo. |
| Memory round (design §3.7, Q26) | **Built:** conversations first-class and parallel with resumed sessions and a world delta; routing by structure then the System One judge; the wiki with its index; noticing; context by relevance (cards, day-scoped retrieval); skills unified. **Open:** the Agent Skills folder export, promotion from repetition, fewer tools by principle, a routing journey, "move to…" in the panel, noticing over what Alpha reads, a sleep-time pass. |
| Trust (design §7) | **Built:** known, assumed or asked with provenance; the second opinion; build trials; actions atomic. **Open:** the Activity checklist view, Undo, an Access page. |
| Hands free of site vocabulary (Q17, Q23) | **Done.** |
| No limits (Q18) | **Holds.** One floor: 30 minutes between an automation's runs (Q22). |

**Runs for real, daily, on Kenil's Mac:** four automations (LinkedIn connections; 15 deal
sites; 4 job boards; Gmail from one sender), questions over the tables, drafts and sends with
previews, files in and out, builds in the background. **Proven by tests only:** the calendar
connect, Install and Sign in on a fresh Mac, the first-run experience as a whole.

## What is wrong, measured (the checkpoint)

- A turn takes 26–34 s at the median, up to three minutes at p90, and can start five model
  runs. Resumed conversations answer in 6 s.
- The pre-pack is 9–12k characters of a 12k cap: the next section added cuts something.
- ~~`claude_cli.run` has no timeout; `collections.upsert` is not one transaction; journal hot
  paths scan; internal error text reaches the person.~~ Done 3 Oct evening (the hardening day).
- Two files hold 2,300 of 11,000 core lines (`mcp/tools.py`, `api/server.py`).
- The desktop polls about 26 requests a minute idle and 140 during a turn, never paused when
  hidden; nothing supervises the core; 26 swallowed errors; three tests.

## Pending, in order (from the checkpoint's §10)

1. ~~The docs' shape~~ — done 3 Oct: this page, the log, the design as intent.
2. ~~Harden the model boundary and the store~~ — done 3 Oct evening: a silent run is ended,
   routing off the request path, `upsert` one transaction, journal indexes, build backoff,
   unique run keys, plain error messages. Left from the review: a schema version, `records_fts`
   by triggers, the pre-pack budget per section.
3. Split `tools.py` and `server.py` into packages, no behaviour change; one `site_of`, one
   name rule, one proposal-answer helper.
4. Make turns fast: measure, fewer tools per turn, warm sessions, the judge for table
   questions.
5. The desktop's four: supervise the core and reset "working" chats at startup; pause polling
   when hidden and drop the global refetch; show every failure; resolve paths before the
   folder check. Then the minimum tests.
6. People for real: readers declare their rows as people; a pass links existing rows.
7. Proactivity, the smallest honest version: a digest at two fixed times, as cards on Home.
8. Then: the memory round's leftovers, the first-run experience on a clean Mac, the smaller
   items in [`log/2026-10-02-4-9-status-at-the-end-of.md`](log/2026-10-02-4-9-status-at-the-end-of.md).

## How to verify any of this

`just test`, `just lint`, `just test-desktop`, `just stats`; `just journeys` (all) or
`just journeys <name>` on a copy of the world, report in `docs/journeys/`; `just app` to
rebuild and open the app. A core for checks on a copy of a world: `alpha serve --no-background`
(never `cp` the world file; use SQLite's backup, as `copy_home` does).
