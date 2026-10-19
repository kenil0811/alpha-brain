# The prompt and the context, step 4: measured, before and after (20 Oct 2026, early)

Kenil: "Yes, run step 4: the same seven journeys against the before table, plus my own turns
from just turns, and write both tables into the log." Then, with two of the seven done: "lets
commit and start with s2 for now". The other five run on a frozen copy of this commit; their
table follows in a later entry.

## His own turns in the app (`alpha turns` on a SQLite-backup copy of his world)

The twelve turns since the step-1 restart, the first to keep the token kinds apart (times
UTC):

| When | Session | Input | Cache read | Cache made | Output | First words | Said |
|---|---|---|---|---|---|---|---|
| 21:40 | fresh | 6 | 63,561 | 16,283 | 597 | 9.8 s | log my lunchy |
| 21:41 | fresh | 2 | 11,509 | 13,631 | 304 | 3.2 s | what columns does my Monthly P&L have… |
| 21:57 | resumed | 6 | 87,618 | 3,323 | 826 | 10.5 s | log my lunch |
| 22:13 | fresh | 8 | 96,848 | 16,004 | 762 | 22.8 s | log my breakfast for today |
| 22:13 | resumed | 8 | 121,231 | 1,554 | 974 | 3.3 s | Greek yoghurt granola bowl (1 bowl) |
| 22:33 | resumed | 4 | 52,253 | 17,915 | 416 | 5.6 s | what are my standing instructions |
| 22:34 | resumed | 2 | 13,597 | 14,599 | 248 | 2.0 s | what columns does my Monthly P&L have |
| 22:34 | resumed | 4 | 72,968 | 3,211 | 600 | 7.2 s | what did I say about the Accounting module… |
| 22:50 | fresh | 8 | 104,639 | 13,473 | 703 | 8.8 s | add Lakeside Bakery … to my deal list |
| 22:51 | fresh | 8 | 103,396 | 23,440 | 3,078 | 34.7 s | @deal analyst compare Midwest HVAC and … |
| 23:00 | fresh | 8 | 103,519 | 24,915 | 3,743 | 33.0 s | @Deal Analyst compare lakeside bakery a… |
| 23:01 | fresh | 6 | 69,279 | 20,885 | 1,095 | 11.6 s | just compare whatever you have |

What it shows:
- **A turn in a warm session writes little to the cache:** 1,554 and 3,211–3,323 tokens.
- **A fresh session writes the whole prefix:** 13,000–25,000 tokens. Every turn was fresh at
  first after a restart, and every agent's run is fresh.
- **So does the first turn after the tools' words change:** 22:33 and 22:34 followed the
  step-2 restart, which changed `world_query`'s docstring, and the tools come before the
  system prompt in what is cached.
- Medians over the twelve: input 6, cache read 87,618, cache made 16,004, output 762, first
  words 8.4 s.
- Before step 0 his turns kept one summed number (58,000–85,000 in, S1), which can't be
  split, so there is no "before" of his own.

## The same seven journeys

Done on the committed code before he moved on: `track_then_log` and `watch_from_words`, both
passed. Their numbers are in their console output: two of the reports were overwritten when
the step-3 run wrote a report in the same minute, since the report's name is per minute.
`reminder_fires`, `memory_follow_up` (its follow-up now typed in the same conversation's box,
`here`), `memory_yesterday`, `question_card` and `two_things_at_once` run on a frozen copy.
