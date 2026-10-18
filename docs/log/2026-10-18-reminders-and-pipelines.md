# 18 October 2026 — a reminder is a row, not an agent; an agent's pipeline is its own

Kenil, on the agents and skills pages after slice 6: "reminding to call Sara is not a separate
agent! the agent would probably be like a reminder agent, which can handle all such queries"
and "why do these skills have time associated with them?" Both right; both the same slip, the
"when" leaking into things that hold only the "how".

## What changed

- **A reminder is a row with a moment** (`world/commitments.py`: `remind`, `due_now`,
  `reminded`, `snooze`; columns `remind_at`, `reminded_at`): the person's own commitment with
  the moment to be reminded at, kept in UTC from the local time given. It shows with the
  other commitments due this week in front of Alpha on every turn.
- **One built-in agent, Reminders** (`runtime/agents/reminders.py`, its brief
  `config/briefs/reminders.md`): a clock, not a cursor; on every tick it looks for open
  reminders whose moment has come and puts one card each, "Reminder: call Sara." · Done ·
  Tomorrow, same time; Done closes the commitment, Tomorrow moves its moment a day on
  (`api/home.py`). No agent, no schedule is made for a reminder.
- **The hand**: `world_remember(kind="reminder", text, when)`; the `remind` step of 4a is gone
  and `agent_keep` no longer speaks of reminders. The `at` schedule stays for a genuine one-off
  job. `builtin.ensure` makes Reminders in every world on the next start.
- **An agent's own pipeline is its internals**: its run skill is described by what it does
  ("Reads hn_who_is_hiring_backend into remote_job; tells what changed in remote_job."), never
  by the agent's sentence or schedule (`agents.steps_words`), and the Skills list no longer
  shows it (`/api/intelligence`): the list holds the readers, procedures and shared pipelines.
  The pipeline is on the agent's page and in its file.

## Proven by tests

`test_agents`: a reminder makes no agent; the Reminders agent has nothing until the moment
comes, then one card, put once; Tomorrow moves the moment and closes the card with no turn;
Done closes the commitment; the `at` schedule still runs once; an agent's pipeline says what it
does and is not in the Skills list. 326 core tests; ruff and mypy clean.

## Ran for real

`reminder_fires` (fresh world, Sonnet, `../journeys/2026-10-18-1508.md`, 12 s): "remind me to
call Sara on Friday" in Home made no agent (the model used `world_remember kind reminder`);
the suite brought the moment to now (`due_now`) and ran Reminders: the card "Reminder: Call
Sara.", the run's line "Reminded you: Call Sara." On the way the suite's fresh world had been
given Kenil's module folders along with the browser profiles (a skill naming a module the
world lacked broke the pre-pack): the copy of skills and modules is the world-copy's only now,
and the pre-pack names a stray skill's module by its id rather than failing.
