"""Skills: the one unit of know-how (design §3.7, point 7)."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from conftest import building

from alpha.context import prepack
from alpha.mcp.tools import Tools
from alpha.runtime import pipeline
from alpha.world.purge import remove_module
from alpha.world.store import Problem
from alpha.world.world import World


def test_an_older_world_moves_its_readers_procedures_and_pipelines_into_skills(
        tmp_path: Path) -> None:
    path = tmp_path / "old.sqlite"
    db = sqlite3.connect(path)
    db.executescript(
        "CREATE TABLE readers (name TEXT PRIMARY KEY, site TEXT NOT NULL, url TEXT NOT NULL,"
        " script TEXT NOT NULL, to_end INTEGER NOT NULL DEFAULT 0, description TEXT NOT NULL,"
        " version INTEGER NOT NULL DEFAULT 1, health TEXT NOT NULL DEFAULT 'ok',"
        " last_problem TEXT, last_run_at TEXT, last_count INTEGER, last_ok_count INTEGER,"
        " created_at TEXT NOT NULL, updated_at TEXT NOT NULL, whole INTEGER NOT NULL DEFAULT 1);"
        "INSERT INTO readers VALUES ('linkedin_connections','linkedin.com','https://l/c',"
        " 'return []',1,'Reads connections',3,'ok',NULL,'2026-10-03T08:44:02+00:00',1551,1551,"
        " 'x','x',1);"
        "CREATE TABLE procedures (name TEXT PRIMARY KEY, site TEXT NOT NULL, url TEXT NOT NULL,"
        " description TEXT NOT NULL, effect TEXT NOT NULL, steps TEXT NOT NULL,"
        " verify TEXT NOT NULL DEFAULT '[]', fields TEXT NOT NULL, version INTEGER NOT NULL"
        " DEFAULT 1, health TEXT NOT NULL DEFAULT 'untried', last_problem TEXT,"
        " last_run_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);"
        "INSERT INTO procedures VALUES ('gmail_draft','google.com','https://mail.google.com',"
        " 'Make a draft email in Gmail','prepare','[{\"click_text\": \"Compose\"}]','[]',"
        " '[\"to\"]',1,'ok',NULL,NULL,'x','x');"
        "CREATE TABLE automations (id TEXT PRIMARY KEY, title TEXT NOT NULL, module TEXT,"
        " thread TEXT, schedule TEXT NOT NULL, procedure TEXT NOT NULL, enabled INTEGER NOT NULL"
        " DEFAULT 1, next_run_at TEXT, last_run_at TEXT, last_result TEXT, last_error TEXT,"
        " created_at TEXT NOT NULL, updated_at TEXT NOT NULL, steps TEXT);"
        "INSERT INTO automations VALUES ('a_1','Daily deal tracker — read all broker sources',"
        " NULL,NULL,'daily 07:00','',1,NULL,'2026-10-03T08:45:53+00:00','Read 15',NULL,'x','x',"
        " '[{\"read\": \"linkedin_connections\", \"into\": \"t\", \"key\": \"k\"}]');"
    )
    db.commit()
    db.close()
    world = World(path)
    names = {s["name"]: s for s in world.skills.all()}
    pipe = "run_deal_tracker_broker_sources"
    assert set(names) == {"linkedin_connections", "gmail_draft", pipe}
    reader = names["linkedin_connections"]
    assert reader["kind"] == "read" and reader["version"] == 3
    assert world.readers.get("linkedin_connections")["last_ok_count"] == 1551
    assert names["gmail_draft"]["kind"] == "act" and names["gmail_draft"]["fields"] == ["to"]
    assert world.procedures.get("gmail_draft")["steps"] == [{"click_text": "Compose"}]
    run = names[pipe]
    assert run["kind"] == "run" and run["health"] == "ok"
    assert run["steps"][0]["read"] == "linkedin_connections"
    auto = world.automations.get("a_1")
    assert auto["skill"] == run["name"] and auto["steps"] == run["steps"]
    assert world.store.one("SELECT name FROM sqlite_master WHERE name IN ('readers',"
                           " 'procedures')") is None
    world.close()
    again = World(path)  # opening again moves nothing twice
    assert len(again.skills.all()) == 3
    # A run skill named by an earlier rule is renamed on open, with references following.
    with again.store.tx() as db:
        db.execute("UPDATE skills SET name = 'run_every_day_at_07_00' WHERE name = ?", (pipe,))
        db.execute("UPDATE automations SET skill = 'run_every_day_at_07_00' WHERE id = 'a_1'")
        db.execute("INSERT INTO skills (name, kind, description, steps, created_at, updated_at)"
                   " VALUES ('run_other', 'run', 'Other', ?, 'x', 'x')",
                   ('[{"run":"run_every_day_at_07_00"},{"tell":"t"}]',))  # compact, as kept
    again.close()
    third = World(path)
    assert third.automations.get("a_1")["skill"] == pipe
    assert third.skills.get("run_other")["steps"] == [{"run": pipe}, {"tell": "t"}]
    third.close()


def test_a_pipeline_is_a_run_skill_named_after_its_automation(world: World) -> None:
    building(world).collection_create("deals", "Deals", [{"name": "title", "kind": "text"}])
    world.readers.save("brokers", site="b.com", url="https://b.com", script="return []",
                       description="Reads brokers", to_end=False, count=3)
    t = building(world)
    one = t.automation_create("Daily deals, read the brokers", "daily 07:00",
                              steps=[{"read": "brokers", "into": "deals", "key": "title"}])
    assert one["skill"] == "run_deals_brokers"  # the words that carry meaning
    assert world.skills.get(one["skill"])["kind"] == "run"
    two = t.automation_create("Daily deals, read the brokers", "daily 08:00",
                              steps=[{"tell": "deals"}])
    assert two["skill"] == "run_deals_brokers_2"  # a second of the same title
    # Updating the steps replaces the skill's steps, same name, version up.
    t.automation_update(one["id"], steps=[{"read": "brokers", "into": "deals", "key": "title"},
                                          {"tell": "deals"}])
    skill = world.skills.get(one["skill"])
    assert skill["version"] == 2 and len(skill["steps"]) == 2
    assert world.automations.get(one["id"])["steps"] == skill["steps"]
    # A run's outcome lands on the skill's health.
    world.automations.finished(one["id"], result=None, error="b.com needs your sign-in.")
    assert world.skills.get(one["skill"])["health"] == "broken"


def test_a_step_may_call_another_run_skill_but_never_itself(world: World) -> None:
    building(world).collection_create("deals", "Deals", [{"name": "title", "kind": "text"}])
    world.readers.save("brokers", site="b.com", url="https://b.com", script="return []",
                       description="Reads brokers", to_end=False, count=3)
    t = building(world)
    base = t.automation_create("Read the brokers", "daily 07:00",
                               steps=[{"read": "brokers", "into": "deals", "key": "title"}])
    composed = t.automation_create("Brokers, then tell", "daily 07:30",
                                   steps=[{"run": base["skill"]}, {"tell": "deals"}])
    flat = pipeline._flatten(world, world.automations.get(composed["id"])["steps"])
    assert [list(s)[0] for s in flat] == ["read", "tell"]
    with pytest.raises(Problem, match="call itself"):
        pipeline.check_steps(world, [{"run": base["skill"]}], within=base["skill"])
    with pytest.raises(Problem, match="call itself"):
        pipeline.check_steps(world, [{"run": composed["skill"]}], within=base["skill"])
    with pytest.raises(Problem, match="no pipeline"):
        pipeline.check_steps(world, [{"run": "nothing"}])


def test_the_index_finds_and_shows_skills_and_their_notes(world: World) -> None:
    world.readers.save("linkedin_connections", site="linkedin.com", url="https://l/c",
                       script="return []", description="Reads the connections list",
                       to_end=True, count=10, when_to_use="The person's own connections.")
    world.procedures.save("gmail_draft", site="google.com", url="https://mail.google.com/",
                          description="Make a draft email in Gmail", effect="prepare",
                          steps=[{"click_text": "Compose"}], fields=["to"],
                          when_to_use="Any draft in Gmail; to, subject and body are fields.")
    k = world.skills
    assert [s["name"] for s in k.find(site="mail.google.com")] == ["gmail_draft"]
    assert [s["name"] for s in k.find("connections")] == ["linkedin_connections"]
    assert [s["name"] for s in k.find(kind="act")] == ["gmail_draft"]
    assert k.find(site="example.com") == []
    with pytest.raises(Problem, match="no reader"):
        world.readers.get("gmail_draft")
    with pytest.raises(Problem, match="already a read skill"):
        world.procedures.save("linkedin_connections", site="l", url="https://l",
                              description="x", effect="prepare", steps=[{"click": "a"}],
                              fields=[])
    # Site notes are a page of the wiki; a page needs a real skill.
    t = Tools(world)
    t.note_write("skill:gmail_draft", "gmail_draft", "Compose opens a popup; the To field is"
                 " a contenteditable.")
    assert "no skill" in t.note_write("skill:nothing", "nothing", "x")["error"]
    read = t.skill_read("gmail_draft")
    assert read["kind"] == "act" and "contenteditable" in read["notes"]
    found = t.skills_find(site="google.com")
    assert [f["name"] for f in found] == ["gmail_draft"] and "script" not in found[0]
    # The pre-pack carries every skill in one line, with when to use it.
    text = prepack.build(world, "anything")
    assert "WHAT ALPHA CAN DO" in text
    assert "[read] linkedin_connections (linkedin.com, 10 rows When: The person's own" in text
    assert "[act] gmail_draft (google.com, untried, prepare): Make a draft email in Gmail" in text
    assert "When: Any draft in Gmail" in text


def test_removing_a_module_takes_its_run_skills(world: World) -> None:
    mod = world.modules.create("Deals")
    t = building(world)
    t.collection_create("deals", "Deals", [{"name": "title", "kind": "text"}], module="Deals")
    world.readers.save("deals_site", site="d.com", url="https://d.com", script="return []",
                       description="Reads deals", to_end=False, count=3)
    auto = t.automation_create("Daily deals", "daily 07:00", module="Deals",
                               steps=[{"read": "deals_site", "into": "deals", "key": "title"}])
    assert world.skills.get(auto["skill"])["module"] == mod["id"]
    remove_module(world, "Deals")
    assert world.skills.names() == []
