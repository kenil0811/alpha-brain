# The review and clean-up (14 Oct 2026)

Kenil, after slice 2: "lets take a step back and review our code and documentation and other
things once and clean up stale things". Four read-only reviews (the core, the window, the docs
against the code, everything else: the justfile, journeys, checks, git, connectors, memory,
the parent folder), their claims checked by hand, then one written proposal in five groups:
(1) real faults, (2) code clean-up, (3) docs, (4) memory, (5) disk and outside the repo. Kenil:
"lets start with 1." One reviewer claim was wrong and corrected before building: "job" threads
are agents' own threads (`runtime/automation.py`), not the removed jobs; they stay.

## Group 1: real faults

- **1a Deleting a module for good takes everything of it** (`world/purge.py`): its files go
  with the entity each file is, that entity's facts and its page; its workflow page with every
  version (`Workflows.delete_module`; it was only marked removed); the notes of the readers and
  pipelines that go (a connection's readers and procedures too). Found on the way: facts about
  an entity are kept under `entity:<id>` and every delete looked under the bare id, so deleting
  a file or a folder connection never took its facts; one helper (`_forget_entities`) now does
  it for all three. The workflow state "removed" went (nothing sets it); a migration deletes
  such rows on other Macs. Kenil's world had none of these leftovers.
- **1b** `alpha clear-conversation` and `purge.clear_conversation` removed: the only physical
  delete of journal rows.
- **1c The build-thread gap closed**: a plan's build thread (before 11 Oct) still let any turn
  in it make lasting things, and Alpha's `thread_open` could open new build threads. The
  migration makes a build thread that belongs to no workflow a topic (run in Kenil's world on
  restart: 12 threads, one open; the workflow build's own kept); `thread_open` opens topics
  only.
- **1d** Colours that were never defined (`--accent`, `--accent-soft`, `--muted`, `--danger`)
  left the working pulse dot, the agent chip's dot and the drop outline invisible: main's
  `--primary`, `--primary-soft`, `--text-3`, `--bad` now (computed values checked in the
  browser pane).
- **1e** "Core" on screen, missed in step 8: the sidebar and the companion say "Alpha isn't
  answering" / "Not running in the background"; the host's twelve start-up errors are
  sentences under that heading; a bad session from the host is no longer echoed (it could
  carry the token).
- **1f** The car-wash journeys removed the module by its old name ("— Austin", renamed 13 Oct),
  so their clean start did nothing; the current name now.
- **1g** The page check visits every address the window has: the map, each table tab of a
  module, a loose table's record, the newest conversation, the newest entry and failure, each
  goal (94 pages, was 79).

What ran: `just lint` clean; 258 core tests (2 new: a module deleted taking its files'
entities, facts and pages, skill notes and workflow page; a plan's old build thread becoming a
topic while a workflow's keeps its own, and `thread_open` making topics); 195 desktop tests in
45 files; the host test; `just check-desktop`: 88 of 94 pages clean
(`docs/checks/2026-10-14-1123.md`). The 6 others are two layout faults older than today that
the check never visited: on five table tabs at 1100×560 the totals row and the "+" row cover
the last rows (the first table of each module, the only one checked before, is clean); on the
map, the hint line and the "at a glance" panel cover legend chips at every size. The Mac app
rebuilt and restarted. "ok commit it, then propose the layout fixes, and ok for journeys".

## The two layout faults the wider check found

Proposed in writing; Kenil: "ok for all".

- **A table on a short window** (`modules/DataPage.tsx`, `styles/app.css`): when the room under
  the table's header is less than five rows, measured from where the rows start (so a wrapping
  toolbar and the panel count, the same in both layouts), the card is marked `card--scrolls`:
  the page scrolls instead of the rows, nothing is held in place, a wide table still scrolls
  sideways in place. On a normal window nothing changes; a resize switches back. Two misses of
  the first try, both caught by the check: the rows area stopped scrolling sideways (wide tables
  ran off the page), and static header cells sent the columns' grips 3px past the edge
  (`position: relative`, not held).
- **The map's overlays** (`shell/map/WorkMap.tsx`, CSS): the toolbar never breaks a word ("Shak
  e", "Refre sh"; the check didn't name it, the screenshot did), what doesn't fit wraps whole,
  "as of" first; the legend wraps to the left of the glance card, never under it.

What ran: `just check-desktop`: 94 of 94 pages clean, 0 problems
(`docs/checks/2026-10-14-1156.md`; the runs at 11:46 and 11:50 are the two misses); 195 desktop
tests; the table at 1100×560 and 1240×820 and the map in the browser pane; the map in Kenil's
Mac app (WebKit), navigation only.

## The journeys, all 22 (Kenil's ok)

18 that read or work inside the copy (`docs/journeys/2026-10-14-1134.md`): 12 of 18 passed.
Four that act in Kenil's accounts were held until he said so ("ok for all. for linkedin, create
draft messdage to sania instead": `linkedin_message` now writes to Sania Hussain, a
connection), then run (`docs/journeys/2026-10-14-1209.md`): 4 of 4 passed, for real: an email
sent from his Gmail to his own address and checked in Sent, a Gmail draft to Sania (and
probably "Skill reuse check", Gmail keeping what is typed), a LinkedIn message to Sania typed
and stopped before Send.

The six that failed:
- **workflow_build**: the build stopped on `'str' object has no attribute 'get'` in
  `claude_cli.count_tools`, an event whose `message` is text, right after a page was read: a
  real bug, older than today, that can stop any turn. **workflow_interview** ran next in the
  same copy, picked up that stopped build and went off course.
- **gmail_network** (never passed): Alpha read Gmail (four reads in the journal), but the
  judge sees only the answer and called it invented: the check's fault.
- **memory_two_sources**, **memory_who_emailed**: Alpha answered from memory and said it never
  read those emails rather than looking in Gmail; on 3 Oct they passed when it looked and
  failed when it didn't. Behaviour, not a regression.
- **branded_food**: 240 kcal from the label, right; fat 14 g where the second opinion found
  13.4 g. A near miss.

Proposed next, to Kenil: the stream bug fixed and both car-wash journeys run again; the judge
given the turn's own steps and gmail_network run again; the memory gap ("look it up when memory
is thin") onto the pending list.

## The stream bug and the judge (Kenil: "ok go ahead with 1 and 2")

- **Stream events read safely** (`runtime/claude_cli.py`): `_blocks` gives a message's content
  blocks only when the message is an object and its content a list of objects, `_inputs` a
  tool call's input only when it is an object; `count_tools`, `_steps` and `_watch` read
  through them, and a stream event that still can't be read is logged and skipped in the run
  loop, never the run's end. The ChatGPT route (`runtime/codex_cli.py`, off for now) had the
  same fault (`(x.get("error") or {}).get("message")` on an error given as text): `_obj` and
  `_said`. The new test, run against the old code, fails with the build's own error at the
  same line.
- **The judge sees the turn's steps** (`journeys/suite.py`): what Alpha did in the turn, from
  its journal (saw, did, made, changed, failed, noticed), goes into the judge's prompt as the
  evidence of what it read; an answer drawn from those steps is not invented.

What ran: `just lint` clean; 261 core tests (3 new: a run whose stream has every odd shape goes
on and its steps and result are read; the ChatGPT route reads odd events; the judge's prompt
carries the turn's steps). The three journeys again, each in a run of its own
(`docs/journeys/2026-10-14-1250.md`, `1305.md`, `1312.md`): workflow_build passed (the build
ran to its end in 9 minutes with five parts; the row filled with real values and their
sources, e.g. TxDOT's 30,403 cars a day), workflow_interview passed (drafted, revised to v3 by
the lot size, nothing built), gmail_network passed for the first time (the judge cites the
Gmail reads). All journeys now: 19 of 22; left, memory_two_sources and memory_who_emailed (the
memory gap, on the pending list) and branded_food (fat 14 g vs 13.4 g). The app restarted on the
fixed core.

## Group 2: the code clean-up (Kenil: "ok go ahead with group 2, keep the focus and move routes")

No behaviour changes but the model's instructions' wording. 55 files, 580 lines out, 217 in.

- **Dead code, each checked unused across the core, the window, connectors, journeys and
  scripts**: `ApprovePlanBody`; `Sources.coverage`, `coverage_line`, `WORDS`; `Files.unwatch`
  (it would also have skipped clean removal); `Knowledge.delete_note`, `NOTE_SCOPES`,
  `RESERVED_NOTES`; `Skills.for_sites`; `connectors/base.manifest`; `Tools._module_of`; the
  journey check `module_inside`; six read routes the window never calls (`GET /api/workflows`,
  `/api/workflows/{id}`, `/api/actions`, `/api/actions/{id}`, `/api/tables/{name}/lists`,
  `/api/documents/{id}`; their tests read the world); the always-empty `brief` on Home; the
  test judge moved from `runtime/conversations.py` to the tests; unused re-exports. Kept:
  `entities.unmerge` (step 4), the `modules.project` column, the old-plan check in Needs you
  (old unanswered plan proposals would show), and, at Kenil's word, the focus and move routes
  (`POST /api/conversations/{id}/focus`, `POST /api/turns/{key}/move`) for later wiring.
- **Comments made true** (about 20: plans, jobs, trials, the evaluator, Q38 described as live)
  and the model's instructions: rule 6 "and never write the plan yourself" dropped; rule 8 and
  `page_download`: files are kept "when their workflow page says to keep them".
- **Shape**: 24 imports inside functions moved up (the optional or heavy ones and the
  store↔skills cycle stay); `purge.py` no longer imports the runtime: a module's workspace
  folder is `world/workspaces.py`; `Journal.reply_of` for the two copies; `local_midnight_utc()`
  beside `now()` for the two; a `documents_ad` trigger for the three hand-written index deletes
  (a test: search is right after a delete); `hosts_for` takes a list; test fixtures with
  removed names (`plan=`, `plan_approve`) updated. Not merged: the five slug functions (they
  differ in length and non-English letters, and name existing tables and folders).
- **The window**: client methods `document` and `actions`; `TEXT_KINDS`, `CHOICE_KINDS`,
  `ArrowUpRight`, the `Tooltip` re-export; the host's `core-down` event nothing heard; about 150
  CSS rules of 108 unused classes (found by every string in the code, prefixes built in
  templates counted); `tokens.css` (its one live token, `--font-mono`, moved into `app.css`);
  the unused colour variables; six duplicated rules folded; `.planq*` renamed `.wfq*` (the
  workflow page's questions); stale section headers. Found on the way: an explicitly chosen dark
  theme lacked the map's dark colours (only the Mac's own dark had them); now both.

What ran: `just lint` clean; 262 core tests; 195 desktop tests; the host test;
`just check-desktop`: 94 of 94 clean (`docs/checks/2026-10-14-1357.md`); every screenshot
compared with the run before (`2026-10-14-1156`): the 19 that differ are the time of day
(Home's greeting), the character's blink and the map's own layout, the same as between two runs
before the clean-up; the journeys that read the reworded instructions
(`docs/journeys/2026-10-14-1402.md`, `1407.md`): attachment_in, vague_tracker,
workflow_interview, 3 of 3. The app rebuilt and restarted. "ok commit it, then go ahead with
group 3".

## Group 3: the docs

- **`STATE.md` is one page again** (197 lines → about 100): the last three entries instead of
  forty, the latest check report instead of nineteen, the done items gone from the pending list,
  every number from `just stats` (and the agents from the world: three daily, one weekly, Gmail's
  switched off), the "not built" that was built (Undo on a record's page, the pack's budgets)
  corrected, the design sessions and the deferred asks on the pending list in Kenil's own words.
- **The design's boxes** say what is: plans, trials and the evaluator out of the Built boxes; the
  pack at 14,000 characters in budgets per section, 73 tools; Intelligence's five tabs, ⌘K, the
  Assistant page, Activity's entry pages; §8's box rewritten as what the window has rather than
  the diary of how it came; §6.1's build narrative and its false claim (acting in Mac apps, undo
  of a draft) gone; §6.3 and §6.4 folded to a paragraph each with their boxes (the full text in
  git, commit `8ea259e`); the §11 table's break fixed; every box dated 14 Oct; the header's Q
  range Q1–Q43. §12's own evaluator stays as intent (not built), as does the docstring in
  `workflow_build.py` that group 2 had dropped.
- **`build-plan.md`**: fonts bundled, not Google's; the toolchain cited from the repo's own pins;
  the tables, the ten rules, the 73 tools and the CLI as they are; the open engineering
  questions replaced by the real ones.
- **README, CONTRIBUTING, `CLAUDE.md`**: Q1–Q43; the research folder; the workspace as §12's; the
  data folder's contents; the Assistant page; the host and CSP as they are; the suite's time;
  `CLAUDE.md`'s plan rule now "lasting things are made only on the person's yes on the workflow
  page (§12); how an agent gets an automation or a reader of its own is open (Q40)", with
  `just check-desktop` and the four journeys that act in Kenil's accounts.
- **Research and proposals**: the two superseded research notes and the graph proposal say so
  at the top; the rulebook's Q40 named as the branch's; Vikas's list of what the window needed
  from the core brought in as `design/research/core-changes-for-the-window.md` (the copy Kenil
  answered; the branch's later G8–G11 noted, not decided).
- **The log's index**: one line per entry.

What ran: `just lint` clean (one docstring changed in code); every relative link in the edited
docs resolves. "ok commit it, then go ahead with group 3".

## Left

Group 4, the memory notes; group 5, disk and outside the repo, Kenil's call per item.
