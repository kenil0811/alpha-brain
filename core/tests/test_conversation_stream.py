"""The core's part of the conversation's slice 1 (16 Oct 2026): a turn pushed as it happens,
a question's kind and hint, one automatic retry of a route failure, identical failures folded."""

from __future__ import annotations

import json
import time
from typing import Any

from conftest import building
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.api.views import fold_failures
from alpha.runtime import running
from alpha.runtime.running import NO_ANSWER, RunResult, TurnRequest
from alpha.runtime.turn import ask
from alpha.world.world import World


def client(world: World, **kw: Any) -> TestClient:
    return TestClient(create_app(world, live=False, **kw))


def events_of(c: TestClient, key: str) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    with c.stream("GET", f"/api/turns/{key}/events") as response:
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")
        for line in response.iter_lines():
            if line.startswith("data: "):
                out.append(json.loads(line[6:]))
    return out


def test_a_turn_is_pushed_as_it_happens(world: World) -> None:
    def runner(req: TurnRequest) -> RunResult:
        keys = [req.turn_id or ""]
        running.LIVE.note(keys, thought="Let me look at the Food Log first.")
        time.sleep(0.15)
        running.LIVE.note(keys, partial="", doing="Reading rows: food_log")
        world.journal.append("did", "Added a row to Food Log.", data={"turn": req.turn_id})
        time.sleep(0.6)
        running.LIVE.note(keys, partial="")
        running.LIVE.add_text(keys, "Logged ")
        time.sleep(0.15)
        running.LIVE.add_text(keys, "**two eggs**, 140 kcal.")
        time.sleep(0.15)
        return RunResult(reply="Logged **two eggs**, 140 kcal.", ok=True, duration_ms=1200)

    c = client(world, runner=runner)
    started = c.post("/api/ask", json={"text": "log two eggs"}).json()
    events = events_of(c, started["id"])
    kinds = [e["type"] for e in events]
    # no routing before a sentence (section C): the desk's turn runs at once
    assert kinds[0] == "state" and events[0]["state"] == "running"
    assert [e["state"] for e in events if e["type"] == "state"] == ["running", "done"]
    assert kinds[-1] == "done" and events[-1]["turn"]["state"] == "done"
    words = "".join(e.get("delta", "") for e in events if e["type"] == "text")
    assert words == "Logged **two eggs**, 140 kcal."
    assert any(e["type"] == "thought" and e["text"].startswith("Let me look") for e in events)
    assert any(e["type"] == "doing" and e["text"] == "Reading rows: food_log" for e in events)
    assert any(e["type"] == "step" and e["text"] == "Added a row to Food Log." for e in events)
    # the end carries the whole turn, as the poll would give it
    assert events[-1]["turn"]["reply"] == "Logged **two eggs**, 140 kcal."


def test_a_turn_the_core_does_not_know_is_a_plain_problem(world: World) -> None:
    c = client(world)
    assert c.get("/api/turns/nope/events").status_code == 400


def test_a_route_failure_is_tried_once_more_only_when_nothing_was_written(world: World) -> None:
    calls: list[str] = []

    def flaky(req: TurnRequest) -> RunResult:
        calls.append("run")
        if len(calls) == 1:
            return RunResult(reply="", ok=False, error=NO_ANSWER)
        return RunResult(reply="Logged.", ok=True)

    out = ask(world, "log two eggs", runner=flaky)
    assert out.ok and out.reply == "Logged." and len(calls) == 2

    calls.clear()

    def wrote_then_failed(req: TurnRequest) -> RunResult:
        calls.append("run")
        world.journal.append("made", "Added a row.", data={"turn": req.turn_id})
        return RunResult(reply="", ok=False, error=NO_ANSWER)

    out = ask(world, "log two eggs", runner=wrote_then_failed)
    assert not out.ok and len(calls) == 1  # it wrote something: never run twice

    calls.clear()

    def stopped(req: TurnRequest) -> RunResult:
        calls.append("run")
        return RunResult(reply="", ok=False, error="You stopped it.", stopped=True)

    out = ask(world, "log two eggs", runner=stopped)
    assert not out.ok and len(calls) == 1  # the person stopped it: not the route's failure


def test_consecutive_identical_failures_show_once_with_their_count() -> None:
    def e(i: int, kind: str, text: str) -> dict[str, Any]:
        return {"id": f"j{i}", "kind": kind, "text": text, "data": {}}

    stopped = "The build stopped."
    folded = fold_failures([e(1, "said", "build it"), e(2, "failed", stopped),
                            e(3, "failed", stopped), e(4, "failed", stopped),
                            e(5, "failed", "Something else."), e(6, "replied", "Done.")])
    assert [(x["kind"], x.get("repeats")) for x in folded] == [
        ("said", None), ("failed", 3), ("failed", None), ("replied", None)]
    assert folded[1]["id"] == "j4"  # the latest of the three


def test_a_question_has_a_kind_and_a_hint(world: World) -> None:
    tools = building(world)
    tools.ask_person("Which days?", ["Mon", "Tue", "Wed"], kind="several")
    tools.ask_person("How many days back?", hint="a number of days")
    refused = tools.ask_person("Which?", ["a", "b"], kind="many")
    assert "one" in refused["error"]  # a tool's Problem comes back in plain words
    asks = client(world).get("/api/conversation").json()["asks"]
    by_text = {a["text"]: a for a in asks}
    assert by_text["Which days?"]["choose"] == "several" and by_text["Which days?"]["hint"] is None
    assert by_text["How many days back?"]["choose"] == "one"
    assert by_text["How many days back?"]["hint"] == "a number of days"
    home = client(world).get("/api/home").json()
    assert {i["kind"] for i in home["needs_you"]} >= {"ask"}
    assert any(i.get("hint") == "a number of days" for i in home["needs_you"])
