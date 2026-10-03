# §4.11 The journey suite (built 2 Oct 2026, evening)

*Moved verbatim from `build-plan.md` §4.11 on 3 October 2026, when the dated entries became this log. References elsewhere to "build-plan §4.11" mean this file.*


Why: every trust mechanism so far checks one answer; nothing re-ran the journeys that matter
after a change, so each "Again!" was found by Kenil using the app. §4.9 item 1.

- **What a journey is**: a YAML file in `journeys/` with `steps` (a `say` as the person, a
  `reader` run, an `automation` run by title, or `build` of the newest plan) and `checks`
  (`independent`: the second opinion on the last turn agrees; `row` / `near`: a row this
  journey added, its source and a value within a tolerance; `no_new_tables`,
  `no_new_modules`, `plan`: nothing lasting before a yes; `reply`; `judge`: a rubric judged by
  a no-tools run; `count`, `reader_health`, `automation`, `journal`). Every step and check is
  timed and says why.
- **Where it runs**: `core/alpha/journeys/suite.py` copies the world with SQLite's backup and
  the browser profiles (minus Chrome's lock files) into a scratch `ALPHA_HOME`, so signed-in
  sites read as the person and the live world is never written. The same `turn.ask`,
  `run_reader`, `automation.run` and `build.run_build` the app uses; builds run to the end as
  the scheduler would. The report is `docs/journeys/<stamp>.md` + `.json`. `alpha journeys
  [names] [--world] [--keep] [--list]`; `just journeys` wraps it in `caffeinate`.
- **The five journeys**: `branded_food` (a 45 g Cadbury Dairy Milk bar: a row not estimated,
  calories within 10% of 240, the second opinion agrees); `vague_tracker` ("keep track of all
  the AI conferences in London this year": no table, no module, a plan proposed, numbered
  questions); `linkedin_sync` (the person's reader reads the whole list: health ok, at least
  95% of its last good count); `gmail_network` ("which of my LinkedIn connections emailed me
  in the last 7 days": Gmail was read, and a judge checks the answer names senders from the
  table or says plainly none / needs sign-in, never invents); `eta_daily` (the pipeline runs
  with no model and reports "Read N of M sources", only sign-in and bot-check problems
  allowed).
- **Tests**: `core/tests/test_journeys.py` runs a journey with a fake model on a copy and
  shows the live world untouched. 115 core tests.
- **First real run** (2 Oct 17:49, Sonnet, a copy of Kenil's world; `docs/journeys/2026-10-02-1749.md`):
  4 of 5 passed in 7½ minutes. Branded food: 240 kcal from fatsecret.com in 33 s, the second
  opinion agreed (58 s in all). Deal pipeline: 15 of 15 sources read with no model, 111 s.
  LinkedIn: 1,551 of 1,551 through the generic driver (Q23 holds on the real site), 147 s.
  Vague tracker: a plan with one source found and numbered questions, nothing built, 59 s.
  Gmail × network: the answer named one connection with what he wrote and excluded three
  senders not in the table; the judge passed it, my `journal` check failed because it matched
  the entry's text for `mail.google.com` while the text says "(google.com, signed in)" (fixed:
  the check now matches the entry's URL). **Found by the run:** the pipeline's tell step
  reported "818 new" on a table of 831 because a first run measured changes from the
  automation's creation, so rows made while the module was built counted as new.
