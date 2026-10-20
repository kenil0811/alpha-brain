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

## The same seven journeys, before and after

The before run was S1 with step 0, frozen, 19 Oct 21:09–21:18
(`docs/journeys/2026-10-19-2109.md` to `-2118.md`). The after run was section B through
step 3: `track_then_log` and `watch_from_words` on `779c0d5`, the other five on a frozen copy
of `3104bd2`. All seven passed both times; each ran alone on a fresh world, except
`question_card` and `memory_yesterday`, which use a copy of his world. Read from each run's
console output, since two of the after reports were overwritten in the same minute.

| Journey | Turn | Cache read | Cache made | Output | First words | Verdict |
|---|---|---|---|---|---|---|
| memory_follow_up | 1 | 61,156 → 65,258 | 14,056 → 13,024 | 414 → 386 | 8.0 s → 6.1 s | pass → pass |
| memory_follow_up | 2 | 61,622 → 53,822 | 14,292 → 963 | 440 → 339 | 7.0 s → 5.7 s | pass → pass |
| memory_yesterday | 1 | 11,509 → 71,164 | 15,697 → 18,097 | 346 → 839 | 3.9 s → 10.9 s | pass → pass |
| question_card | 1 | 96,235 → 139,790 | 17,938 → 21,348 | 646 → 1,222 | 6.1 s → 22.4 s | pass → pass |
| reminder_fires | 1 | 63,096 → 65,781 | 16,262 → 13,689 | 409 → 337 | 6.8 s → 8.6 s | pass → pass |
| track_then_log | 1 | 61,607 → 99,714 | 15,389 → 17,697 | 859 → 1,105 | 11.9 s → 15.9 s | pass → pass |
| track_then_log | 2 | 61,465 → 97,961 | 14,450 → 10,153 | 803 → 842 | 10.1 s → 13.8 s | pass → pass |
| two_things_at_once | 1 | 288,621 → 257,818 | 29,529 → 28,630 | 4,880 → 4,255 | 1.6 s → 45.2 s | pass → pass |
| two_things_at_once | 2 | 61,470 → 69,500 | 13,956 → 8,241 | 301 → 351 | 6.4 s → 10.3 s | pass → pass |
| two_things_at_once | 3 | 82,659 → 85,626 | 1,174 → 1,757 | 228 → 218 | 4.3 s → 9.9 s | pass → pass |
| watch_from_words | 1 | 284,668 → 344,463 | 37,207 → 36,171 | 3,629 → 4,470 | 35.5 s → 10.2 s | pass → pass |

- **Every turn** (medians): cache read 61,622 → 85,626; cache made 15,389 → 13,689; first words 6.8 s → 10.3 s.
- **A session's first turn** (medians): cache read 63,096 → 99,714; cache made 16,262 → 18,097; first words 6.8 s → 10.9 s.
- **A session's later turns** (medians): cache read 61,546.0 → 77,563.0; cache made 14,124.0 → 4,999.0; first words 6.7 s → 10.1 s.

What it shows, against the spec's expected shape:
- **Cache made from a session's second turn on: down**, the change B was for. The median goes
  from 14,124 to 4,999, and a plain follow-up writes 963 (`memory_follow_up` turn 2) or 1,757
  (`two_things_at_once` turn 3).
  - What a later turn still writes is its own new history: the previous turn's tool results
    and reply, and the turn layer.
  - His own turns agree (above): a warm session writes 1,554–3,323.
- **Input per turn did not go down by thousands: it was already a few tokens.** Uncached input
  is 2–10 a turn before and after. S1 already ran with the SDK's `snapshot` on, which cached
  everything, stale pack included. B's gain is that what is cached is now true (the clock,
  the matches, what changed elsewhere), not fewer tokens.
- **Cache read is up:** median 61,622 → 85,626, and 99,714 on a first turn.
  - The model takes more steps: it looks up what the pre-pack used to hand it (a table's
    fields, a person's contact, the day's journal), and every step re-reads the cached
    prompt and tools.
  - Reads from the cache are the cheap kind, but they are not nothing.
- **First words are later, not sooner:** median 6.8 s → 10.3 s; on a first turn 6.8 → 10.9.
  The same extra look-ups come before the answer starts.
- **What would move it, all proposals, not built:**
  - put a table's fields back into the start layer for the module the session is in (one
    module, not all);
  - give the person card's contact numbers back with the turn layer's one line per person;
  - or measure again once A9 (skills from the filesystem) takes the connectors' 1,095 words
    out of the fixed prompt.

  None is a rule for the model.
