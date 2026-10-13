# Alpha, the state

Rewritten, not appended, at the end of every session. This page is what a new session reads
first; the numbers come from `just stats`; the history is [`log/`](log/README.md); the intent is
[`design/alpha-second-brain-design.md`](design/alpha-second-brain-design.md).

**As of 13 October 2026.** Last entry: Settings › Models ([`log/2026-10-13-models-spend.md`](log/2026-10-13-models-spend.md), Q49, branch `feat/models-spend` off `feat/file-import`): every model call's tokens and price recorded by the core in a `usage` table from `route.run` (one row per model; Claude Code's own API-equivalent price; Codex tokens and no price), old answers carried over once; the page splits spend by assistant, model, project, conversation and agent, with Billed and a daily budget that only warns; one real answer recorded on a backup of the owner's world, background passes proven by tests only. Before it: a table file goes in whole ([`log/2026-10-12-file-import.md`](log/2026-10-12-file-import.md), branch `feat/file-import` on PR #6): uploads kept in the project's `sources` folder and the turn told where each is; `file_to_table` reads a CSV, TSV or Excel file whole, every column unless the person said which; the review's 10 defects fixed; journey `file_import` passed with the real model; the folded panels' arrow, Send inside the composer, fit to window without the gap, Dashboard out of the View list. Before it, the window merged into the Map branch (`feat/map-view`, PR #6) after main's merge; the place field's Q44 is now Q46. Before it, the Map view ([`log/2026-10-12-map-view.md`](log/2026-10-12-map-view.md), Q46, core G13, pull request #6 on `feat/map-view`): a `place` field kind located by Apple's geocoder (CoreLocation in the core, not a Tauri plugin), Alpha proposing to turn a city or address field into one and only the person's yes doing it, and Map as a data-view type on an offline world outline; reviewed by a separate agent and its 12 findings fixed; journey `map_places` passed with the real model; layout check 272 of 272 clean with a map state. Before that: main merged into the window again ([`log/2026-10-12-merge-main.md`](log/2026-10-12-merge-main.md)): main's Q39 (modules as workflows) and Q40 (the sweep) keep their numbers and the window's decisions move to Q41–Q46; the workflow card, grouped questions, read-only tables, where a value came from, and a module's parts shown in the rulebook's look; plans and the research pass gone from the window too. The window's entries before it: Graph in the View dropdown and no pop-ups for predefined choices ([`log/2026-10-12-views-and-popups.md`](log/2026-10-12-views-and-popups.md), Q46, window only): Second Brain is one data view with Graph as a view type; List and Chart views dropped; the chosen toggle tinted; lists changed with Cancel and Save in the toolbar, renamed in ⋮, shared (copy, CSV, Excel); ⋮ settings and the sidebar's Move, icon and hidden projects as dropdowns and submenus (rule 31); the Map view planned (`design/map-view-plan.md`: outlines, Apple's geocoder, waiting on core G13 and a Tauri plugin). Before it: Home as cards and Second Brain as one graph and one table ([`log/2026-10-12-home-cards-second-brain.md`](log/2026-10-12-home-cards-second-brain.md), Q45, window only): Home a grid of cards each with its purpose as its title and an action on every item, in three fixed heights, most urgent first; Second Brain one Obsidian-like graph of everything (legend filters, search, local graph, side panel) and one table of facts, goals and hypotheses with ✓/✕ on hover, also in each project's Intelligence; pages for goals, permissions and notes; the numbers strip always shown; the add row only where it adds inline; the Dashboard view after ChatGPT's; small zoom and move buttons on the graph; not yet pushed to PR #5. Before it: main merged into the window ([`log/2026-10-11-merge-main.md`](log/2026-10-11-merge-main.md)): main's Q35–Q38 kept with their numbers and their behaviour, in the rulebook's look: the Assistant page (`#/assistant`, from ⌘K; not in the sidebar, rule 3; the side panel stays folded while it is open), the reply shown as it is written with the steps so far, a question left in prose as a card with choices, a plan's questions and a researched plan's pieces on its card and on Home's proposals, carried by Approve; the window's own Q35–Q38 renumbered Q41–Q44. Before it: the owner's decisions on the UX audit ([`log/2026-10-11-audit-decisions.md`](log/2026-10-11-audit-decisions.md), Q44, window only): Notion-sized tokens, no subtitles, one Toggle and one Switch, every delete and revoke confirms, Add list as a page with Save and Cancel, toolbar changes temporary, download what's shown, Add new… to Alpha, plain errors with no "core", the frame kept while Alpha is away, the workspace logo as its own first letter, project icons from their names and goals, named folded sidebar, contrast checked; `just check-layout` and a source-rule test as guard rails. Before it: the owner's fourth review ([`log/2026-10-09-owner-review-4.md`](log/2026-10-09-owner-review-4.md), window only): one layout for every table page (projects, Network, Intelligence's lists) with the data over the first screen, round fold buttons on the panels' edges and double-click to unfold, rename and icon by double-click (the name kept in the window until the core can rename), New project in the sidebar with Cancel (fixed rule 25), fixed column widths on hover, an interactive metrics strip with details on click. Before it: the owner's third review ([`log/2026-10-09-owner-review-3.md`](log/2026-10-09-owner-review-3.md), window only): type and spacing ×1.3, Governance as Allowed/Denied tabs, a page for every item including Activity, Alpha among the agents, Add goal/agent/automation, Sub-projects; Task manager and the pre-built projects specified for the core in [`design/core-changes-for-the-window.md`](design/core-changes-for-the-window.md). Before it: the owner's second review of the window ([`log/2026-10-09-owner-review-2.md`](log/2026-10-09-owner-review-2.md), Q43, window only): sections back below the table, ⋮ everywhere, every dropdown with search, a star and Add new, Save / Cancel / Last saved, New project, Settings with Overview, the bell in the assistant's header, the egg with every record and its links; "project" reads "project". Before it: `feat/ui-rulebook` merged with main ([`log/2026-10-09-merge-main.md`](log/2026-10-09-merge-main.md)): main's agents (Q33) shown as the window's one Agents data view with goal, verdict and the companion each wears; the browser row in Settings and on first run (Q34). On the branch before it, window only: the UX guidelines v2 in the window ([`log/2026-10-09-ux-guidelines-built.md`](log/2026-10-09-ux-guidelines-built.md), Q42), the owner's review ([`log/2026-10-09-owner-review.md`](log/2026-10-09-owner-review.md)), the UI rulebook ([`log/2026-10-09-ui-rulebook.md`](log/2026-10-09-ui-rulebook.md), Q41). On main, merged on 11 Oct: modules as programs ([`log/2026-10-10-modules-as-programs.md`](log/2026-10-10-modules-as-programs.md), Q38, the decision; no code changed), the research pass before a build ([`log/2026-10-09-research-pass.md`](log/2026-10-09-research-pass.md), Q37, run for real on a copy of Kenil's world), a plan's questions with their choices ([`log/2026-10-09-plan-questions.md`](log/2026-10-09-plan-questions.md), Q36), the conversation, closer to Claude ([`log/2026-10-09-chat.md`](log/2026-10-09-chat.md), Q35). On main before the first merge: Alpha on another Mac ([`log/2026-10-09-fresh-mac.md`](log/2026-10-09-fresh-mac.md), Q34), agents, schedule first ([`log/2026-10-09-agents.md`](log/2026-10-09-agents.md), Q33 built in part), reliability first ([`log/2026-10-09-reliability.md`](log/2026-10-09-reliability.md)), what went wrong 4–8 October ([`log/2026-10-08-what-went-wrong-and-agents.md`](log/2026-10-08-what-went-wrong-and-agents.md)); older entries in [`log/README.md`](log/README.md).

Main's entries before it: the superseded shapes go
([`log/2026-10-12-clean-sweep.md`](log/2026-10-12-clean-sweep.md), Q40; the research pass, plans, milestones and jobs removed; 5,500 lines fewer), shipped again with a Python that can make a venv ([`log/2026-10-11-shipped-again.md`](log/2026-10-11-shipped-again.md)), questions asked together answered together
([`log/2026-10-11-questions-together.md`](log/2026-10-11-questions-together.md); proven by tests only), modules as workflows, piece 2b, parts on linked things and
the first run from the app ([`log/2026-10-11-parts-for-real.md`](log/2026-10-11-parts-for-real.md); run for real in Kenil's app), piece 2, the build from the page
([`log/2026-10-11-build-from-the-page.md`](log/2026-10-11-build-from-the-page.md); run for real), piece 1, the interview and the page
([`log/2026-10-11-workflow-page.md`](log/2026-10-11-workflow-page.md); run for real), the rethink
([`log/2026-10-11-modules-as-workflows.md`](log/2026-10-11-modules-as-workflows.md), Q39, §12; no code changed), modules as programs, slice 1, the spine
([`log/2026-10-10-workspace-spine.md`](log/2026-10-10-workspace-spine.md), Q38; proven by tests only,
M0 of the car wash ask on Austin is the acceptance), the decision and its prior art
([`log/2026-10-10-modules-as-programs.md`](log/2026-10-10-modules-as-programs.md); §6.4,
`design/research/modules-as-programs.md`), the research pass before a build
([`log/2026-10-09-research-pass.md`](log/2026-10-09-research-pass.md), Q37; run for real on a
copy of Kenil's world), a plan's questions with their choices
([`log/2026-10-09-plan-questions.md`](log/2026-10-09-plan-questions.md), Q36), the conversation, closer to Claude
([`log/2026-10-09-chat.md`](log/2026-10-09-chat.md), Q35), Alpha on another Mac
([`log/2026-10-09-fresh-mac.md`](log/2026-10-09-fresh-mac.md), Q34), agents, schedule first
([`log/2026-10-09-agents.md`](log/2026-10-09-agents.md), Q33 built in part), reliability first
([`log/2026-10-09-reliability.md`](log/2026-10-09-reliability.md)), what went wrong 4–8 October and the agents
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

## Numbers (13 Oct, measured with `just stats`)

| | |
|---|---|
| Core tests | 237 passed (about 40 s alone, 116 s beside the window's run); ruff and mypy strict clean |
| Desktop tests | 490 passed, 1 skipped (vitest); typecheck clean |
| Tools the model sees | 75 (`file_to_table` added) |
| Journeys | 24 defined; latest `docs/journeys/2026-10-12-1143.md`, 1 of 1 (`file_import`: 400 rows and every column into Contacts, nothing asked, 22.5 s); `2026-10-12-0539.md`, 1 of 1 (`map_places`); `2026-10-12-0907.md` (main's interview after the sweep) |
| Desktop check | `just check-layout` (12 Oct, this branch with the Map; run with the title bar merged too): 272 of 272 clean at 1100×560 and 1240×820, light and dark. `just check-desktop` last full run `docs/checks/2026-10-03-2043.md` |
| Turns | `just turns`: 1–3 Oct, a person's turn 25 s at the median, the model 23 s of it, Alpha's overhead 1.5 s; one step 4 s, four steps 14 s, twelve or more about 3 min. Since 9 Oct (main) the first words of a reply are measured too ("first s"): 2.7 to 8.7 s on the seven real turns of the chat slice when the reply came first, 23 to 28 s when steps came first |
| Window's requests | 4 a minute idle (the one poll), none while hidden; was about 26 and never paused |
| Commits | 241 total, 239 since 1 Oct 2026 before this entry's commits (`just stats`) |
| Lines | core 16,447 Python; tests 5,760; desktop 25,341 TS/TSX |

## What is built, against the design's order of work

| Step | State |
|---|---|
| 1. World store, MCP server, stream, companion | **Built.** One SQLite file per person; the journal verbatim with FTS; what the model saw kept per turn; 72 tools; the companion window and the panel. Projects nest since 3 Oct night (Q31): a project inside a project to any depth, a parent's page, summary, activity and conversation reaching what it holds, the rail as a tree; the person makes a parent and moves projects in from a project's Settings. |
| 2. Browser, files, calendar; derived pages | **Built.** Readers (read skills) kept only after a real run, health-checked, repaired by Alpha; files in and out (§4.17); calendar read-only. Reading LinkedIn's whole list daily is still the slowest thing (read only what is new: open). |
| 3. Sensors, triage, sleep-time pass, digest, Inbox | **Not started.** Nothing proactive exists beyond an automation's "worth telling". |
| 4. Entities and bi-temporal facts across sources | **Partial.** Facts bi-temporal; entities with hard keys; a page per person (§4.23); noticing after every turn; entity cards in context. But no table in Kenil's world declares its rows as people, so 1,551 connections are rows, not people (20 entities, 6 facts). |
| 5. Standing things, promotion from verified runs | **Partial.** The workflow page → yes → build by mechanism (§12); automations as pipelines (run skills) or procedures; skills one table with composition (§4.24). Since 9 Oct every automation is an agent's process (Q33): a goal, a page Alpha writes and the person edits (read by the model when it steps in), a row per run with a verdict judged by code, repair at most twice a run, failures in the journal and the companion, the Agents tab and page. Since 12 Oct (Q40) the research pass and plans with milestones are gone; with them went the only door through which the model made a new automation, reader or source: **open question for Kenil** (§6.2's box). No ladder, no promotion from repetition; no event triggers, no digest. |
| 6. Pending actions and Access | **Built as actions** (§4.13, Q24): dry-run card, the person's yes, prepare-level standing sentences; automations cannot act outward, by code (checkpoint). No Access page; no Undo. |
| Memory round (design §3.7, Q26) | **Built:** conversations first-class and parallel with resumed sessions and a world delta; routing by structure then the System One judge; the wiki with its index; noticing; context by relevance (cards, day-scoped retrieval); skills unified. **Open:** the Agent Skills folder export, promotion from repetition, fewer tools by principle, a routing journey, "move to…" in the panel, noticing over what Alpha reads, a sleep-time pass. |
| Trust (design §7) | **Built:** known, assumed or asked with provenance; the second opinion; build trials; actions atomic; where a fact came from, on the page. **Open:** the Activity checklist view, Undo, an Access page. |
| The desktop (pull request #3's ideas, Q27–Q28) | **Built:** fonts bundled, AA contrast, the Mac's motion and contrast honoured, addresses, resizable rail and panel, the UI kit on Radix and lucide; the table views (table, board, list, gallery, timeline, calendar, chart; saved lists in the world; selection; pickers); ⌘K on search; a page per skill and per automation; the project's page on its tab; the desktop check at the window's sizes; the type scale; quick entry on a table through the conversation; the companion's characters (Bridge's art, our rig, ten animals, a wardrobe and three sizes chosen in Settings, kept in the world; dragged from the character; Bridge's eleven moods as poses, driven by what the companion does); relations followed in the drawer with a way back; the form view; the map (Intelligence › Map, Q29–Q30): the person's world as the default view with Alpha's proposed links as suggested facts, the map of work as a toggle, refresh only on demand; the host watches the core and restarts it on the same port, the window asks one question for what changed (nothing while hidden) and says what failed with Try again, the words come back when a send is lost; Add files on every project's page (the Mac's picker, the same route as a drop); from main (9 Oct, Q35–Q37): the Assistant page with every conversation down the left, the reply shown as it is written with the steps so far, a question left in prose turned into a card with choices by mechanism, a plan's questions with their choices and a researched plan's pieces (keep, defer, skip) on its card and on Home's proposals, Alpha's picks pressed and carried by Approve into the brief. **Left:** the links worth having wait on people-for-real (pending item 6) and noticing over what Alpha reads. |
| The window by the UI rulebook (Q41, Q42) | **Built, window only:** one frame and header line; panels fold to strips and step back with Escape; the sidebar's order, project menu (icon, move, hide, View options), drag to reorder; project pages that land on their data, with Files, Intelligence and Governance below the data (Q41; tabs in Q40 were reversed), and one empty table when there is nothing yet; one data view (toolbar order, Filter with pills, table menus, Duplicate, Pin, footer summaries, the add bar, frozen columns) and a Dashboard view whose every tile has a call to action; a page per record that saves as you go, with History's Undo and Redo; Home a grid of cards by urgency, each with its purpose and an action per item (Q43); Intelligence with Second Brain (one graph of everything and one table of facts, goals and hypotheses with ✓/✕, Q43), Agents, Automations, Skills, Connections as data views; Activity in a bell; Network; Settings as a grid; after the owner's review: Notion's database (view tabs, advanced filters, sorts, groups, layouts, peeks, footers on every column, bulk edit, grid keys, conditional colour), Governance's Always and Never, agents wearing a companion; the panel's picker and composer (depth: Quick overview, Deep thinking disabled); Approve and Decline, Always allow suggested after three approvals; after Q40: comfortable rows, sentence case, Estimated and Assumed chips, a pencil on hover, the metrics strip always shown (Q43), star defaults, "/" to insert. **Left (needs the core):** project rename in the core (the window keeps its own name for now) and delete, removed projects, several workspaces, conversation delete, adding a field, outcome and success criteria on proposals, the data-sharing notice, other agents, saving a dashboard's selection as a list, per-record notes and history routes, editing skills, agents and automations, a file's content (CSV save), Governance rules read by the runtime; from the UX guidelines (Q40): every assistant output saved as a file and linked from its turn, each reply's sources (records and files), the goal-confirmation rule in planning, a plan approved once covering its routine steps, a depth carried by `ask` (to enable Deep thinking); from the second review (Q41): creating a person or organisation in Network, files tied to Network, the builder refusing a duplicate name (and project rename to fix "Deals › Deals" at the source), Try again for failures other than an agent's run; from the third review: the pre-built projects Task manager and Network (A6) and Task manager in full (section T), creating goals, agents and automations directly (D11), activity and goals by id (D12). The whole list, each with what it should do: `design/core-changes-for-the-window.md`. **Not adopted:** forced edits, Task manager first, the Mac title bar. |
| Hands free of site vocabulary (Q17, Q23) | **Done.** |
| No limits (Q18) | **Holds.** One floor: 30 minutes between an automation's runs (Q22). |

**Two ways to think (Q32):** Claude through Claude Code (runs for real, everything below) or
ChatGPT through the Codex CLI on his subscription, chosen in Settings › Thinks with; the ChatGPT
way is proven by tests only until he signs in again (his Codex sign-in lapsed on 16 June).
What each call costs is in Settings › Models (Q49): Claude's price is Claude Code's own; a
ChatGPT call has tokens and no price.

**Runs for real, daily, on Kenil's Mac:** four agents (LinkedIn connections; 15 deal
sites; 4 job boards; Gmail from one sender), each run a row with a verdict judged by code
(9 Oct 07:40, the first wake: deal tracker succeeded 15 of 15 with no model; LinkedIn
connections converted itself to steps and succeeded; founding-engineer partial, 3 of 4,
Wellfound stops automated reading), questions over the tables, drafts and sends with
previews, files in and out, builds in the background. The four have no goal or page yet:
Alpha writes one when asked from the agent's page, or when it next builds one. **Proven by tests only:** the calendar
connect, Claude Code's Install and Sign in on a fresh Mac. **Proven in a clean room on
Kenil's Mac (9 Oct, a fresh HOME, the shipped app):** see the fresh-Mac log entry for exactly
what ran; the friend's own first run is the acceptance and hasn't happened yet. **Proven by
the desktop check:** every page opens clean at 1100×560 and 1240×820, light and dark, on a
copy of Kenil's world (see the numbers). **Proven in the real app** (3 Oct night): the core
killed by hand twice came back on the same port within two seconds and the window said so.

## What is wrong, measured (the checkpoint, updated)

- The rulebook's window has not run in the Tauri app (WebKit) nor through `just check-desktop`; it is proven by 481 tests and by `just check-layout` in Edge (Chromium), not WebKit; the Second Brain graph has been seen only on the audited world, its layout runs on the main thread. Before merging: `just check-desktop` (needs Playwright's Chromium) and a look in `just app`.

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
  repair all failed with it. Kenil is back on Claude. Since 9 Oct: ~~a run that fails on a
  network error at wake is not retried~~ (tried again after a minute), ~~failed runs reach
  nobody but Activity~~ (the companion carries them; every run has a verdict), ~~the LinkedIn
  connections automation is a procedure and pays a model turn a day~~ (it converted itself to
  steps at the 9 Oct 07:40 run), and the schedule's words say "or when your Mac next wakes".
  Still true: a clock-time run waits for the Mac's next full wake, by the sleep rule.
- Alpha cannot rename a project (seen in the nested-modules journey: a part kept its old name
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

**Answered 12 Oct:** the Mac title bar may change `desktop/src-tauri/` (built on `feat/title-bar`, not pushed); a record's History and a metric's detail stay pop-ups (rule 31).

**The Map (Q46, G13):** `feat/map-view` is pull request #6 against `feat/ui-rulebook` (PR #5, pushed to c0d4f6e on 12 Oct). Left: re-locating places that couldn't be looked up other than by editing them, a person dropping a point on the map, streets (option D), and the Mac app walk.

**The UI rulebook (Q41–Q44):** review `feat/ui-rulebook` (PR #5) with Kenil, now with the audit decisions (Q44) and main's Q35–Q38 merged in (11 Oct; the Assistant page has not been through `just check-layout` or the app yet); the core's side in `design/core-changes-for-the-window.md` §G (conversation rename and delete, Add new… addressed to the builder, the person's organisations, file delete, Excel of what is shown, a document's date, errors as sentences, the 401 sentence without "core") (it supersedes 1 Oct's "keep it similar"); run `just check-desktop` and the app; answer the questions at the end of both log entries; then the core's side of what the window shows disabled (project rename and delete, conversation delete, adding a field, outcome and success criteria on proposals, per-record notes and history).

**The port of pull request #3's ideas (Q27–Q29), all built:** ~~foundations~~ → ~~the table
views~~ (stage three, relations followed and the form view, 3 Oct evening) → ~~⌘K~~ → ~~item pages, fact origins,
the project's page~~ → ~~the desktop check and the UI rules~~ → ~~quick entry on a table~~ → ~~the
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
6. ~~Reliability first~~ — done 9 Oct
   ([`log/2026-10-09-reliability.md`](log/2026-10-09-reliability.md)): a failed-tools turn fails
   with the reason; a route is tried before it is switched to; a transient failure at wake is
   retried; the schedule's words say the truth; failed runs reach the companion; reading in a run
   is refused and an old automation converts itself to steps.
7. ~~Agents (Q33), schedule first~~ — done 9 Oct
   ([`log/2026-10-09-agents.md`](log/2026-10-09-agents.md)): goal, page, runs with verdicts by
   code, repair at most twice a run, the window; the build writes each agent's page. Left of
   Q33: event triggers, escalation as a question, the digest, a brief per agent; the four
   agents' pages written for real.
8. ~~Alpha self-sufficient on a fresh Mac~~ — done 9 Oct
   ([`log/2026-10-09-fresh-mac.md`](log/2026-10-09-fresh-mac.md), Q34): `just ship` carries the
   runtime inside the app, the host uses it and clears the quarantine mark, the first-run page
   installs Claude Code and Alpha's browser; shipped again 11 Oct night with `ensurepip` kept so a module's build can make its venv. Left: notarization (no Apple Developer account:
   right-click › Open for now); the friend's own first run, which decides it.
9. **Modules as workflows (Q39, design §12)** ([`log/2026-10-11-parts-for-real.md`](log/2026-10-11-parts-for-real.md)): pieces 1–2 built and run for real, the last time in Kenil's own app: the real ask became "Car Wash Site Scorecard — Austin" (module `m_12ac0a8738be`, 16 parts); 1600 S Lamar added; the app's scheduler ran the gates (37,900 AADT, Pass), the fourteen items as linked Score rows (four scored from Austin's and Travis County's open data, five flagged for a look, the Census ones waiting on the key) and the memo ("Needs more info"). Found by running: parts had to fill a linked thing, "after" had to mean ran, and the profile broke a workspace inside Alpha's home. Later that night Kenil's first try ("didnt work") found two more: the Census key refused until activated (theirs), and nothing in Alpha retrying when a setting or a row changes, with an edit wiping the row's provenance (ours); built: a change tries the parts again, an edit keeps provenance, a part after another reruns when that one fills later. **Next: Kenil's acceptance** (the Census fields filled in the app, then one change by chat preserving his rows), then documents drafted from templates with a page, the evaluator through the pages, the library across modules.
10. **The conversation, the rest of Q35** (questions of one turn are one form since 11 Oct
   night, [`log/2026-10-11-questions-together.md`](log/2026-10-11-questions-together.md), to
   be seen on the next interview in the app): one automatic retry of a transient failure with a
   Try again card; identical replies collapsed and a stopped build posting once (the loop that
   posted 19 on 2 Oct); long replies folded; copy and edit-and-resend; a plus for files in the
   composer; Kenil to say whether one stream should replace the per-page conversations.
11. The ChatGPT route stays off until it passes a real tool call (Codex's own pre-approval
   setting, or not at all).
12. People for real: readers declare their rows as people; a pass links existing rows.
13. Then: the memory round's leftovers (and from 3 Oct night: the person's own words first,
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
