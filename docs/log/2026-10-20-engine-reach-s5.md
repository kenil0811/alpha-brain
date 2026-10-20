# Engine reach S5: three agents off by default (20 Oct 2026)

Kenil: "lokos good" (S4 committed as `42d2f16`), then, on the written proposal
([`design/engine-reach-s5-proposal.md`](../design/engine-reach-s5-proposal.md)): "yes", with
both questions as recommended (Q106). S5 is A11, the last slice of section A (Q98). Nothing
here is committed.

## Found before building

- **Sherlock has nothing of his own since 18 Oct.** His look only moves his cursor, and he
  runs only on `@Sherlock`. His brief's "or when Alpha calls it for a big job" has no
  mechanism in the code.
- **Pausing already existed.** The Agents tab's switch and an agent's page (Pause / Set going)
  do it, and the scheduler and the looks skip a paused agent. So no window change was needed.
- **A paused agent's cursor stays where the pause left it.** Set going after a month, Columbo
  would have judged that month's answers in one run.

## Built

- **Made paused.** `runtime/agents/builtin.py`'s list of the six marks Columbo, Sherlock and
  Scout `paused`. A fresh world makes them so, and Watson, Doc and Reminders on as before.
  Their "… is here" lines are unchanged.
- **Paused once on a world made before it.**
  - When such a world opens, the three still on are paused in one transaction with a meta
    mark (`builtins_paused_a11`), the change conditional on each being on.
  - One Activity line, as Alpha's, names the ones paused: "Columbo, Sherlock and Scout are
    paused; turn them on from Agents."
  - The mark keeps it from happening again, so one the person turns on afterwards stays on.
    A fresh world gets the mark with no line.
- **Set going looks back to the start of that day** (question 2). When one of Alpha's own goes
  from paused to on, its cursor moves to the last journal line before the local day began,
  never backwards (`agents.update`, in the same transaction).
  - Columbo checks today's answers, not the backlog.
  - Scout still sees today's opening and picks at the next tick.
  - Custom agents are unchanged: their wake marks (P7) say what they look at.
- **`@Name` and Run now** still run a paused agent (question 1): a pause stops what an agent
  does on its own, never the person's own call. Nothing was deleted.

## What ran

- **Tests:**
  - new: `test_builtins_paused.py` (4): a fresh world's defaults; a world from before
    paused once with its line, and a choice after it holds; only the ones still on are paused
    and named; set going looks back to the day's start, never further, and a custom agent's
    cursor is untouched;
  - `test_scout.py`: Scout made paused picks for the day once set going, after Home's first
    poll (the spec's proof);
  - the tests that ran Columbo's and Scout's looks now set them going first: six failed
    before that, as expected (four in `test_columbo.py`, one each in `test_scout.py` and
    `test_api.py`);
  - core 448 and desktop 240 passed; lint and types clean.
- **Journeys**, on a scratch folder of their own (`TMPDIR`), all passed:
  - the first-day ones on fresh worlds with the three paused: `track_then_log`
    (`docs/journeys/2026-10-20-1242.md`), `watch_from_words` (`-1244.md`) and
    `reminder_fires` (`-1247.md`);
  - `scout_picks_the_day` (`-1248.md`) on a copy of his world. The copy took the one-time
    pause as it opened, and the journey's own step ran Scout as Run now does: "3 picks for
    today (a pattern in your data, something to stop doing by hand)".

## Restart

Restarted on his word ("as usual, restart and let me know what to test"). The core came up at
12:46 BST on the repository's code; the window needed no rebuild (no window change since S4).
His world took the one-time pause as it opened:
- Columbo, Sherlock and Scout paused, and the one line in Activity at 12:46, "Columbo, Sherlock
  and Scout are paused; turn them on from Agents.";
- Watson, Doc, Reminders, Deal Analyst and Email Sender on;
- the meta mark set.

The only errors in the core's log are the known files sync of his granted `~/Desktop/dev`
(UNIQUE path, S3's note). His look is next.

## Kenil's look, and the commit

From his journal (read-only), 12:47–12:52 BST:
- **A paused agent called by name.** He typed "@Sherlock what should I check before buying a
  landscaping business" in Home, with Sherlock paused.
  - The sentence was sent to Sherlock's item, and Sherlock looked into it and answered in
    70 s, fitted to Summit Landscaping in his deal list. He asked three questions on cards.
  - Kenil answered all three together ("Whole business", "Summit only", "Hire or keep a
    manager"). The answers went on as a turn in Sherlock's item, which made a "Summit
    Landscaping checklist" table as he looked.
- **The defaults held:** Columbo, Sherlock and Scout are still paused. He did not set Columbo
  going.
- **Seen, not acted on:** the answers to Sherlock's cards were taken up by Alpha's turn in
  Sherlock's item (the table is Alpha's), not by Sherlock himself. That's how a mention's
  questions are answered today, not something S5 changed.

His word: "looks fine". S5 is committed on it as `15eee6d`.
