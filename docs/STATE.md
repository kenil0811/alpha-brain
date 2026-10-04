# Alpha, the state

Rewritten, not appended, at the end of every session. This page is what a new session reads
first; the numbers come from `just stats`; the history is [`log/`](log/README.md); the intent is
[`design/alpha-second-brain-design.md`](design/alpha-second-brain-design.md).

**As of 3 October 2026, late night.** Last entries: the map of the brain
([`log/2026-10-03-brain-map.md`](log/2026-10-03-brain-map.md)), the map of Alpha's work
([`log/2026-10-03-work-map.md`](log/2026-10-03-work-map.md)), the companion's sizes, drag and moods
([`log/2026-10-03-companion-moods.md`](log/2026-10-03-companion-moods.md)), relations followed and the form view
([`log/2026-10-03-table-views-2.md`](log/2026-10-03-table-views-2.md)), the companion's characters
([`log/2026-10-03-companion-characters.md`](log/2026-10-03-companion-characters.md)), quick entry on a table
([`log/2026-10-03-quick-entry.md`](log/2026-10-03-quick-entry.md)), the desktop check and the type scale
([`log/2026-10-03-desktop-check.md`](log/2026-10-03-desktop-check.md)), the table views, ⌘K,
fact origins, the module's page and the item pages
([`log/2026-10-03-table-views-1.md`](log/2026-10-03-table-views-1.md)), the desktop foundations
([`log/2026-10-03-desktop-foundations.md`](log/2026-10-03-desktop-foundations.md)), the review
of pull request #3 ([`log/2026-10-03-review-pr3.md`](log/2026-10-03-review-pr3.md)), the
contributor's guide ([`CONTRIBUTING.md`](../CONTRIBUTING.md)), the hardening day, the checkpoint.

## Numbers (`just stats`, 3 Oct night)

| | |
|---|---|
| Core tests | 193, in about 13 s; ruff and mypy strict clean |
| Desktop tests | 65, in sixteen files; typecheck clean |
| Tools the model sees | 71 |
| Journeys | 18 defined; latest report `docs/journeys/2026-10-03-1425.md`, 2 of 2 |
| Desktop check | latest full run `docs/checks/2026-10-03-1622.md`, 61 of 61 pages clean at every size; later partial runs clean (Settings, Home, the module pages) |
| Commits | 116 total; 100 since 1 Oct 2026 (this count includes the commit that records it) |
| Lines | core 12,171 Python; tests 4,325; desktop 9,126 TS/TSX |

## What is built, against the design's order of work

| Step | State |
|---|---|
| 1. World store, MCP server, stream, companion | **Built.** One SQLite file per person; the journal verbatim with FTS; what the model saw kept per turn; 71 tools; the companion window and the panel. |
| 2. Browser, files, calendar; derived pages | **Built.** Readers (read skills) kept only after a real run, health-checked, repaired by Alpha; files in and out (§4.17); calendar read-only. Reading LinkedIn's whole list daily is still the slowest thing (read only what is new: open). |
| 3. Sensors, triage, sleep-time pass, digest, Inbox | **Not started.** Nothing proactive exists beyond an automation's "worth telling". |
| 4. Entities and bi-temporal facts across sources | **Partial.** Facts bi-temporal; entities with hard keys; a page per person (§4.23); noticing after every turn; entity cards in context. But no table in Kenil's world declares its rows as people, so 1,551 connections are rows, not people (20 entities, 6 facts). |
| 5. Standing things, promotion from verified runs | **Partial.** Plan → yes → build by mechanism (§4.7); automations as pipelines (run skills) or procedures; skills one table with composition (§4.24). No ladder, no promotion from repetition. |
| 6. Pending actions and Access | **Built as actions** (§4.13, Q24): dry-run card, the person's yes, prepare-level standing sentences; automations cannot act outward, by code (checkpoint). No Access page; no Undo. |
| Memory round (design §3.7, Q26) | **Built:** conversations first-class and parallel with resumed sessions and a world delta; routing by structure then the System One judge; the wiki with its index; noticing; context by relevance (cards, day-scoped retrieval); skills unified. **Open:** the Agent Skills folder export, promotion from repetition, fewer tools by principle, a routing journey, "move to…" in the panel, noticing over what Alpha reads, a sleep-time pass. |
| Trust (design §7) | **Built:** known, assumed or asked with provenance; the second opinion; build trials; actions atomic; where a fact came from, on the page. **Open:** the Activity checklist view, Undo, an Access page. |
| The desktop (pull request #3's ideas, Q27–Q28) | **Built:** fonts bundled, AA contrast, the Mac's motion and contrast honoured, addresses, resizable rail and panel, the UI kit on Radix and lucide; the table views (table, board, list, gallery, timeline, calendar, chart; saved lists in the world; selection; pickers); ⌘K on search; a page per skill and per automation; the module's page on its tab; the desktop check at the window's sizes; the type scale; quick entry on a table through the conversation; the companion's characters (Bridge's art, our rig, ten animals, a wardrobe and three sizes chosen in Settings, kept in the world; dragged from the character; Bridge's eleven moods as poses, driven by what the companion does); relations followed in the drawer with a way back; the form view; the map (Intelligence › Map, Q29–Q30): the person's world as the default view with Alpha's proposed links as suggested facts, the map of work as a toggle, refresh only on demand. **Left:** the links worth having wait on people-for-real (pending item 6) and noticing over what Alpha reads. |
| Hands free of site vocabulary (Q17, Q23) | **Done.** |
| No limits (Q18) | **Holds.** One floor: 30 minutes between an automation's runs (Q22). |

**Runs for real, daily, on Kenil's Mac:** four automations (LinkedIn connections; 15 deal
sites; 4 job boards; Gmail from one sender), questions over the tables, drafts and sends with
previews, files in and out, builds in the background. **Proven by tests only:** the calendar
connect, Install and Sign in on a fresh Mac, the first-run experience as a whole. **Proven by
the desktop check:** every page opens clean at 1100×560 and 1240×820, light and dark, on a
copy of Kenil's world (see the numbers).

## What is wrong, measured (the checkpoint, updated)

- A turn takes 26–34 s at the median, up to three minutes at p90, and can start five model
  runs. Resumed conversations answer in 6 s.
- The pre-pack is 9–12k characters of a 12k cap: the next section added cuts something.
- Two files hold 2,300 of 11,000 core lines (`mcp/tools.py`, `api/server.py`).
- The desktop polls about 26 requests a minute idle and 140 during a turn, never paused when
  hidden; nothing supervises the core; swallowed errors remain (the count is from the checkpoint).
- The window's minimum is 1100×560 since the desktop check: below 1100 wide the panel used to
  float over the page.

## Pending, in order

**The port of pull request #3's ideas (Q27–Q29), all built:** ~~foundations~~ → ~~the table
views~~ (stage three, relations followed and the form view, 3 Oct evening) → ~~⌘K~~ → ~~item pages, fact origins,
the module's page~~ → ~~the desktop check and the UI rules~~ → ~~quick entry on a table~~ → ~~the
companion's characters~~ → ~~a graph~~: the map of Alpha's work (Q29), then the map of the brain
as the default view with Alpha's links as suggestions (Q30); the links worth having wait on
pending item 6, people for real, and noticing over what Alpha reads.

1. ~~The docs' shape~~ — done 3 Oct.
2. ~~Harden the model boundary and the store~~ — done 3 Oct. Left from the review: a schema
   version, `records_fts` by triggers, the pre-pack budget per section.
3. Split `tools.py` and `server.py` into packages, no behaviour change; one `site_of`, one
   name rule, one proposal-answer helper.
4. Make turns fast: measure, fewer tools per turn, warm sessions, the judge for table
   questions.
5. The desktop's four: supervise the core and reset "working" chats at startup; pause polling
   when hidden and drop the global refetch; show every failure; resolve paths before the
   folder check.
6. People for real: readers declare their rows as people; a pass links existing rows.
7. Proactivity, the smallest honest version: a digest at two fixed times, as cards on Home.
8. Then: the memory round's leftovers, the first-run experience on a clean Mac, the smaller
   items in [`log/2026-10-02-4-9-status-at-the-end-of.md`](log/2026-10-02-4-9-status-at-the-end-of.md).

## How to verify any of this

`just test`, `just lint`, `just test-desktop`, `just stats`; `just journeys` (all) or
`just journeys <name>` on a copy of the world, report in `docs/journeys/`;
`just check-desktop` (every page of the window at its sizes on a copy of the world, report in
`docs/checks/`, screenshots in `desktop/.check/`); `just app` to rebuild and open the app. A
core for checks on a copy of a world: `alpha serve --no-background` (never `cp` the world file;
use SQLite's backup, as `copy_home` does).
