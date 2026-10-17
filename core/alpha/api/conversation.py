"""Routes for search, conversations, the companion, turns and threads."""

from __future__ import annotations

import asyncio
import json
import time
from collections.abc import AsyncIterator
from typing import Any

from fastapi import FastAPI, Request
from fastapi.responses import StreamingResponse

from alpha.api.bodies import (
    AskBody,
    ConversationBody,
    MoveBody,
    RenameConversationBody,
)
from alpha.api.served import Served
from alpha.api.views import (
    action_view,
    conversation_view,
    fold_failures,
    needs_you,
    thread_views,
    troubles,
)
from alpha.connectors.files import Files
from alpha.runtime import conversations
from alpha.runtime.running import LIVE
from alpha.world.purge import conversation_removal, remove_conversation
from alpha.world.store import Problem


def routes(app: FastAPI, s: Served) -> None:
    world = s.world
    running = s.running
    api = s.api

    @app.get("/api/search", dependencies=[api])
    def search(q: str) -> dict[str, Any]:
        return {"records": world.collections.search(q, 20), "documents": Files(world).search(q),
                "people": world.entities.find(name=q), "journal": world.journal.search(q, 20)}

    @app.get("/api/conversations", dependencies=[api])
    def list_conversations(module: str | None = None, done: bool = False) -> list[dict[str, Any]]:
        """Live conversations and work items, newest first, for the strip and for Home;
        `done=true` adds the finished ones (the Assistant page's history)."""
        module_id = world.modules.get(module)["id"] if module else None
        return [conversation_view(world, t["id"], t) for t in thread_views(world, done=done)
                if module_id is None or t["module"] == module_id]

    @app.post("/api/conversations", dependencies=[api])
    def new_conversation(body: ConversationBody) -> dict[str, Any]:
        chat = conversations.open_conversation(world, body.title or "New conversation",
                                               body.module)
        return conversation_view(world, chat["id"])

    @app.post("/api/conversations/{cid}/close", dependencies=[api])
    def close_conversation(cid: str) -> dict[str, Any]:
        return conversation_view(world, conversations.close(world, cid)["id"])

    @app.post("/api/conversations/{cid}/focus", dependencies=[api])
    def focus_conversation(cid: str) -> dict[str, Any]:
        world.modules.thread(cid)
        conversations.set_focus(world, cid)
        return {"focus": cid}

    @app.get("/api/companion", dependencies=[api])
    def companion() -> dict[str, Any]:
        """What the companion shows: its focus, the live conversations, what needs the person."""
        current = conversations.focus(world)
        return {"focus": conversation_view(world, current) if current else None,
                "conversations": [conversation_view(world, t["id"], t)
                                  for t in thread_views(world)],
                "needs_you": needs_you(world),
                "troubles": troubles(world),
                "look": world.preferences.get("companion_look")}

    @app.post("/api/turns/{key}/move", dependencies=[api])
    def move_turn(key: str, body: MoveBody) -> dict[str, Any]:
        """A sentence that went to the wrong conversation: say so, and ask it again in the
        right one."""
        state = running.get(key)
        world.modules.thread(body.conversation)
        world.journal.append("changed", f"Moved \"{state['text'][:80]}\" to another"
                             " conversation.", actor="person",
                             data={"turn": state.get("said"), "to": body.conversation})
        return running.start(AskBody(text=state["text"], conversation=body.conversation))

    @app.get("/api/conversation", dependencies=[api])
    def conversation(limit: int = 40, module: str | None = None,
                     conversation: str | None = None) -> dict[str, Any]:
        """A conversation's turns: the one named, else the scope's live one, else (for
        General) the old stream."""
        module_id = world.modules.get(module)["id"] if module else None
        chat = (world.modules.thread(conversation) if conversation
                else world.modules.live_chat(module_id))
        if chat:
            turns_ = world.journal.recent(limit, thread=chat["id"],
                                          kinds=["said", "replied", "failed", "asked"])
        else:
            turns_ = world.journal.recent(limit, stream=True,
                                          kinds=["said", "replied", "failed", "asked"],
                                          module=module_id)
        return {"turns": fold_failures(turns_),
                "conversation": conversation_view(world, chat["id"], chat)
                if chat else None,
                "conversations": [conversation_view(world, t["id"], t)
                                  for t in thread_views(world)],
                "threads": thread_views(world), "running": running.running(),
                "workflows": world.workflows.recent(),
                "actions": [action_view(world, a) for a in world.actions.all(limit=20)],
                "asks": [{"id": a["id"], "text": a["text"], "at": a["at"],
                          "options": a["data"].get("options", []), "thread": a["thread"],
                          "module": a["module"], "turn": a["data"].get("turn"),
                          "derived": bool(a["data"].get("derived")),
                          "choose": a["data"].get("kind") or "one",
                          "hint": a["data"].get("hint")}
                         for a in world.journal.open_asks()]}

    @app.post("/api/ask", dependencies=[api])
    def ask(body: AskBody) -> dict[str, Any]:
        if not body.text.strip():
            raise Problem("Say something first.")
        if body.conversation:
            conversations.name_from_first(world, body.conversation, body.text)
        return running.start(body)

    @app.post("/api/conversations/{cid}/rename", dependencies=[api])
    def rename_conversation(cid: str, body: RenameConversationBody) -> dict[str, Any]:
        """The person's title for a conversation (13 Oct, slice 2 G1)."""
        return conversation_view(world, conversations.rename(world, cid, body.title)["id"])

    @app.get("/api/conversations/{cid}/removal", dependencies=[api])
    def conversation_removal_plan(cid: str) -> dict[str, Any]:
        """What deleting a conversation would do, before it does (C9)."""
        return conversation_removal(world, cid)

    @app.delete("/api/conversations/{cid}", dependencies=[api])
    def delete_conversation(cid: str) -> dict[str, Any]:
        """Delete a conversation from the lists (C9); the journal keeps its turns."""
        return remove_conversation(world, cid)

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
                if state["state"] not in ("running", "routing"):
                    yield line({"type": "done", "turn": state})
                    return
                await asyncio.sleep(0.1)

        return StreamingResponse(events(), media_type="text/event-stream",
                                 headers={"Cache-Control": "no-cache"})

    @app.get("/api/threads/{tid}", dependencies=[api])
    def thread(tid: str) -> dict[str, Any]:
        return {**world.modules.thread(tid), "journal": world.journal.recent(200, thread=tid)}
