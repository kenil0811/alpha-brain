"""Home, the threads, and where a sentence goes (section C, Q107, 20 Oct 2026).

Every sentence the person types is the desk's (`runtime/desk.py`): Home's session, kept open,
with no routing before it. Two cases stay by structure, in the API: an `@Name` reaches that
agent in its own thread (`mentioned` journals the line in Home), and a reply to a card, or its
button, answers that card (the answer routes). The judgement over a roster of items, its
unsure card and the person's corrections went with C4 (until then, slice 3 of 18 Oct). What
is left here: Home, the threads' state and line after a turn (`settle`), the reset when the
core starts (`reset_working`, which also stops work beside the desk left running), and the
items from before C, kept as history (`open_item`, `rename`, `finish`).
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any

from alpha.world.store import Problem
from alpha.world.world import World

log = logging.getLogger(__name__)

FOCUS_KEY = "companion_focus"
# Done items stay on the roster (and on Home) this long after their last turn: a follow-up
# ("make that watch check at 7") continues the item that did the work.
DONE_FOR_H = 24


def title_for(sentence: str) -> str:
    words = " ".join(sentence.split())
    if len(words) <= 60:
        return words[:1].upper() + words[1:]
    cut = words[:60].rsplit(" ", 1)[0]
    return cut[:1].upper() + cut[1:] + "…"


def home(world: World) -> dict[str, Any]:
    return world.modules.home_thread()


def open_item(world: World, sentence: str, module: str | None) -> dict[str, Any]:
    module_id = world.modules.get(module)["id"] if module else None
    return world.modules.open_thread(title_for(sentence), "work", module_id)


UNNAMED = "New conversation"
RESTARTED = "Alpha closed while this ran, so it stopped. Try again to start it afresh."
REMOVAL_GONE = "No longer waiting: Alpha closed before the yes. Ask again if it still matters."


def rename(world: World, cid: str, title: str) -> dict[str, Any]:
    """The person's title for an item (13 Oct, slice 2 G1), kept from then on."""
    thread = world.modules.thread(cid)
    if thread["kind"] == "home":
        raise Problem("Home is Home; it has no other name.")
    clean = " ".join(title.split())
    if not clean:
        raise Problem("A work item needs a title.")
    if clean == thread["title"]:
        return world.modules.retitle(cid, clean, by_person=True)  # named now, even if the same
    renamed = world.modules.retitle(cid, clean[:120], by_person=True)
    world.journal.append("changed", f"You renamed {thread['title']} to {renamed['title']}.",
                         actor="person", thread=cid, module=thread["module"],
                         data={"conversation": cid, "before": thread["title"]})
    return renamed


def name_from_first(world: World, cid: str, sentence: str) -> None:
    """An item started unnamed (+ New) takes its first message's words as its title, unless
    the person named it."""
    thread = world.modules.thread(cid)
    if thread["kind"] == "work" and not thread.get("titled") and thread["title"] == UNNAMED:
        world.modules.retitle(cid, title_for(sentence), by_person=False)


def finish(world: World, cid: str, why: str = "done") -> dict[str, Any]:
    """An item is over (the person's Done): its state; its session and its turns stay."""
    thread = world.modules.thread(cid)
    if thread["kind"] == "home":
        raise Problem("Home never closes.")
    if thread["state"] in ("done", "stopped"):
        return thread
    world.modules.update_thread(cid, state="done")
    world.journal.append("changed", f"Closed \"{thread['title']}\" ({why}).",
                         actor="alpha" if why != "done" else "person",
                         data={"conversation": cid, "why": why}, thread=cid,
                         module=thread["module"])
    if focus(world) == cid:
        set_focus(world, None)
    return world.modules.thread(cid)


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


# ---- the companion's focus: the item a sentence last went to ----


def focus(world: World) -> str | None:
    row = world.store.one("SELECT value FROM meta WHERE key = ?", (FOCUS_KEY,))
    if row is None:
        return None
    try:
        return world.modules.thread(row["value"])["id"] if row["value"] else None
    except Exception:
        return None


def set_focus(world: World, cid: str | None) -> None:
    with world.store.tx() as db:
        db.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", (FOCUS_KEY, cid or ""))


# ---- the roster ----


def mentioned(world: World, sentence: str, tid: str) -> dict[str, Any]:
    """A sentence typed in Home to one of the person's agents by name ("@Deal Analyst ...")
    goes to that agent's own item, said in Home like a routed sentence and the focus moved
    there (19 Oct 2026: the agent's answer sat in its item, and Home showed nothing)."""
    return _settled(world, sentence, tid, "mention", world.modules.home_thread())


def _settled(world: World, sentence: str, tid: str, by: str, home_row: dict[str, Any], *,
             opened: bool = False) -> dict[str, Any]:
    """Where an `@Name` went, journaled in Home (the stream shows its sentence and the agent's
    answer from it, Q107), and the focus moved."""
    here = tid == home_row["id"]
    title = world.modules.thread(tid)["title"]
    if opened:
        text = f"Started a work item for \"{sentence[:80]}\": {title}."
    elif here:
        text = f"Answering \"{sentence[:80]}\" here."
    else:
        text = f"Sent \"{sentence[:80]}\" to {title}."
    data: dict[str, Any] = {"routed": tid, "sentence": sentence, "opened": opened, "by": by}
    world.journal.append("did", text, actor="alpha", data=data, thread=home_row["id"])
    set_focus(world, None if here else tid)
    return {"thread": tid, "by": by, "opened": opened, "here": here}
