"""Alpha's own agents (design Q44, Q50): each kind registers its frame when imported here, and
`ensure` makes its row in a world the first time that world opens with the kind built. A
built-in row is never deleted; the person renames it, pauses it, and edits its brief. Its
cursor starts where the journal ends: nothing before its birth is its business (Watson's
refiling of the facts kept before it is the one exception, and it says so)."""

from __future__ import annotations

from typing import Any

from alpha import config
from alpha.runtime.agents import columbo, doc, journal_rowid, watson
from alpha.world.world import World

# kind → name, description, write list (the default brief is config/briefs/<kind>.md)
BUILTIN: list[dict[str, Any]] = [
    {"kind": watson.KIND, "name": watson.NAME, "description": watson.DESCRIPTION,
     "may": watson.MAY},
    {"kind": doc.KIND, "name": doc.NAME, "description": doc.DESCRIPTION, "may": doc.MAY},
    {"kind": columbo.KIND, "name": columbo.NAME, "description": columbo.DESCRIPTION,
     "may": columbo.MAY},
]


def ensure(world: World) -> list[dict[str, Any]]:
    """The built-in agents' rows, made once per world; the ones already there are left as the
    person has them."""
    have = {a["kind"]: a for a in world.agents.all() if a["kind"] != "custom"}
    made = []
    for spec in BUILTIN:
        if spec["kind"] in have:
            continue
        agent = world.agents.create(spec["description"], name=spec["name"], kind=spec["kind"],
                                    may=list(spec["may"]))
        world.knowledge.write_note(f"agent:{agent['id']}", "Brief", config.brief(spec["kind"]))
        world.journal.append("made", f"{spec['name']} is here: {spec['description']}",
                             actor=agent["id"], data={"agent": agent["id"]})
        # its cursor starts after its own birth line: nothing before it is its business
        world.agents.advance_cursor(agent["id"], journal_rowid(world))
        made.append(world.agents.get(agent["id"]))
    return made
