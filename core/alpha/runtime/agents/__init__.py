"""Agents at runtime (design Q50): a program whose judgement is the model's.

Everything that can be a mechanism is code: when an agent wakes, what it looks at, what it may
touch, what it accepts back, how it reaches the person, what counts as success. The model sits
in the middle and judges. Every kind of agent follows one loop (`runner.run`): wake (the
scheduler's tick or kick, a route, an @) → claim (one run per agent at a time) → gather (only
the state that bears) → judge (the model, when needed, with the kind's rules, the agent's
brief, its notes and the decisions that bind it; its hands cut to its write list) → check (by
code) → write (through the tools, under the agent's name) → reach the person (a line in the
run, a proposal, a question) → verdict, the run row, the cursor.

A kind is a frame in code, registered here: `look(world, agent)` says whether there is work
since the agent's cursor (code only, no model), `run(world, agent, work, ...)` does it and gives
the verdict. `custom` is the generic frame every agent the person makes shares: a pipeline
with no model and, or, the model following the agent's brief. The built-in kinds (Sherlock,
Watson, Columbo, Scout, Doc) arrive with their own slices and register here; a kind that is not
registered is not shown.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from alpha.world.world import World


@dataclass
class Work:
    """What a kind's `look` found to do: the journal rows it looked at (`upto` moves the
    cursor once the run ends) and what the run is about."""
    upto: int
    about: dict[str, Any] = field(default_factory=dict)


Look = Callable[[World, dict[str, Any]], Work | None]

# kind → how it looks for work on a tick (None: only its schedule, an @ or Run now wake it)
LOOKS: dict[str, Look | None] = {"custom": None}


def register(kind: str, look: Look | None) -> None:
    LOOKS[kind] = look


def known(kind: str) -> bool:
    return kind in LOOKS


def journal_rowid(world: World) -> int:
    """Where the journal ends now: what a look covers, and where the next one starts."""
    row = world.store.one("SELECT MAX(rowid) AS n FROM journal", ())
    return int(row["n"] or 0) if row else 0


def since_cursor(world: World, agent: dict[str, Any], kinds: list[str] | None = None,
                 limit: int = 500) -> list[dict[str, Any]]:
    """The journal entries after the agent's cursor, oldest first: the events it has not
    looked at yet."""
    from alpha.world.journal import entry

    args: list[Any] = [int(agent.get("cursor") or 0)]
    where = "rowid > ? AND deleted_at IS NULL"
    if kinds:
        where += f" AND kind IN ({', '.join('?' * len(kinds))})"
        args.extend(kinds)
    rows = world.store.all(f"SELECT * FROM journal WHERE {where} ORDER BY rowid LIMIT ?",
                           (*args, limit))
    return [entry(r) for r in rows]
