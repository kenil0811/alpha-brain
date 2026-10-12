# Modules as workflows, piece 1: the interview and "Your workflow" (11 October 2026)

The first piece of §12, built the same day as the decision.

## Built

- **The page** (`world/workflows.py`): `workflows` (title, body, the prose, state drafted →
  agreed → building → built | declined | removed, version, the conversation it came from,
  the module once built, the agreement) and `workflow_versions` (every earlier body, with the
  change that replaced it). `clean_body` checks what the model gave: a purpose; steps each
  with a title, what happens, who does it (alpha, you, both), what it takes and gives, what
  it reaches, whether it acts outward, when it runs; things kept with fields and relations to
  other things kept (a relation to a thing not kept is refused); documents; settings each with
  an origin (you, your document, the trade, Alpha's default); assumptions; suggestions with
  sources; questions as on plans. Nothing about the steps is fixed by the platform.
- **The tools** (`mcp/tools/workflows.py`): `workflow_draft` (only once the job is known),
  `workflow_revise` (the whole page again with the change made; the version before kept;
  decisions on suggestions and answers carry over by title; suggestions and questions left
  out altogether carry over whole; a thing, step or setting that vanished is named in the
  journal and to the model, found on the first real run), `workflow_agree` (the person's own
  words from a later turn; what they said about suggestions; their answers),
  `workflow_decline`.
- **The rules** (`runtime/turn.py` 6–7): the interview (the job and the decision; the
  procedure today with their documents read in; what enters; which steps are their judgement;
  what comes out, for whom), decisive questions as cards two or three at a time, a safe
  default for the rest; then look up only what the workflow needs and draft; what is unknown
  goes on the page as a question or an assumption, never as a reason to hold it back
  (found on the second real run); changes through `workflow_revise`, the yes through
  `workflow_agree`. The plan door is closed in the conversation: `plan_propose` refuses
  outside a research pass and no longer revises an old plan into a new one (found on the
  third run); `research_start` refuses with the same words (found on the fourth: the model
  reached for the pass and spent twenty minutes in looks). The research pass's mechanisms
  stay as material; its journey is gone, `vague_tracker` expects the page.
- **The card** (`WorkflowCard`, in the conversation and on Home): the purpose; the steps with
  who does each and "asks you first" on anything outward; what it keeps and its documents;
  settings and assumptions behind a toggle; Alpha's suggestions with Add it / Skip and "why?"
  for the sources; the questions; "Yes, build it" / "Not now"; and the line that changes
  happen by saying what's different in the conversation. The API: `/api/workflows`,
  `/api/workflows/{id}` with versions, `/agree` with suggestions and answers, `/decline`;
  Needs you shows a drafted page as one item.

**Checked.** The body checked and normalized (ids from titles, relations resolved, origins
refused when unknown); drafted, revised with the version kept and decisions carried, the
thinner revision keeping suggestions and questions and naming what it dropped, agreed in
words (refused in the drafting turn and on words never said), still revisable once agreed,
declined; on Home and in the conversation and agreed in the app; removed with its module;
the card's steps, toggle, sources on ask, add or skip, the yes with decisions. 261 core
tests, 86 desktop, lint and typecheck clean.

**Run for real** (journey `workflow_interview`, five runs, the last one
`../journeys/2026-10-11-1457.md`, passed in 467 s): "I want help picking car wash sites to
open" → Alpha asked which way to go (the copy of the world still remembered the removed
module); the job and the procedure in one message → the page in 258 s: seven steps (receive
a site from a broker; geocode; households within 3 miles; drive-time population; traffic;
score the 14 criteria, both; write the investor memo), four linked things (candidate sites,
site metrics, site scores, investor memos), three suggestions (carry over last week's zoning
and competitor gates; keep every broker attachment; a competitor-density row), six settings,
three questions with picks (the exact 14 criteria, the drive-time band, how sites get in);
"add a minimum lot size of 0.8 acres" → version 2 in 132 s. The four earlier runs each
found a behaviour and led to a mechanism (above).

## Left

- "Yes, build it" leads nowhere yet: the build from the page (the model's things and
  relations as tables, the pages composed from a catalog, documents from a template, parts
  with contracts in the workspace, the evaluator through the pages) is piece 2.
- The first real revision rewrote the page and merged steps; the carry-over and the naming
  of what vanished are the mechanism for it; a journey check for "the step added is on the
  page" would be the next.
