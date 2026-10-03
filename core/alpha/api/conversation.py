"""Routes for Activity, search, conversations, the companion, turns and threads."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI

from alpha.api.bodies import (
    AskBody,
    ConversationBody,
    MoveBody,
)
from alpha.api.served import Served
from alpha.api.views import (
    action_view,
    conversation_view,
    needs_you,
    thread_views,
)
from alpha.connectors.files import Files
from alpha.runtime import conversations
from alpha.world.store import Problem


def routes(app: FastAPI, s: Served) -> None:
    world = s.world
    running = s.running
    api = s.api

    @app.get("/api/activity", dependencies=[api])
    def activity(limit: int = 100, module: str | None = None, q: str | None = None,
                 kind: str | None = None) -> list[dict[str, Any]]:
        if q:
            return world.journal.search(q, limit)
        module_id = world.modules.get(module)["id"] if module else None
        kinds = [kind] if kind else None
        return list(reversed(world.journal.recent(limit, module=module_id, kinds=kinds)))

    @app.get("/api/search", dependencies=[api])
    def search(q: str) -> dict[str, Any]:
        return {"records": world.collections.search(q, 20), "documents": Files(world).search(q),
                "people": world.entities.find(name=q), "journal": world.journal.search(q, 20)}

    @app.get("/api/conversations", dependencies=[api])
    def list_conversations(module: str | None = None) -> list[dict[str, Any]]:
        """Live conversations and work items, newest first, for the strip and for Home."""
        module_id = world.modules.get(module)["id"] if module else None
        return [conversation_view(world, t["id"], t) for t in thread_views(world)
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
                                          kinds=["said", "replied", "failed"])
        else:
            turns_ = world.journal.recent(limit, stream=True,
                                          kinds=["said", "replied", "failed"], module=module_id)
        return {"turns": turns_, "conversation": conversation_view(world, chat["id"], chat)
                if chat else None,
                "conversations": [conversation_view(world, t["id"], t)
                                  for t in thread_views(world)],
                "threads": thread_views(world), "running": running.running(),
                "plans": world.plans.recent(),
                "actions": [action_view(world, a) for a in world.actions.all(limit=20)],
                "asks": [{"id": a["id"], "text": a["text"], "at": a["at"],
                          "options": a["data"].get("options", []), "thread": a["thread"],
                          "module": a["module"]} for a in world.journal.open_asks()]}

    @app.post("/api/ask", dependencies=[api])
    def ask(body: AskBody) -> dict[str, Any]:
        if not body.text.strip():
            raise Problem("Say something first.")
        return running.start(body)

    @app.get("/api/turns/{key}", dependencies=[api])
    def turn_state(key: str) -> dict[str, Any]:
        return running.get(key)

    @app.get("/api/threads/{tid}", dependencies=[api])
    def thread(tid: str) -> dict[str, Any]:
        return {**world.modules.thread(tid), "journal": world.journal.recent(200, thread=tid)}
