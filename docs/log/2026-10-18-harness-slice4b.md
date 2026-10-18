# 18 October 2026 — harness slice 4b: the five built-in agents, quieter

The second half of slice 4 (`../design/harness-slice-4-proposal.md`; Kenil's yes to the four
brief lines in chat). The design's §13: none of the built-in agents writes in the person's
conversation; each change is one mechanism.

## What was built

- **Watson**: his suggested facts leave Needs you (`api/views.py`); they are marked
  *suggested* on the About-you table of the Intelligence page, where Yes and No already were.
  Under Alpha's reply the window shows a folded line, "Watson kept 1 fact · 1 decision": the
  conversation's turns carry `kept` (facts, commitments and decisions whose source is that
  turn; `api/conversation.py`).
- **Columbo** (`runtime/agents/columbo.py`): the correction turn in the person's conversation
  is gone with its prompt (`repair_prompt`). A value that differs from a source stays as Alpha
  wrote it, carries the mark, has a line on Columbo's page, and the person chooses between the
  two sources on a card (as before when Alpha stood by its own); nothing is corrected behind
  their back.
- **Sherlock** (`runtime/agents/sherlock.py`): no triggers of his own; `look` finds nothing
  (the cursor still moves). He looks on `@Sherlock`; Alpha's call as a subagent is not built
  (the SDK's subagents, slice 1's "not built"). What he finds lands on the module's notes as
  before.
- **Scout** (`runtime/agents/scout.py`, `empty_world`): quiet on a world with less than a day
  of the person's turns behind it (`[scout] quiet_days`, a named judgement).
- **Doc**: unchanged. **The briefs**: the four lines agreed in chat, and no others.

## Proven by tests

`test_columbo`: a wrong answer is a card and a mark, never a correction, and no turn runs in
the conversation; the stands-by case the same. `test_sherlock`: an interview under way wakes
nobody; his look is empty and the cursor moves. `test_scout`: an empty world gets no picks; a
day of turns and the opening wakes him. `test_api`: Needs you holds asks and proposals, not
facts; a suggested fact is decided from the table. 314 core tests (the three trigger tests of
Sherlock's went with the triggers); ruff and mypy clean.

## Ran for real

`gmail_last_week` (sentence 4) on a copy of Kenil's world (`../journeys/2026-10-18-1219.md`):
passed by the rubric's sign-in branch only: his copied world has no Gmail sign-in since the
16 Oct reset, and Alpha said so and offered to open Gmail, in prose, without the `connect`
hand's card. The prompt's hands line now says the sign-in goes through `connect`'s card; the
sentence is accepted only when he has signed in to Gmail in the app and it is answered with
the emails named. The quieter agents are seen in the app over his next days, not in a journey.
