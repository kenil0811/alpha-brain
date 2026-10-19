# Engine reach, S1: sessions that survive, query totals, tool search (19 Oct 2026, night)

Kenil parked P4/P10 ("leave that, I want to work in this instead") and sent "open the engine's
reach", A1–A12: walls on reach go, the four gates stay. The proposal
(`design/engine-reach-proposal.md`) kept his spec word for word and checked each "Today"
against the code. He agreed: "A7 - let it talk to network, others are good" (Q98). S1 is A12,
A5, A8 and A1's proof. Nothing here is committed.

The memory named an earlier proposal for this list (`fences-down-proposal.md`) that was found
nowhere, on disk or in any session; the new one replaced it, and the memory says so.

## A12: a session survives everything but a change of hand names

- **The fingerprint is the hands' names alone** (`mcp/inprocess.fingerprint_of`). Before, it
  hashed each hand's name and signature. So the spec's "a docstring edit resets sessions" was
  already not true, but an optional parameter added did reset them, and P5, P7 and P8 each
  reset every open conversation today. One last reset comes with this change, since the
  fingerprint's form changed.
- **A fresh session carries what was going on.**
  - When the names do change, the turn's sentence to the model starts with "What was going on
    before the tools changed:" and the conversation's checkpoint. The journal keeps the
    person's own words.
  - The checkpoint is Watson's: what the conversation decided and what is open. It is now kept
    as a note (`conversation:<thread>`, "Checkpoint"), a new note scope that the knowledge
    index never lists and a removed conversation takes with it.
  - It is reused when there is one and written (one model call) only when there is none
    (Q98). It runs on the turn's own runner, so tests and journeys never reach the real model
    through it.
  - The spec said this note "exists for PreCompact". It didn't: the PreCompact hook only notes
    a step, so the note is new.
- **A journey step `tools_change`** changes the names between two turns, for the proof journey
  `carries_over_a_tool_change`.

## A5: a query names its total

`world_query(sql, limit=1000, offset=0)`:
- the result carries `total` (a count over the same query) and `offset`, and says "N more; ask
  again with offset M for the rest" when there is more;
- `limit` has no cap;
- the default of 1,000 is the existing `limits.toml [views] query_rows`, changed from 200 with
  its why (no new entry).

## A8: tool search on

- **The spike** (`track_then_log` on a fresh world, once with `ENABLE_TOOL_SEARCH` off and once
  on): both passed, and the hands were still found and called (the table made, the chart list
  kept, the row added with its source).

  | Input tokens per turn | Turn 1 | Turn 2 |
  |---|---|---|
  | Off | 111,744 | 111,796 |
  | On | 104,941 (−6%) | 76,377 (−32%) |

  One step more per turn (the look-up). Turn 1 took 18.2 s against 16.0 s, turn 2 9.1 s
  against 11.2 s. First words in 7.9 s and 9.9 s, against 8.6 s and 11.9 s.
- **Tokens are recorded now.** `engine.result_data` keeps the result's usage, and every reply's
  journal line carries `tokens_in` (input with the cache read and written) and `tokens_out`, so
  "before and after" is measured from the journal.
- `environment()` now sets `"true"`.

## A1

`models.toml` stays as it is (`fadcf46`). Its proof is the first-day journeys below.

## What ran

- **Tests:**
  - `test_session_carry.py` (3): the fingerprint ignores docstrings and parameters but not a
    hand added; a fresh session starts with the checkpoint, the journal keeping the person's
    words, and a second change of names makes no second model call; a reply records its
    tokens;
  - `test_hands.py`: a 1,553-row query returns 1,000 rows with total 1,553 and pages by offset;
  - the engine's environment test.
  - Core 423 passed; lint and types clean.
- **Journeys**, each alone on a fresh world with tool search on, all passed:
  - `track_then_log` (`docs/journeys/2026-10-19-1918.md`);
  - `watch_from_words` (`-1919.md`);
  - `reminder_fires` (`-1921.md`);
  - `carries_over_a_tool_change` (new, `-1922.md`): the names changed between two turns, and
    the second named Dune, Piranesi and the Books table without asking again. The journey
    world wasn't kept, so which carried them (the checkpoint or the conversation in the
    pre-pack) isn't shown there; the unit test shows the checkpoint carried.
  - `sync_from_words` and `gmail_last_week` touch Kenil's accounts: on his say.

## Left

- **A rebuild and a restart on his yes.** His open conversations start one fresh session each
  (the fingerprint's form changed), carrying their checkpoint.
- **S2:** A2 (its spike), A4, A3.

## Kenil's look (19 Oct, night)

After the rebuild and restart on his yes, he tried the sample sentences in his app: "ok its
fine". Then he sent section B ("the prompt and the context"); its proposal
(`design/prompt-and-context-proposal.md`) was agreed with all nine questions as recommended
(Q99), the first being to commit S1 before B starts. Committed on that word.
