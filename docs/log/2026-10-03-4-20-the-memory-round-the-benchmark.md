# §4.20 The memory round: the benchmark first (3 Oct 2026, early)

*Moved verbatim from `build-plan.md` §4.20 on 3 October 2026, when the dated entries became this log. References elsewhere to "build-plan §4.20" mean this file.*


The decisions are design §3.7 (Q26). First slice: the memory journeys, run before anything
changes so each later slice is measured against them (`journeys/memory_*.yaml`): yesterday
(a seeded exchange dated a day ago), an old fact (178 cm, 63 kg from 1 Oct), a correction
(130 g protein overriding 115), two sources for one person (Alexander Miller: LinkedIn and
his email), who emailed (Sara Ramos: email and the intro on the calendar), a follow-up ("tell
me more about the second one"). The suite gained `seed` steps (a past exchange with a date, a
fact) and a judge that can see the previous exchange (`history`).

**Baseline (3 Oct 12:07, before any memory change, `docs/journeys/2026-10-03-1207.md`): 5 of
6 passed.** Old fact (11 s), correction (22 s), two sources (40 s; LinkedIn headline and
connection date joined with the Fuse Energy email), who emailed (30 s; the Penelope Health
email and the 2 Oct intro), and the follow-up ("tell me more about the second one", 29 s, the
previous list was still inside the recent window) all passed. **Failed: yesterday.** The
seeded promise to Vikas, dated a day back, was pushed out of the recent-turns window by the
evening's many real turns about Vikas Badami, and full-text search ranked those higher; Alpha
answered from a different note. Retrieval has no sense of time: a sentence that names a day
should narrow its matches to that day. That is the first thing the context slice must fix,
and the first number to beat: 5 of 6. (The first run of this baseline lost its report to a
reporting bug on the new `seed` step kind; fixed, and the raw outcomes are now written before
the report.)
