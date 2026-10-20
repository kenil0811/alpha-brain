"""Home and the threads after a turn (section C, Q107, 20 Oct 2026).

Every sentence the person types is the desk's (`runtime/desk.py`): Home's session, kept open,
with no routing before it. Two cases stay by structure, in the API: an `@Name` reaches that
agent in its own thread (`mentioned` journals the line in Home), and a reply to a card, or its
button, answers that card. The judgement over a roster of items went with C4; the items
themselves, their list, names, focus and Done with C7. What is left: Home, the threads' state
and line after a turn (`settle`), and the reset when the core starts (`reset_working`, which
also stops work beside the desk left running and closes the items from before C left open).
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from alpha.world.world import World

log = logging.getLogger(__name__)

# An item from before C left open this long after its last turn is over at the core's start.
DONE_FOR_H = 24


def home(world: World) -> dict[str, Any]:
    return world.modules.home_thread()


RESTARTED = "Alpha closed while this ran, so it stopped. Try again to start it afresh."
REMOVAL_GONE = "No longer waiting: Alpha closed before the yes. Ask again if it still matters."


def reset_working(world: World) -> list[str]:
    """At the core's start no turn is running, so a thread left "working" by a core that died
    is open again: the panel was stuck polling it with Done hidden (found at the 3 Oct
    checkpoint)."""
    # Work beside the desk (section C) lived in the desk's process, which is gone: it stopped,
    # and its thread says so (Try again starts it afresh).
    # Only work that was running: one waiting on a host's card had already ended (Q109: the
    # card holds nothing; Kenil's two finished helpers read "closed while this ran", 20 Oct).
    for t in world.store.all("SELECT id FROM threads WHERE session_tools = 'desk-work'"
                             " AND state = 'working'"):
        world.modules.update_thread(t["id"], state="stopped", last_line=RESTARTED)
        world.journal.append("changed", RESTARTED, actor="alpha", thread=t["id"],
                             data={"work": t["id"]})
    # A removal's card waited on the turn that asked it, gone with the core: it closes, saying
    # so (a host's card holds nothing and stays answerable, Q109).
    for a in world.journal.open_asks():
        if a["data"].get("permission") == "world_change":
            world.journal.close_ask(a["id"], REMOVAL_GONE, actor="alpha", closed="withdrawn")
    reset = [t["id"] for t in world.store.all(
        "SELECT id FROM threads WHERE state = 'working'")]
    for tid in reset:
        world.modules.update_thread(tid, state="open")
    # An item nobody has touched for a day and that no agent owns is over (18 Oct: a build
    # thread of 16 Oct sat "open" on Home under Working).
    since = (datetime.now(UTC) - timedelta(hours=DONE_FOR_H)).replace(microsecond=0).isoformat()
    for t in world.store.all("SELECT id FROM threads WHERE kind = 'work' AND state = 'open'"
                             " AND updated_at < ?", (since,)):
        if world.agents.of_thread(t["id"]) is None:
            # its day stays its own: stopping it now must not make it "done today"
            with world.store.tx() as db:
                db.execute("UPDATE threads SET state = 'stopped', last_line = ? WHERE id = ?",
                           ("Left open; over.", t["id"]))
    if reset:
        n = len(reset)
        world.journal.append(
            "changed", f"Alpha's core started; {n} piece{'s' if n != 1 else ''} of work left"
            " mid-turn " + ("are" if n != 1 else "is") + " open again.",
            actor="alpha", data={"conversations": reset})
    return [str(t) for t in reset]


def settle(world: World, tid: str, *, ok: bool, stopped: bool, last_line: str) -> None:
    """A thread after a turn in it: Home is open again; an item is needs_you when a question
    or a yes waits in it, done when the turn ended well, stopped when it failed or the person
    stopped it; its card's line is the reply's first line or the failure."""
    thread = world.modules.thread(tid)
    if thread["kind"] == "home":
        world.modules.update_thread(tid, state="open", last_line=last_line)
        return
    waiting = any(a["thread"] == tid for a in world.journal.open_asks()) or bool(
        world.store.one("SELECT 1 AS x FROM actions WHERE thread = ? AND state = 'proposed'",
                        (tid,)))
    state = "needs_you" if waiting else "done" if ok else "stopped"
    del stopped  # a stop and a failure are one state; the line says which
    world.modules.update_thread(tid, state=state, last_line=last_line)


def first_line(reply: str) -> str:
    for line in reply.splitlines():
        words = " ".join(line.replace("*", "").replace("#", "").split())
        if words:
            return words[:200]
    return ""


# ---- an @Name ----


def mentioned(world: World, sentence: str, tid: str) -> dict[str, Any]:
    """A sentence typed in Home to one of the person's agents by name ("@Deal Analyst ...")
    goes to that agent's own thread; the line in Home says so, and the stream shows its
    sentence and the agent's answer from it (19 Oct 2026, Q107)."""
    home_row = world.modules.home_thread()
    title = world.modules.thread(tid)["title"]
    data: dict[str, Any] = {"routed": tid, "sentence": sentence, "opened": False,
                            "by": "mention"}
    world.journal.append("did", f"Sent \"{sentence[:80]}\" to {title}.", actor="alpha",
                         data=data, thread=home_row["id"])
    return {"thread": tid, "by": "mention", "opened": False, "here": False}
