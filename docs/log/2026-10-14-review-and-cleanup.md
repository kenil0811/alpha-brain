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

## Left

The layout fixes proposed next; the journeys run (Kenil's ok); then groups 2–5.
