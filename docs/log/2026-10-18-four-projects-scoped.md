# Vikas's four projects scoped against the harness (18 Oct 2026, evening)

Kenil: "scope this for alpha. two things - can current version of alpha accomodate these
requests, and if not, what do we need to change to accomodate it". No code changed.

## What was read

- **The requirements:** `requirements/AB-four-projects-scope.md` beside the repo (Vikas, 13 Oct:
  Network, Task manager, Accounting, DealPilot, with approvals on tasks, document intake and
  formula fields as shared foundations), written against the pre-harness Alpha (§12, proposals,
  section T, A6/B3/D10).
- **The client's files:** the reference dashboard `requirements/avilo-dashboard-v9/index.html`, a
  one-page report for restoration contractors, and RestoPros' six QuickBooks exports for June 2026
  in `requirements/avilo/`. The ETA tracker came only as its Platforms sheet (a CSV); Kenil said
  missing configuration takes defaults.
- **Alpha's side:** STATE, the harness design, and three read-only searches of the code (tasks and
  approvals; the store, fields and pages; connectors, people and readers). No world database was
  opened.

## What was found

The analysis is `requirements/alpha-fit-four-projects.md`.

About half the scope is buildable now as modules the model makes:
- DealPilot's sourcing was proven by the Deal Tracker agent (15 sources, daily, model-free, 2–16
  Oct). It went with the world reset of 18 Oct, so it is rebuilt, not reused.
- The report fits slice 7/7b's drawn pages, read-only.
- Gmail and LinkedIn are read through the browser.
- Outward drafts go on cards.

The rest needs generic platform changes P1–P14. The weight sits in four:
- **Formula fields and fx:** absent; the field kinds are in `world/collections.py:18`.
- **Tasks:** there is no task object; `threads` are conversations and `runs` link only to their
  agent.
- **Approvals:** these need decision records, staged writes, a history page and a guard against
  identical cards.
- **People for real:** rows link to a person only by email or URL (`collections.py:165`).

Also found:
- Documents are read as plain text, losing sheet, row and page (`connectors/files.py:36`).
- Custom agents have no event trigger (`LOOKS = {"custom": None}`).
- Kits carry no rows.
- A drawn page can only tell the window ready, error or size.

Found in the reference:
- Its benchmarks are restoration ones and differ from the scope's.
- Its days-cash formula divides a month's costs by 365.
- Its own parser reads RestoPros' COGS as $0. Replaying its rules on the export showed the
  "Total for Cost of Goods Sold" line caught as a section heading.

Deal Tracker's reports of 3 and 16 Oct list the same title as New and Gone in one run, so its key
was probably unstable; the rebuilt readers should key on each listing's own ID.

## What was decided

Kenil agreed the seven recommendations ("the 7 decisions make sense to me"), now Q84–Q90:
- **Q84:** the freeze holds for the platform changes. Kenil then changed the second half: "i
  dont want to build modules before the platform work is done", so no module is built first.
- **Q85:** a task is a commitment grown up, with an anchor; a run serves a task.
- **Q86:** what an agent pulls in from outside is a staged write.
- **Q87:** placement is said, not asked.
- **Q88:** pages never write; reports are edited in the tables.
- **Q89:** kits may carry setup rows.
- **Q90:** set-up is a conversation, not a wizard.

## Left

- Kenil's run of the five first-day sentences in the app, which lifts the freeze for P1–P14.
- The first platform proposal, P1–P3, written the same evening
  (`docs/design/tasks-and-cards-proposal.md`: tasks as a built-in table with anchors, runs that
  serve tasks, cards as rows with staged writes). Kenil agreed it as written, with the
  recommendation on all five of its questions (Q91). Built once the freeze lifts.
- The modules after the platform work: DealPilot (its readers rebuilt), Accounting, Network.
- For Vikas: which benchmarks, whether every client is a restoration business, and v9.2 of the
  reference.
