# Fast turns: measured first, then the two things the numbers supported (3 October 2026, night)

The checkpoint's item 4: "measure where the 30 s goes (CLI start, tool manifest, rules, pack,
model); cut the tools the model sees per turn; keep sessions warm; answer table questions through
the judge where a rule plus Haiku can." Measured on a fresh copy of Kenil's world (SQLite backup)
before anything changed; the measurements decided what to build.

## Where the time goes

From the journal of the live world (71 turns with timings, 1–3 Oct; `alpha turns` prints this
now): a person's turn took 25 s at the median, the model's own run 23 s of it, and Alpha's
overhead (the pre-pack, the journal, the CLI and the MCP server starting) 1.5 s at the median.
The time is the model's, and it is the steps: turns with one step took 4 s at the median, four
steps 14 s, five 26 s, twelve or more about three minutes. The slowest turns were real work
(sending a draft, reading pages, a build), not slow plumbing.

Timed runs on the copy, sonnet unless said, Alpha's tools and rules attached:
"Say ok" 3.6–4.8 s (haiku 3.6; the floor of a run: the CLI's start, 1.1 s to the first event);
"How many deals are in the Deal Tracker table?" 8.5 s, 2 steps; "What did you do today?" 7.6 s,
1 step; "Which of my LinkedIn connections work at Deloitte?" 13.3 s, 2 steps, 615 output
tokens. Every step reads about 60–68k tokens from the prompt cache (Claude Code's own prompt
about 22k, Alpha's 71 tool schemas about 13k, the rules, the skills and the pack about 6k) in
2–5 s; a fresh run creates about 17k tokens of cache (the part that differs per turn). Output
is what costs: a 2,600-token answer (every EY connection, with false matches) took 28 s fresh
and 22 s resumed in a kept session; "how many are in London" resumed took 8.7 s. The tools are
13k of 60k tokens and cached: cutting them would shorten the first run of a session by a
fraction of a second and no step after it, so **the tool manifest was not cut**, and neither was
the judge put in front of table questions: a judge run costs about the 2 s it would save on a
haiku answer. **Warm sessions exist since the conversations round** (3 Oct morning): a turn in a
live conversation resumes its session; of the 51 person turns measured only 2 resumed because
most were before that round, and today's three were 2 of 3.

## What changed

**Every table with its fields in the pack** (`context/prepack.py`, `table_line`): WHAT ALPHA
HOLDS lists each table as `food_log (5 rows): date date, meal choice[Breakfast|Lunch|…],
calories number kcal, client relation->advisory_clients`, with the current module's tables
first, and rule 4 says to query straight away. Before, a data question paid a
`collection_describe` step first. Kenil's 13 tables take about 2,100 characters.

**A budget per section** (`BUDGET`, `_fit`, `_assemble`): each section keeps whole lines within
its budget and says how many it left out (the conversation, a thread's history and a day's turns
keep their newest lines); when the whole still runs over, sections give up a third of their room
in `SHRINK_ORDER` (the index and the skills first, the matches last) instead of the blind cut of
the tail, which held the matches for the sentence. The cap went from 12,000 to 14,000 characters
(about 500 tokens a turn) because the fields earned it. On Kenil's world the pack is 10.7–13.8k
characters now, nothing cut short; before, a sentence naming a day in a module was cut at the cap.

**`alpha turns` / `just turns`**: the last turns' wall time, the model's time and steps, fresh or
resumed, with medians, from the journal: the numbers STATE quotes are measured here from now on.

## What it did

The same questions after the change, same copy: deals 8.4 s (2 steps, one of them a
`collection_describe` the model chose although the fields were in front of it), what did you do
5.7 s (1 step), Deloitte 12.3 s (3 steps: it queried headline then company, no describe), "how
much protein have I had today" 7.1 s (2 steps, one query, no describe), deals on haiku 6.8 s
(1 step: it read the row count from the pack). Honestly: on one-to-two-step questions the step
count moved little in this sample; the model sometimes describes anyway. The pack is better
(nothing cut, the fields there) and the measurement is repeatable; the latency that is felt is
the model's time per step and the length of its answer.

**What would make a real difference, for Kenil to decide:** (1) the model: haiku halves the
time per step (the fast questions above at 5.8–6.8 s against 8.4) at a cost in judgement on
anything beyond a lookup; a cheap judge run to pick it costs about what it saves; (2) answers
that list (every connection at a firm) cost a second per 70 tokens: a rule to summarise and
offer the list would cut those turns by half; (3) conversations stay live for 30 minutes
(IDLE_CLOSE_S); longer keeps the session warm across a morning at the price Q21 named (a
session remembers what it once believed).

## Judged by the journeys

The whole suite on a copy of the world after the change (`docs/journeys/2026-10-03-2022.md`):
14 of 18 passed. The four that failed, each read against the old pack rebuilt on the same copy:
"a branded food is logged from its label" logged the bar right (240 kcal from the label, the row
checks passed) and failed only the second opinion, which differed on fibre (0.9 g from the
label, 0.3 g from FatSecret): a disagreement between two sources, not the pack. "A question
across Gmail and the network" failed on 2 Oct too; the judge saw no evidence of the reads while
the journal held four. "What was said yesterday": the seeded sentence was not in the old pack
either; the day's section holds the day's first 14 turns and the seed sat beyond the matches'
shared cap, behind the records that matched the name; the model has to search, and did it
twice before (12:07 failed, 12:56 and 13:06 passed). "Sara Ramos" the same: she is not an
entity, no card is possible, the one journal line naming her is in both packs; failed at
12:56, passed at 13:06. None of the four is the pack's doing; the pack's section for the day
and its matches were made better by the look: the journal's hits now have a cap of their own
(`MATCHES * 2`, apart from the records and documents) with 2,200 characters of room, so a
sentence that names a day sees ten of that day's lines about its words, not four. The two
memory journeys run again after that (`docs/journeys/2026-10-03-2048.md`): Sara Ramos passed
(her Penelope Health email and the 2 October intro meeting, with the date); "what was said
yesterday" failed again, the model finding "ok lets track emails then" and not the seeded
promise. That one is open and worth saying plainly: on this world, 2 October's journal holds
dozens of Alpha's own lines about the Vikas readers ("Read 3 with vikas_badami_gmail_search…"),
and a search for the name returns them before the person's one sentence; neither the pack nor
the model's search puts the person's own words first by structure. It goes on the pending list
(the memory round's leftovers), not under this change.
