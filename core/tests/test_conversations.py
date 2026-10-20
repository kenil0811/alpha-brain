"""Home and the threads since section C (Q107): every sentence the desk's, with no routing
judgement; its session resumed only on the same tools; the threads' reset and their words."""

from __future__ import annotations

import time
from typing import Any

from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.mcp.tools import Tools
from alpha.runtime import conversations, engine
from alpha.runtime.running import RunResult, TurnRequest
from alpha.world.world import World


def settle(c: TestClient, turn: dict[str, Any]) -> dict[str, Any]:
    """A turn runs in a thread; wait for it the way the app does."""
    for _ in range(300):
        if turn.get("state") not in ("running", "routing"):
            return turn
        time.sleep(0.02)
        turn = c.get(f"/api/turns/{turn['id']}").json()
    raise AssertionError("the turn never finished")


def item(world: World, title: str, module: str | None = None, *, said: str | None = None,
         asked: str | None = None, state: str | None = None) -> str:
    module_id = world.modules.get(module)["id"] if module else None
    tid = str(world.modules.open_thread(title, "work", module_id)["id"])
    if said:
        s = world.journal.append("said", said, actor="person", thread=tid, module=module_id)
        world.journal.append("replied", "Sure.", data={"turn": s}, thread=tid, module=module_id)
    if asked:
        world.journal.append("asked", asked, data={"options": []}, thread=tid, module=module_id)
    if state:
        world.modules.update_thread(tid, state=state)
    return tid


def test_no_judge_is_called_from_conversations(world: World) -> None:
    """Section C, C4's proof: routing is by structure only, then the desk; the judgement, its
    roster, its unsure card and the person's corrections are gone."""
    import inspect

    source = inspect.getsource(conversations)
    assert "judge" not in source.split('"""', 2)[2]  # nothing below the module's words
    for gone in ("route", "roster", "corrections", "misroutes", "routed_answer", "correct",
                 "CONFIDENT"):
        assert not hasattr(conversations, gone), gone


def test_every_sentence_is_the_desks_and_keeps_its_session_on_the_same_tools(
        world: World, monkeypatch: Any) -> None:
    """Section C (Q107): every sentence goes to the desk, Home's session, with no judge before
    it, whatever box it was typed in; the session is resumed only on the same tools (A12)."""
    requests: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        requests.append(req)
        return RunResult(ok=True, reply="ok", session_id="s1")

    monkeypatch.setattr(engine, "tools_fingerprint", "hands-v1")
    c = TestClient(create_app(world, live=False, runner=runner))
    home = world.modules.home_thread()["id"]
    started = c.post("/api/ask", json={"text": "sync my LinkedIn connections"}).json()
    assert started["state"] == "running" and started["conversation"]["id"] == home
    settle(c, started)
    assert [r.kind for r in requests] == ["turn"]  # no routing judgement (C1's proof)
    first = requests[0]
    assert first.persist and first.resume is None and first.thread_id == home
    t = world.modules.thread(home)
    assert t["session_ref"] == "s1" and t["session_tools"] == engine.fingerprint()
    # typed in an old item's box: still the desk, its session resumed
    old = item(world, "Old item")
    second = settle(c, c.post("/api/ask", json={"text": "how many?", "conversation": old}).json())
    assert second["conversation"]["id"] == home and requests[-1].resume == "s1"
    assert requests[-1].system == first.system and "NOW" in requests[-1].turn_layer
    # the hands changed (an update): a fresh session starts, said so
    monkeypatch.setattr(engine, "tools_fingerprint", "hands-v2")
    settle(c, c.post("/api/ask", json={"text": "and now?"}).json())
    assert requests[-1].resume is None and requests[-1].persist
    assert world.modules.thread(home)["session_tools"] == "hands-v2+layers"
    assert any(e["data"].get("fresh_session") for e in world.journal.recent(5, thread=home))
    turns = c.get("/api/conversation").json()
    assert [x["kind"] for x in turns["turns"]] == ["said", "replied"] * 3


def test_a_question_at_the_desk_waits_in_home_and_a_failure_says_so(world: World) -> None:
    def runner(req: TurnRequest) -> RunResult:
        if "fail" in req.sentence:
            return RunResult(ok=False, reply="", error="the site stopped it")
        # the model asks through its hand (Q78: never read out of its prose)
        Tools(world, turn=req.turn_id, thread=req.thread_id).ask_person(
            "Which size was the shake?", ["330 ml", "500 ml"])
        return RunResult(ok=True, reply="Which size?")

    c = TestClient(create_app(world, live=False, runner=runner))
    home = world.modules.home_thread()["id"]
    settle(c, c.post("/api/ask", json={"text": "log a shake"}).json())
    asks = [a for a in world.journal.open_asks() if a["thread"] == home]
    assert [a["text"] for a in asks] == ["Which size was the shake?"]
    settle(c, c.post("/api/ask", json={"text": "please fail"}).json())
    last = world.journal.recent(1, thread=home)[0]
    assert last["kind"] == "failed" and last["text"].startswith("That didn't work")
    assert world.modules.thread(home)["state"] == "open"


def test_a_sentence_from_a_module_page_brings_the_module_to_the_desk(world: World) -> None:
    world.modules.create("Nutrition")
    world.knowledge.write_note("module:Nutrition", "NOTES", "Kcal from the label first.")
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        return RunResult(ok=True, reply="ok", session_id="n")

    c = TestClient(create_app(world, live=False, runner=runner))
    a = settle(c, c.post("/api/ask", json={"text": "log two eggs", "module": "Nutrition"}).json())
    assert a["conversation"]["kind"] == "home" and [r.kind for r in seen] == ["turn"]
    assert seen[0].sentence == "log two eggs"
    layer = seen[0].turn_layer
    assert "THIS SENTENCE CAME FROM A MODULE'S PAGE" in layer and "Nutrition" in layer
    assert "Kcal from the label first." in layer
    # the session's start layer is the same whichever page the first sentence came from
    assert "THIS MODULE'S NOTES" not in seen[0].start_layer


def test_a_core_that_starts_opens_the_work_a_dead_one_left_working(world: World) -> None:
    tid = item(world, "Deals", said="which are new")
    world.modules.update_thread(tid, state="working")
    other = item(world, "Food", said="log eggs")
    assert conversations.reset_working(world) == [tid]
    assert world.modules.thread(tid)["state"] == "open"
    assert world.modules.thread(other)["state"] == "open"
    assert world.journal.recent(1, kinds=["changed"])[-1]["text"].startswith(
        "Alpha's core started; 1 piece of work left mid-turn is open again.")
    assert conversations.reset_working(world) == []
    # an item left open for a day, owned by no agent, is over (18 Oct: a 16 Oct build on Home)
    stale = item(world, "Old build")
    with world.store.tx() as db:
        db.execute("UPDATE threads SET updated_at = '2026-01-01T00:00:00+00:00' WHERE id = ?",
                   (stale,))
    conversations.reset_working(world)
    gone = world.modules.thread(stale)
    assert gone["state"] == "stopped" and gone["updated_at"].startswith("2026-01-01")  # not today
    assert world.modules.thread(other)["state"] == "open"  # touched today: stays
    # A live core resets them when it starts, before anything else runs.
    world.modules.update_thread(tid, state="working")
    with TestClient(create_app(world, live=True)):
        assert world.modules.thread(tid)["state"] == "open"


def test_a_world_from_before_has_its_threads_as_items(world: World) -> None:
    with world.store.tx() as db:
        db.execute("INSERT INTO threads (id, title, kind, state, module, created_at, updated_at)"
                   " VALUES ('t_old', 'Old chat', 'chat', 'waiting', NULL, '2026-10-01T00:00:00'"
                   ", '2026-10-01T00:00:00')")
    world.store._migrate()
    t = world.modules.thread("t_old")
    assert t["kind"] == "work" and t["state"] == "needs_you"
