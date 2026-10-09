# A plan's questions with their choices (9 October 2026)

Kenil, on the first plan proposed on the new Assistant page: "when there are questions, why
give build option? This is not optimal, if there are default, those should be visible". The
plan card said "Answer the questions above in a reply, or build it as proposed" next to two
numbered questions in the reply's prose; "build it as proposed" meant "with my assumptions",
and the assumptions were nowhere on screen. Q36.

**A plan's questions are part of the plan** (`plans.questions`, `plan_propose(questions=…)`,
`plans.answer`, `decided_words`, the brief's "Decided before the build"). Each question has
its text, 2 to 4 choices and Alpha's default, the one it would take if the person just says
build. The person's answers go on the plan by number before the yes (`POST
/api/plans/{id}/approve` with `answers`), and the brief the build reads lists every question
with what was decided: their choice, Alpha's pick kept, or "not answered: decide it sensibly
and say so". The rule tells the model to put its questions there, never in the text.

**Questions left in the text become the plan's questions anyway** (`asking.numbered_questions`,
`plan_questions_from`). When a turn proposed a plan without questions and the reply ends with
numbered ones, the core takes them as the plan's, and the System One seam reads each one's
choices and the plan's own lean ("for now", "or should I pick one myself" means Alpha's pick)
out of the reply; an open question (an address, a name) gets no choices. No ask card is made
for a plan's questions: the plan card carries them.

**The card** (`PlanQuestions`, on the conversation's plan card and on Home's). Each question
with its choices as buttons, Alpha's pick selected and marked, and a line to say it another
way; the button reads "Build with these"; the faint line says whether every question has a
pick or how many have none ("answer it, or build and Alpha decides it sensibly"). A reply
whose numbered questions the card carries shows without them and their lead-in line.

**Where the choices come from, in order.** The model's own, on `plan_propose` (a question with
choices and no default is refused: "give the one you'd take if the person just says build it").
Else, for a question the core read out of the reply: "A or B?" by rule ("Distance in miles or
km?" gives Miles and Km with no model), else the fast seam, which also reads the plan's own
lean as the default when the reply has one. The seam is told twice that it is a parser, not a
participant, after the first real run answered the person's questions in prose instead of
JSON.


**Checked.** Core: a plan proposed with its own questions (a default matched to its choice,
an open one kept), the tool refusing choices without a default, a plan's numbered questions
read out of the reply with the seam's choices and defaults, no ask card for them, the answers
by number and the brief's "Decided before the build" naming their choice, Alpha's pick, or an
open question; approving in the app with answers. Desktop: the card with Alpha's pick
selected, a changed choice and a typed answer sent with "Build with these", the reply
stripped of the questions the card carries. 233 core tests, 84 desktop, lint, mypy and
typecheck clean. **Run for real** on a copy of Kenil's world in the window: "I want to keep
track of my runs…" proposed Running Log with two numbered questions in prose; the card showed
them with choices (Miles / Kilometers; Short scale / Free text per run, from the seam) and "2
questions have no pick yet", since that reply expressed no lean; the first such run had shown
the same card with no choices, because the seam had answered the person's questions in prose
instead of JSON, which is what the parser-not-participant wording and the "A or B?" rule fix.
**The model's own path, run for real** (journey `plan_questions`,
`docs/journeys/2026-10-09-1157.md`, passed, 126 s): asked for a running tracker, the model
first asked miles-or-km as a card; told "Kilometres, and a short scale", it proposed Running
Tracker with one question on the plan itself, "After you log a run, should I show the week's
totals automatically?", with the choices "Show totals automatically after each run" and "Only
when I ask" and the latter as its pick. The journey accepts either shape: questions on the
plan, or asked as cards before it; never prose next to Build it. (Its first run,
`2026-10-09-1155.md`, failed on the journey's own expectation that the plan comes in one turn,
when the model rightly asked first.)
