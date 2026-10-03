# §4.7 Plan first, sources, pipelines, background builds (decided 2 Oct 2026)

*Moved verbatim from `build-plan.md` §4.7 on 3 October 2026, when the dated entries became this log. References elsewhere to "build-plan §4.7" mean this file.*


Why: "i want a live daily tracker capturing all deals from my eta tracker list" (2 Oct) — Alpha
read the person's CSV of 20 broker sites, built a module, 9 tables and 8 readers on its own
guesses, set aside 54 rows over "PENDING" vs "Pending", was told four healthy readers were
broken (the health check compared one reader's rows with the whole table's), copied rows
between tables through the model, and was cut off at 900 s with no automation, no note and no
reply. Rule 5 told it to build first and ask at the end. Kenil's expectations and decisions are
in the design §6 (revision of 2 Oct). The build:

- **Store**: `plans` (id, title, body, state proposed → approved → building → done | stopped |
  declined | replaced, module, thread, turn, approval, attempts, report); `sources` (module,
  title, url, reader, status working | needs_signin | blocked | broken | not_built, detail,
  last_checked, last_rows); `records.reader/seen_at/gone_at`; `automations.steps`.
- **Gate**: `module_create`, `collection_create`, a new `reader_save`, `automation_create` and
  `source_add` refuse unless the turn is a build of an approved plan. `table_start` makes the
  one simplest table for a log with no home, with its first row. `plan_propose` journals the
  plan as a proposal; `plan_approve(plan, quote, answers)` needs the person's words from a
  message after the plan; the app approves with a button (`/api/plans/{id}/approve`).
- **Builds** (`runtime/build.py`): the scheduler starts approved plans in their own thread
  (kicked right after every turn); BUILD_RULES; a run cut off continues from
  the brief *(then: by the time limit, at most four runs; since the same afternoon no time limit
  and no cap, see "No limits" below)*; the report goes into the conversation with a coverage line from
  the sources table.
- **Readers and pipelines** (`runtime/pipeline.py`): one `run_reader` for tools and pipelines;
  health compares with the rows *this* reader returned last time; every healthy run marks rows
  seen and the reader's missing rows gone; choices match regardless of case; steps
  `{"read": reader, "into": table, "key": field, "keep": [...], "map": {field: {from: to}}}`
  and `{"tell": table, "where": {...}}`; a broken step gets one repair turn by the model, then
  one rerun; a sign-in wall asks the person once; a bot check marks the source blocked.
- **Browser**: bot-check pages (challenge titles and markers, captcha frames) come back as
  `bot_check`; reads mark that site's sources needs_signin or blocked.
- **App**: plan proposals in Needs you (Approve / Not now); a module's sources with their status
  in its Settings; build progress on the thread card.

**As built (2 Oct, `f9194aa` … `d734aab`)**, plus what the real runs added: the browser treats
a captcha widget on a form as an ordinary page (only a challenge title, a challenge page's own
marks or a page that is only a captcha is a bot check) and a visible password field as a sign-in;
`reader_save` refuses a reader on a page that shows more pages until Alpha says `whole` (every
page) or not (newest page only, whose rows are never marked gone); sources also have
`unavailable` (nothing to read) and `skipped` (the person's choice); tables fed by readers show a
Seen column (New today, Since, Gone) and hide gone rows; removing a module removes every reader
that fed it. 98 core tests, ruff, mypy strict.

**Real runs** (2 Oct, on copies of Kenil's world with the blind module removed, Sonnet on the
subscription):

1. "i want a live daily tracker capturing all deals from my eta tracker list" → nothing built;
   in 137 s Alpha opened all 20 sites (reading only) and proposed one Listings table, readers that
   page fully and a daily tell, with four questions. Three sites were wrongly called blocked (the
   captcha-widget bug above, then fixed). Rerun after the fix: 162 s, classification right (APS
   and Kumo need a sign-in, Sunbelt a bot check), and it asked whether general brokers' listings
   should be all or only accounting firms.
2. Stand-in answers (mine, not Kenil's: all listings with an accounting mark; skip BizBuySell,
   APS, Kumo, Transworld, Sunbelt, Metro; tell at 7) → `plan_approve` with the quote, 12 s.
3. The build, run as the scheduler would: one run, 737 s. Module ETA Deals, one Deals table (309
   rows from 13 sites, 53 marked accounting), 13 readers, a pipeline of 13 read steps and a tell
   step at 07:00 (no procedure), all 20 sources with a status and a reason, the module note, and
   a report in the conversation ending "Sources: 20 in all — 13 working, 2 need your sign-in, 3
   blocked, 2 not read yet." Found: several readers read only the first page and the report
   admitted it for three other sites only (fixed by the more-pages check); a newest-page reader
   would have marked rows gone daily (fixed by `whole`); dead links were filed as blocked (fixed
   by `unavailable` and `skipped`). The more-pages check finds 4 of the 5 paged sites (not Quiet
   Light).

Then the blind ETA Tracker module was removed from Kenil's world (backup first; 9 tables, 756
rows and 8 readers; its activity stays) and the app restarted for him to ask again.

**No limits; the person stops (2 Oct, after Kenil's first real build stopped on the 80-step
cap with 11 sources to go):** no `--max-turns`, no time limit on a run, no cap on a build's runs.
`claude_cli.LIVE` knows every run by its turn and thread and stops it with its whole process
group; Stop in the conversation (`/api/turns/{key}/stop`) and on a running build's card
(`/api/plans/{id}/stop`); a stopped build reports what it made and resumes on "continue" or
Continue building (`plan_resume`, `/api/plans/{id}/resume`).
