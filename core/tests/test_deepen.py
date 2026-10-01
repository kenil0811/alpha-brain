from __future__ import annotations

import time
from collections.abc import Callable

from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.mcp.tools import Tools
from alpha.runtime import deepen
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world.world import World


def fake_model(world: World) -> Callable[[TurnRequest], RunResult]:
    """Plays the model: the stream turn sets up a module and opens a deepen thread; the deepen
    pass researches (here: pretends), adds fields, writes the note and asks one question; the
    continuation applies the answer."""

    def run(req: TurnRequest) -> RunResult:
        t = Tools(world, turn=req.turn_id, thread=req.thread_id, module=req.module_id)
        if "working in a thread of your own" in req.system and "just answered" not in req.system:
            fibre = {"name": "fibre_g", "kind": "number", "unit": "g"}
            t.collection_add_fields("food_log", [fibre])
            t.note_write("module:Nutrition", "Nutrition", "Tracks what you eat. Sources: NHS.")
            t.ask_person("What's your height, weight and goal?")
            t.thread_update(req.thread_id or "", state="waiting")
            return RunResult(reply="I looked at NHS guidance and two apps. Added fibre. "
                                   "1. What's your height, weight and goal?", ok=True,
                             session_id="s-deepen", duration_ms=90_000)
        if "just answered" in req.system:
            t.fact_record("person", "height_cm", "178", stated=True)
            t.thread_update(req.thread_id or "", state="done")
            return RunResult(reply="Targets set: 2,100 kcal, 130 g protein.", ok=True,
                             session_id="s-deepen")
        t.module_create("Nutrition")
        t.collection_create("food_log", "Food log", [{"name": "item", "kind": "text"}],
                            module="Nutrition")
        t.thread_open("Make the nutrition tracker good", "deepen", module="Nutrition")
        return RunResult(reply="Set up Nutrition › Food log. Researching how to make it good.",
                         ok=True, duration_ms=8000)

    return run


def test_cli_style_deepen_runs_after_the_turn(world: World) -> None:
    from alpha.runtime.turn import ask

    model = fake_model(world)
    first = ask(world, "i want to build a calorie and nutrition tracker", runner=model)
    assert len(first.opened) == 1
    tid = deepen.deepen_threads(world, first.opened)[0]
    out = deepen.run(world, tid, runner=model)
    assert out.ok
    thread = world.modules.thread(tid)
    assert thread["state"] == "waiting" and thread["session_ref"] == "s-deepen"
    stream = world.journal.recent(20, stream=True, kinds=["said", "replied"])
    assert stream[-1]["text"].startswith("I looked at NHS guidance")
    assert stream[-1]["data"]["thread"] == tid
    # the pass's own prompt is Alpha's doing, not words the person said
    said = [e for e in world.journal.recent(50, kinds=["said"])]
    assert [e["text"] for e in said] == ["i want to build a calorie and nutrition tracker"]
    assert "fibre_g" in [f["name"] for f in world.collections.describe("food_log")["fields"]]
    assert world.journal.open_asks()[0]["thread"] == tid


def wait_for(check: Callable[[], bool], seconds: float = 5) -> None:
    end = time.time() + seconds
    while time.time() < end:
        if check():
            return
        time.sleep(0.05)
    raise AssertionError("timed out")


def test_api_starts_the_pass_and_an_answer_continues_it(world: World) -> None:
    c = TestClient(create_app(world, live=False, runner=fake_model(world)))
    c.post("/api/ask", json={"text": "i want to build a calorie and nutrition tracker"})
    wait_for(lambda: bool(world.journal.open_asks()))
    home = c.get("/api/home").json()
    ask = next(i for i in home["needs_you"] if i["kind"] == "ask")
    convo = c.get("/api/conversation").json()
    assert [t["kind"] for t in convo["turns"]] == ["said", "replied", "replied"]
    assert convo["threads"][0]["state"] == "waiting"
    answered = c.post(f"/api/asks/{ask['id']}/answer", json={"text": "178 cm, 80 kg, lose fat"})
    assert answered.json()["continues"] == convo["threads"][0]["id"]
    wait_for(lambda: any(f["predicate"] == "height_cm" for f in world.knowledge.facts()))
    wait_for(lambda: c.get("/api/conversation").json()["turns"][-1]["text"].startswith("Targets"))
    assert c.get("/api/home").json()["needs_you"] == []
    assert world.modules.threads() == []  # done


def test_talking_in_a_thread_answers_its_question(world: World) -> None:
    model = fake_model(world)
    c = TestClient(create_app(world, live=False, runner=model))
    c.post("/api/ask", json={"text": "i want to build a calorie and nutrition tracker"})
    wait_for(lambda: bool(world.journal.open_asks()))
    tid = world.modules.threads()[0]["id"]
    c.post("/api/ask", json={"text": "178 cm and 80 kg", "thread": tid})
    wait_for(lambda: not world.journal.open_asks())
