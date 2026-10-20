# Engine reach S5: three agents off by default (A11)

*Agreed by Kenil the same day ("yes"), with both questions as recommended (Q106).*

*For Kenil's yes, 20 Oct 2026. A11 was agreed with section A (Q98) as specified
([`engine-reach-proposal.md`](engine-reach-proposal.md)). This says how it will be built,
checked against the code at `764988d`, and the two points the spec leaves open. No code until
his yes.*

## What the code does today

- **All six on.** `runtime/agents/builtin.ensure` makes Watson, Doc, Columbo, Sherlock, Scout
  and Reminders on a world's first open, all on. In his world all six are on.
- **What each of the three does on its own:**
  - **Scout:** the first Home poll of a day writes "Alpha opened for the day". At the next
    tick Scout picks for that day: one model run, once a day, on a world with at least a day
    of his turns.
  - **Columbo:** it gathers what Alpha works out: replies with worked-out values or numbers, a
    part's first filled row, an outward card carrying numbers. About once an hour, one run
    judges each candidate (one small judgement each), then checks the ones that need it. A
    card is checked at once.
  - **Sherlock:** nothing on his own since 18 Oct. His look only moves his cursor, and he
    runs only on `@Sherlock`. His brief's "or when Alpha calls it for a big job" has no
    mechanism in the code.
- **Pausing already exists.**
  - Where: the switch on the Agents tab, and Pause / Set going on an agent's page. Each change
    is journaled "You paused …".
  - What a paused agent does: the scheduler doesn't run it, and its look isn't taken. Its
    cursor stays where the pause left it.
  - What still runs it: Run now and `@Name`, the person's own calls.
- **Home** hides "Scout's picks" when there are none, so no window change is needed. The spec's
  "Resume" is the window's Set going.

## The build

1. **A fresh world** makes Columbo, Sherlock and Scout paused, and Watson, Doc and Reminders on
   as now.
   - Where it's marked: in `builtin`'s list of the six, beside their names and write lists.
   - Their "… is here" lines stay as they are.
2. **An existing world**, once, when it opens:
   - The three, where on, are paused. One Activity line, as Alpha's, names the ones it paused:
     "Columbo, Sherlock and Scout are paused; turn them on from Agents."
   - A mark in the world's meta keeps this from happening again: one he turns on afterwards
     stays on. A fresh world gets the mark at birth, with no line.
3. **Nothing is deleted:** their code, briefs, pages and journeys stay. Run now and `@Name`
   work as before (question 1).
4. **Set going** for a built-in, as question 2 settles.

**Tests:**
- a fresh world has the three paused and the other three on;
- an existing world is paused once, with its line; one set going stays on when the world opens
  again, with no second line;
- Scout set going picks for the day at the next tick after Home's first poll (the spec's
  proof, with a fake runner);
- the tests that run Columbo's, Scout's or Sherlock's looks set them going first (14 places).

**Journeys**, on fresh worlds:
- the first-day ones without the three: `track_then_log`, `watch_from_words`, `reminder_fires`.
  `gmail_last_week` and `sync_from_words` read his accounts, so they run only on his say,
  with section A's acceptance;
- `scout_picks_the_day` still runs Scout through its own step, as Run now does.

**Your look after the restart:**
- the Agents tab shows the three paused, and Activity has the one line;
- Set going on Columbo, then a question whose answer works a number out, and its ✓ or ≠
  appears within the hour;
- Scout has already picked for today in your world, so its next picks come tomorrow morning.

## Questions

1. **`@Name` on a paused agent.** Today it still answers, as Run now still runs it.
   - I'd keep that: a pause stops what an agent does on its own, never your own call.
   - What it means: Sherlock does nothing on his own, so pausing him changes nothing you can
     see. `@Sherlock` still answers.
   - The alternative: a paused agent answers `@` with a line ("Sherlock is paused; turn it on
     from Agents") and doesn't run.
2. **What a built-in looks at when set going again.** Today its cursor stays where the pause
   left it. Columbo set going after a month would judge that whole month's answers in one
   run.
   - I'd have a built-in set going look back to the start of that day, never further:
     Columbo checks today's answers, and Scout still sees today's opening and picks at the
     next tick.
   - Custom agents keep their wake marks (P7) as they are.
   - The alternatives: everything since the pause (today's code), or only from the moment
     it's set going (Scout would then wait for tomorrow's opening).

## After S5: section A's acceptance

As agreed in Q98, once S5 is committed:
- **The journeys:** the five first-day journeys plus `watch_from_words`, with subagents
  allowed. Two of them, `gmail_last_week` and `sync_from_words`, read your accounts, so they
  run on your say.
- **The three new journeys:** a listed fetch, a card for an unlisted host, a page button. All
  have passed (S2, S4).
- **Your four sentences in the app:** "what did Vikas email me about last week", a two-site
  watch, "save this as a CSV in my folder", and "fetch the JSON at <url> and keep it as a
  table", with the card answered once.
- **Measured against before S1:** input tokens per turn and time to first words, on the same
  journeys (S1's spike and B8 have the before numbers).
