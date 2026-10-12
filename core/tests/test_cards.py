"""Dashboard cards (12 Oct, the owner): Alpha proposes, the person's yes keeps them, and a change
that matters in a table brings a short turn to propose more. The model is never called: a fake
runner stands in and records what it was asked."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.mcp.tools import Tools
from alpha.runtime import cards as cards_runtime
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world import purge
from alpha.world.world import World

FIELDS: list[dict[str, Any]] = [
    {"name": "name", "kind": "text"}, {"name": "amount", "kind": "number"},
    {"name": "stage", "kind": "status", "choices": ["open", "won"]},
    {"name": "closed", "kind": "date"}]


def deals(world: World) -> None:
    world.collections.create("deals", "Deals", FIELDS)
    world.collections.add("deals", {"name": "Bakery", "amount": 40, "stage": "open"}, {})


def test_alpha_proposes_cards_and_only_the_yes_keeps_them(world: World) -> None:
    deals(world)
    t = Tools(world)
    wrong = {"type": "metric", "measure": "sum", "field": "stage", "title": "x"}
    assert "number field" in t.card_propose("deals", [wrong], "")["error"]
    assert "title" in t.card_propose("deals", [{"type": "attention"}], "")["error"]
    proposed = t.card_propose("deals", [
        {"type": "metric", "measure": "sum", "field": "amount", "title": "Pipeline value"},
        {"type": "breakdown", "field": "stage", "title": "Where deals stand", "why": "chase"},
    ], "So you see the pipeline at a glance.")
    assert world.cards.of("deals") == []  # nothing until the yes
    c = TestClient(create_app(world, live=False))
    needs = c.get("/api/home").json()["needs_you"]
    assert any(n["id"] == proposed["proposed"] and "Pipeline value" in n["text"] for n in needs)
    out = c.post(f"/api/proposals/{proposed['proposed']}/decide", json={"accept": True}).json()
    assert [k["title"] for k in out["cards"]] == ["Pipeline value", "Where deals stand"]
    kept = c.get("/api/tables/deals/cards").json()
    assert [(k["type"], k["field"], k["measure"]) for k in kept] == [
        ("metric", "amount", "sum"), ("breakdown", "stage", None)]
    assert "Kept 2 dashboard card(s)" in world.journal.recent(1, kinds=["changed"])[0]["text"]
    # a card already kept isn't proposed again; removing one says so in the journal
    assert "already" in t.card_propose(
        "deals", [{"type": "breakdown", "field": "stage", "title": "Stages"}], "")["error"]
    assert c.delete(f"/api/cards/{kept[0]['id']}").status_code == 200
    assert len(world.cards.of("deals")) == 1
    # a no keeps nothing
    other = t.card_propose("deals", [{"type": "attention", "title": "Chase these"}], "")
    c.post(f"/api/proposals/{other['proposed']}/decide", json={"accept": False})
    assert len(world.cards.of("deals")) == 1


def test_a_change_that_matters_asks_alpha_for_cards_and_rows_alone_do_not(world: World) -> None:
    asked: list[str] = []

    def runner(req: TurnRequest) -> RunResult:
        asked.append(req.sentence)
        return RunResult(ok=True, reply="Proposed one card.")

    deals(world)
    assert cards_runtime.review(world, runner) == []  # the first pass takes tables as they are
    world.collections.add("deals", {"name": "Cafe", "amount": 10}, {})
    assert cards_runtime.review(world, runner) == []  # more rows: the numbers follow by themselves
    world.collections.add_fields("deals", [{"name": "owner", "kind": "text"}])
    out = cards_runtime.review(world, runner)
    assert [(o["collection"], o["change"]) for o in out] == [("deals", "new fields: owner")]
    assert "card_propose" in asked[-1] and "no dashboard cards yet" in asked[-1]
    assert cards_runtime.review(world, runner) == []  # seen once, asked once
    world.collections.create("leads", "Leads", [{"name": "name", "kind": "text"}])
    assert cards_runtime.review(world, runner) == []  # an empty new table waits for rows
    world.collections.add("leads", {"name": "Ann"}, {})
    assert [o["change"] for o in cards_runtime.review(world, runner)] == ["it has its first rows"]


def test_removing_a_project_removes_its_cards(world: World) -> None:
    module = world.modules.create("Sales", None)
    world.collections.create("deals", "Deals", FIELDS, module=module["id"])
    with world.store.tx() as db:
        world.cards.keep(db, "deals", [{"type": "attention", "field": None, "measure": None,
                                        "title": "Chase these", "why": ""}], None)
    purge.remove_module(world, module["id"])
    assert world.cards.of("deals") == [] and "deals" not in world.cards.shapes()


def test_the_first_table_ever_gets_its_proposal(world: World) -> None:
    asked: list[str] = []

    def runner(req: TurnRequest) -> RunResult:
        asked.append(req.sentence)
        return RunResult(ok=True, reply="Proposed.")

    assert cards_runtime.review(world, runner) == []  # an empty world: the pass starts
    deals(world)
    assert [o["change"] for o in cards_runtime.review(world, runner)] == ["it is new"]
    assert len(asked) == 1


def test_one_proposal_per_card_and_one_answer_per_proposal(world: World) -> None:
    deals(world)
    t = Tools(world)
    pipeline = {"type": "metric", "measure": "sum", "field": "amount", "title": "Pipeline"}
    first = t.card_propose("deals", [pipeline, {**pipeline, "title": "Same card"}], "")
    assert first["cards"] == 1  # the same card twice in one proposal is one card
    assert "wait" in t.card_propose("deals", [pipeline], "")["error"]  # already proposed
    c = TestClient(create_app(world, live=False))
    assert c.post(f"/api/proposals/{first['proposed']}/decide",
                  json={"accept": True}).status_code == 200
    again = c.post(f"/api/proposals/{first['proposed']}/decide", json={"accept": True})
    assert again.status_code >= 400 and "already answered" in again.text
    assert len(world.cards.of("deals")) == 1


def test_a_yes_for_a_table_that_went_keeps_nothing(world: World) -> None:
    module = world.modules.create("Sales", None)
    world.collections.create("deals", "Deals", FIELDS, module=module["id"])
    proposed = Tools(world).card_propose(
        "deals", [{"type": "attention", "title": "Chase these"}], "")
    purge.remove_module(world, module["id"])
    c = TestClient(create_app(world, live=False))
    out = c.post(f"/api/proposals/{proposed['proposed']}/decide", json={"accept": True}).json()
    assert out["gone"] and out["cards"] == [] and world.cards.of("deals") == []
