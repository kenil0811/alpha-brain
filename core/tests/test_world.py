from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

import pytest

from alpha.world.store import VERSION, Problem, Store, version_of
from alpha.world.world import World

FOOD: list[dict[str, Any]] = [
    {"name": "food", "kind": "text", "required": True},
    {"name": "kcal", "kind": "number", "unit": "kcal"},
    {"name": "protein_g", "kind": "number", "unit": "g"},
    {"name": "meal", "kind": "choice", "choices": ["breakfast", "lunch", "dinner", "snack"]},
    {"name": "eaten_on", "kind": "date"},
]


def food_table(world: World) -> None:
    world.collections.create("food_log", "Food log", FOOD)


# ---- journal ----


def test_journal_append_recent_search_and_forget(world: World) -> None:
    a = world.journal.append("said", "log two boiled eggs", actor="person")
    world.journal.append("replied", "Logged two boiled eggs, about 155 kcal.")
    world.journal.append("said", "what about lunch", actor="person", thread="t_x")
    stream = world.journal.recent(10, stream=True)
    assert [e["kind"] for e in stream] == ["said", "replied"]
    assert world.journal.search("eggs")[0]["id"] in {e["id"] for e in stream}
    world.journal.forget(a)
    assert all(e["id"] != a for e in world.journal.search("boiled"))
    with pytest.raises(Problem):
        world.journal.read(a)


def test_journal_refuses_unknown_kind(world: World) -> None:
    with pytest.raises(Problem, match="kind"):
        world.journal.append("shouted", "x")


def test_open_asks_until_answered(world: World) -> None:
    ask = world.journal.append("asked", "What is your height?")
    assert [a["id"] for a in world.journal.open_asks()] == [ask]
    world.journal.append("answered", "180 cm", actor="person", data={"ask": ask})
    assert world.journal.open_asks() == []


# ---- collections ----


def test_create_add_query_aggregate(world: World) -> None:
    food_table(world)
    prov = {"by": "alpha"}
    world.collections.add("food_log", {"food": "Two boiled eggs", "kcal": 155, "protein_g": 13,
                                       "meal": "breakfast", "eaten_on": "2026-10-01"}, prov)
    world.collections.add("food_log", {"food": "Chicken salad", "kcal": "520.0",
                                       "meal": "lunch", "eaten_on": "2026-10-01"}, prov)
    world.collections.add("food_log", {"food": "Toast", "kcal": 90, "eaten_on": "2026-09-30"},
                          prov)
    today = world.collections.query("food_log", {"eaten_on": "2026-10-01"}, order="kcal")
    assert [r["food"] for r in today] == ["Two boiled eggs", "Chicken salad"]
    assert today[1]["kcal"] == 520  # a whole float is stored as an int
    total = world.collections.aggregate("food_log", "sum", "kcal", {"eaten_on": "2026-10-01"})
    assert total["value"] == 675 and total["records"] == 2
    assert world.collections.aggregate("food_log", "count")["value"] == 3
    big = world.collections.query("food_log", {"kcal": {"gte": 150}, "food": {"contains": "EGG"}})
    assert [r["food"] for r in big] == ["Two boiled eggs"]
    assert world.collections.search("chicken")[0]["collection"] == "food_log"
    assert world.collections.describe("food_log")["records"] == 3


def test_the_model_reads_500_at_a_time_and_the_page_reads_every_row(world: World) -> None:
    food_table(world)
    rows = [{"food": f"Item {i}", "kcal": i} for i in range(620)]
    world.collections.upsert("food_log", "food", rows, {"by": "alpha"})
    assert len(world.collections.query("food_log", limit=1000)) == 500
    every = world.collections.query("food_log", {"kcal": {"gte": 10}}, order="kcal", limit=None)
    assert len(every) == 610 and every[0]["kcal"] == 10


def test_validation_speaks_plainly(world: World) -> None:
    food_table(world)
    with pytest.raises(Problem, match="kcal"):
        world.collections.add("food_log", {"food": "x", "kcal": "lots"}, {})
    with pytest.raises(Problem, match="meal"):
        world.collections.add("food_log", {"food": "x", "meal": "brunch"}, {})
    with pytest.raises(Problem, match="no field"):
        world.collections.add("food_log", {"food": "x", "sugar": 3}, {})
    with pytest.raises(Problem, match="needs"):
        world.collections.add("food_log", {"kcal": 3}, {})
    with pytest.raises(Problem, match="table name"):
        world.collections.create("Food Log", "Food", FOOD)
    with pytest.raises(Problem, match="exists already"):
        food_table(world)
    with pytest.raises(Problem, match="choices"):
        world.collections.create("t", "T", [{"name": "s", "kind": "status"}])


def test_every_field_kind(world: World) -> None:
    world.collections.create("things", "Things", [
        {"name": "title", "kind": "text"}, {"name": "body", "kind": "long_text"},
        {"name": "n", "kind": "number"}, {"name": "d", "kind": "date"},
        {"name": "dt", "kind": "datetime"}, {"name": "b", "kind": "bool"},
        {"name": "c", "kind": "choice", "choices": ["a", "b"]},
        {"name": "mc", "kind": "multichoice", "choices": ["x", "y"]},
        {"name": "s", "kind": "status", "choices": ["open", "done"], "done_choices": ["done"]},
        {"name": "u", "kind": "url"}, {"name": "who", "kind": "relation",
                                       "relation": "entity:person"},
    ])
    rec = world.collections.add("things", {
        "title": "t", "body": "long", "n": "3.5", "d": "2026-10-01T09:00:00", "dt":
        "2026-10-01T09:00:00Z", "b": "yes", "c": "a", "mc": ["x", "y"], "s": "open",
        "u": "https://example.com", "who": "e_1",
    }, {})
    assert rec["n"] == 3.5 and rec["d"] == "2026-10-01" and rec["b"] is True
    assert rec["dt"].endswith("+00:00") and rec["mc"] == ["x", "y"]
    with pytest.raises(Problem, match="web address"):
        world.collections.add("things", {"u": "example.com"}, {})


def test_update_is_compare_and_swap_and_delete(world: World) -> None:
    food_table(world)
    rec = world.collections.add("food_log", {"food": "Eggs", "kcal": 150}, {"by": "alpha"})
    updated = world.collections.update("food_log", rec["id"], {"kcal": 155}, 1, {"by": "person"})
    assert updated["kcal"] == 155 and updated["revision"] == 2 and updated["food"] == "Eggs"
    with pytest.raises(Problem, match="changed since"):
        world.collections.update("food_log", rec["id"], {"kcal": 1}, 1, {})
    assert world.collections.search("eggs")
    world.collections.delete("food_log", rec["id"], 2)
    assert world.collections.query("food_log") == []
    assert world.collections.search("eggs") == []


def test_tables_only_grow(world: World) -> None:
    food_table(world)
    world.collections.add("food_log", {"food": "Eggs"}, {})
    grown = world.collections.add_fields(
        "food_log", [{"name": "fibre_g", "kind": "number", "required": True}]
    )
    assert "fibre_g" in [f["name"] for f in grown["fields"]]
    world.collections.add("food_log", {"food": "Oats", "fibre_g": 4}, {})  # still optional
    with pytest.raises(Problem, match="already has"):
        world.collections.add_fields("food_log", [{"name": "kcal", "kind": "number"}])


# ---- knowledge ----


def test_notes_goals(world: World) -> None:
    note = world.knowledge.write_note("person", "Standing instructions", "Metric units.")
    again = world.knowledge.write_note("person", "Standing instructions", "Metric units. No calls.")
    assert again["id"] == note["id"] and "No calls" in again["body"]
    with pytest.raises(Problem, match="scope"):
        world.knowledge.write_note("everyone", "x", "y")
    goal = world.knowledge.set_goal("Under 2,000 kcal on weekdays")
    assert [g["id"] for g in world.knowledge.goals()] == [goal["id"]]
    world.knowledge.update_goal(goal["id"], "done")
    assert world.knowledge.goals() == []


def test_single_valued_facts_supersede(world: World) -> None:
    k = world.knowledge
    a = k.record_fact("person", "works_at", "Northwind", source="you", state="accepted")
    b = k.record_fact("person", "works_at", "Lumen", source="you", state="accepted")
    current = k.facts("person")
    assert [f["value"] for f in current] == ["Lumen"]
    old = k.fact(a["id"])
    assert old["superseded_by"] == b["id"] and old["valid_to"] is not None
    history = k.facts("person", current=False)
    assert {f["value"] for f in history} == {"Northwind", "Lumen"}


def test_multi_valued_facts_side_by_side_and_suggestions(world: World) -> None:
    k = world.knowledge
    k.record_fact("person", "speaks", "English", source="you", state="accepted", single=False)
    k.record_fact("person", "speaks", "Gujarati", source="you", state="accepted", single=False)
    assert {f["value"] for f in k.facts("person")} == {"English", "Gujarati"}
    s = k.record_fact("person", "prefers", "mornings", source="alpha")
    assert s["state"] == "suggested"
    assert k.decide_fact(s["id"], accept=True)["state"] == "accepted"
    with pytest.raises(Problem, match="not waiting"):
        k.decide_fact(s["id"], accept=False)


# ---- entities ----


def test_hard_keys_resolve_names_do_not(world: World) -> None:
    e = world.entities
    a = e.resolve("person", "Priya Raman", {"linkedin": "https://www.linkedin.com/in/priya/"})
    assert a["created"]
    b = e.resolve("person", "P. Raman", {"linkedin": "linkedin.com/in/priya",
                                         "email": "Priya@Lumen.example"})
    assert not b["created"] and b["entity"]["id"] == a["entity"]["id"]
    assert "P. Raman" in b["entity"]["aliases"]
    assert e.find(keys={"email": "priya@lumen.example"})[0]["id"] == a["entity"]["id"]
    c = e.resolve("person", "Priya Raman")  # a name alone never merges
    assert c["created"] and c["maybe"] and c["maybe"][0]["id"] == a["entity"]["id"]


def test_merge_and_undo(world: World) -> None:
    e = world.entities
    a = e.resolve("person", "Mark Ellis", {"linkedin": "linkedin.com/in/mark"})["entity"]
    b = e.resolve("person", "M. Ellis", {"email": "m.ellis@northwind.example"})["entity"]
    merged = e.merge(a["id"], b["id"])
    assert merged["keys"]["email"] == ["m.ellis@northwind.example"]
    assert e.get(b["id"])["id"] == a["id"]
    assert e.find(keys={"email": "m.ellis@northwind.example"})[0]["id"] == a["id"]
    e.unmerge(b["id"])
    assert e.find(keys={"email": "m.ellis@northwind.example"})[0]["id"] == b["id"]


# ---- modules and threads ----


def test_modules_and_threads(world: World) -> None:
    m = world.modules.create("Food", "Eat well")
    assert world.modules.get("food")["id"] == m["id"]
    with pytest.raises(Problem, match="already"):
        world.modules.create("FOOD")
    t = world.modules.open_thread("Make the food tracker good", "research", m["id"])
    assert world.modules.threads()[0]["id"] == t["id"]
    world.modules.update_thread(t["id"], state="done", session_ref="s-1")
    assert world.modules.threads() == []
    assert world.modules.thread(t["id"])["session_ref"] == "s-1"


def test_an_older_store_is_upgraded_and_a_newer_one_refused(tmp_path: Path) -> None:
    path = tmp_path / "world.sqlite"
    Store(path).close()
    old = sqlite3.connect(path)  # a store from before versions were kept
    old.execute("ALTER TABLE readers DROP COLUMN allow_posts")
    old.execute("PRAGMA user_version = 0")
    old.close()
    store = Store(path)
    assert "allow_posts" in {r[1] for r in store.db.execute("PRAGMA table_info(readers)")}
    assert version_of(store.db) == VERSION
    store.db.execute(f"PRAGMA user_version = {VERSION + 1}")
    store.close()
    with pytest.raises(Problem, match="newer Alpha"):
        Store(path)
