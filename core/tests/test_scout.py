"""Scout, the recommender (design Q48, on Q50's substrate): the day's picks, gathered by code
and judged once; what code keeps; where the picks show; Take and Not now as the person's
decisions; declines that hold."""

from __future__ import annotations

import json
from typing import Any

from conftest import building
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.mcp.tools import Tools
from alpha.runtime.agents import builtin, look_and_run, scout
from alpha.runtime.agents import runner as agent_runner
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world.world import World


def with_scout(world: World) -> dict[str, Any]:
    return next(a for a in builtin.ensure(world) if a["kind"] == "scout")


def material(world: World) -> dict[str, Any]:
    """A world with something coming up, a table, an open question and a repeated ask."""
    t = building(world)
    t.module_create("Nutrition")
    t.collection_create("food_log", "Food log", [{"name": "item", "kind": "text"},
                                                 {"name": "kcal", "kind": "number"}],
                        module="Nutrition")
    rec = Tools(world, turn="j_0").records_add("food_log", {"item": "Eggs", "kcal": 155},
                                               source="stated")
    goal = world.knowledge.set_goal("Eat 150 g of protein a day")
    c = world.commitments.record("person", "send Sania the deck", to_whom=None,
                                 due=scout.today(), source="turn:j_0")
    ask = world.journal.append("asked", "Which metro first?", data={"options": ["Austin"]})
    for _ in range(3):
        world.journal.append("said", "what did i eat today", actor="person")
    return {"record": rec, "goal": goal, "commitment": c, "ask": ask}


def picks_json(m: dict[str, Any], **extra: Any) -> str:
    picks = [
        {"kind": "coming_up", "title": "Sania's deck is due today", "subject": "Sania deck",
         "what": "You said you'd send Sania the deck.", "why": "it is due today",
         "evidence": [m["commitment"]["id"]], "action": "draft the email to Sania with the deck",
         "sure": 0.9, "helpful": 0.8, "costly_to_miss": True, "expires": scout.today(),
         "goal": None},
        {"kind": "pattern", "title": "Protein is below your goal", "subject": "protein",
         "what": "Your food log shows 60 g a day this week.", "why": "your goal is 150 g",
         "evidence": [m["record"]["id"]], "action": "add a protein line to the daily summary",
         "sure": 0.5, "helpful": 0.7, "costly_to_miss": False, "goal": m["goal"]["id"]},
        {"kind": "by_hand", "title": "You ask what you ate every day", "subject": "what did i eat",
         "what": "Three times this month.", "why": "Alpha could tell you each evening",
         "evidence": ["j_nothing"], "action": "set up an evening food summary", "sure": 0.7,
         "helpful": 0.6, "costly_to_miss": False, "goal": None},
        {"kind": "follow_up", "title": "Two things in one", "subject": "two",
         "what": "x", "why": "y", "evidence": [m["ask"]], "action": "answer it; then archive it",
         "sure": 0.9, "helpful": 0.9, "costly_to_miss": False, "goal": None},
    ]
    return "Looked.\n" + json.dumps({"picks": picks, **extra})


def fake(m: dict[str, Any], reply: str | None = None) -> Any:
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        if req.kind == "judge":  # the map's links pass: nothing to link
            return RunResult(reply='{"links": []}', ok=True)
        return RunResult(reply=reply or picks_json(m), ok=True, duration_ms=3100)

    runner.seen = seen  # type: ignore[attr-defined]
    return runner


def test_the_days_opening_is_noted_once_and_wakes_scout(world: World) -> None:
    me = with_scout(world)
    assert scout.note_opened(world) and scout.note_opened(world) is None
    assert world.journal.recent(1, kinds=["saw"])[0]["text"] == "Alpha opened for the day."
    work = scout.look(world, me)
    assert work and work.about == {"day": scout.today()}


def test_what_code_keeps_of_the_picks(world: World) -> None:
    m = material(world)
    me = with_scout(world)
    p = scout.packet(world, me)
    words = scout._words(p)
    assert "send Sania the deck" in words and "Food log" in words and "3×" in words
    assert "Which metro first?" not in words  # an ask is a follow-up only after a day
    out = scout.check_picks(world, json.loads(picks_json(m).split("\n", 1)[1]), p)
    assert [k["title"] for k in out["picks"]] == ["Protein is below your goal",
                                                   "Sania's deck is due today"]  # goal first
    assert out["dropped"] == ["You ask what you ate every day: its evidence names nothing Alpha"
                              " holds", "Two things in one: not one clear action"]
    sania = out["picks"][1]
    assert sania["card"] and not sania["less_sure"] and sania["key"] == "coming_up:sania_deck"
    assert out["picks"][0]["less_sure"] and out["picks"][0]["goal"] == m["goal"]["id"]


def test_the_days_picks_land_on_home_and_only_the_costly_one_in_needs_you(world: World) -> None:
    m = material(world)
    me = with_scout(world)
    runner = fake(m)
    scout.note_opened(world)
    out = look_and_run(world, "scout", runner=runner)
    assert out and out["last_result"] == ("2 picks for today (a pattern in your data, coming"
                                          " up); 2 left out by the checks.")
    kinds = [r.kind for r in runner.seen]
    assert kinds == ["judge", "turn"]  # the links pass, then one turn with the read tools
    assert runner.seen[1].actor == me["id"] and "You are Scout" in runner.seen[1].system
    assert "Pick what deserves the person's attention today" in runner.seen[1].sentence
    run = world.runs.last(me["id"])
    assert run and run["verdict"] == "succeeded" and run["model_ms"] == 3100
    c = TestClient(create_app(world, live=False))
    home = c.get("/api/home").json()
    assert [p["title"] for p in home["picks"]] == ["Protein is below your goal",
                                                   "Sania's deck is due today"]
    cards = [i for i in home["needs_you"] if i["kind"] == "proposal"]
    assert [i["text"] for i in cards] == ["Sania's deck is due today"]
    goal = c.get(f"/api/goals/{m['goal']['id']}").json()
    assert [p["title"] for p in goal["picks"]] == ["Protein is below your goal"]
    # picked once for the day: no second run
    assert look_and_run(world, "scout", runner=runner) is None
    notes = world.knowledge.find_note(f"agent:{me['id']}", "Notes")
    assert notes and "## coming up" in notes["body"] and "1 shown" in notes["body"]


def test_take_and_not_now_are_the_persons_decisions_and_a_decline_holds(world: World) -> None:
    m = material(world)
    me = with_scout(world)
    runner = fake(m)
    agent_runner.run(world, me["id"], trigger="now", runner=runner)
    picks = scout.picks_of_day(world)
    sania = next(p for p in picks if p["kind"] == "coming_up")
    protein = next(p for p in picks if p["kind"] == "pattern")
    c = TestClient(create_app(world, live=False))
    # Not now: a decision of the person's, by the pick's key, with its evidence kept
    out = c.post(f"/api/proposals/{protein['id']}/decide", json={"accept": False}).json()
    assert out["turn"] is None
    d = next(d for d in world.decisions.recent(10) if d["about"].get("pick") == protein["key"])
    assert d["by"] == "person" and d["about"]["taken"] is False
    assert d["evidence"]["evidence"] == [m["record"]["id"]]
    assert world.journal.recent(1, kinds=["did"])[0]["text"] == \
        "You left Scout's pick: Protein is below your goal."
    left = [p["title"] for p in c.get("/api/home").json()["picks"]]
    assert left == ["Sania's deck is due today"]
    # the same pick with the same evidence never returns; with new evidence it may
    p = scout.packet(world, me)
    again = json.loads(picks_json(m).split("\n", 1)[1])
    out2 = scout.check_picks(world, again, p)
    assert ("Protein is below your goal: you declined it before and nothing changed"
            in out2["dropped"])
    new_row = Tools(world, turn="j_1").records_add("food_log", {"item": "Tofu", "kcal": 200},
                                                   source="stated")
    again["picks"][1]["evidence"] = [m["record"]["id"], new_row["id"]]
    back = [k["title"] for k in scout.check_picks(world, again, p)["picks"]]
    assert "Protein is below your goal" in back
    # Take: Alpha does it as a turn in the pick's words (the fake answers the turn)
    out3 = c.post(f"/api/proposals/{sania['id']}/decide", json={"accept": True}).json()
    assert out3["turn"]
    assert out3["turn"]["text"] == "Yes, go ahead: draft the email to Sania with the deck"
    taken = next(d for d in world.decisions.recent(10) if d["about"].get("pick") == sania["key"])
    assert taken["about"]["taken"] is True


def test_a_kind_declined_three_times_running_sinks_to_sure_picks(world: World) -> None:
    m = material(world)
    me = with_scout(world)
    for i in range(3):
        world.decisions.record(by="person", what=f"Not now: pick {i}",
                               about={"pick": f"pattern:p{i}", "pick_kind": "pattern",
                                      "taken": False}, evidence={"evidence": [f"j_{i}"]})
    assert scout.sunk_kinds(world) == {"pattern"}
    p = scout.packet(world, me)
    out = scout.check_picks(world, json.loads(picks_json(m).split("\n", 1)[1]), p)
    assert "Protein is below your goal: you keep declining this kind; only a sure one shows" \
        in out["dropped"]
    world.decisions.record(by="person", what="Took Scout's pick: x",
                           about={"pick": "pattern:x", "pick_kind": "pattern", "taken": True})
    assert scout.sunk_kinds(world) == set()


def test_at_scout_picks_now_and_says_them(world: World) -> None:
    m = material(world)
    me = with_scout(world)
    out = agent_runner.mention(world, me, "@Scout anything I should look at?", thread=None,
                               runner=fake(m))
    assert out.ok and out.reply.startswith("Today's picks: Protein is below your goal; Sania's")
    assert world.runs.last(me["id"])["trigger"] == "mention"  # type: ignore[index]
    assert len(scout.picks_of_day(world)) == 2


def test_nothing_worth_attention_is_said_plainly(world: World) -> None:
    me = with_scout(world)
    out = agent_runner.run(world, me["id"], trigger="now", runner=fake({}, reply='{"picks": []}'))
    assert out["last_result"] == "Nothing worth your attention today."
    assert scout.picks_of_day(world) == []
