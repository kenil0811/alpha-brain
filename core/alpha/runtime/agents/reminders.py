"""Reminders: the built-in agent that owns the rows with a time (18 October 2026).

Kenil: "reminding to call Sara is not a separate agent; the agent would be a reminder agent,
which can handle all such queries." A reminder is the person's task with a moment (the tasks
table's `remind_at`, P1); this agent looks on every tick for the ones whose moment has come
and puts one card each ("Reminder: call Sara." · Done · Tomorrow, same time). Done closes the
task; Tomorrow moves its moment a day on. Nothing else is made: no agent, no schedule.
"""

from __future__ import annotations

from typing import Any

from alpha.runtime import route, turn
from alpha.runtime.agents import Outcome, Work, journal_rowid, register
from alpha.world.world import World

KIND = "reminders"
NAME = "Reminders"
DESCRIPTION = ("Reminders puts a card in front of you when the moment you named comes: a call to"
               " make, a thing to do, a follow-up; Done closes it, Tomorrow moves it a day.")
MAY = ["asks"]


def look(world: World, agent: dict[str, Any]) -> Work | None:
    """A clock, not a cursor: the open reminders whose moment has come."""
    due = world.tasks.due_now()
    about: dict[str, Any] = {"due": [c["id"] for c in due]} if due else {}
    return Work(journal_rowid(world), about)


def run(world: World, agent: dict[str, Any], work: Work | None, *,
        runner: turn.Runner = route.run) -> Outcome:
    del runner  # no model: the card is the work
    if work is None:
        work = look(world, agent) or Work(journal_rowid(world))
    put = []
    for cid in work.about.get("due") or []:
        c = world.tasks.get(cid)
        world.journal.append(
            "asked", f"Reminder: {c['title']}.", actor=agent["id"],
            data={"options": ["Done", "Tomorrow, same time"], "kind": "one",
                  "reminder": cid, "words": c["title"], "agent": agent["id"], "turn": None},
            thread=agent.get("thread"), module=None)
        world.tasks.reminded(cid)
        put.append(c["title"])
    line = ("Reminded you: " + "; ".join(put) + "." if put else "Nothing due.")
    return Outcome("succeeded", None, line, upto=work.upto)


register(KIND, look, run, words={
    "works": "whenever a reminder's moment comes (it looks every half minute while Alpha is"
             " awake, and at the next wake for one that fell due while the Mac slept)",
    "good_run": "every reminder that fell due got its card"})
