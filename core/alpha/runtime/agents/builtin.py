"""Alpha's own agents (design Q44, Q50): each kind registers its frame when imported here, and
`ensure` makes its row in a world the first time that world opens with the kind built. A
built-in row is never deleted; the person renames it, pauses it, and edits its brief. Its
cursor starts where the journal ends: nothing before its birth is its business (Watson's
refiling of the facts kept before it is the one exception, and it says so)."""

from __future__ import annotations

from typing import Any

from alpha import config
from alpha.runtime.agents import columbo, doc, journal_rowid, reminders, scout, sherlock, watson
from alpha.world.store import now
from alpha.world.world import World

# kind → name, description, write list (the default brief is config/briefs/<kind>.md), and
# whether it starts paused: Columbo, Sherlock and Scout wait for the person to turn them on
# (A11, Q106), Watson, Doc and Reminders work from the start
BUILTIN: list[dict[str, Any]] = [
    {"kind": watson.KIND, "name": watson.NAME, "description": watson.DESCRIPTION,
     "may": watson.MAY},
    {"kind": doc.KIND, "name": doc.NAME, "description": doc.DESCRIPTION, "may": doc.MAY},
    {"kind": columbo.KIND, "name": columbo.NAME, "description": columbo.DESCRIPTION,
     "may": columbo.MAY, "paused": True},
    {"kind": sherlock.KIND, "name": sherlock.NAME, "description": sherlock.DESCRIPTION,
     "may": sherlock.MAY, "paused": True},
    {"kind": scout.KIND, "name": scout.NAME, "description": scout.DESCRIPTION, "may": scout.MAY,
     "paused": True},
    {"kind": reminders.KIND, "name": reminders.NAME, "description": reminders.DESCRIPTION,
     "may": reminders.MAY},
]

# the world's meta key saying the three were paused once (A11): a world made before it has them
# paused when it next opens, one line in Activity; one the person turns on afterwards stays on
PAUSED_ONCE = "builtins_paused_a11"


def ensure(world: World) -> list[dict[str, Any]]:
    """The built-in agents' rows, made once per world; the ones already there are left as the
    person has them, but for the one pause of A11."""
    have = {a["kind"]: a for a in world.agents.all() if a["kind"] != "custom"}
    made = []
    for spec in BUILTIN:
        if spec["kind"] in have:
            continue
        agent = world.agents.create(spec["description"], name=spec["name"], kind=spec["kind"],
                                    may=list(spec["may"]))
        if spec.get("paused"):
            world.agents.update(agent["id"], state="paused")
        world.knowledge.write_note(f"agent:{agent['id']}", "Brief", config.brief(spec["kind"]))
        world.journal.append("made", f"{spec['name']} is here: {spec['description']}",
                             actor=agent["id"], data={"agent": agent["id"]})
        # its cursor starts after its own birth line: nothing before it is its business
        world.agents.advance_cursor(agent["id"], journal_rowid(world))
        made.append(world.agents.get(agent["id"]))
    _pause_once(world, [have[s["kind"]] for s in BUILTIN if s.get("paused") and s["kind"] in have])
    return made


def _pause_once(world: World, before: list[dict[str, Any]]) -> None:
    """A11 on a world that had the three before it: the ones still on are paused, once, with one
    line naming them. A world that never had them (made paused above) only gets the mark."""
    with world.store.tx() as db:
        if db.execute("SELECT 1 FROM meta WHERE key = ?", (PAUSED_ONCE,)).fetchone():
            return
        db.execute("INSERT INTO meta (key, value) VALUES (?, '1')", (PAUSED_ONCE,))
        paused = [a for a in before if db.execute(
            "UPDATE agents SET state = 'paused', next_run_at = NULL, updated_at = ?"
            " WHERE id = ? AND state = 'on'", (now(), a["id"])).rowcount]
    if paused:
        names = [a["name"] for a in paused]
        one = len(names) == 1
        listed = names[0] if one else f"{', '.join(names[:-1])} and {names[-1]}"
        world.journal.append("changed", f"{listed} {'is' if one else 'are'} paused; turn"
                             f" {'it' if one else 'them'} on from Agents.",
                             actor="alpha", data={"agents": [a["id"] for a in paused]})
