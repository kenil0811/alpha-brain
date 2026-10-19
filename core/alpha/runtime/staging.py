"""The person's decision on what an agent brought in (P3 items 5–6, Q86, Q91; 19 Oct 2026): yes
lands it where the card says (a file kept as a document of the module chosen), edit-then-yes
lands what was ticked with the person's changes, no stores nothing and deletes a held file. A
standing "Always" for one agent and one place lands its writes at once, as allowed; the card is
still made and decided, so History and Decisions keep every one."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from alpha.connectors.files import Files
from alpha.world import people
from alpha.world.store import Problem
from alpha.world.world import World

STANDING_YES = "Yes (standing permission)"


def land_file(world: World, sid: str, destination: str | None = None) -> dict[str, Any]:
    """A held file kept as a document of the module chosen (its own, unless the person changed
    it), out of the holding folder."""
    s = world.staged.get(sid)
    module = destination if destination is not None else (s.get("module") or None)
    doc = Files(world).take(Path(str(s["path"])), module=module or None,
                            origin=s.get("origin") or "an agent's run", move=True,
                            by=s["drafter"], twin_ok=bool(s.get("duplicate_of")))
    shutil.rmtree(Path(str(s["path"])).parent, ignore_errors=True)
    return world.staged.mark_landed(sid, {"document": doc["id"], "module": module})


def place_words(world: World, s: dict[str, Any]) -> str:
    """Where a batch lands, in words: its table's title, or its module's name."""
    if s["kind"] == "rows":
        return str(world.collections.describe(s["target"]).get("title") or s["target"])
    return str(world.modules.get(s["target"])["name"]) if s["target"] else "your files"


def decide(world: World, sid: str, *, accept: bool, ticks: list[int] | None = None,
           edits: dict[int, dict[str, Any]] | None = None, destination: str | None = None,
           reason: str | None = None, always: bool = False) -> dict[str, Any]:
    """The person's yes or no on a staged card, journaled on the card's own line."""
    s = world.staged.get(sid)
    if not accept:
        world.staged.drop(sid)
        world.journal.answer_proposal(s["card"], False, staged=sid,
                                      **({"reason": reason} if reason else {}))
        return world.staged.get(sid)
    if always and not world.staged.offers_always(sid):
        raise Problem("Always is offered once this agent's writes into this place were said yes"
                      " to unchanged a few times in a row.")
    edited = bool(edits) or (ticks is not None and sorted(ticks) != list(range(len(s["rows"]))))
    if s["kind"] == "file" and destination is not None and destination != (s["module"] or ""):
        edited = True
    landed = (world.staged.land_rows(sid, ticks=ticks, edits=edits) if s["kind"] == "rows"
              else land_file(world, sid, destination))
    if s["kind"] == "rows":
        people.settle_if_changed(world)  # rows of people landed: who may be the same (P8)
    if edited:
        world.journal.answer_proposal(s["card"], True, staged=sid, edited=True)
    else:
        world.journal.answer_proposal(s["card"], True, staged=sid)
    if always:
        agent = world.agents.get(s["drafter"])
        granted = world.permissions.grant_staging(
            agent=s["drafter"], destination=s["target"], source="the card's Always",
            sentence=f"{agent['name']} may keep what it brings into {place_words(world, s)}"
                     " without asking.")
        world.journal.append("changed", f"Standing permission: {granted['sentence']}",
                             actor="person", data={"permission": granted["id"], "staged": sid})
    return landed


def land_if_allowed(world: World, sid: str) -> bool:
    """A batch whose agent has the person's standing yes for that place lands at once, as
    allowed (its card decided by that yes). False when it waits for the person."""
    s = world.staged.get(sid)
    if not world.permissions.for_staging(s["drafter"], s["target"]):
        return False
    if s["kind"] == "rows":
        world.staged.land_rows(sid)
        people.settle_if_changed(world)
    else:
        land_file(world, sid)
    world.journal.answer_proposal(s["card"], True, words=STANDING_YES, allowed=True, staged=sid)
    return True
