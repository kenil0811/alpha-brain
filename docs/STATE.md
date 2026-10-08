# Alpha, the state

Rewritten, not appended, at the end of every session. This page is what a new session reads
first; the numbers come from `just stats`; the history is [`log/`](log/README.md); the intent is
[`design/alpha-second-brain-design.md`](design/alpha-second-brain-design.md).

**As of 8 October 2026, evening.** Last entries: what went wrong 4–8 October and the agents
decision ([`log/2026-10-08-what-went-wrong-and-agents.md`](log/2026-10-08-what-went-wrong-and-agents.md), Q33;
no code changed), replies rendered the same in the panel and
the companion ([`log/2026-10-03-replies-rendered.md`](log/2026-10-03-replies-rendered.md)), a second way to think, ChatGPT through the
Codex CLI ([`log/2026-10-03-chatgpt-route.md`](log/2026-10-03-chatgpt-route.md), Q32; built, not
yet run for real), modules inside modules
([`log/2026-10-03-nested-modules.md`](log/2026-10-03-nested-modules.md), Q31), a plain yes, a plan not asked about twice,
Add files ([`log/2026-10-03-yes-and-add-files.md`](log/2026-10-03-yes-and-add-files.md)), the desktop's four
([`log/2026-10-03-desktop-four.md`](log/2026-10-03-desktop-four.md)), fast turns
([`log/2026-10-03-fast-turns.md`](log/2026-10-03-fast-turns.md)), the split
([`log/2026-10-03-the-split.md`](log/2026-10-03-the-split.md)), the map of the brain
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

## Numbers (`just stats`, 3 Oct late night)

| | |
|---|---|
| Core tests | 210, in about 15 s; ruff and mypy strict clean |
| Desktop tests | 77, in twenty-one files; typecheck and `cargo check` clean |
| Tools the model sees | 72 |
| Journeys | 19 defined; latest full run `docs/journeys/2026-10-03-2022.md`, 14 of 18 (the four read in the fast-turns log: none the change's doing); since then `nested_modules` `docs/journeys/2026-10-03-2211.md` 1 of 1, and the two memory ones re-run `docs/journeys/2026-10-03-2048.md`, 1 of 2 |
| Desktop check | latest full run `docs/checks/2026-10-03-2043.md`, 61 of 61 pages clean at every size; after nesting, Home and Settings `docs/checks/2026-10-03-2212.md`, 2 of 2 |
| Turns | `just turns`: 1–3 Oct, a person's turn 25 s at the median, the model 23 s of it, Alpha's overhead 1.5 s; one step 4 s, four steps 14 s, twelve or more about 3 min |
| Window's requests | 4 a minute idle (the one poll), none while hidden; was about 26 and never paused |
| Commits | 132 total; 132 since 1 Oct 2026 (this count includes the commit that records it) |
| Lines | core 13,418 Python; tests 4,710; desktop 9,962 TS/TSX |

## What is built, against the design's order of work

| Step | State |
|---|---|
| 1. World store, MCP server, stream, companion | **Built.** One SQLite file per person; the journal verbatim with FTS; what the model saw kept per turn; 72 tools; the companion window and the panel. Modules nest since 3 Oct night (Q31): a module inside a module to any depth, a parent's page, summary, activity and conversation reaching what it holds, the rail as a tree; the person makes a parent and moves modules in from a module's Settings. |
| 2. Browser, files, calendar; derived pages | **Built.** Readers (read skills) kept only after a real run, health-checked, repaired by Alpha; files in and out (§4.17); calendar read-only. Reading LinkedIn's whole list daily is still the slowest thing (read only what is new: open). |
| 3. Sensors, triage, sleep-time pass, digest, Inbox | **Not started.** Nothing proactive exists beyond an automation's "worth telling". |
| 4. Entities and bi-temporal facts across sources | **Partial.** Facts bi-temporal; entities with hard keys; a page per person (§4.23); noticing after every turn; entity cards in context. But no table in Kenil's world declares its rows as people, so 1,551 connections are rows, not people (20 entities, 6 facts). |
| 5. Standing things, promotion from verified runs | **Partial.** Plan → yes → build by mechanism (§4.7); automations as pipelines (run skills) or procedures; skills one table with composition (§4.24). No ladder, no promotion from repetition. |
| 6. Pending actions and Access | **Built as actions** (§4.13, Q24): dry-run card, the person's yes, prepare-level standing sentences; automations cannot act outward, by code (checkpoint). No Access page; no Undo. |
| Memory round (design §3.7, Q26) | **Built:** conversations first-class and parallel with resumed sessions and a world delta; routing by structure then the System One judge; the wiki with its index; noticing; context by relevance (cards, day-scoped retrieval); skills unified. **Open:** the Agent Skills folder export, promotion from repetition, fewer tools by principle, a routing journey, "move to…" in the panel, noticing over what Alpha reads, a sleep-time pass. |
| Trust (design §7) | **Built:** known, assumed or asked with provenance; the second opinion; build trials; actions atomic; where a fact came from, on the page. **Open:** the Activity checklist view, Undo, an Access page. |
| The desktop (pull request #3's ideas, Q27–Q28) | **Built:** fonts bundled, AA contrast, the Mac's motion and contrast honoured, addresses, resizable rail and panel, the UI kit on Radix and lucide; the table views (table, board, list, gallery, timeline, calendar, chart; saved lists in the world; selection; pickers); ⌘K on search; a page per skill and per automation; the module's page on its tab; the desktop check at the window's sizes; the type scale; quick entry on a table through the conversation; the companion's characters (Bridge's art, our rig, ten animals, a wardrobe and three sizes chosen in Settings, kept in the world; dragged from the character; Bridge's eleven moods as poses, driven by what the companion does); relations followed in the drawer with a way back; the form view; the map (Intelligence › Map, Q29–Q30): the person's world as the default view with Alpha's proposed links as suggested facts, the map of work as a toggle, refresh only on demand; the host watches the core and restarts it on the same port, the window asks one question for what changed (nothing while hidden) and says what failed with Try again, the words come back when a send is lost; Add files on every module's page (the Mac's picker, the same route as a drop). **Left:** the links worth having wait on people-for-real (pending item 6) and noticing over what Alpha reads. |
| Hands free of site vocabulary (Q17, Q23) | **Done.** |
| No limits (Q18) | **Holds.** One floor: 30 minutes between an automation's runs (Q22). |

**Two ways to think (Q32):** Claude through Claude Code (runs for real, everything below) or
ChatGPT through the Codex CLI on his subscription, chosen in Settings › Thinks with; the ChatGPT
way is proven by tests only until he signs in again (his Codex sign-in lapsed on 16 June).

**Runs for real, daily, on Kenil's Mac:** four automations (LinkedIn connections; 15 deal
sites; 4 job boards; Gmail from one sender), questions over the tables, drafts and sends with
previews, files in and out, builds in the background. **Proven by tests only:** the calendar
connect, Install and Sign in on a fresh Mac, the first-run experience as a whole. **Proven by
the desktop check:** every page opens clean at 1100×560 and 1240×820, light and dark, on a
copy of Kenil's world (see the numbers). **Proven in the real app** (3 Oct night): the core
killed by hand twice came back on the same port within two seconds and the window said so.

## What is wrong, measured (the checkpoint, updated)

- A turn takes 25 s at the median, up to three minutes at p90: the model's steps and the
  length of its answer, not Alpha's 1.5 s of overhead (measured 3 Oct night; `just turns`). A
  simple question is 6–13 s fresh on sonnet, about half that on haiku. What would change it is
  Kenil's to choose: haiku for lookups, a summarise-then-offer rule for long lists, longer-lived
  conversations (the fast-turns log).
- ~~The pre-pack is 9–12k characters of a 12k cap~~ — a budget per section since 3 Oct night;
  10.7–13.8k of 14k on Kenil's world, nothing cut short.
- ~~Two files hold 2,300 of 11,000 core lines~~ — packages since 3 Oct night (the split).
- ~~The desktop polls about 26 requests a minute idle and 140 during a turn, never paused when
  hidden; nothing supervises the core~~ — one poll, 4 a minute idle, none hidden; the host
  restarts a dead core on the same port (3 Oct night). Failures: the pages, the panel, the
  command menu, Settings and the companion say what failed with Try again; smaller catches
  remain where nothing is shown anyway (a screenshot that didn't load, a module-name lookup).
- The window's minimum is 1100×560 since the desktop check: below 1100 wide the panel used to
  float over the page.
- **4–8 Oct, measured:** the daily automations ran only when the laptop fully woke (4 Oct at
  18:20, never on 5–6 Oct, 7 Oct 21:32, 8 Oct 12:31), by the 3 Oct sleep rule, and the window
  never says so. The ChatGPT route (Q32), in use from 3 Oct 22:41 to 8 Oct, was refused every
  call to Alpha's tools by Codex's own approval gate, and the model claimed a build was approved
  that never was; the LinkedIn connections run, the Sunday summary and the LinkedIn readers'
  repair all failed with it. A run that fails on a network error at wake is not retried. Failed
  runs reach nobody but Activity. The LinkedIn connections automation is a procedure (made
  before pipelines) and pays a model turn a day for a read. Kenil is back on Claude.
- Alpha cannot rename a module (seen in the nested-modules journey: a part kept its old name
  under the new path); a small missing tool.
- Noticing keeps session state as suggested facts about the person ("using_module =
  Advisory", 3 Oct 20:21), which then show in Needs you and the companion's bubble; it needs
  a rule, by mechanism, for what a fact about a person is.
- "What was said yesterday" fails on this world (2 of 3 runs on 3 Oct): the day's journal is
  crowded by Alpha's own reader lines naming Vikas, and neither the pack nor a search puts the
  person's own words first by structure. Sara Ramos across email and calendar passes or fails
  with the model's own searching (she is not an entity); the Gmail-and-network question fails
  its judge, which sees no evidence of reads the journal holds.

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
3. ~~Split `tools.py` and `server.py` into packages, no behaviour change; one `site_of`, one
   name rule, one proposal-answer helper~~ — done 3 Oct night
   ([`log/2026-10-03-the-split.md`](log/2026-10-03-the-split.md)).
4. ~~Make turns fast: measure, fewer tools per turn, warm sessions, the judge for table
   questions~~ — measured and built what the numbers supported, 3 Oct night
   ([`log/2026-10-03-fast-turns.md`](log/2026-10-03-fast-turns.md)): the fields in the pack, a
   budget per section, `just turns`; the tools were not cut (cached, not the lever); the levers
   left are Kenil's to choose (above).
5. ~~The desktop's four~~ — done 3 Oct night
   ([`log/2026-10-03-desktop-four.md`](log/2026-10-03-desktop-four.md)).
6. **Reliability first (8 Oct):** a turn whose tool calls all failed is a failed turn with the
   reason shown; switching routes runs a real tool call first; a run that fails on a network error
   at wake retries after a minute; the schedule's line says the truth ("07:00, or when your Mac
   next wakes; last ran 12:31"); failed runs reach the person through the companion; an automation
   that only reads is steps, never a procedure; LinkedIn connections converted by asking Alpha.
7. **Agents (Q33), schedule first:** the shell around each recurring process (goal, guidelines
   page, declared success, a verdict per run, a runs table, the failure policy, reporting), the
   loop that calls the model only on breakage, novelty, judgement or the ask, the window, the
   build making agents, the five automations migrated; the digest lands here.
8. The ChatGPT route stays off until it passes a real tool call (Codex's own pre-approval
   setting, or not at all).
9. People for real: readers declare their rows as people; a pass links existing rows.
10. Then: the memory round's leftovers (and from 3 Oct night: the person's own words first,
   by structure, in the day's section and in search, so "what did I say yesterday" is not
   crowded out by Alpha's own lines; noticing's rule for what a fact about a person is), the
   first-run experience on a clean Mac, the smaller
   items in [`log/2026-10-02-4-9-status-at-the-end-of.md`](log/2026-10-02-4-9-status-at-the-end-of.md).

## How to verify any of this

`just test`, `just lint`, `just test-desktop`, `just stats`, `just turns` (how long the last
turns took); `just journeys` (all) or
`just journeys <name>` on a copy of the world, report in `docs/journeys/`;
`just check-desktop` (every page of the window at its sizes on a copy of the world, report in
`docs/checks/`, screenshots in `desktop/.check/`); `just app` to rebuild and open the app. A
core for checks on a copy of a world: `alpha serve --no-background` (never `cp` the world file;
use SQLite's backup, as `copy_home` does).
