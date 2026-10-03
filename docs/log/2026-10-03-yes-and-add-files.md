# A plain yes, a plan not asked about twice, and Add files (3 October 2026, late night)

Kenil, from the app at 20:21, after the attachments build: "why is there no button first of
all, also why did it ask me multiple time". What the journal showed, and what changed.

**What happened.** At 20:12 he asked for attachments on Advisory; Alpha proposed; he clicked
Yes on Home at 20:13; the build made the Advisory Attachments table and finished at 20:16. In
the conversation he then wrote "yes every" (answering the plan's question), then "yes", then
"yes build it", and Alpha asked again each time. The approve tool takes a quote of the person's
own words, at least three of them, so Alpha can never approve a plan on words it picked out;
"yes every" and "yes" were under three and refused, and Alpha passed the refusal on as a
question, then as "needs a slightly fuller confirmation". The third try found the plan already
approved and built, which Alpha explained as "the build went through despite the error
messages". Separately: the table had no rows, the file picker lives in a row's file cell, and
the page says "Drop files here" only once a drag has started, so there was no visible way to
put the first file in; Alpha, asked, guessed "drag it into the chat", which is not where it goes.

**A whole-message yes counts** (`mcp/tools/base.py`, `_persons_words`). A quote that is the
person's entire message, however short ("yes", "go ahead"), is their words; a short quote that
is only part of a longer message is still refused, as before.

**An approved plan says so** (`mcp/tools/planning.py`, `plan_words`). `plan_approve` looks at
the plan's state before the quote: approved, building, done, declined or stopped come back with
when and how ("Already approved (Approved in the app, Sat 3 Oct 20:13); its build starts on its
own. Nothing to approve again: tell the person it is on its way."), never as a refusal.

**Add files** (`modules/ModulePage.tsx`). A button on every module's page opens the Mac's
picker; what is chosen takes the same route as a drop (kept for the module, made documents,
read by Alpha into the tables in a turn that follows). An empty table with a file field says
so: "Nothing here yet. Add files with the button above, or drop them on the page; Alpha keeps
each as a row here."

**Not changed, noted for the pending list.** After his "drop pdf" turn, noticing kept two
suggested facts about him that are session state, not facts (`using_module = Advisory`,
`working_with_data = RestoPros client financials`); they showed in Needs you and in the
companion's bubble. Noticing needs a rule, by mechanism, for what a fact about a person is.

**Checked.** Core: a plain yes approves, an approved plan is not asked about again (approved,
then done), a partial short quote is still refused; 200 core tests. Desktop: the button opens
the picker and sends what was chosen the way a drop does, with the notice; 74 desktop tests.
The app rebuilt and restarted at 21:17; a window screenshot (WebKit, the real app) shows Advisory with the Add files button in its head beside the App · Activity · Settings toggle, and the Advisory Attachments table holding the A/R Aging Summary Kenil had put in by then.
