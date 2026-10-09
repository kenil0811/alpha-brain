# The research pass before a build (9 October 2026, Q37)

Kenil, after the "Car Wash Site Scoring" module of this morning: "I want to have dedicated
agents throughout alpha … when user asks for a new module, unless they explicitly say what
exactly to build, alpha should trigger a research agent which tries to look at competitors /
open source alternatives / common practices about the request, and comes up with best
recommendations / questions / suggestions on what and how to build." And, after comparing the
module with a site engine a friend built: "i dont just want some working thing which isnt
useful for the end user, it needs to be a proper module … alpha should do a good scan of what
all could potentially be helpful for such a product, and how well can it be built, and suggest
those to the user so that they can decide."

**What the car wash build was, read from his world.** Ask: "I want to build something similar
to growthfactor.ai" and four one-word answers (car washes, US, site scoring, public). Alpha
wrote the spec itself in two chat turns on 8 Oct (the ChatGPT route, which could not approve),
re-proposed it on 9 Oct in two minutes from the journal, and built it in fourteen: five tables,
one candidate row, eight factor rows, nine competitors, six source rows, a recipe in the note;
no skill, no automation, no view. "Give it an address and it scores it" meant a fresh model
turn following the recipe by hand each time. Thirty per cent of the weights sat on factors the
build itself said have no source anywhere in the US; the score was a weighted average with no
gates, so a site with nine washes within 2.7 miles scored 69 "Favorable"; nobody asked who
scores sites, what decision it serves, or whether a process or scorecard already existed. The
friend's engine (`~/Desktop/dev/project-waterways-main`, a week of Claude Code sessions from a
client's own process documents) has gates before a score, whole-metro screening, trade areas,
a map, a per-site report with evidence per row, a pipeline; Kenil's point was the gap in kind,
not that Waterways is the ideal ("that also has a lot of ai slop").

**The evidence** (`../design/research/research-before-build.md`, four research passes with
sources): models fill unspecified requirements silently 41% of the time and that is the default
failure; research before building measurably helps only when its output is checked (deep
research agents dead-link or invent about 11% of their URLs; 85% of errors in multi-agent
research come from the merge); goal questions lose nearly all value after about 10% of the
work; people tolerate about 4–7 specific questions with choices, and a bad question is worse
than none; no builder on the market researches alternatives before proposing; product people
pre-keep the table stakes, offer differentiators as a few choices with a recommended default,
and name the won't-haves. Kenil accepted the four recommendations (every build ask; the menu
is the plan, one yes; research starts once the job is known; "research pass", not "agent").

## Built (design §6.3)

- **The job first** (`runtime/turn.py` rule 6): who uses it, what decision it serves, what
  happens today, what already exists; as cards with choices, only what isn't known; then
  `research_start(title, ask, job)`, which refuses without the job. The person is told what
  Alpha will look at, that it takes a few minutes, and that they can stop it.
- **The pass** (`world/research.py`, `runtime/research.py`): a `research` row (waiting →
  running → done | stopped | failed) and a thread of kind `research`, run by the scheduler like
  a build (`Scheduler.researches`, `kick` after a turn), from a brief with the ask and the job,
  with no limit; continued from the brief when cut off; waits in its thread when it asks the
  person; fails after three runs without a plan and says so in the conversation. The lead run
  uses `RESEARCH_RULES`: breadth scaled to the ask by rule (a log: one look; a product-like
  thing: products, the trade's practice, open data and tools, and the person's own world).
- **A look** (`research_look`, only inside a pass): an `independent` run with web search and
  `LOOK_RULES` returns findings as JSON, each a claim with the quote and its page; the core
  fetches every page (`resolve_urls`, parallel, a deadline; a 404 or a dead host does not answer,
  a 403 does) and keeps the findings (`findings` table, `resolved` 1 / 0 / NULL for the
  person's own world); journaled as "Looked at <angle>: N findings from M pages, K answered."
- **The plan is a menu** (`world/plans.py`): `plan_propose` works only inside a running pass
  (or to revise a researched plan) and needs `pieces`: title, what, why, evidence (finding
  ids) or `known`, build, can (now / needs / not_yet), needs, recommend (keep / defer / skip),
  kind (kept / choice / wont). `clean_pieces` refuses a piece that cites a finding not read or
  whose page did not answer: the merge is checked by code. The proposal is journaled in the
  conversation that asked; the pass's closing line goes there too. `decide_pieces` takes the
  person's keep / skip / defer by piece id (the tool's `pieces`, the card's `pieces` on
  `/api/plans/{id}/approve`); `decided_words` puts "Build these / Not this time / Skipped"
  into the brief, with whose decision each was; after the build, `build.not_this_time` writes
  the deferred and skipped pieces under "Not this time" on the module's page.
- **Know-how and a verdict**: on done, the findings become a `topic:<slug>` page ("<title>:
  what such things have", pieces by kind with their sources, what was not found); the verdict
  by code is succeeded (every finding's page answered), partial (some dropped) or failed.
- **The window**: the plan card's three blocks (`PlanPieces`), each piece with what it needs,
  how it would be built, its sources as links (`plan_view` attaches the findings' titles and
  pages), Keep / Defer / Skip with Alpha's pick pressed; "N of M pieces kept"; "Build with
  these"; Home's proposal card the same; a research thread's card says "Looking into how this
  is done · a few minutes" with Stop (`POST /api/research/{id}/stop`).
- **The suite**: a `say` settles research passes before builds; `check_research` (state,
  looks, verdict) and `check_plan`'s `pieces_min`, `kinds`, `evidence_min`; a `remove_module`
  step for a journey that asks afresh for something the world already has; the
  `research_pass` journey; `vague_tracker` now answers the job's questions and expects the pass.
- Removal: a module's passes stop and their findings go (`purge.py`).

**Checked.** Core: the gate (a plan only out of a pass; a look only inside one; a start only
from the conversation, with the job), a look's findings resolved by a fake fetch and kept with
their resolution, the fetch rules (404 and a dead host do not answer, 403 does), pieces
refused for unread evidence and bad words, decisions into the brief and the leftovers onto the
page, the app approving with pieces and answers and the card's sources, a pass run end to end
with a fake model (looks, the plan in the conversation, the know-how page, the verdict), a
pass that never proposes failing after three runs, a cut-off run left running, a pass that
asks waiting, stopping from the API, the scheduler picking a pass up, removal, the suite
settling a pass and judging the pieces. 247 core tests, 85 desktop, ruff, mypy strict and
typecheck clean. **Seen in the window's web view** (a core on a scratch world seeded with a
researched plan): the three blocks, the sources as links, "Not yet: a rule computed over
rows", Defer pressed as Alpha's pick, "5 of 10 pieces kept", the running pass's card with Stop.
Chromium, not the WebKit app window: a card of text and buttons, no transforms.

**Run for real** (journey `research_pass`, Sonnet on the subscription, a copy of Kenil's
world). First run, `../journeys/2026-10-09-1347.md`, failed rightly: the copy still had the
morning's module, and Alpha said it already existed. With the module removed first,
`../journeys/2026-10-09-1349.md` passed in 896 s: the turn started the pass at once (the ask
said the job), told him what it would look at and that it runs in the background, and noted
that he had built and removed the same thing today. Three looks (site-selection products;
car wash site selection and lender underwriting practice; open public data for nationwide
scoring), 58 findings from 37 pages, 6 dropped by code because their page did not answer
(verdict partial); the lead then read the actual sources (the Census geocoder; api.census.gov,
"Missing Key"; Overpass, 406; FHWA HPMS; a Texas AADT server). The plan: 13 pieces citing 21
distinct resolved findings. Kept for you: address → location data; demographics (needs a
Census key); AADT near the site; competitor density in 1/3/5-mile rings; a weighted 0–100
scorecard by format; a keyless/unattended flag; a lender-style memo. Your call: lot size,
shape and access as manual input (keep, needs); a zoning and environmental gate as a manual
checklist (keep, not yet); auto-score new Deal Tracker listings (defer, needs: it found his
own module). Not this time: paid foot traffic (Placer.ai, SafeGraph); paid parcel and zoning
data (Regrid); a natural-language "judge the site" evaluator. Nothing was built; the journey
declined the plan.

**Judged against the morning's plan**, honestly: every piece now rests on something Alpha
read, it names what cannot be built from free data and why, it found the Deal Tracker link,
and it proposes a gate (zoning, environmental) at all. But the core is still a weighted
scorecard: no "gates before the score" piece, no trade area as a ring, and seven pieces kept
is more than the lean core the rule asks for; the "keyless/unattended flag" looks like his
8 Oct answer about the Census API read as a feature. The looks' angles decide what the plan
can know: the practice look asked about lender underwriting rather than how operators kill a
site. The pass took fourteen minutes where the words say "a few".

## Left

- The lean core: the rule says it, the first real plan kept seven; measure over the next asks
  before changing the mechanism (a cap would be a knob).
- A piece's buildability (`can`, `needs`) feeding what capability to add next: it is data on
  the plan; nothing reads it yet. Computed things (a gate over a site's values, a score over
  rows) are the first "not yet" the real run named.
- A later pass over a built module that brings "Not this time" back.
- Research starting at once with the job's answers steering the merge (decided, not built:
  the turn asks first and starts the pass on the answers; one mechanism).
- The suite's report keeps only the pieces' titles; the scratch world is cleaned on success,
  so the plan's text is gone with it. Keep the plan's pieces in the report.
- The time words ("a few minutes") against the measured fourteen.
