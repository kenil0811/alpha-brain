"""A11 (Q106, 20 Oct 2026): Columbo, Sherlock and Scout start paused; a world made before it has
them paused once, with one line; one set going again looks back to the start of that day."""

from __future__ import annotations

from alpha.runtime.agents import builtin, journal_rowid
from alpha.world.world import World

PAUSED = {"columbo", "sherlock", "scout"}


def states(world: World) -> dict[str, bool]:
    return {a["kind"]: a["on"] for a in world.agents.all() if a["kind"] != "custom"}


def lines(world: World) -> list[str]:
    return [e["text"] for e in world.journal.recent(50, kinds=["changed"])
            if "turn them on from Agents" in e["text"] or "turn it on from Agents" in e["text"]]


def made_before_a11(world: World) -> None:
    """A world whose six were made, all on, before A11 came."""
    builtin.ensure(world)
    for a in world.agents.all():
        if a["kind"] in PAUSED:
            world.agents.update(a["id"], state="on")
    with world.store.tx() as db:
        db.execute("DELETE FROM meta WHERE key = ?", (builtin.PAUSED_ONCE,))


def test_a_fresh_world_makes_the_three_paused_and_the_rest_on(world: World) -> None:
    made = builtin.ensure(world)
    assert {a["kind"]: a["on"] for a in made} == {
        "watson": True, "doc": True, "reminders": True,
        "columbo": False, "sherlock": False, "scout": False}
    assert lines(world) == []  # nothing was paused: they were made so
    assert builtin.ensure(world) == [] and states(world)["scout"] is False and lines(world) == []


def test_a_world_from_before_is_paused_once_and_a_choice_after_it_holds(world: World) -> None:
    made_before_a11(world)
    assert all(states(world).values())
    builtin.ensure(world)
    assert {k for k, on in states(world).items() if not on} == PAUSED
    assert lines(world) == ["Columbo, Sherlock and Scout are paused; turn them on from Agents."]
    scout = next(a for a in world.agents.all() if a["kind"] == "scout")
    world.agents.update(scout["id"], state="on")  # the person sets it going
    builtin.ensure(world)  # the world opens again
    assert states(world)["scout"] is True and len(lines(world)) == 1


def test_only_the_ones_still_on_are_paused_and_named(world: World) -> None:
    made_before_a11(world)
    sherlock = next(a for a in world.agents.all() if a["kind"] == "sherlock")
    world.agents.update(sherlock["id"], state="paused")  # the person paused him already
    builtin.ensure(world)
    assert lines(world) == ["Columbo and Scout are paused; turn them on from Agents."]


def test_set_going_looks_back_to_the_start_of_the_day_never_further(world: World) -> None:
    builtin.ensure(world)
    columbo = next(a for a in world.agents.all() if a["kind"] == "columbo")
    with world.store.tx() as db:
        db.execute("UPDATE agents SET cursor = 0 WHERE id = ?", (columbo["id"],))
    old = [world.journal.append("said", f"an old answer {n}", actor="person") for n in range(3)]
    yesterday = world.journal.rowid(old[-1])
    with world.store.tx() as db:  # all of it came on an earlier day, while it was paused
        db.execute("UPDATE journal SET at = '2026-09-01T09:00:00+00:00' WHERE rowid <= ?",
                   (yesterday,))
    world.journal.append("said", "today's answer", actor="person")
    world.agents.update(columbo["id"], state="on")
    assert world.agents.get(columbo["id"])["cursor"] == yesterday  # today's lines are its own
    # a custom agent set going keeps its cursor: its wake marks say what it looks at (P7)
    mine = world.agents.create("Look at my deals", name="Deal Watch")
    world.agents.update(mine["id"], state="paused")
    world.agents.update(mine["id"], state="on")
    assert world.agents.get(mine["id"])["cursor"] == 0
    # one already further on is never moved back
    world.agents.update(columbo["id"], state="paused")
    world.agents.advance_cursor(columbo["id"], journal_rowid(world))
    world.agents.update(columbo["id"], state="on")
    assert world.agents.get(columbo["id"])["cursor"] == journal_rowid(world)
