"""Conversations: live, parallel, routed by structure or the judge, never by name matching."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.runtime import conversations
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world.world import World


def settle(c: TestClient, turn: dict[str, Any]) -> dict[str, Any]:
    """A turn runs in a thread; wait for it the way the app does."""
    import time

    for _ in range(200):
        if turn.get("state") != "running":
            return turn
        time.sleep(0.02)
        turn = c.get(f"/api/turns/{turn['id']}").json()
    raise AssertionError("the turn never finished")


def chat(world: World, title: str, module: str | None = None, *, said: str | None = None,
         asked: str | None = None) -> str:
    module_id = world.modules.get(module)["id"] if module else None
    cid = str(world.modules.open_thread(title, "chat", module_id)["id"])
    if said:
        s = world.journal.append("said", said, actor="person", thread=cid, module=module_id)
        world.journal.append("replied", "Sure.", data={"turn": s}, thread=cid, module=module_id)
    if asked:
        world.journal.append("asked", asked, data={"options": []}, thread=cid, module=module_id)
    return cid


def test_a_sentence_with_one_live_conversation_needs_no_judge(world: World) -> None:
    out = conversations.route(world, "and protein today?",
                              runner=lambda r: (_ for _ in ()).throw(AssertionError("judge")))
    first = out["conversation"]
    assert out["by"] == "new" and world.modules.thread(first)["kind"] == "chat"
    again = conversations.route(world, "anything",
                                runner=lambda r: (_ for _ in ()).throw(AssertionError("judge")))
    assert again["conversation"] == first and again["by"] == "only one"
    assert conversations.focus(world) == first


def test_a_short_reply_goes_to_the_one_conversation_that_asked(world: World) -> None:
    world.modules.create("Nutrition")
    a = chat(world, "Deals today", said="what came in")
    b = chat(world, "Logging the shake", "Nutrition", asked="Which size was the shake?")
    out = conversations.route(world, "330 ml",
                              runner=lambda r: (_ for _ in ()).throw(AssertionError("judge")))
    assert out["conversation"] == b and out["by"] == "answers the open question"
    assert a != b


def test_with_a_real_choice_the_judge_decides_from_the_state(world: World) -> None:
    world.modules.create("Nutrition")
    world.modules.create("Deal Tracker")
    a = chat(world, "Deals today", "Deal Tracker", said="what came in today")
    b = chat(world, "Logging the shake", "Nutrition", said="log a shake")
    conversations.set_focus(world, a)
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        return RunResult(ok=True, reply='{"answer": "Nutrition: Logging the shake",'
                                        ' "confidence": 0.85, "why": "protein"}')

    out = conversations.route(world, "and protein today?", runner=runner)
    assert out["conversation"] == b and out["by"].startswith("judge")
    state = seen[0].sentence
    assert "the one in focus" in state and "Deal Tracker: Deals today" in state
    assert "and protein today?" in state and seen[0].kind == "judge"
    assert conversations.focus(world) == b


def test_when_unsure_the_judge_asks_with_choices_and_the_pick_routes(world: World) -> None:
    world.modules.create("Nutrition")
    world.modules.create("Deal Tracker")
    a = chat(world, "Deals today", "Deal Tracker", said="what came in today")
    chat(world, "Logging the shake", "Nutrition", said="log a shake")
    out = conversations.route(world, "change that to weekly",
                              runner=conversations.fake_runner("Nutrition: Logging the shake",
                                                               0.3))
    assert "ask" in out and len(out["options"]) == 3 and conversations.NEW in out["options"]
    asked = world.journal.read(out["ask"])
    picked = conversations.routed_answer(world, asked, "Deal Tracker: Deals today")
    assert picked == {"conversation": a, "text": "change that to weekly"}
    fresh = conversations.routed_answer(world, asked, conversations.NEW)
    assert fresh and fresh["conversation"] not in (a,) and fresh["text"] == "change that to weekly"


def test_a_conversation_keeps_its_session_while_live_and_drops_it_when_closed(
        world: World) -> None:
    requests: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        requests.append(req)
        return RunResult(ok=True, reply="ok", session_id=f"s{len(requests)}")

    c = TestClient(create_app(world, live=False, runner=runner))
    first = settle(c, c.post("/api/ask", json={"text": "list the top deals"}).json())
    cid = first["conversation"]["id"]
    assert first["conversation"]["scope"] == "General" and requests[0].persist
    assert requests[0].resume is None
    assert world.modules.thread(cid)["session_ref"] == "s1"
    second = settle(c, c.post("/api/ask",
                              json={"text": "tell me more about the second one"}).json())
    assert second["conversation"]["id"] == cid
    assert requests[1].resume == "s1" and requests[1].persist
    assert "THIS CONVERSATION" in requests[1].system
    assert "SINCE YOUR LAST TURN" in requests[1].system
    turns = c.get(f"/api/conversation?conversation={cid}").json()
    assert [t["kind"] for t in turns["turns"]] == ["said", "replied", "said", "replied"]
    closed = c.post(f"/api/conversations/{cid}/close").json()
    assert closed["state"] == "done" and world.modules.thread(cid)["session_ref"] is None
    # A build thread never resumes.
    plan_thread = world.modules.open_thread("Build: x", "build")["id"]
    world.modules.set_session(plan_thread, "stale")
    settle(c, c.post("/api/ask", json={"text": "continue", "thread": plan_thread}).json())
    assert requests[-1].resume is None and not requests[-1].persist


def test_the_panel_on_a_module_page_uses_that_modules_live_conversation(world: World) -> None:
    world.modules.create("Nutrition")
    c = TestClient(create_app(world, live=False,
                              runner=lambda r: RunResult(ok=True, reply="ok", session_id="n")))
    a = settle(c, c.post("/api/ask", json={"text": "log two eggs", "module": "Nutrition"}).json())
    b = settle(c, c.post("/api/ask", json={"text": "and a shake", "module": "Nutrition"}).json())
    assert a["conversation"]["id"] == b["conversation"]["id"]
    assert a["conversation"]["scope"] == "Nutrition"
    listed = c.get("/api/conversations").json()
    assert [x["title"] for x in listed] == ["Log two eggs"]
    # Quiet for long enough, it closes on the scheduler's tick.
    with world.store.tx() as db:
        db.execute("UPDATE journal SET at = '2026-01-01T00:00:00+00:00'")
        db.execute("UPDATE threads SET updated_at = '2026-01-01T00:00:00+00:00',"
                   " state = 'open'")
    assert conversations.close_idle(world) == [a["conversation"]["id"]]
    assert c.get("/api/conversations").json() == []
