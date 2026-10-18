# 18 October 2026 — harness slice 4a: a time that comes once, and the reminder

The first half of slice 4 (`../design/harness-slice-4-proposal.md`, Kenil's yes in chat with
its three answers: the two buttons are enough, Mac notifications stay later, Sherlock only on
`@Sherlock` or Alpha's call). The design's §9: every trigger it names already exists (time, a
mention, the app opened, a change in the world, a folder, the Mac waking); mail arriving is an
agent like any other, a reader of the signed-in Gmail on a schedule. What was missing was a
time that comes once, for sentence 5 of §17.

## What was built

- **`at 2026-10-24 17:00`** is a schedule (`world/agents.py`: `check_schedule`, `once_at`,
  `next_run`, `describe` → "once, on Saturday 24 October at 17:00"), local time. The agent is
  due from that moment however late the Mac wakes; after its run it is paused with no next
  run, and its item is done.
- **The remind step** (`runtime/pipeline.py`, `{"remind": "call Sara"}`): a run puts one card,
  "Reminder: call Sara.", with Done and "Tomorrow, same time", in the agent's item and so in
  Home's Waiting on you; the run's line is "Reminded you: call Sara." The answer route
  (`api/home.py`): Done closes the card and nothing runs; Tomorrow makes a new `at` 24 hours on
  and turns the agent on again, by code, with a journal line; neither starts a turn.
- **The hand's words** (`agent_keep`): "at …" for once ("on Friday at 5" is that, worked out
  from today's date), and the reminder as the plainest agent.

## Proven by tests

`test_agents`: the schedule parsed, described and refused when not a date; an agent due at a
past once runs once, says "Reminded you", is paused with no next run, its item done, its card
with the two options; Tomorrow makes the next once with no turn; Done closes it. 316 core
tests; ruff and mypy clean.

## Ran for real

`reminder_fires` (fresh world, Sonnet): "remind me to call Sara on Friday" in Home, the agent
made ("Friday 23 October at 09:00; you didn't give a time, so I assumed 09:00"), run now by the
suite (it cannot wait until Friday), the card "Reminder: Call Sara." and the run's verdict: passed
(`../journeys/2026-10-18-1217.md`). `gmail_last_week` (sentence 4) reads Kenil's own account and runs on his say.
