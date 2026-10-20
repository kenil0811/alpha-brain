# Section C: the acceptance, as it stands (20 Oct 2026, evening)

Kenil, after C7 was committed (`dcf57b5`): "Yes, run section C's acceptance: the journeys on
the final code, then give me the sentences to type in my app." Then, before his run: "its
fine, lets commit..". So this is written up as it stands: the journeys ran, and his run in the
app is open.

What section C's spec set as the acceptance:
- `two_things_at_once`, rewritten: two unrelated requests in one stream; the first starts
  work, the second is answered while it runs; both outcomes in the stream; a follow-up about
  the first reaches it, or is answered after its outcome; nothing opened;
- `go_ahead`, with one and with two pending cards;
- `tell_me`: an agent's outcome line only with the instruction;
- Kenil in his app: three sentences including one long one, a follow-up, one "go ahead", the
  fold opened once, the companion showing the same; nothing clicked into.

## The journeys, at `70cf96f`

Each ran alone on a fresh world, in a scratch folder of its own, with the real model.

- **`two_things_at_once`** passed (`docs/journeys/2026-10-20-1937.md`):
  - the eggs question was answered while the listings work ran: "You've logged 6 eggs in
    total";
  - that same reply carried the work's outcome ("Your listings are done too. Lakeside Bakery
    is the cheapest per location…"): the work finished during the turn;
  - the follow-up got "The answer hasn't changed: Harbour Car Wash is the most expensive per
    location, at 212,500";
  - nothing was opened, and the judge passed the stream;
  - **but the follow-up's turn took 613 s**, with its first words at 1.0 s. The run before it
    (`-1820.md`) took 7 s for the same sentence. See below.
- **`go_ahead`** passed (`-1948.md`):
  - one site card, then two, answered by "go ahead" in words, three yeses in all, no yes card
    left open;
  - **but the first "go ahead" took 628 s**, with its first words at 9.8 s.
- **`tell_me`** passed (`-2001.md`):
  - one told line ("There's one new listing since my last run: Lakeside Bakery");
  - "Stop telling me about Listing Watch." took one turn, 7.2 s, and nothing more was told.
- **`work_beside_the_desk`** passed (`-2003.md`, 209 s): "15% of 840,000 is 126,000" came in
  5.3 s while the car wash research ran, and no turn was slow.

## Found: a turn that waits out the 600 s silence limit

In both slow turns the reply's first words came within seconds, but the turn ended only after
about 600 s. That is `silence_s`, the limit after which a run with no output counts as hung.
The turn ended "ok" with its reply, so no check failed.

**What it looks like:**
- the desk keeps its turns in the order they began and settles each with the next result
  message (`runtime/desk.py`);
- in `two_things_at_once` the eggs reply already carried the work's outcome. Claude Code took
  the work's notification into the turn already running, not as a turn of its own;
- the desk still queued a turn for that notification, and that turn never gets a result of
  its own;
- the next sentence's messages and result were taken as that phantom turn's, and the
  sentence's own turn waited out the silence limit;
- `go_ahead`'s first "go ahead" fits the same shape.

**Not yet known:** whether Claude Code runs the prompt hook for a notification it takes into a
running turn. The journey worlds of passed runs are cleaned away, so neither run can be
replayed. Settling it needs a spike that makes the overlap happen on purpose. Then the fix is
to bind a notification taken into a running turn to that turn, not queue a turn of its own.
**Open, and put to Kenil.**

## Kenil's run in the app

Not done. His world's journal has no sentence after the C7 restart. The sentences he was
given:
- the London forecast from `api.open-meteo.com` in the background;
- the food log's rows while it runs;
- "go ahead" on the site card;
- "will it rain today?" as the follow-up;
- "Show the work" opened once;
- the companion.

His word: "its fine, lets commit".

## Numbers

Core 467 passed, desktop 240; lint and types clean (at `70cf96f`).
