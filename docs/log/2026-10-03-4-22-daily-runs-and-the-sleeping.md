# §4.22 Daily runs and the sleeping Mac (3 Oct 2026, morning)

*Moved verbatim from `build-plan.md` §4.22 on 3 October 2026, when the dated entries became this log. References elsewhere to "build-plan §4.22" mean this file.*


**What Kenil saw.** The Activity page: the daily LinkedIn connections run started at 07:20
local, failed its reader three times (10, 100 and 10 rows against 1551 last time) at 07:51,
08:51 and 09:30, repaired it and finished at 09:44; the three other daily automations (due 07:00,
07:30, 08:00) all ran between 09:44 and 09:48. Two hours twenty-four minutes of wall clock for
twenty-four minutes of model time. "Daily runs should not be so difficult."

**What happened, from the journal and `pmset -g log`.**
- **The Mac was asleep.** It went to sleep around 02:00 and woke for two seconds every quarter
  hour (macOS maintenance wakes: 06:07, 06:18, 06:34, 06:49, 07:04, 07:20, 07:36, 07:51, 08:09,
  08:19, 08:35, 08:51, 09:09, 09:20, 09:30 local), then properly at 09:31. The scheduler's tick
  fired inside the 07:20 wake, started the run, and from then on the core, the model process and
  Chrome ran only in those two-second slices: every timestamp in the run falls on a wake
  (07:51:43, 08:51:40, 09:30:23). The scheduler held no sleep assertion of its own, and the
  half-minute wait between ticks is measured on a clock that does not advance in sleep.
- **A page read cut up into two-second slices looks like a broken reader.** The reader scrolls
  the connections list to its end; cut short, it returned 10 and 100 rows, which the health
  check (rightly) refused. Alpha, following the automation's procedure ("if broken, repair"),
  reran the unchanged reader twice an hour apart before looking at the page, then found
  LinkedIn's card classes had rotated and wrote reader v3 (1551 rows). Whether v2 would have
  read the full list on an awake Mac is not known: it was never run awake that morning.
- **One automation at a time.** `Scheduler.tick` ran due automations sequentially, so Deal
  Tracker (15 readers, pipeline, 92 s), Founding Engineer (84 s) and Vikas (8 s) queued behind
  the LinkedIn run for two hours.

**What changed (`runtime/automation.py`, `runtime/pipeline.py`, `mcp/tools.py`).**
- **Runs start only on a properly awake Mac.** Each tick notes the wall-clock time; a tick far
  later than the last (more than three tick intervals) means the Mac slept, and after a gap no
  run starts until a minute has passed without another. A quarter-hour maintenance wake lasts
  seconds, so its tick always follows a gap and starts nothing; on a real wake the due runs
  start within a minute. Quiet conversations still close on every tick. A run due while the
  Mac sleeps therefore happens when it wakes, not in slices across the morning.
- **While anything runs, the Mac is held awake** (`caffeinate -i`, tied to the core's process,
  released when the last run, build or action ends): no dozing off mid-run; closing the lid
  still sleeps, and battery policy is untouched. Alpha cannot wake a sleeping Mac at 07:00
  (that needs a root-level power schedule) and does not try: a run missed in sleep happens on
  waking.
- **Due automations run side by side**, each in its own thread, like builds. The hands already
  take turns on one sign-in profile (the per-profile lock, §4.15), so two runs never open one
  Chrome profile twice; runs on different sites overlap.
- **A broken reader's result says what to do**: don't rerun it unchanged (the same page gives
  the same rows); look at the page now, compare, fix, save, run once; and fewer rows than before
  can also mean the page had not finished loading, so a script that still finds its items on the
  current HTML needs no rewrite. The `reader_run` docstring says the same in one line.
- Tests: the awake gate on a fake clock (asleep, maintenance wake, real wake, settled after a
  minute), and two due automations running together (neither finishes until both have
  started). 148 core tests; lint and types clean.

**Not done / to watch.** Tomorrow's 07:00 runs are the real check: if the Mac is asleep, they
should start within a minute of it waking and all finish within a few minutes of each other,
with no broken-reader lines. Reading LinkedIn's whole list daily is still the gentler-read item
of §4.9/7. The procedure Alpha wrote for the LinkedIn automation still says "retry reader_run"
after a repair, which is right; only the unchanged retries were wrong, and the tool's result now
says so. Not touched: the automation's own know-how (the reader, the procedure), per the rule.
