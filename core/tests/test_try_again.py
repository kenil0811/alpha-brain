"""Finding and redoing (13 Oct, slice 2 D5, D9, D12): Try again redoes exactly what a failure
names and says how it went; a whole day's failures; a page for any entry and for a goal."""

from __future__ import annotations

import time
from typing import Any

from conftest import building
from fastapi.testclient import TestClient
from test_actions import (
    PAYLOAD,
    Driver,
    gmail_connected,
    keep_procedure,
    restore,
    said,
    with_fake,
)

from alpha.api.server import create_app
from alpha.mcp.tools import Tools
from alpha.runtime import acting
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world.world import World


def _failures(c: TestClient) -> list[dict[str, Any]]:
    return [e for e in c.get("/api/activity?kind=failed").json()]


def test_a_failed_action_is_done_once_more_and_says_it_worked(world: World) -> None:
    gmail_connected(world)
    driver = Driver()
    with_fake(driver)
    try:
        t = keep_procedure(world, turn=said(world, "draft"))
        aid = t.action_propose("gmail_draft", "Draft", PAYLOAD, "deletable")["action"]
        driver.fail_at = 3
        acting.approve(world, aid, "yes", runner=lambda r: RunResult(ok=True, reply="Looked."))
        c = TestClient(create_app(world, live=False))
        failure = next(e for e in _failures(c) if "did not happen" in e["text"])
        assert failure["again"]["asks"] and "again, once" in failure["again"]["words"]
        assert failure["tried"] is None
        driver.fail_at = None
        out = c.post(f"/api/activity/{failure['id']}/again").json()
        assert out["tried"]["state"] == "worked", out
        assert world.actions.get(aid)["state"] == "done"
        assert any(e["text"].startswith("You tried again:") and e["actor"] == "person"
                   for e in world.journal.recent(10))
        # done now: nothing left to try
        assert c.get(f"/api/activity/{failure['id']}").json()["again"] is None
    finally:
        restore()


def test_a_newer_proposal_after_a_fix_stands_in_the_way(world: World) -> None:
    gmail_connected(world)
    driver = Driver()
    with_fake(driver)
    try:
        t = keep_procedure(world, turn=said(world, "draft"))
        aid = t.action_propose("gmail_draft", "Draft", PAYLOAD, "deletable")["action"]
        driver.fail_at = 3
        acting.approve(world, aid, "yes", runner=lambda r: RunResult(ok=True, reply="Looked."))
        driver.fail_at = None
        t.action_propose("gmail_draft", "Draft, fixed", PAYLOAD, "deletable")
        c = TestClient(create_app(world, live=False))
        failure = next(e for e in _failures(c) if "did not happen" in e["text"])
        assert "Draft, fixed" in failure["again"]["blocked"]
        assert "Needs you" in c.post(f"/api/activity/{failure['id']}/again").json()["error"]
        assert world.actions.get(aid)["state"] == "failed"
    finally:
        restore()


def test_a_failed_turn_is_asked_again_and_one_that_replied_never_is(world: World) -> None:
    replies = iter([RunResult(ok=False, reply="", error="the model was busy"),
                    RunResult(ok=True, reply="Logged two eggs.")])

    def runner(req: TurnRequest) -> RunResult:
        return next(replies)

    c = TestClient(create_app(world, live=False, runner=runner))
    chat = world.modules.open_thread("Food", "chat", None)
    started = c.post("/api/ask", json={"text": "log two eggs", "conversation": chat["id"]}).json()
    deadline = time.time() + 5
    while c.get(f"/api/turns/{started['id']}").json()["state"] == "running":
        assert time.time() < deadline
        time.sleep(0.02)
    failure = _failures(c)[0]
    assert failure["again"]["how"] == "turn" and "log two eggs" in failure["again"]["words"]
    c.post(f"/api/activity/{failure['id']}/again")
    while (tried := c.get(f"/api/activity/{failure['id']}").json()["tried"])["state"] == "running":
        assert time.time() < deadline
        time.sleep(0.02)
    assert tried["state"] == "worked" and tried["words"] == "Logged two eggs."
    # a turn that replied is never asked again, even if a step of it failed
    turn = world.journal.recent(5, kinds=["said"])[-1]["id"]
    step = world.journal.append("failed", "A step failed.", thread=chat["id"],
                                data={"turn": turn})
    assert c.get(f"/api/activity/{step}").json()["again"] is None


def test_alpha_s_own_note_has_nothing_to_redo(world: World) -> None:
    jid = Tools(world).journal_note("failed", "Couldn't find the invoice.")["id"]
    c = TestClient(create_app(world, live=False))
    assert c.get(f"/api/activity/{jid}").json()["again"] is None
    assert "nothing to try again" in c.post(f"/api/activity/{jid}/again").json()["error"]


def test_a_day_of_activity_and_the_page_before(world: World) -> None:
    c = TestClient(create_app(world, live=False))  # first: Alpha's own agents say hello here
    for i in range(3):
        world.journal.append("failed", f"Failure {i}")
    for r in world.store.all("SELECT id FROM journal WHERE text != 'Failure 0'"):
        with world.store.tx() as db:
            db.execute("UPDATE journal SET at = ? WHERE id = ?",
                       ("2026-10-13T10:00:00+00:00", r["id"]))
    with world.store.tx() as db:
        db.execute("UPDATE journal SET at = ? WHERE text = 'Failure 0'",
                   ("2026-10-12T10:00:00+00:00",))
    today = c.get("/api/activity?kind=failed&since=2026-10-13T00:00:00%2B00:00").json()
    assert [e["text"] for e in today] == ["Failure 2", "Failure 1"]
    page = c.get("/api/activity?limit=2").json()
    assert [e["text"] for e in page] == ["Failure 2", "Failure 1"]
    earlier = c.get(f"/api/activity?before={page[-1]['id']}").json()
    # Alpha's own agents said hello first (newest first), then the oldest failure
    assert [e["text"][:6] for e in earlier] == ["Sherlo", "Columb", "Doc is", "Watson", "Failur"]
    # many entries in one second: the page before is exact
    same = [world.journal.append("did", f"Step {i}") for i in range(4)]
    with world.store.tx() as db:
        db.execute("UPDATE journal SET at = ? WHERE id IN (?,?,?,?)",
                   ("2026-10-13T11:00:00+00:00", *same))
    first = c.get("/api/activity?limit=2").json()
    rest = c.get(f"/api/activity?limit=2&before={first[-1]['id']}").json()
    assert [e["text"] for e in first + rest] == ["Step 3", "Step 2", "Step 1", "Step 0"]


def test_an_entry_s_page_shows_what_it_touched_and_its_turn(world: World) -> None:
    m = world.modules.create("Food")
    chat = world.modules.open_thread("Breakfast", "chat", m["id"])
    turn = world.journal.append("said", "log two eggs", actor="person", module=m["id"],
                                thread=chat["id"])
    step = world.journal.append("did", "Logged two eggs.", module=m["id"], thread=chat["id"],
                                data={"turn": turn})
    c = TestClient(create_app(world, live=False))
    page = c.get(f"/api/activity/{step}").json()
    assert {(t["kind"], t["name"]) for t in page["touched"]} == {
        ("module", "Food"), ("conversation", "Breakfast")}
    assert [s["text"] for s in page["steps"]] == ["log two eggs"]
    assert "no journal entry" in c.get("/api/activity/j_nope").json()["error"]


def test_a_goal_s_page_has_its_history(world: World) -> None:
    c = TestClient(create_app(world, live=False))
    g = c.post("/api/goals", json={"text": "An offer by December"}).json()
    c.patch(f"/api/goals/{g['id']}", json={"state": "done"})
    page = c.get(f"/api/goals/{g['id']}").json()
    assert page["state"] == "done" and page["module_name"] is None
    assert [h["text"] for h in page["history"]] == [
        "You set a goal: An offer by December", "You marked done the goal: An offer by December"]


def test_an_agent_s_failed_run_runs_again_and_reports_how_it_went(world: World) -> None:
    auto = building(world).agent_create("Sync", "every 1h", "do it")
    results = iter([RunResult(ok=False, reply="", error="the page was down"),
                    RunResult(ok=True, reply="Nothing new.")])
    c = TestClient(create_app(world, live=False, runner=lambda req: next(results)))
    deadline = time.time() + 5

    def failures() -> list[dict[str, Any]]:
        return [e for e in _failures(c) if e["data"].get("agent") == auto["id"]]

    c.post(f"/api/agents/{auto['id']}/run")
    while not failures():
        assert time.time() < deadline
        time.sleep(0.02)
    failure = failures()[0]
    assert failure["again"] == {"how": "agent", "agent": auto["id"],
                                "words": "Runs Sync again."}
    c.post(f"/api/activity/{failure['id']}/again")
    while (tried := c.get(f"/api/activity/{failure['id']}").json()["tried"])["state"] == "running":
        assert time.time() < deadline
        time.sleep(0.02)
    assert tried["state"] == "worked", tried
    last = world.runs.last(auto["id"])
    assert last and last["trigger"] == "again"  # a try is its own kind of start (16 Oct)
    # a reader that broke inside the agent's run names only the agent's thread: still its run
    broke = world.journal.append("failed", "The reader x looks broken.", thread=auto["thread"],
                                 data={"reader": "x", "turn": None})
    assert c.get(f"/api/activity/{broke}").json()["again"]["how"] == "agent"
