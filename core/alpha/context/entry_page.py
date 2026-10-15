"""One activity entry's own page (13 Oct, slice 2 D12): the entry as the journal holds it, what
it touched (each with where it opens: a module, a conversation, an agent, a skill, a row of a
table, a goal), and the other steps of the same turn. Something since removed is left out of
what it touched; the entry still says what it was."""

from __future__ import annotations

from typing import Any

from alpha.context.again import failures_view
from alpha.world.store import Problem
from alpha.world.world import World


def _touched(world: World, e: dict[str, Any]) -> list[dict[str, Any]]:
    d = e["data"]
    out: list[dict[str, Any]] = []

    def add(work: Any) -> None:
        try:
            out.append(work())
        except Problem:
            pass  # removed since; the entry's own words still say what it was

    if e["module"]:
        add(lambda: {"kind": "module", "id": e["module"],
                     "name": world.modules.get(e["module"])["name"]})
    # an agent's own thread is the agent's page, not a conversation of its own
    owner = world.agents.of_thread(e["thread"]) if e["thread"] else None
    if e["thread"] and owner is None:
        add(lambda: {"kind": "conversation", "id": e["thread"],
                     "name": world.modules.thread(e["thread"])["title"],
                     "chat": world.modules.thread(e["thread"])["kind"] == "chat"})
    agent = d.get("agent") or d.get("automation") or (owner["id"] if owner else None)
    if agent:
        add(lambda: {"kind": "automation", "id": agent,
                     "name": world.agents.get(str(agent))["name"]})
    for key in ("reader", "procedure", "skill"):
        if isinstance(d.get(key), str):
            add(lambda key=key: {"kind": "skill", "id": d[key],
                                 "name": world.skills.get(d[key])["name"]})
    if isinstance(d.get("collection"), str) and isinstance(d.get("record"), str):
        def row() -> dict[str, Any]:
            world.collections.get(d["collection"], d["record"])  # a Problem if it's gone
            table = world.collections.describe(d["collection"])
            return {"kind": "record", "id": d["record"], "table": d["collection"],
                    "module": table.get("module"), "name": f"A row of {table['title']}"}
        add(row)
    if isinstance(d.get("goal"), str):
        add(lambda: {"kind": "goal", "id": d["goal"],
                     "name": world.knowledge.goal(d["goal"])["text"]})
    return out


def entry_page(world: World, jid: str) -> dict[str, Any]:
    e = failures_view(world, world.journal.mark_removed([world.journal.read(jid)]))[0]
    turn = e["data"].get("turn") or (e["id"] if e["kind"] == "said" else None)
    steps = world.journal.of_turn(str(turn)) if turn else []
    return {**e, "touched": _touched(world, e),
            "steps": [s for s in steps if s["id"] != e["id"]]}
