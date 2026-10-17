"""Trying again (13 Oct, slice 2 D5): what a failure carries says what can be redone, and what
happened after the person tried says how it went. Nothing here is per kind of work: a failure
names the agent (or happened in its thread), the part and row, the action or the turn,
and that is what is redone. A failure that names none of them (Alpha's own note) has nothing
to redo.

`again(world, e)` is what Try again would do, in words, or None; `blocked` says why it can't
when something newer stands in its way. `outcome(world, attempt)` reads the try's result from
the world: the agent's next run, the part's next entry for that row, the conversation's
next reply, the action's state."""

from __future__ import annotations

from typing import Any

from alpha.world.store import Problem
from alpha.world.world import World

RUNNING = "Trying again…"
# Written after the try (journal order, since two entries can share a second).
LATER = "at >= ? AND rowid > (SELECT rowid FROM journal WHERE id = ?)"


def _turn_sentence(world: World, e: dict[str, Any]) -> str | None:
    """The person's sentence a failed turn answered, when that turn never replied. Never a turn
    that replied: asking "log two eggs" again would log four."""
    turn = e["data"].get("turn")
    if not turn or not e["thread"]:
        return None
    steps = world.journal.of_turn(str(turn))
    said = next((s for s in steps if s["id"] == turn and s["kind"] == "said"), None)
    if said is None or said["actor"] != "person":
        return None
    if any(s["kind"] == "replied" for s in steps):
        return None
    return str(said["text"])


def again(world: World, e: dict[str, Any]) -> dict[str, Any] | None:
    """What Try again would redo for this failure: {how, words, asks?, ...what}; `blocked`
    instead of a way when something newer stands in its way; None when nothing can be redone."""
    if e["kind"] != "failed":
        return None
    d = e["data"]
    try:
        if d.get("action"):
            a = world.actions.get(str(d["action"]))
            if a["state"] != "failed":
                return None
            newer = world.actions.newer(a)
            if newer:
                return {"how": None, "blocked": f"Alpha proposed \"{newer['title']}\" again"
                        " after a fix; decide it in Needs you."}
            if not a.get("approval"):
                return {"how": "preview", "action": a["id"],
                        "words": "Makes its preview again; you decide it in Needs you."}
            return {"how": "action", "action": a["id"], "asks": True,
                    "words": f"Does \"{a['title']}\" on {a['site']} again, once."}
        # an agent's failure names it (entries before 15 Oct say "automation"), or happened
        # in its own thread (a reader it ran)
        named = d.get("agent") or d.get("automation")
        agent = (world.agents.get(str(named)) if named else
                 world.agents.of_thread(e["thread"]) if e["thread"] else None)
        if agent:
            return {"how": "agent", "agent": agent["id"],
                    "words": f"Runs {agent['name']} again."}
    except Problem:
        return None  # what it names is gone
    sentence = _turn_sentence(world, e)
    if sentence:
        return {"how": "turn", "thread": e["thread"], "text": sentence,
                "words": f"Asks again: \"{sentence[:80]}{'…' if len(sentence) > 80 else ''}\""}
    return None


def _after(world: World, sql: str, args: tuple[Any, ...]) -> dict[str, Any] | None:
    row = world.store.one(sql, args)
    return {k: row[k] for k in row.keys()} if row else None


def outcome(world: World, attempt: dict[str, Any]) -> dict[str, Any]:
    """How a try went, from what came after it: running, worked or failed, with words."""
    d, at = attempt["data"], attempt["at"]
    how = d.get("how")
    state, words = "running", RUNNING
    try:
        if how in ("agent", "automation"):
            run = _after(world, "SELECT ended_at, verdict, why, line FROM runs WHERE agent = ?"
                         " AND started_at >= ? ORDER BY started_at DESC LIMIT 1",
                         (d.get("agent") or d["automation"], at))
            if run and run["ended_at"]:
                state = "failed" if run["verdict"] == "failed" else "worked"
                words = run["why"] or run["line"] or ""
        elif how == "turn":
            row = _after(world, f"SELECT kind, text FROM journal WHERE thread = ? AND {LATER}"
                         " AND kind IN ('replied', 'failed') AND deleted_at IS NULL"
                         " ORDER BY rowid LIMIT 1", (d["thread"], at, attempt["id"]))
            if row:
                state = "failed" if row["kind"] == "failed" else "worked"
                words = row["text"]
        elif how in ("action", "preview"):
            a = world.actions.get(str(d["action"]))
            if a["state"] == "failed" and a["updated_at"] >= at:
                state, words = "failed", a.get("error") or a.get("preview_note") or ""
            elif how == "action" and a["state"] == "done":
                state, words = "worked", a.get("result") or ""
            elif how == "preview" and a["state"] != "failed" and a.get("preview"):
                state, words = "worked", "Its preview was made; it waits for your decision."
    except Problem:
        state, words = "failed", "What it tried is gone."
    return {"at": at, "state": state, "words": words}


def failures_view(world: World, entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Each failure with what Try again would do and how the latest try went (others as they
    are)."""
    failed = [e for e in entries if e["kind"] == "failed"]
    tries = world.journal.tries([e["id"] for e in failed])
    for e in failed:
        e["again"] = again(world, e)
        e["tried"] = outcome(world, tries[e["id"]]) if e["id"] in tries else None
    return entries
