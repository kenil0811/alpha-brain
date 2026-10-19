"""Tasks (P1, 18 Oct 2026; docs/design/tasks-and-cards-proposal.md, Q85, Q87, Q91): one table
the world keeps itself, each task living on the place it concerns, commitments grown into it."""

from __future__ import annotations

import sqlite3
from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest
from conftest import building
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.mcp.tools import Tools
from alpha.world import queries
from alpha.world.purge import remove_module
from alpha.world.store import Problem
from alpha.world.tasks import TABLE, next_due, repeat_step
from alpha.world.world import World


def deals(world: World) -> tuple[str, str]:
    """A module with a table and one row: a place for tasks to live."""
    t = building(world)
    mid = t.module_create("DealPilot", "find a firm to buy")["id"]
    t.collection_create("deals", "Deals", [{"name": "title", "kind": "text"},
                                           {"name": "price", "kind": "number"}], module=mid)
    row = world.collections.add("deals", {"title": "Midwest HVAC", "price": 900000},
                                {"by": "alpha", "source": "https://brokers.example/l/1"})
    return mid, row["id"]


def test_the_table_is_the_worlds_own_with_its_lists(world: World) -> None:
    desc = world.collections.describe(TABLE)
    assert desc["world"] and desc["module"] is None and desc["title"] == "Tasks"
    assert {f["name"] for f in desc["fields"]} >= {"title", "state", "due", "owner", "anchor",
                                                   "about", "parent", "repeats", "remind_at"}
    titles = [v["title"] for v in world.views.for_table(TABLE)]
    assert titles[:4] == ["Open", "Today", "This week", "Overdue"] and "By place" in titles
    world.tasks.ensure()  # again: nothing made twice
    assert len(world.views.for_table(TABLE)) == len(titles)
    home = TestClient(create_app(world, live=False)).get("/api/home").json()
    assert all(t["name"] != TABLE for t in home["loose_tables"])  # its own page, not Home's


def test_a_world_with_commitments_has_them_moved_into_tasks_once(tmp_path: Path) -> None:
    path = tmp_path / "old.sqlite"
    World(path).close()
    db = sqlite3.connect(path)
    db.executescript("""
        CREATE TABLE commitments (id TEXT PRIMARY KEY, who TEXT NOT NULL, what TEXT NOT NULL,
            to_whom TEXT, due TEXT, state TEXT NOT NULL DEFAULT 'open', source TEXT,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL, remind_at TEXT,
            reminded_at TEXT);
        INSERT INTO commitments VALUES ('c_1', 'person', 'send Sania the deck', NULL,
            '2026-10-20', 'open', 'j_1', '2026-10-10T00:00:00+00:00',
            '2026-10-10T00:00:00+00:00', NULL, NULL);
        INSERT INTO commitments VALUES ('c_2', 'person', 'call Sara', NULL, '2026-10-24',
            'done', 'j_2', '2026-10-11T00:00:00+00:00', '2026-10-11T00:00:00+00:00',
            '2026-10-24T08:00:00+00:00', NULL);
        UPDATE agents SET may = '["facts", "notes", "commitments", "decisions"]';
    """)
    db.commit()
    db.close()
    world = World(path)
    try:
        rows = {t["title"]: t for t in world.tasks.all()}
        assert rows["send Sania the deck"]["state"] == "Open"
        assert rows["send Sania the deck"]["_provenance"]["source"] == "from what you said"
        assert rows["call Sara"]["state"] == "Done" and rows["call Sara"]["remind_at"]
        assert rows["call Sara"]["created_at"] == "2026-10-11T00:00:00+00:00"  # its day kept
        assert world.store.one("SELECT 1 FROM sqlite_master WHERE name = 'commitments'") is None
        assert "Moved 2 commitments" in world.journal.recent(5, kinds=["did"])[-1]["text"]
    finally:
        world.close()
    again = World(path)  # once: opening again moves nothing
    try:
        assert len(again.tasks.all()) == 2
    finally:
        again.close()


def test_a_task_lives_on_a_place_said_in_words(world: World) -> None:
    mid, rid = deals(world)
    tasks = world.tasks
    on_row = tasks.address(table="deals", record=rid)
    on_field = tasks.address(table="deals", record=rid, field="price")
    assert on_row == f"#/m/{mid}/deals/{rid}" and on_field == on_row + "/price"
    assert tasks.address(module="DealPilot") == f"#/m/{mid}"
    assert tasks.place_words(on_field) == "DealPilot › Deals › Midwest HVAC › Price"
    with pytest.raises(Problem, match="no field"):
        tasks.address(table="deals", record=rid, field="nope")
    with pytest.raises(Problem, match="an address"):
        tasks.check_anchor("deals somewhere")
    a = tasks.make("Ask the broker for three years of P&L", anchor=on_row)
    b = tasks.make("Check the asking price", anchor=on_field)
    tasks.make("Read the CIM", anchor=f"#/m/{mid}")
    assert [t["id"] for t in tasks.at(on_row)] == [a["id"], b["id"]]  # the row and inside it
    assert [t["id"] for t in tasks.at(on_row, within=False)] == [a["id"]]
    assert len(tasks.at(f"#/m/{mid}")) == 3
    assert (a["state"], a["owner"], a["by"], a["suggested"]) == ("Open", "person", "alpha", False)


def test_an_agents_task_is_a_suggestion_and_watsons_is_not(world: World) -> None:
    from alpha.runtime.agents import builtin

    builtin.ensure(world)
    agent = world.agents.create("Every day, read the broker sites")
    made = Tools(world, turn="j_1", actor=agent["id"]).world_remember(
        "task", text="Ask Thrive for the teaser")
    assert made["suggested"] and world.tasks.get(made["task"])["by"] == agent["id"]
    watson = next(a for a in world.agents.all() if a["kind"] == "watson")
    kept = world.tasks.record("person", "send the deck", source="j_2", by=watson["id"])
    assert kept["suggested"] is False and kept["by"] == watson["id"]  # Q91: at once
    with pytest.raises(Problem, match="owner"):
        world.tasks.make("Who does this?", owner="somebody")


def test_the_model_places_a_task_and_says_where(world: World) -> None:
    mid, rid = deals(world)
    t = Tools(world, turn="j_1", module=mid)
    out = t.world_remember("task", text="Ask the broker for 3 years of P&L",
                           place=f"deals/{rid}", when="2026-10-24")
    row = world.tasks.get(out["task"])
    assert row["anchor"] == f"#/m/{mid}/deals/{rid}" and row["due"] == "2026-10-24"
    assert out["placed"] == "DealPilot › Deals › Midwest HVAC" and "one line" in out["note"]
    assert not row.get("remind_at")  # a day alone is not a reminder
    timed = t.world_remember("task", text="Call the broker", when="2026-10-24T15:00")
    assert world.tasks.get(timed["task"])["remind_at"]  # a time is a reminder too
    assert world.tasks.get(timed["task"])["anchor"] == f"#/m/{mid}"  # the conversation's module
    home = Tools(world, turn="j_2").world_remember("task", text="Renew the passport")
    assert home["placed"] == "nowhere yet" and not world.tasks.get(home["task"]).get("anchor")
    done = t.world_remember("task", id=out["task"], state="done")
    assert done["state"] == "Done"
    bad = t.world_remember("task", text="x", place="deals/r_nothing")
    assert "error" in bad


def test_done_makes_the_next_of_a_repeating_task(world: World) -> None:
    today = datetime.now(UTC).astimezone().date()
    due = today - timedelta(days=2)
    t = world.tasks.make("Send the weekly numbers", due=due.isoformat(), repeats="weekly")
    world.tasks.set_state(t["id"], "Done")
    nxt = [x for x in world.tasks.of("person") if x["title"] == "Send the weekly numbers"]
    assert len(nxt) == 1 and nxt[0]["id"] != t["id"] and nxt[0]["state"] == "Open"
    assert nxt[0]["due"] == (due + timedelta(days=7)).isoformat()
    with pytest.raises(Problem, match="Repeats is said like"):
        world.tasks.make("x", repeats="whenever I feel like it")


def test_the_repeat_rules_step_forward() -> None:
    monday = date(2026, 10, 19)
    assert repeat_step("every Monday")(monday) == date(2026, 10, 26)
    assert repeat_step("every friday")(monday) == date(2026, 10, 23)
    assert repeat_step("every 2 weeks")(monday) == date(2026, 11, 2)
    assert repeat_step("monthly on the 1st")(monday) == date(2026, 11, 1)
    assert repeat_step("monthly on the 31st")(date(2027, 1, 31)) == date(2027, 2, 28)
    assert repeat_step("monthly on the 31st")(date(2027, 2, 28)) == date(2027, 3, 31)
    assert repeat_step("monthly")(date(2027, 1, 31)) == date(2027, 2, 28)
    # done late: the next one is past today, never overdue at once
    assert next_due("daily", date(2026, 10, 1), date(2026, 10, 18)) == date(2026, 10, 19)


def test_removal_takes_the_tasks_living_on_what_goes(world: World) -> None:
    mid, rid = deals(world)
    tasks = world.tasks
    on_row = tasks.make("Ask for the P&L", anchor=tasks.address(table="deals", record=rid))
    tasks.make("Read the CIM", anchor=f"#/m/{mid}")
    elsewhere = tasks.make("Renew the passport")
    row = world.collections.get("deals", rid)
    world.collections.delete("deals", rid, row["revision"])
    assert [t["id"] for t in tasks.all()] == [x["id"] for x in tasks.all()
                                             if x["id"] != on_row["id"]]
    remove_module(world, mid)
    assert [t["id"] for t in tasks.all()] == [elsewhere["id"]]
    assert world.store.one("SELECT 1 FROM records WHERE collection = ? AND"
                           " json_extract(\"values\", '$.title') = 'Read the CIM'",
                           (TABLE,)) is None  # for good, with the module


def test_someone_removed_takes_what_they_owed(world: World) -> None:
    from alpha.world.purge import _forget_entities

    sania = world.entities.resolve("person", "Sania", {"email": "sania@example.com"})["entity"]
    owed = world.tasks.record(f"entity:{sania['id']}", "send the term sheet")
    mine = world.tasks.record("person", "send Sania the deck", to_whom=f"entity:{sania['id']}")
    assert world.tasks.of(f"entity:{sania['id']}") and mine["about"] == [f"entity:{sania['id']}"]
    with world.store.tx() as db:
        _forget_entities(db, [sania["id"]])
    ids = [t["id"] for t in world.tasks.all()]
    assert owed["id"] not in ids and mine["id"] in ids
    assert world.tasks.get(mine["id"]).get("about") == []


def test_around_a_task_is_its_place_its_tree_and_its_neighbours(world: World) -> None:
    mid, rid = deals(world)
    tasks = world.tasks
    world.knowledge.write_note("module:DealPilot", "DealPilot", "We buy bookkeeping firms.")
    field = tasks.address(table="deals", record=rid, field="price")
    parent = tasks.make("Diligence on Midwest HVAC", anchor=tasks.address(table="deals",
                                                                           record=rid))
    task = tasks.make("Check the asking price", anchor=field, parent=parent["id"])
    child = tasks.make("Find two comparables", parent=task["id"])
    tasks.make("Ask about the price drop", anchor=field)
    around = tasks.around(task["id"])
    assert [s["kind"] for s in around["where"]] == ["module", "table", "record", "field"]
    assert around["place"]["values"] == [{"field": "price", "label": "Price", "value": 900000,
                                          "source": "https://brokers.example/l/1",
                                          "estimated": False, "kind": "number"}]
    assert around["parent"]["id"] == parent["id"] and around["children"][0]["id"] == child["id"]
    assert [b["title"] for b in around["beside"]] == ["Ask about the price drop"]
    assert around["notes"] == "We buy bookkeeping firms."
    text = tasks.around_text(task["id"])
    assert "Where it lives: DealPilot › Deals › Midwest HVAC › Price" in text
    c = TestClient(create_app(world, live=False))
    assert c.get(f"/api/tasks/{task['id']}/around").json()["parent"]["id"] == parent["id"]
    at = c.get("/api/tasks", params={"at": f"#/m/{mid}"}).json()
    assert {t["id"] for t in at["tasks"]} == {parent["id"], task["id"], tasks.at(field)[1]["id"]}
    assert at["tasks"][0]["_words"]["anchor"].startswith("DealPilot › Deals")


def test_the_model_reads_tasks_as_tasks(world: World) -> None:
    world.tasks.make("Renew the passport", due="2026-11-01")
    out = queries.query(world.path, "SELECT title, state, due FROM tasks")
    assert out["rows"] == [{"title": "Renew the passport", "state": "Open", "due": "2026-11-01"}]
    # a field named like a word of SQL still reads
    building(world).collection_create("orders", "Orders", [{"name": "order", "kind": "text"}])
    world.collections.add("orders", {"order": "first"}, {"by": "alpha"})
    assert queries.query(world.path, 'SELECT "order" FROM rows_orders')["rows"] == [
        {"order": "first"}]


def test_a_relation_may_hold_several(world: World) -> None:
    t = world.tasks.make("Call them both", about=["entity:e_1", "deals/r_1", "entity:e_1", ""])
    assert t["about"] == ["entity:e_1", "deals/r_1"]


def test_a_removal_says_which_tasks_go_with_it(world: World) -> None:
    from alpha.world.purge import removal_plan

    mid, rid = deals(world)
    world.tasks.make("Ask for the P&L", anchor=world.tasks.address(table="deals", record=rid))
    world.tasks.make("Read the CIM", anchor=f"#/m/{mid}")
    assert "2 open tasks" in removal_plan(world, mid)["what"]


def test_the_model_reads_what_is_around_a_task(world: World) -> None:
    mid, rid = deals(world)
    task = world.tasks.make("Check the asking price",
                            anchor=world.tasks.address(table="deals", record=rid, field="price"))
    out = Tools(world, turn="j_1").world_remember("task", id=task["id"])
    assert "Where it lives: DealPilot › Deals › Midwest HVAC › Price" in out["around"]
    assert "Price: 900000 (from https://brokers.example/l/1)" in out["around"]


def test_the_person_moves_a_task_and_keeps_or_drops_a_suggestion(world: World) -> None:
    mid, rid = deals(world)
    c = TestClient(create_app(world, live=False))
    made = c.post("/api/tasks", json={"title": "Call the broker", "anchor": f"#/m/{mid}"}).json()
    assert made["by"] == "person" and made["_words"]["anchor"] == "DealPilot"
    moved = c.post(f"/api/tasks/{made['id']}/place",
                   json={"table": "deals", "record": rid, "field": "price"}).json()
    assert moved["_words"]["anchor"] == "DealPilot › Deals › Midwest HVAC › Price"
    off = c.post(f"/api/tasks/{made['id']}/place", json={}).json()
    assert not off.get("anchor")
    agent = world.agents.create("Every day, read the broker sites")
    out = Tools(world, turn="j_1", actor=agent["id"]).world_remember("task", text="Ask Thrive")
    kept = c.post(f"/api/tasks/{out['task']}/keep").json()
    assert kept["suggested"] is False and kept["state"] == "Open"
    other = Tools(world, turn="j_2", actor=agent["id"]).world_remember("task", text="Ask Mindy")
    dropped = c.post(f"/api/tasks/{other['task']}/drop").json()
    assert dropped["state"] == "Dropped" and dropped["suggested"] is False
