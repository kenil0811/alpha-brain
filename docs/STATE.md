# Alpha, the state

Rewritten, not appended, at the end of every session. This page is what a new session reads
first; the numbers come from `just stats`; the history is [`log/`](log/README.md); the intent is
[`design/alpha-second-brain-design.md`](design/alpha-second-brain-design.md).

**As of 15 October 2026, night.** The last three entries:
- Watson, the first built-in agent ([`log/2026-10-15-watson.md`](log/2026-10-15-watson.md)): noticing as an agent on Q50's substrate, facts filed by type, commitments, decisions, the refiling of the facts that were not about Kenil. Built and proven on a copy; his own world is the acceptance (the app restarted, his next turn).
- Agents, slice A ([`log/2026-10-15-agents-slice-a.md`](log/2026-10-15-agents-slice-a.md)): the substrate in the core and the window (Q50); automations are custom agents under their ids; Kenil's five named. The 07:00 runs of 16 Oct are the acceptance.
- The review and clean-up after slice 2 ([`log/2026-10-14-review-and-cleanup.md`](log/2026-10-14-review-and-cleanup.md)). All five groups are done: the real faults, the code, the docs (this page), the memory notes, and disk. All 22 journeys were run.
- Slice 2, the small core routes the window asked for ([`log/2026-10-13-slice2-core-routes.md`](log/2026-10-13-slice2-core-routes.md)), with step 4 (people) skipped.
- The window from pull request #5, feature by feature ([`log/2026-10-12-window-from-pr5.md`](log/2026-10-12-window-from-pr5.md), Q41 and Q42).

Everything before them is listed in [`log/README.md`](log/README.md).

## Numbers (`just stats`, 14 Oct)

| | |
|---|---|
| Core tests | 275, in about 38 s; ruff and mypy strict clean |
| Desktop tests | 199 passed, 1 skipped, in 45 files; typecheck clean; 1 host test (`cargo test --lib`) |
| Tools the model sees | 73 |
| Journeys | 22 defined. All were run on 14 Oct and 19 of 22 pass (the reports in `docs/journeys/2026-10-14-*`). The three that fail: memory_two_sources and memory_who_emailed (Alpha answered from memory instead of looking in Gmail), and branded_food (fat 14 g against 13.4 g). On 15 Oct agent_verdict and automation_self_converts passed again on the agents substrate (`docs/journeys/2026-10-15-1216.md`); with Watson, memory_follow_up, memory_two_sources (failing since 14 Oct) and memory_noticing pass (`2026-10-15-1649.md`, `-1701.md`), memory_who_emailed still fails |
| Desktop check | `docs/checks/2026-10-15-1649.md`: 95 of 95 pages clean at 1100×560 and 1240×820, light and dark, on a copy of Kenil's world. Every address the window has is visited |
| Turns | `just turns`: a person's turn takes 25 s at the median (the model 23 s of it, Alpha's overhead 1.5 s). One step takes 4 s, four steps 14 s, twelve or more about 3 min. The first words of a reply come in 2.7–8.7 s when the reply comes first |
| Window's requests | 4 a minute idle (the one poll), none while hidden |
| Commits | 223 total; 223 since 1 Oct 2026 (this count includes the commit that records it) |
| Lines | core 18,265 Python; tests 6,864; desktop 17,925 TS/TSX |

## What is built, against the design's order of work

| Step | State |
|---|---|
| 1. World store, MCP server, stream, companion | **Built.** One SQLite file per person. The journal is kept verbatim with full-text search and is never deleted. What the model saw is kept for each turn. 73 tools. The companion window and the panel. Modules nest to any depth (Q31). |
| 2. Browser, files, calendar; derived pages | **Built.** Readers (read skills) are kept only after a real run, health-checked and repaired by Alpha. Files go in and out; a module's and a person's files are listed with their dates and deleted with what goes said first. The calendar is read-only. Reading LinkedIn's whole list daily is still the slowest thing; reading only what's new is open. |
| 3. Sensors, triage, sleep-time pass, digest, Inbox | **Not started.** Nothing proactive exists beyond an agent's "worth telling". |
| 4. Entities and bi-temporal facts across sources | **Partial.** Facts are bi-temporal, and the person can correct or forget one (13 Oct). Entities have hard keys, a page each and files kept about them. Noticing runs after every turn, and entity cards go into context. But no table in Kenil's world declares its rows as people: 1,553 connections are rows, beside 14 person entities and 36 facts (pending: people for real). |
| 5. Standing things, promotion from verified runs | **Partial.** The workflow page goes to a yes and then a build, by mechanism (§12), and has run for real. **Agents (Q50, slice A, 15 Oct):** one shape for everything that works on its own: an `agents` table (Kenil's five migrated under their ids as custom agents), runs per agent with their trigger, the journal as the event stream with a cursor per agent, the actor on every step and reply, a write list enforced in the tools, a `decisions` table, @Name in the conversation, the Agents tab and a page per agent (brief, notes, what it may touch, runs, decisions; rename, pause, delete). **Watson built (Q46):** noticing as an agent, facts filed by type, commitments, decisions, a conversation's checkpoint, documents, the refiling. Next Doc, Columbo, Sherlock, Scout. Try again works on any failure that can be redone. **Not built:** the agent's page as the door for its own readers and pipelines (Q40, decided by Q50), an event trigger in use, the digest, promotion from repetition. |
| 6. Pending actions and Access | **Built as actions** (Q24): a dry-run card, the person's yes, and standing sentences for prepare-level actions. Automations can't act outward, by code. There is no Access page. |
| Memory round (§3.7, Q26) | **Built:** conversations are first-class and parallel; routing goes by structure, then the System One judge; the wiki and its index; Watson (noticing as an agent, Q46); context by relevance; skills unified. Everything Alpha remembers can be exported, with sources. **Open:** look things up when memory is thin (memory_who_emailed); the person's own words first, by structure; the Agent Skills export; promotion from repetition; Watson over emails; a sleep-time pass. |
| Trust (§7) | **Built:** every value is known, assumed or asked, with its provenance. The second opinion. Actions are atomic. Facts show their origins. A record's History has Undo. Removal deletes everything related, journals itself and never touches the journal. Every error the window shows is a sentence. **Open:** the Activity checklist view, Undo outside a record's page, an Access page. |
| The window | **Built:** pull request #3's ideas (Q27–Q30: fonts, contrast, addresses, the UI kit, the table views, ⌘K, item pages, the map of the person's world and of Alpha's work, the companion's characters and moods). Pull request #5's features (Q41, Q42): a page per record with History, Undo and Notes; filters in the columns; grouping; saved lists as tabs; totals; editing ticked rows together; paste; colour; the sidebar's order, nesting, hiding and icons; Settings as cards; Intelligence's tables; agents with a look; the assistant panel's picker and Retry; plain errors, absolute dates, every delete confirmed. Slice 2: modules renamed, removed with their data kept and restored, or deleted; fields added and renamed by hand; files; conversations renamed and deleted; facts corrected and forgotten; goals by hand with their own page; everything remembered exported; Try again on any failure; a page per activity entry; Show earlier; downloads of exactly what a table shows; the companion opening where it was left; hold the mic to talk and send. Agents (slice A, 15 Oct): the Agents tab, a page per agent with Rename, Pause, Delete and the brief editor, @ in the composer. The window's minimum is 1100×560; on a window too short for five rows, the page scrolls instead of the rows. |
| Hands free of site vocabulary (Q17, Q23) | **Done.** |
| No limits (Q18) | **Holds.** One floor: 30 minutes between an agent's runs (Q22). |

**Two ways to think (Q32):** Claude through Claude Code runs everything. ChatGPT through the
Codex CLI can be chosen in Settings, but from 3 to 8 Oct Codex's own approval gate refused every
call to Alpha's tools, so it stays off until it passes a real tool call (pending).

**Runs for real, on Kenil's Mac:**
- **Five agents**, named 15 Oct: LinkedIn Connections, Deal Tracker (15 broker sites) and Job Boards run daily; Nutrition Check-in weekly; Gmail from Vikas is paused. Each run is a row with a verdict judged by code. The app has run on the agents substrate since 15 Oct evening; the 07:00 runs of 16 Oct are its acceptance.
- **The rest:** questions over the tables, drafts and sends with previews (an email sent for real by the gmail_send journey on 14 Oct), files in and out, the car wash workflow built from its page with its parts filling rows (11 Oct, and again in the workflow_build journey on 14 Oct).
- **Proven by tests only:** the calendar connect, and Claude Code's Install and Sign in on a fresh Mac.
- **Proven in a clean room** (9 Oct): the shipped app. The friend's own first run is the acceptance.
- **Not yet tried by Kenil in the app:** Watson (its first run on his world refiles the 11 facts; his page's Commitments; a module's Decisions), @Name in a conversation, dragging the companion and reopening, holding the mic, Try again on a real failure, and ⌘V paste.

## What is wrong, measured

- A turn takes 25 s at the median and up to three minutes at p90. That's the model's steps and the length of its answer, not Alpha's 1.5 s. The levers are Kenil's to choose: haiku for lookups, summarise-then-offer for long lists, longer-lived conversations ([`log/2026-10-03-fast-turns.md`](log/2026-10-03-fast-turns.md)).
- A clock-time agent run waits for the Mac's next full wake (the sleep rule of 3 Oct), and the schedule's words say so.
- Asked about someone it holds little on (Alexander Miller, Sara Ramos), Alpha answered from memory and said it hadn't read their emails, instead of opening Gmail. On 3 Oct the same journeys passed when it looked.
- Noticing had kept settings, requests and session state as facts about Kenil (11 of 24). Watson files by type now and refiles those 11 once on his world (proven on a copy with the stronger model; the small model wrongly moved his weight and job search in a first try, so the refiling uses the turn's model).
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
3. **Design sessions with Kenil** ([`log/2026-10-14-design-agents.md`](log/2026-10-14-design-agents.md)): agents' shared shape agreed 14 Oct (Q44), and the five built-in agents 15 Oct: Sherlock (Q45), Watson (Q46), Columbo (Q47), Scout (Q48) and Doc (Q49), and how they are built (Q50: the substrate, the anatomy, automations folded into agents, the agent page as Q40's door). **Slice A (the substrate, the routes and the window) and Watson built 15 Oct.** Next: Doc, then Columbo, Sherlock, Scout, each proposed in writing; C1 and T still to design. From his 12 Oct answers to Vikas's list:
   - C2, decisions and checkpoints kept ("all decisions / checkpoints should be persisted")
   - C8, several persisted, dedicated agents, with Q33's leftovers (event triggers, escalation as a question, the digest, a brief per agent) and Q40's door for an agent's own automations and readers (decided, Q50)
   - C1, depth
   - T, a single unified view of Alpha
   - Deferred but wanted: A5 several workspaces, A6 pre-built projects, B3 overrides, D7 dashboard tiles, D8 notifications and builder rules, D10 formulas
4. **People for real** (slice 2's step 4, skipped at Kenil's call): readers declare their rows as people, a pass links the existing rows, a person or company is made by hand, and "Your organisations".
5. **Memory:** look things up when memory is thin (memory_who_emailed); the person's own words first; the rest of the memory round (above); emails read by Watson (they arrive as readers' rows).
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
- **Agents:** `uv run alpha agents` lists them with their state and last verdict; `uv run alpha agent-rename <id> <name>` renames one (journaled as the person's).
- **The app:** `just app` rebuilds and opens it.
- **A core for checks** on a copy of a world: `alpha serve --no-background`. Never `cp` the world file; use SQLite's backup, as `copy_home` does.
