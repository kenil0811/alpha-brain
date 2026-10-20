"""Routes for search, the stream, the companion, turns and the threads of work."""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import AsyncIterator
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

from alpha.api.bodies import AskBody
from alpha.api.served import Served
from alpha.api.views import (
    action_view,
    asked_by,
    fold_failures,
    needs_you,
    troubles,
)
from alpha.connectors.files import Files
from alpha.runtime import conversations, desk
from alpha.runtime.running import LIVE
from alpha.world.store import Problem
from alpha.world.tasks import TABLE as TASKS


def routes(app: FastAPI, s: Served) -> None:
    world = s.world
    running = s.running
    api = s.api

    @app.get("/api/search", dependencies=[api])
    def search(q: str) -> dict[str, Any]:
        return {"records": world.collections.search(q, 20), "documents": Files(world).search(q),
                "people": world.entities.find(name=q), "journal": world.journal.search(q, 20)}

    @app.get("/api/companion", dependencies=[api])
    def companion() -> dict[str, Any]:
        """What the companion shows besides the stream: what needs the person, what didn't
        work, its look."""
        return {"needs_you": needs_you(world),
                "troubles": troubles(world),
                "look": world.preferences.get("companion_look")}

    @app.get("/api/conversation", dependencies=[api])
    def conversation(limit: int = 60, module: str | None = None,
                     conversation: str | None = None, work: str | None = None) -> dict[str, Any]:
        """The stream (section C, Q107): the person's sentences and the desk's replies in the
        order they happened, the work beside the desk where it started, the cards where they
        arose, and what runs now. `module` narrows it to one module's page; `work` to one
        piece of work. A conversation named that is an agent's own thread is that thread's, as
        before (an agent's page)."""
        home_id = conversations.home(world)["id"]
        named = world.modules.thread(conversation) if conversation else None
        if named and named["id"] != home_id and world.agents.of_thread(named["id"]):
            return thread_view(named)
        module_id = world.modules.get(module)["id"] if module else None
        # the work beside the desk, by its thread (C2), and the conversations from before C:
        # the person's own items, whose sentences and replies are the stream's history (C7)
        desk_work = {t["id"]: t for t in world.modules.items(limit=200)
                     if t.get("session_tools") == "desk-work"}
        older = [t["id"] for t in world.modules.items(limit=200)
                 if t["id"] not in desk_work and not world.agents.of_thread(t["id"])]
        entries = world.journal.recent(limit * 2, threads=[home_id, *older],
                                       kinds=["said", "replied", "failed", "asked", "did"])

        def works_of(e: dict[str, Any]) -> list[str]:
            found = e["data"].get("work")
            return [str(w) for w in (found if isinstance(found, list) else [found] if found
                                     else [])]

        # filtered to one piece of work: the person's sentence that started it comes too
        asked_for = {str(e["data"].get("turn")) for e in entries
                     if work and e["kind"] == "did" and e["data"].get("work") == work}
        kept: list[dict[str, Any]] = []
        for e in entries:
            if e["kind"] == "did" and not (isinstance(e["data"].get("work"), str)
                                           and e["thread"] == home_id):
                continue  # only the line where work started stays (an @Name's comes below)
            if work and work not in works_of(e) and e["id"] not in asked_for:
                continue
            if module_id and e["module"] != module_id and not any(
                    (desk_work.get(w) or {}).get("module") == module_id for w in works_of(e)):
                continue
            kept.append(e)
        if not work:
            kept = sorted([*kept, *mentioned(entries, module_id)], key=lambda e: e["at"])
        kept = kept[-limit:]
        kept = [({**e, "kept": got} if (got := kept_from(world, e)) else e) for e in kept]
        to_agents = {str(e["data"].get("ask")): e["text"] for e in world.journal.recent(
            limit, kinds=["answered"]) if e["data"].get("to")}
        kept = [({**e, "by": asked_by(world, e), "answer": to_agents.get(e["id"])}
                 if e["kind"] == "asked" else e) for e in kept]
        shown = {w for e in kept for w in works_of(e)}
        now = [t for t in desk_work.values() if t["state"] in ("working", "needs_you")
               and (not module_id or t.get("module") == module_id)]
        return {"turns": fold_failures(kept),
                "work": {tid: work_view(t) for tid, t in desk_work.items()
                         if tid in shown or t in now},
                "now": [work_view(t) for t in sorted(now, key=lambda t: t["created_at"])],
                "running": running.running(),
                # every card where it arose (C3): a page drafted, an action proposed, a question
                # asked, by the desk, its work or an agent's run
                "workflows": [w for w in world.workflows.recent()
                              if w["state"] in ("drafted", "agreed", "building")],
                "actions": [action_view(world, a) for a in world.actions.all(limit=20)],
                "asks": asks_view(),
                # the other cards waiting on the person (staged rows, who may be the same, a
                # suggestion, a fact to confirm), shown in the stream where they arose
                "needs": [n for n in needs_you(world)
                          if n["kind"] in ("staged", "pairs", "proposal", "fact")]}

    def mentioned(entries: list[dict[str, Any]],
                  module_id: str | None) -> list[dict[str, Any]]:
        """An `@Name` typed to an agent and its answer, in the stream with the agent's name
        (Q107, question 3): the person asked it directly. The sentence and the answer live in
        the agent's own thread; Home keeps the line that sent it there."""
        out: list[dict[str, Any]] = []
        for e in entries:
            d = e["data"]
            if e["kind"] != "did" or d.get("by") != "mention" or not d.get("routed"):
                continue
            if module_id and e["module"] != module_id:
                continue
            agent = world.agents.of_thread(str(d["routed"]))
            lines = world.journal.recent(12, thread=str(d["routed"]), since=e["at"],
                                         kinds=["said", "replied", "failed"])
            said = next((x for x in lines if x["kind"] == "said"
                         and x["text"] == d.get("sentence")), None)
            if said is None:
                continue
            out.append(said)
            answer = next((x for x in lines if x["kind"] in ("replied", "failed")
                           and x["data"].get("turn") == said["id"]), None)
            if answer is not None:
                name = agent["name"] if agent else "The agent"
                out.append({**answer, "data": {**answer["data"], "agent_name": name}})
        return out

    def work_view(t: dict[str, Any]) -> dict[str, Any]:
        return {"id": t["id"], "title": t["title"], "state": t["state"],
                "last_line": t.get("last_line"), "module": t.get("module"),
                "created_at": t["created_at"], "updated_at": t["updated_at"],
                "live": LIVE.progress_for(t["id"])}

    def asks_view() -> list[dict[str, Any]]:
        return [{"id": a["id"], "text": a["text"], "at": a["at"],
                 "options": a["data"].get("options", []), "thread": a["thread"],
                 "module": a["module"], "turn": a["data"].get("turn"),
                 "derived": bool(a["data"].get("derived")),
                 "choose": a["data"].get("kind") or "one",
                 "hint": a["data"].get("hint"), "by": asked_by(world, a),
                 "permission": a["data"].get("permission")}
                for a in world.journal.open_asks()]

    def thread_view(chat: dict[str, Any], limit: int = 40) -> dict[str, Any]:
        """One thread's own turns: an agent's, on its page."""
        turns_ = world.journal.recent(limit, thread=chat["id"],
                                      kinds=["said", "replied", "failed", "asked"])
        turns_ = [({**e, "kept": kept} if (kept := kept_from(world, e)) else e) for e in turns_]
        to_agents = {str(e["data"].get("ask")): e["text"] for e in world.journal.recent(
            limit, thread=chat["id"], kinds=["answered"]) if e["data"].get("to")}
        turns_ = [({**e, "by": asked_by(world, e), "answer": to_agents.get(e["id"])}
                   if e["kind"] == "asked" else e) for e in turns_]
        return {"turns": fold_failures(turns_), "work": {}, "now": [],
                "running": running.running(),
                "workflows": [w for w in world.workflows.recent()
                              if w.get("conversation") == chat["id"]],
                "actions": [action_view(world, a) for a in world.actions.all(limit=20)
                            if a.get("thread") == chat["id"]],
                "asks": [a for a in asks_view() if a["thread"] == chat["id"]]}

    def kept_from(world_: Any, e: dict[str, Any]) -> dict[str, int] | None:
        """What Watson kept from a turn (slice 4b): the folded line under Alpha's reply."""
        turn_id = e["data"].get("turn") if e["kind"] == "replied" else None
        if not turn_id:
            return None
        counts = {}
        for name, sql in (
                ("facts", "SELECT COUNT(*) AS n FROM facts WHERE source = ?"),
                ("tasks", f"SELECT COUNT(*) AS n FROM records WHERE collection = '{TASKS}'"
                          " AND json_extract(provenance, '$.turn') = ?"),
                ("decisions", "SELECT COUNT(*) AS n FROM decisions WHERE json_extract(evidence,"
                              " '$.source') = ?")):
            try:
                row = world_.store.one(sql, (turn_id,))
            except Exception:
                continue
            if row and row["n"]:
                counts[name] = int(row["n"])
        return counts or None

    @app.post("/api/ask", dependencies=[api])
    def ask(body: AskBody) -> dict[str, Any]:
        if not body.text.strip():
            raise Problem("Say something first.")
        return running.start(body)

    @app.get("/api/turns/{key}", dependencies=[api])
    def turn_state(key: str) -> dict[str, Any]:
        return running.get(key)

    @app.get("/api/turns/{key}/events", dependencies=[api])
    async def turn_events(key: str, request: Request) -> StreamingResponse:
        """A running turn pushed as it happens (16 Oct, the conversation's slice 1, the core's
        part): the words as they are written, the thought, the current step in words, each
        journal step, the state, and the end; one `text/event-stream` per turn, read from the
        live state every tenth of a second and the journal every half second, in process. The
        window falls back to the poll when the stream drops."""
        running.get(key)  # a turn the core doesn't know answers here, before the stream opens

        async def events() -> AsyncIterator[str]:
            def line(event: dict[str, Any]) -> str:
                return f"data: {json.dumps(event)}\n\n"

            seen: dict[str, Any] = {"state": None, "written": 0, "partial": "", "thought": None,
                                    "doing": None, "steps": 0}
            state: dict[str, Any] = {}
            looked = 0.0
            yield ": open\n\n"
            while True:
                if await request.is_disconnected():
                    return
                now = time.monotonic()
                if seen["state"] is None or now - looked >= 0.5:
                    try:
                        state = running.get(key)
                    except Problem:
                        yield line({"type": "lost"})
                        return
                    looked = now
                    if state["state"] != seen["state"]:
                        seen["state"] = state["state"]
                        yield line({"type": "state", "state": state["state"],
                                    "conversation": state.get("conversation"),
                                    "ask": state.get("ask"), "options": state.get("options")})
                    steps = state.get("steps") or []
                    for step in steps[seen["steps"]:]:
                        yield line({"type": "step", **step})
                    seen["steps"] = len(steps)
                    live = state.get("live")
                else:
                    live = LIVE.progress_for(state.get("said"))
                if live:
                    written = int(live.get("written") or 0)
                    partial = str(live.get("partial") or "")
                    if written < seen["written"] or (written == 0 and seen["partial"]):
                        yield line({"type": "text", "reset": True, "text": partial})
                    elif written > seen["written"]:
                        fresh = written - seen["written"]
                        yield line({"type": "text", "delta": partial[-fresh:]})
                    seen["written"], seen["partial"] = written, partial
                    for kind in ("thought", "doing"):
                        if live.get(kind) and live.get(kind) != seen[kind]:
                            seen[kind] = live[kind]
                            yield line({"type": kind, "text": live[kind]})
                if state["state"] != "running":
                    yield line({"type": "done", "turn": state})
                    return
                await asyncio.sleep(0.1)

        return StreamingResponse(events(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache"})

    @app.get("/api/threads/{tid}", dependencies=[api])
    def thread(tid: str) -> dict[str, Any]:
        """A thread with its journal: work beside the desk shows its steps from here ("Show
        the work", C3), with no model call."""
        return {**world.modules.thread(tid), "journal": world.journal.recent(200, thread=tid)}

    @app.post("/api/work/{tid}/stop", dependencies=[api])
    def stop_work(tid: str) -> dict[str, Any]:
        """The person's Stop on a piece of work beside the desk: the SDK stops its task."""
        row = world.modules.thread(tid)
        if row.get("session_tools") != "desk-work":
            raise Problem("That is no piece of work beside the conversation.")
        if not desk.of(world).stop_work(tid):
            raise Problem("That work isn't running.")
        return work_view(world.modules.thread(tid))
