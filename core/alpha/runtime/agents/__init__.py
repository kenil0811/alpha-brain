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


@dataclass
class Outcome:
    """What a kind's run came to, judged by code: the verdict, why, and the line for the log."""
    verdict: str
    why: str | None = None
    line: str | None = None
    model_ms: int = 0


Look = Callable[[World, dict[str, Any]], Work | None]
Run = Callable[..., Outcome]
Mention = Callable[..., Any]

# kind → how it looks for work on a tick (None: only its schedule, an @ or Run now wake it)
LOOKS: dict[str, Look | None] = {"custom": None}
# kind → its own run (a frame in code); a kind without one runs the custom frame
RUNS: dict[str, Run] = {}
# kind → what "@Name …" does in code, if the kind has such a thing ("@Columbo check that");
# it returns None when the sentence is not that, and the model answers as the agent instead
MENTIONS: dict[str, Mention] = {}
# kind → its words for the person's page: `works` (when it looks for work, in place of a
# schedule's words) and `good_run` (what its verdict means); the frame knows, not the window
WORDS: dict[str, dict[str, str]] = {}


def register(kind: str, look: Look | None, run: Run | None = None,
             mention: Mention | None = None, *, words: dict[str, str] | None = None) -> None:
    LOOKS[kind] = look
    if run is not None:
        RUNS[kind] = run
    if mention is not None:
        MENTIONS[kind] = mention
    if words:
        WORDS[kind] = dict(words)


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


def look_and_run(world: World, kind: str, *, runner: Any = None) -> dict[str, Any] | None:
    """What a tick does for one built-in kind, in line: its look since its cursor, a run when
    there is work, the cursor moved. None when the kind has no agent in this world or nothing
    to do. The journey suite and the tests use it where the app's scheduler would."""
    from alpha.runtime.agents import runner as agent_runner

    agent = next((a for a in world.agents.all() if a["kind"] == kind and a["on"]), None)
    look = LOOKS.get(kind)
    if agent is None or look is None:
        return None
    work = look(world, agent)
    if work is None:
        return None
    if not work.about:
        world.agents.advance_cursor(agent["id"], work.upto)
        return None
    kwargs: dict[str, Any] = {"trigger": "event", "work": work}
    if runner is not None:
        kwargs["runner"] = runner
    out = agent_runner.run(world, agent["id"], **kwargs)
    world.agents.advance_cursor(agent["id"], work.upto)
    return out
