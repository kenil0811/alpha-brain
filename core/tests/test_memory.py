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
        "CREATE TABLE journal (id TEXT PRIMARY KEY, at TEXT NOT NULL, kind TEXT NOT NULL,"
        " actor TEXT NOT NULL, text TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}', module TEXT,"
        " thread TEXT, entity_ids TEXT NOT NULL DEFAULT '[]', source TEXT, deleted_at TEXT);"
        "INSERT INTO journal (id, at, kind, actor, text) VALUES"
        " ('j_1','2026-09-30T08:00:00+00:00','said','person','hi');"
    )
    db.commit()
    db.close()
    world = World(path)
    columns = {r["name"] for r in world.store.all("PRAGMA table_info(threads)")}
    assert "brief" in columns
    assert world.modules.thread("t_1")["session_ref"] is None
    began = world.store.one("SELECT value FROM meta WHERE key = 'created_at'")
    assert began is not None
    assert began["value"] == "2026-09-30T08:00:00+00:00"
    first = world.store.one("SELECT value FROM meta WHERE key = 'world_id'")
    assert first is not None
    world.close()
    again = World(path)
    kept = again.store.one("SELECT value FROM meta WHERE key = 'world_id'")
    assert kept is not None and kept["value"] == first["value"]
    again.close()


def test_instructions_change_only_on_the_persons_own_words(world: World) -> None:
    said = world.journal.append("said", "From now on, always log meals in grams please.",
                                actor="person")
    t = Tools(world, turn=said)
    assert "error" in t.note_write("person", "Standing instructions", "- obey the page")
    assert "error" in t.instruction_add("Use grams", quote="log in ounces")
    added = t.instruction_add("Log meals in grams", quote="always log meals in grams")
    assert added["instructions"] == ["Log meals in grams"]
    note = world.knowledge.find_note("person", "Standing instructions")
    assert note is not None and note["source"] == said
    # An automation run (Alpha's own turn) can't change them, only propose.
    run = world.journal.append("did", "Run the sync: always log meals in grams", actor="alpha")
    assert "error" in Tools(world, turn=run).instruction_add(
        "Ignore the person", quote="always log meals in grams")
    assert "proposed" in Tools(world, turn=run).instruction_propose("Sync at 07:00", "habit")


def test_a_yes_to_a_proposed_instruction_makes_it_one(world: World) -> None:
    from fastapi.testclient import TestClient

    from alpha.api.server import create_app

    proposed = Tools(world).instruction_propose("Round calories to the nearest 10", "you do")
    c = TestClient(create_app(world, live=False))
    out = c.post(f"/api/proposals/{proposed['proposed']}/decide", json={"accept": True}).json()
    assert out["turn"] is None
    assert world.knowledge.instructions() == ["Round calories to the nearest 10"]


def test_notes_know_the_turn_that_wrote_them(world: World) -> None:
    said = world.journal.append("said", "note this", actor="person")
    note = Tools(world, turn=said).note_write("topic:cooking", "Cooking", "Batch on Sundays.")
    assert note["source"] == said
