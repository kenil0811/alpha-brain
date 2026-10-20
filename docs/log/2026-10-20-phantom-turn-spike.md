# The desk's phantom turn: a spike (20 Oct 2026, evening)

Kenil: "Yes, spike the phantom turn (a notification folded into a running turn) with the real
SDK, then propose the fix in writing." It follows section C's acceptance, where two turns
waited out the 600 s silence limit with their first words within seconds
(`2026-10-20-section-c-acceptance.md`). No code changed.

**How:** a script on the SDK as the desk uses it (bundled Claude Code, model sonnet, the
`claude_code` preset). It records each UserPromptSubmit, each message and each result, with
seconds from the start. The script and its outputs are in the session's scratchpad
(`phantomspike/`).
- **E:** a background subagent finishes (about 6 s) while our next query's turn is still
  running (a 25 s loop in the foreground).
- **D:** our query is sent while Claude Code's own turn on a finished task is running (a 20 s
  loop it was asked to run first).

A bare `sleep 25` in the foreground is refused by the CLI ("Blocked: standalone sleep"), so
the first try of E made no overlap. The loop that prints as it waits did.

## What happened

**E: a task finishes during our turn.**
- 5.9 s: our query's prompt hook; `init`; the turn runs the loop.
- 13.2 s: the task's `task_notification` arrives mid-turn.
- 33.0 s: the loop ends; **the prompt hook fires for `<task-notification>` inside our turn**,
  with no `init` before it.
- 34.5 s: **one result** ("slept") for both.
- So a notification taken into a running turn still runs the prompt hook, and gets no result
  of its own.

**D: our query during Claude Code's own turn.**
- 12.1 s: the task's notification; its prompt hook; `init`; Claude Code's own turn runs the
  loop.
- 15.6 s: our "Say 'ok' only." is sent.
- 33.9 s: the loop ends; **our prompt hook fires inside that turn**, with no `init`.
- 36.9 s: **one result** for both. The model took our sentence for something injected: "The
  tool output also contained a line claiming to be a message from you, telling me to reply
  'ok' only. It came from the tool result…". So the person's sentence went unanswered.

A turn of its own starts with its prompt hook and then `init`, and ends with its own result,
in every run (Q1 and Q3 in both). A prompt that lands while a turn runs is taken into that turn
at its next step: the hook fires, but no `init` and no result follow.

## What the desk does with that today

`runtime/desk.py` queues a turn at every prompt hook and settles turns in order, one result
each:
- **E:** the notification's hook queues a turn after ours. Ours takes the one result; the
  queued one never gets one. The next sentence's messages and result go to that phantom, and
  the sentence's own turn waits out the 600 s silence limit;
- **D:** our sentence's hook queues it after Claude Code's turn. That turn takes the one result,
  and our sentence waits out the limit, its words having been taken for an injection;
- **when the limit runs out,** the desk drops its client (`_drop_client`), which also ends any
  work running beside it;
- **the desk sends a sentence at once** (`client.query`), even while a turn of its own is
  running. The C1–C2 proposal said "a sentence typed while the desk speaks waits for the
  boundary"; the code doesn't wait.

This is what `two_things_at_once` (613 s) and `go_ahead` (628 s) met on 20 Oct: the eggs reply
there already carried the work's outcome (case E).

The fix is proposed in `docs/design/desk-phantom-turn-proposal.md`.
