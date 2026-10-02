from __future__ import annotations

import asyncio
from typing import Any

from conftest import building

from alpha.mcp.server import build_server
from alpha.mcp.tools import Tools
from alpha.world.world import World


def test_level_zero_flow_through_the_tools(world: World) -> None:
    t = building(world, turn="j_turn")
    module = t.module_create("Food", "Eat well")
    table = t.collection_create(
        "food_log", "Food log",
        [{"name": "food", "kind": "text"}, {"name": "kcal", "kind": "number", "unit": "kcal"},
         {"name": "protein_g", "kind": "number"}],
        module="Food",
    )
    assert table["module"] == module["id"]
    rec = t.records_add("food_log", {"food": "Two boiled eggs", "kcal": 155, "protein_g": 13},
                        source="estimated")
    assert rec["_provenance"] == {"by": "alpha", "turn": "j_turn", "source": "estimated",
                                  "estimated": True}
    total = t.records_aggregate("food_log", "sum", "kcal")
    assert total["value"] == 155
    changed = t.records_update("food_log", rec["id"], {"kcal": 160}, rec["revision"])
    assert changed["kcal"] == 160
    hits = t.search("eggs")
    assert hits["records"][0]["id"] == rec["id"]
    kinds = [e["kind"] for e in world.journal.recent(20)]
    assert kinds == ["made", "made", "did", "changed"]
    did = world.journal.recent(20, kinds=["did"])[0]
    assert did["text"] == "Added Two boiled eggs to Food log (estimated)."
    assert did["module"] == module["id"] and did["data"]["turn"] == "j_turn"
    listing = t.modules_list()
    assert listing[0]["tables"][0]["name"] == "food_log"


def test_problems_come_back_as_errors(world: World) -> None:
    t = Tools(world)
    assert "no table" in t.records_add("nope", {"a": 1}, source="stated")["error"]
    assert "kind of journal" not in str(t.journal_note("did", "Checked the page."))
    assert "error" in t.journal_note("replied", "x")
    assert "error" in t.goal_update("g_missing", "done")


def test_facts_stated_and_suggested(world: World) -> None:
    t = Tools(world, turn="j_1")
    t.fact_record("person", "height_cm", "178", stated=True, why="I'm 178 cm")
    t.fact_record("person", "height cm", "180", stated=True)
    t.fact_record("person", "prefers", "mornings")
    facts = {f["predicate"]: f for f in t.facts_get()}
    assert facts["height_cm"]["value"] == "180" and facts["height_cm"]["state"] == "accepted"
    assert facts["prefers"]["state"] == "suggested"


def test_entities_and_asks(world: World) -> None:
    t = Tools(world)
    r = t.entity_resolve("person", "Priya Raman", {"email": "priya@lumen.example"})
    assert r["created"]
    assert t.entities_find(email="PRIYA@lumen.example")[0]["id"] == r["entity"]["id"]
    assert t.entity_read(r["entity"]["id"])["facts"] == []
    ask = t.ask_person("What's your height?")
    assert world.journal.open_asks()[0]["id"] == ask["asked"]


def test_server_exposes_every_tool(world: World) -> None:
    server = build_server(world)
    tools = asyncio.run(server.list_tools())
    names = {x.name for x in tools}
    assert {f.__name__ for f in Tools(world).all()} == names
    assert len(names) >= 30
    q: Any = next(x for x in tools if x.name == "records_query")
    assert set(q.parameters["properties"]) == {"collection", "where", "order", "limit"}
    assert "self" not in q.parameters["properties"]


def test_journal_notes_point_at_the_module_by_id(world: World) -> None:
    t = building(world)
    m = t.module_create("Network")
    t.journal_note("did", "Synced.", module="Network")
    assert world.journal.recent(1)[0]["module"] == m["id"]
