"""The memory and data foundations: row history, rows that are people, the world's identity."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from alpha.mcp.tools import Tools
from alpha.world.world import World

PROV = {"by": "alpha"}


def contacts(world: World, name: str = "contacts", **identity: str) -> None:
    world.collections.create(
        name, name.title(),
        [{"name": "name", "kind": "text"}, {"name": "profile", "kind": "url"},
         {"name": "headline", "kind": "text"}],
        identity=identity or None,
    )


def test_every_change_keeps_what_the_record_was(world: World) -> None:
    contacts(world)
    rec = world.collections.add("contacts", {"name": "Priya", "headline": "Engineer"}, PROV)
    world.collections.update("contacts", rec["id"], {"headline": "Manager"}, 1, {"by": "person"})
    world.collections.upsert("contacts", "name", [{"name": "Priya", "headline": "Director"}],
                             PROV)
    history = world.collections.history("contacts", rec["id"])
    assert [h["values"]["headline"] for h in history] == ["Manager", "Engineer"]
    assert history[0]["by"] == {"by": "person"}
    world.collections.delete("contacts", rec["id"], 3)
    assert world.collections.history("contacts", rec["id"])[0]["values"]["headline"] == \
        "Director"


def test_rows_that_are_people_link_by_hard_key_only(world: World) -> None:
    contacts(world, rows_are="person", field="profile")
    contacts(world, "met_at_events", rows_are="person", field="profile")
    world.collections.upsert("contacts", "profile", [
        {"name": "Priya Raman", "profile": "https://www.example.com/in/priya/"}], PROV)
    world.collections.add("contacts", {"name": "Sam Lee"}, PROV)  # no profile: no entity
    met = world.collections.add("met_at_events", {"name": "Priya R.",
                                                  "profile": "https://example.com/in/priya"}, PROV)
    assert met["_entity"]
    entity = Tools(world).entity_read(met["_entity"])
    assert entity["name"] == "Priya Raman" and "Priya R." in entity["aliases"]
    assert sorted(r["collection"] for r in entity["rows"]) == ["contacts", "met_at_events"]
    sam = world.collections.query("contacts", {"name": "Sam Lee"})[0]
    assert "_entity" not in sam


def test_an_existing_table_can_be_linked_afterwards(world: World) -> None:
    contacts(world)
    world.collections.upsert("contacts", "profile", [
        {"name": f"Person {i}", "profile": f"https://example.com/in/p{i}"} for i in range(5)
    ], PROV)
    described = Tools(world).collection_identify("contacts", "person", "profile")
    assert described["linked"] == 5 and described["identity"]["rows_are"] == "person"
    assert all("_entity" in r for r in world.collections.query("contacts"))


def test_an_older_world_file_is_brought_up_to_date(tmp_path: Path) -> None:
    path = tmp_path / "old.sqlite"
    db = sqlite3.connect(path)
    db.executescript(
        "CREATE TABLE notes (id TEXT PRIMARY KEY, scope TEXT NOT NULL, title TEXT NOT NULL,"
        " body TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (scope, title));"
        "CREATE TABLE threads (id TEXT PRIMARY KEY, title TEXT NOT NULL, kind TEXT NOT NULL,"
        " state TEXT NOT NULL, module TEXT, session_ref TEXT, created_at TEXT NOT NULL,"
        " updated_at TEXT NOT NULL);"
        "INSERT INTO threads VALUES ('t_1','Sync','job','done',NULL,'sess-1','x','x');"
    )
    db.commit()
    db.close()
    world = World(path)
    columns = {r["name"] for r in world.store.all("PRAGMA table_info(threads)")}
    assert "brief" in columns
    assert world.modules.thread("t_1")["session_ref"] is None
    first = world.store.one("SELECT value FROM meta WHERE key = 'world_id'")
    world.close()
    again = World(path)
    assert again.store.one("SELECT value FROM meta WHERE key = 'world_id'")["value"] == \
        first["value"]
    again.close()
