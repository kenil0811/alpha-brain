# 17 October 2026 — harness slice 2b, step 3: the permission callback as the gate

The third of 2b's four steps (`../design/harness-slice-2b-proposal.md`). The design's §8: the
only gate is a permission question on the actions that matter, asked in the window and
answered there, in code, through the SDK's permission callback.

## What was built

- **A turn runs in the SDK's default mode with `can_use_tool`** (`runtime/engine.py`,
  `permission_for`): every hand but the gated ones (`GATED`: `world_change`, `act_outward`) is
  in `allowed_tools` and runs outright; the gated ones reach the callback. Judging and
  independent runs stay in `dontAsk` as before.
- **What asks today:** `world_change` with `remove: true`, the removal of a row of the
  person's tables. The callback puts a card in the journal, "Remove "eggs" from Food log? It
  leaves the table; Activity keeps that it was here.", with Yes / No, in the turn's conversation
  (`data.permission` marks it), and waits. `act_outward` passes through the callback and is
  allowed: its own card is the gate (Q24), and the callback is where the deferred yes goes later.
- **The answer** comes through the window's card as any question's does (`POST
  /api/asks/{id}/answer`): the route sees `data.permission`, resolves the waiting callback
  (`engine.answer_permission`, a registry of futures across threads) and starts no turn; the
  turn that asked carries on with the removal, or with "You said no: nothing changed." as the
  tool's answer. A yes is read from the words (yes, ok, sure, go ahead, remove, do it).
- **A pending yes is not silence:** the run's silence watch skips a run that is waiting on a
  card; the person's Stop ends the wait (the pending future is cancelled with the run; the
  tool's answer says the wait was stopped).
- **Not built, said so:** the deferred yes across a restart (the SDK's `defer`: the hooks page
  says the turn ends with `stop_reason: tool_deferred` and the call can be resumed later, but
  the resume mechanics are on a page not read yet and unverified by a spike), so a card left
  unanswered when the app quits ends with the run; the journal line for every call as a hook
  (the operations' own lines remain the record, richer than a hook's would be).

## Proven by tests

`test_engine.py`: the removal asks on a card in the conversation and waits; the answer from
another thread lets it through (`PermissionResultAllow`) or stops it with the words
(`PermissionResultDeny`); a change that is not a removal and every other hand run at once; an
answer to a card nobody waits for is told so; a turn's options gate the two hands and keep the
judge in `dontAsk`. 326 core tests, lint and types clean.

## Ran for real

LIVE_PENDING
