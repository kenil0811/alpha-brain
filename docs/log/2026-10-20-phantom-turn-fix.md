# The desk's phantom turn, fixed (20 Oct 2026, night)

Kenil, on `design/desk-phantom-turn-proposal.md`: "Yes, build the phantom-turn fix as
proposed: the sentence waits for the boundary, and a prompt landing in a running turn belongs
to it. Then rerun two_things_at_once and go_ahead." Q113. Nothing here is committed.

The spike is `2026-10-20-phantom-turn-spike.md`: a prompt that lands while a turn of the desk
runs is taken into that turn. Its prompt hook fires, but it gets no turn and no result of its
own. The desk counted a turn per hook, ran one ahead, and the next sentence waited out the
600 s silence limit.

## Built (`runtime/desk.py`)

- **A sentence waits for the boundary** (`_at_boundary`):
  - the person's sentence is sent only when no turn of the desk runs and none is sent and
    waiting for its hook;
  - meanwhile the window's line for it reads "Alpha is finishing what it was saying"
    (`FINISHING`);
  - one sentence at a time goes to the boundary and is sent (a lock);
  - if the desk's own turn goes silent past the limit while a sentence waits, the client is
    dropped and connected again, and the sentence goes then.
- **A prompt landing in a running turn belongs to it**, never a turn of its own:
  - **a finished piece of work's notification** joins the running turn (`_work_folded`): the
    "Work finished" line as before, and that turn's reply carries the work's id
    (`RunResult.work`, written into the reply's data by `turn.ask`), so its chip shows;
  - **a person's sentence**, if Claude Code began its own turn in the instant it was sent,
    rides that turn: it shares the turn's reply, journaled once as the sentence's reply, and
    sees the reply grow.
- **Stop on a sentence still waiting** withdraws it; the turn running, Claude Code's own, goes
  on. Before, Stop interrupted the client whatever was running.
- **Dropping the client ends every turn waiting on it** (`_end_all`): a turn left queued would
  have taken the new client's first result.

## What ran

- **Tests** (`test_desk.py`, 3 new), with the scripted CLI:
  - case E: work told inside the person's turn is that turn's; its reply carries the work's
    id; the next sentence is answered within 5 s;
  - case D: a sentence typed during the desk's own turn is not sent until that turn ends, the
    window says so, and it then gets its own result;
  - the race: a sentence taken into the desk's own turn is answered by it once.

  All three failed on the desk before the fix (run against it, then put back). Core 470
  passed; lint and types clean.
- **Journeys**, with the real model:
  - `two_things_at_once` passed (`docs/journeys/2026-10-20-2030.md`, 41 s in all; before the
    fix, 613 s for its follow-up alone):
    - the same overlap as in the acceptance run: the work finished during the eggs turn, and
      the eggs reply told its outcome too;
    - the follow-up then took 12.7 s;
  - `go_ahead` passed (`-2031.md`, 52.5 s in all): the first "go ahead" took 9.2 s (before,
    628 s), the second 7.9 s;
  - **the suite's `work` check, corrected:** its "answered while running" had counted the
    reply that started the work ("I've started on it…"). Once the eggs reply carried the
    work's id, it was skipped. The check now asks whether a sentence said while the work ran,
    other than the one that started it, got its reply. Run again on it:
    - `two_things_at_once` passed (`-2034.md`, 42.5 s; "answered meanwhile: You've logged 6
      eggs…"; no turn over 15 s);
    - `work_beside_the_desk` passed (`-2035.md`, 231 s): "15% of 840,000 is 126,000" in 6.1 s
      while the research ran.
- **Not yet:** Kenil's look. The fix is the core's only, so a restart of the core is enough.
