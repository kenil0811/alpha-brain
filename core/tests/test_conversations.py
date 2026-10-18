"""Home and the work items (harness §7, slice 3): routed by structure or one judgement over the
roster, never by name matching; each with its own session, resumed only on the same tools."""

from __future__ import annotations

import time
from typing import Any

from conftest import judge_answering
from fastapi.testclient import TestClient

from alpha.api.server import create_app
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


def never(req: TurnRequest) -> RunResult:
    raise AssertionError("the judge was asked")


def test_home_is_one_thread_and_the_judge_sends_a_question_there(world: World) -> None:
    home = conversations.home(world)
    assert home["kind"] == "home" and conversations.home(world)["id"] == home["id"]
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        return RunResult(ok=True, reply='{"answer": "answer here", "confidence": 0.9,'
                                        ' "why": "a question"}')

    out = conversations.route(world, "how many eggs this week?", runner=runner)
    assert out["thread"] == home["id"] and out["here"] and not out["opened"]
    assert seen[0].kind == "judge" and "No work items are open" in seen[0].sentence
    assert "answer here" in seen[0].sentence and "new item" in seen[0].sentence
    line = world.journal.recent(1, thread=home["id"], kinds=["did"])[-1]
    assert line["data"]["routed"] == home["id"] and line["text"].startswith("Answering")


def test_new_work_opens_an_item_with_a_card_line_in_home(world: World) -> None:
    world.modules.create("Jobs")
    out = conversations.route(world, "watch We Work Remotely for back-end roles",
                              module="Jobs", runner=judge_answering("new item"))
    tid = out["thread"]
    t = world.modules.thread(tid)
    assert out["opened"] and t["kind"] == "work" and t["state"] == "open"
    assert t["title"] == "Watch We Work Remotely for back-end roles"
    assert t["module"] == world.modules.get("Jobs")["id"]
    card = world.journal.recent(1, thread=conversations.home(world)["id"], kinds=["did"])[-1]
    assert card["data"] == {"routed": tid, "sentence": "watch We Work Remotely for back-end"
                            " roles", "opened": True, "by": "judge", "confidence": 0.9,
                            "why": "test"}
    assert conversations.focus(world) == tid


def test_a_follow_up_continues_the_item_the_judge_names_from_the_roster(world: World) -> None:
    a = item(world, "Watch We Work Remotely", said="watch wwr")
    world.modules.update_thread(a, state="done", last_line="Watching; 12 roles so far.")
    b = item(world, "Deals today", said="what came in")
    conversations.set_focus(world, b)
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        return RunResult(ok=True, reply='{"answer": "continue: Watch We Work Remotely",'
                                        ' "confidence": 0.85, "why": "the watch"}')

    out = conversations.route(world, "make that check every day at 7", runner=runner)
    assert out["thread"] == a and out["by"].startswith("judge") and not out["opened"]
    state = seen[0].sentence
    assert "continue: Watch We Work Remotely (done)" in state
    assert "last: Watching; 12 roles so far." in state
    assert "continue: Deals today (open; the one in focus)" in state
    assert conversations.focus(world) == a


def test_structure_routes_without_the_judge(world: World) -> None:
    # @title names an item
    a = item(world, "LinkedIn sync", said="sync my connections")
    item(world, "Food log", said="track what I eat")
    out = conversations.route(world, "@LinkedIn sync how many so far?", runner=never)
    assert out["thread"] == a and out["by"] == "named"
    # a short sentence when exactly one item asked a question
    b = item(world, "Logging the shake", asked="Which size was the shake?")
    out = conversations.route(world, "330 ml", runner=never)
    assert out["thread"] == b and out["by"] == "answers the open question"


def test_when_unsure_the_judge_asks_with_choices_and_the_pick_routes(world: World) -> None:
    a = item(world, "Deals today", said="what came in today")
    item(world, "Logging the shake", said="log a shake")
    conversations.set_focus(world, a)
    out = conversations.route(world, "change that to weekly",
                              runner=judge_answering("continue: Logging the shake", 0.3))
    # the judge's pick, a new item and here: never the whole roster
    assert "ask" in out and out["options"] == ["continue: Logging the shake",
                                                conversations.NEW, conversations.HERE]
    asked = world.journal.read(out["ask"])
    assert asked["thread"] == conversations.home(world)["id"]
    assert asked["data"]["verdict"]["confidence"] == 0.3
    picked = conversations.routed_answer(world, asked, "continue: Logging the shake")
    assert picked and picked["thread"] != a and picked["text"] == "change that to weekly"
    # the item in focus is a structural prior: the judge's pick of it stands at any confidence
    conversations.set_focus(world, a)
    sure = conversations.route(world, "and the other one?",
                               runner=judge_answering("continue: Deals today", 0.3))
    assert sure["thread"] == a and "ask" not in sure
    fresh = conversations.routed_answer(world, asked, conversations.NEW)
    assert fresh and fresh["thread"] != a and fresh["text"] == "change that to weekly"
    assert world.modules.thread(fresh["thread"])["title"] == "Change that to weekly"
    here = conversations.routed_answer(world, asked, conversations.HERE)
    assert here and here["thread"] == conversations.home(world)["id"]


def test_a_correction_is_kept_counted_and_shown_to_the_judge(world: World) -> None:
    a = item(world, "LinkedIn sync", said="sync my connections")
    item(world, "Food log", said="track what I eat")
    conversations.correct(world, "how many are at Wise?", said=None, to=a)
    assert conversations.misroutes(world) == 1
    assert conversations.corrections(world) == ['"how many are at Wise?" belonged to LinkedIn'
                                                ' sync']
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        return RunResult(ok=True, reply='{"answer": "answer here", "confidence": 0.9}')

    conversations.route(world, "and at Monzo?", runner=runner)
    assert "Corrections the person made lately" in seen[0].sentence
    assert "belonged to LinkedIn sync" in seen[0].sentence


def test_the_roster_carries_each_items_line_and_what_it_touches(world: World) -> None:
    world.modules.create("Network")
    a = item(world, "LinkedIn sync", "Network", said="sync")
    world.journal.append("made", "Made the table connections.", actor="alpha", thread=a,
                         data={"table": "connections"})
    world.journal.append("did", "Ran the reader.", actor="alpha", thread=a,
                         data={"skill": "linkedin_connections",
                               "url": "https://www.linkedin.com/mynetwork/"})
    world.modules.update_thread(a, state="done", last_line="1,553 connections kept.")
    old = item(world, "Old one", said="x")
    world.modules.update_thread(old, state="done")
    with world.store.tx() as db:
        db.execute("UPDATE threads SET updated_at = '2026-01-01T00:00:00+00:00' WHERE id = ?",
                   (old,))
    rows = conversations.roster(world)
    assert [r["title"] for r in rows] == ["LinkedIn sync"]  # done long ago: off the roster
    assert rows[0]["line"] == "1,553 connections kept."
    assert rows[0]["touches"] == ("Network; tables connections; skills linkedin_connections;"
                                  " linkedin.com")


def test_items_and_home_keep_their_sessions_only_on_the_same_tools(
        world: World, monkeypatch: Any) -> None:
    requests: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        requests.append(req)
        if req.kind == "judge":
            return RunResult(ok=True, reply='{"answer": "new item", "confidence": 0.9}')
        return RunResult(ok=True, reply="ok", session_id=f"s{len(requests)}")

    monkeypatch.setattr(engine, "tools_fingerprint", "hands-v1")
    c = TestClient(create_app(world, live=False, runner=runner))
    started = c.post("/api/ask", json={"text": "sync my LinkedIn connections"}).json()
    assert started["state"] == "routing" and started["conversation"] is None  # at once
    first = settle(c, started)
    tid = first["conversation"]["id"]
    t = world.modules.thread(tid)
    assert t["kind"] == "work" and t["state"] == "done" and t["last_line"] == "ok"
    turn = next(r for r in requests if r.kind == "turn")
    assert turn.persist and turn.resume is None and turn.thread_id == tid
    assert t["session_ref"] == "s2" and t["session_tools"] == "hands-v1"
    # typed in the item's own box: that item, its session resumed
    second = settle(c, c.post("/api/ask", json={"text": "how many?", "conversation": tid}).json())
    assert second["conversation"]["id"] == tid and requests[-1].resume == "s2"
    assert "THIS CONVERSATION (the work item" in requests[-1].system
    assert "SINCE YOUR LAST TURN" in requests[-1].system
    # the hands changed (an update): the session is not resumed, a fresh one starts, said so
    monkeypatch.setattr(engine, "tools_fingerprint", "hands-v2")
    settle(c, c.post("/api/ask", json={"text": "and now?", "conversation": tid}).json())
    assert requests[-1].resume is None and requests[-1].persist
    assert world.modules.thread(tid)["session_tools"] == "hands-v2"
    assert any(e["data"].get("fresh_session") for e in world.journal.recent(5, thread=tid))
    turns = c.get(f"/api/conversation?conversation={tid}").json()
    assert [x["kind"] for x in turns["turns"]] == ["said", "replied"] * 3
    # Home's transcript: the routing line (the card) under which the item opened
    home = c.get("/api/conversation").json()
    assert home["conversation"]["kind"] == "home"
    assert [x["kind"] for x in home["turns"]] == ["did"]
    assert home["turns"][0]["data"]["routed"] == tid and home["turns"][0]["data"]["opened"]
    listed = c.get("/api/conversations").json()
    assert [x["kind"] for x in listed] == ["home", "work"]
    assert listed[1]["last_line"] == "ok"


def test_an_item_waits_on_a_question_and_a_failure_stops_it(world: World) -> None:
    def runner(req: TurnRequest) -> RunResult:
        if "fail" in req.sentence:
            return RunResult(ok=False, reply="", error="the site stopped it")
        return RunResult(ok=True, reply="Which size: 330 ml or 500 ml?")

    c = TestClient(create_app(world, live=False, runner=runner))
    tid = item(world, "Logging the shake")
    settle(c, c.post("/api/ask", json={"text": "log a shake", "conversation": tid}).json())
    assert world.modules.thread(tid)["state"] == "needs_you"
    settle(c, c.post("/api/ask", json={"text": "please fail", "conversation": tid}).json())
    t = world.modules.thread(tid)
    assert t["state"] == "stopped" and t["last_line"].startswith("That didn't work")
    listed = c.get("/api/home").json()["threads"]
    assert [x["id"] for x in listed] == [tid]  # stopped today: still on Home


def test_a_sentence_from_a_module_page_is_routed_with_the_module_as_its_scope(
        world: World) -> None:
    world.modules.create("Nutrition")
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        if req.kind == "judge":
            return RunResult(ok=True, reply='{"answer": "new item", "confidence": 0.9}')
        return RunResult(ok=True, reply="ok", session_id="n")

    c = TestClient(create_app(world, live=False, runner=runner))
    a = settle(c, c.post("/api/ask", json={"text": "log two eggs", "module": "Nutrition"}).json())
    assert "on the page of the module Nutrition" in seen[0].sentence
    assert a["conversation"]["scope"] == "Nutrition"
    listed = c.get("/api/conversations?module=Nutrition").json()
    assert [x["title"] for x in listed] == ["Log two eggs"]


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
    assert world.modules.thread(stale)["state"] == "stopped"
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
