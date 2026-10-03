# §4.16 The runaway build (2 Oct 2026, 19:51–19:55; fixed 20:10)

*Moved verbatim from `build-plan.md` §4.16 on 3 October 2026, when the dated entries became this log. References elsewhere to "build-plan §4.16" mean this file.*


Kenil: "something is messed up with alpha when it tried to build a module. shut it and debug".
The conversation showed the same stop report nineteen times in four seconds for "Advisory-
relevant attachments from Vikas Badami". The core log and the journal gave two faults:

1. **Every pre-pack crashed from 18:51:28.** Alpha had deleted one row ("Removed Data from
   Vikas Badami Attachments"); `records_delete` journaled the row's values under `removed`,
   the key the removal convention uses for modules and connections, and
   `Journal.removals()` read `removed["name"]` from every such entry. One deleted row, and
   `prepack.build` raised `KeyError: 'name'` on every turn after it: the build's trial, the
   "Continue the build" runs, and Kenil's own "what is going on, take a step back" (the API
   logged `turn failed`). Fixed: `removals()` reads only entries shaped as a removal (kind,
   id, name) and never raises; a deleted row's values ride under `was`; a test deletes a row
   and runs the pre-pack, with an old-shaped entry left in the journal.
2. **The plan card fired two requests per press.** `PlanCard.decide` built the yes request
   eagerly (`const go = client.resumePlan(…)`), so "Leave it" on a stopped plan resumed it
   and declined it at once, and "Not now" on a proposed plan approved it and declined it. The
   decline was refused (the plan was building by then) after journaling "No", the resume
   started a run, the run died on (1) and stopped, and each press repeated it. This card
   has been wrong since it was added on 2 Oct at noon: a plan "declined" in the panel was in
   fact built. Fixed: one request per decision; `decide_proposal` moves the plan's state
   before it journals the answer, so a refused decline leaves nothing; a test.
3. **A crash in the trial left the plan building forever** (the build itself had finished at
   18:51:44). `run_build` now ends such a build as stopped with the reason.

The world after: the plan is `stopped` and can be resumed (the Advisory module, its
attachments table and reader exist; the trial never ran); the nineteen stop reports stay in
the journal, as history does. 128 core tests; lint and types clean; the app rebuilt.
