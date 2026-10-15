# Alpha, the state

Rewritten, not appended, at the end of every session. This page is what a new session reads
first; the numbers come from `just stats`; the history is [`log/`](log/README.md); the intent is
[`design/alpha-second-brain-design.md`](design/alpha-second-brain-design.md).

**As of 14 October 2026, afternoon.** The last three entries:
- The review and clean-up after slice 2 ([`log/2026-10-14-review-and-cleanup.md`](log/2026-10-14-review-and-cleanup.md)). All five groups are done: the real faults, the code, the docs (this page), the memory notes, and disk. All 22 journeys were run.
- Slice 2, the small core routes the window asked for ([`log/2026-10-13-slice2-core-routes.md`](log/2026-10-13-slice2-core-routes.md)), with step 4 (people) skipped.
- The window from pull request #5, feature by feature ([`log/2026-10-12-window-from-pr5.md`](log/2026-10-12-window-from-pr5.md), Q41 and Q42).

Everything before them is listed in [`log/README.md`](log/README.md).

## Numbers (`just stats`, 14 Oct)

| | |
|---|---|
| Core tests | 262, in about 36 s; ruff and mypy strict clean |
| Desktop tests | 195 passed, 1 skipped, in 45 files; typecheck clean; 1 host test (`cargo test --lib`) |
| Tools the model sees | 73 |
| Journeys | 22 defined. All were run on 14 Oct and 19 of 22 pass (the reports in `docs/journeys/2026-10-14-*`). The three that fail: memory_two_sources and memory_who_emailed (Alpha answered from memory instead of looking in Gmail), and branded_food (fat 14 g against 13.4 g) |
| Desktop check | `docs/checks/2026-10-14-1357.md`: 94 of 94 pages clean at 1100×560 and 1240×820, light and dark, on a copy of Kenil's world. Every address the window has is visited |
| Turns | `just turns`: a person's turn takes 25 s at the median (the model 23 s of it, Alpha's overhead 1.5 s). One step takes 4 s, four steps 14 s, twelve or more about 3 min. The first words of a reply come in 2.7–8.7 s when the reply comes first |
| Window's requests | 4 a minute idle (the one poll), none while hidden |
| Commits | 217 total; 217 since 1 Oct 2026 (this count includes the commit that records it) |
| Lines | core 17,005 Python; tests 6,424; desktop 17,563 TS/TSX |

## What is built, against the design's order of work

| Step | State |
|---|---|
| 1. World store, MCP server, stream, companion | **Built.** One SQLite file per person. The journal is kept verbatim with full-text search and is never deleted. What the model saw is kept for each turn. 73 tools. The companion window and the panel. Modules nest to any depth (Q31). |
| 2. Browser, files, calendar; derived pages | **Built.** Readers (read skills) are kept only after a real run, health-checked and repaired by Alpha. Files go in and out; a module's and a person's files are listed with their dates and deleted with what goes said first. The calendar is read-only. Reading LinkedIn's whole list daily is still the slowest thing; reading only what's new is open. |
| 3. Sensors, triage, sleep-time pass, digest, Inbox | **Not started.** Nothing proactive exists beyond an agent's "worth telling". |
| 4. Entities and bi-temporal facts across sources | **Partial.** Facts are bi-temporal, and the person can correct or forget one (13 Oct). Entities have hard keys, a page each and files kept about them. Noticing runs after every turn, and entity cards go into context. But no table in Kenil's world declares its rows as people: 1,553 connections are rows, beside 14 person entities and 36 facts (pending: people for real). |
| 5. Standing things, promotion from verified runs | **Partial.** The workflow page goes to a yes and then a build, by mechanism (§12), and has run for real. Automations are pipelines (run skills) or procedures. Every automation is an agent's process (Q33): a goal, a page, a row per run with a verdict judged by code, and repair at most twice a run. Try again works on any failure that can be redone. **Open, Kenil's question (Q40):** the model has no door to make a new automation or reader of its own. There are no event triggers, no digest and no promotion from repetition. |
| 6. Pending actions and Access | **Built as actions** (Q24): a dry-run card, the person's yes, and standing sentences for prepare-level actions. Automations can't act outward, by code. There is no Access page. |
| Memory round (§3.7, Q26) | **Built:** conversations are first-class and parallel; routing goes by structure, then the System One judge; the wiki and its index; noticing; context by relevance; skills unified. Everything Alpha remembers can be exported, with sources. **Open:** look things up when memory is thin (the two memory journeys of 14 Oct); the person's own words first, by structure; noticing's rule for what a fact about a person is; the Agent Skills export; promotion from repetition; noticing over what Alpha reads; a sleep-time pass. |
| Trust (§7) | **Built:** every value is known, assumed or asked, with its provenance. The second opinion. Actions are atomic. Facts show their origins. A record's History has Undo. Removal deletes everything related, journals itself and never touches the journal. Every error the window shows is a sentence. **Open:** the Activity checklist view, Undo outside a record's page, an Access page. |
| The window | **Built:** pull request #3's ideas (Q27–Q30: fonts, contrast, addresses, the UI kit, the table views, ⌘K, item pages, the map of the person's world and of Alpha's work, the companion's characters and moods). Pull request #5's features (Q41, Q42): a page per record with History, Undo and Notes; filters in the columns; grouping; saved lists as tabs; totals; editing ticked rows together; paste; colour; the sidebar's order, nesting, hiding and icons; Settings as cards; Intelligence's tables; agents with a look; the assistant panel's picker and Retry; plain errors, absolute dates, every delete confirmed. Slice 2: modules renamed, removed with their data kept and restored, or deleted; fields added and renamed by hand; files; conversations renamed and deleted; facts corrected and forgotten; goals by hand with their own page; everything remembered exported; Try again on any failure; a page per activity entry; Show earlier; downloads of exactly what a table shows; the companion opening where it was left; hold the mic to talk and send. The window's minimum is 1100×560; on a window too short for five rows, the page scrolls instead of the rows. |
| Hands free of site vocabulary (Q17, Q23) | **Done.** |
| No limits (Q18) | **Holds.** One floor: 30 minutes between an agent's runs (Q22). |

**Two ways to think (Q32):** Claude through Claude Code runs everything. ChatGPT through the
Codex CLI can be chosen in Settings, but from 3 to 8 Oct Codex's own approval gate refused every
call to Alpha's tools, so it stays off until it passes a real tool call (pending).

**Runs for real, on Kenil's Mac:**
- **Five agents.** Three run daily: LinkedIn connections, 15 deal sites, and 4 job boards. One runs weekly: the nutrition check-in. Gmail from one sender is switched off. Each run is a row with a verdict judged by code.
- **The rest:** questions over the tables, drafts and sends with previews (an email sent for real by the gmail_send journey on 14 Oct), files in and out, the car wash workflow built from its page with its parts filling rows (11 Oct, and again in the workflow_build journey on 14 Oct).
- **Proven by tests only:** the calendar connect, and Claude Code's Install and Sign in on a fresh Mac.
- **Proven in a clean room** (9 Oct): the shipped app. The friend's own first run is the acceptance.
- **Not yet tried by Kenil in the app:** dragging the companion and reopening, holding the mic, Try again on a real failure, and ⌘V paste.

## What is wrong, measured

- A turn takes 25 s at the median and up to three minutes at p90. That's the model's steps and the length of its answer, not Alpha's 1.5 s. The levers are Kenil's to choose: haiku for lookups, summarise-then-offer for long lists, longer-lived conversations ([`log/2026-10-03-fast-turns.md`](log/2026-10-03-fast-turns.md)).
- A clock-time agent run waits for the Mac's next full wake (the sleep rule of 3 Oct), and the schedule's words say so.
- Asked about someone it holds little on (Alexander Miller, Sara Ramos), Alpha answered from memory and said it hadn't read their emails, instead of opening Gmail. On 3 Oct the same journeys passed when it looked.
- Noticing keeps session state as suggested facts about the person ("using_module = Advisory"), which then show in Needs you. It needs a rule, by mechanism, for what a fact about a person is.
- Alpha (the model) can't rename a module, though the person can since 13 Oct; a missing tool.
- A label value is a near miss: fat 14 g where the independent look-up found 13.4 g (branded_food).

## Pending, in order

1. **Modules as workflows (Q39, §12):**
   - Kenil's acceptance: the Census key into Settings, Try again, then one change by chat that keeps his rows.
   - Then documents drafted from templates with their page, the evaluator through the pages, and the library across modules.
2. **The conversation, the rest of Q35:**
   - one automatic retry of a transient failure
   - identical replies collapsed, and a stopped build posting once
   - long replies folded
   - copy, and edit-and-resend
   - a plus for files in the composer
   - Kenil to say whether one stream should replace the conversation on each page
3. **Design sessions with Kenil** ([`log/2026-10-14-design-agents.md`](log/2026-10-14-design-agents.md)): agents' shared shape agreed 14 Oct (Q44), Sherlock (Q45), Watson (Q46), Columbo (Q47) and Scout (Q48) 15 Oct; next, Doc. From his 12 Oct answers to Vikas's list:
   - C2, decisions and checkpoints kept ("all decisions / checkpoints should be persisted")
   - C8, several persisted, dedicated agents, with Q33's leftovers (event triggers, escalation as a question, the digest, a brief per agent) and Q40's door for an agent's own automations and readers
   - C1, depth
   - T, a single unified view of Alpha
   - Deferred but wanted: A5 several workspaces, A6 pre-built projects, B3 overrides, D7 dashboard tiles, D8 notifications and builder rules, D10 formulas
4. **People for real** (slice 2's step 4, skipped at Kenil's call): readers declare their rows as people, a pass links the existing rows, a person or company is made by hand, and "Your organisations".
5. **Memory:** look things up when memory is thin; the person's own words first; noticing's rule for a fact about a person; the rest of the memory round (above).
6. **Small and open:**
   - B9, saving a dashboard's selection as a list
   - the removal journal line for a file isn't linked to its person
   - the window has no buttons for the companion's focus and for moving a sentence to another conversation (the routes are kept for that)
   - a schema version, and `records_fts` by triggers (from the 3 Oct review)
   - the smaller items in [`log/2026-10-02-4-9-status-at-the-end-of.md`](log/2026-10-02-4-9-status-at-the-end-of.md)
7. **The ChatGPT route** stays off until it passes a real tool call: Codex's own pre-approval setting, or not at all.
8. **A fresh Mac:** notarization (there is no Apple Developer account, so it's right-click › Open for now), and the friend's own first run.

## How to verify any of this

- **Tests and lint:** `just test`, `just lint`, `just test-desktop`, `just stats`.
- **Timing:** `just turns` shows how long the last turns took.
- **Journeys:** `just journeys` (all) or `just journeys <name>` runs on a copy of the world; the report lands in `docs/journeys/`. Four of them act in Kenil's real accounts (gmail_send, gmail_draft, skill_reuse, linkedin_message), so they run only on his say.
- **Pages:** `just check-desktop` checks every page of the window at its sizes on a copy of the world. The report goes in `docs/checks/` and the screenshots in `desktop/.check/`.
- **The app:** `just app` rebuilds and opens it.
- **A core for checks** on a copy of a world: `alpha serve --no-background`. Never `cp` the world file; use SQLite's backup, as `copy_home` does.
