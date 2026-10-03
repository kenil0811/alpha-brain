"""The memory and data foundations: row history, rows that are people, the world's identity."""

from __future__ import annotations

import sqlite3
from pathlib import Path

import pytest
from conftest import backdating

from alpha.mcp.tools import Tools
from alpha.world.store import Problem
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
    assert began is not None and began["value"] == "2026-09-30T08:00:00+00:00"
    first = world.store.one("SELECT value FROM meta WHERE key = 'world_id'")
    assert first is not None
    world.close()
    again = World(path)
    same = again.store.one("SELECT value FROM meta WHERE key = 'world_id'")
    assert same is not None and same["value"] == first["value"]
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


def test_old_linkedin_keys_become_url_keys(tmp_path: Path) -> None:
    path = tmp_path / "keys.sqlite"
    world = World(path)
    priya = world.entities.resolve("person", "Priya Raman",
                                   {"url": "https://www.linkedin.com/in/priya/"})["entity"]
    with world.store.tx() as db:  # as a world written before 2 Oct would have it
        db.execute("UPDATE entity_keys SET key = 'linkedin' WHERE entity_id = ?", (priya["id"],))
        db.execute("UPDATE entities SET keys = ? WHERE id = ?",
                   ('{"linkedin":["linkedin.com/in/priya"]}', priya["id"]))
    world.close()
    again = World(path)
    found = again.entities.find(keys={"url": "https://linkedin.com/in/priya"})
    assert [e["id"] for e in found] == [priya["id"]]
    assert again.entities.get(priya["id"])["keys"] == {"url": ["linkedin.com/in/priya"]}
    assert again.store.one("SELECT 1 AS x FROM entity_keys WHERE key = 'linkedin'") is None
    again.close()


# ---- the wiki, entity cards and days (design §3.7, points 2 and 4) ----


def test_a_page_has_an_index_line_and_grows_under_a_heading(world: World) -> None:
    k = world.knowledge
    page = k.write_note("topic:cooking", "Cooking", "# Cooking\n\nBatch on Sundays.\n")
    assert page["summary"] == "Batch on Sundays."  # the first line of text, when none is given
    page = k.write_note("topic:cooking", "Cooking", "Batch on Sundays.", summary="How Kenil cooks")
    assert page["summary"] == "How Kenil cooks"
    k.append_to_page("topic:cooking", "Cooking", "Noticed", "3 Oct 2026: Tried a new dal.")
    k.append_to_page("topic:cooking", "Cooking", "Noticed", "3 Oct 2026: Tried a new dal.")
    k.append_to_page("topic:cooking", "Cooking", "Noticed", "4 Oct 2026: Froze half.")
    found = k.find_note("topic:cooking", "Cooking")
    assert found is not None
    body = found["body"]
    assert body.startswith("Batch on Sundays.")
    assert body.count("Tried a new dal") == 1 and body.index("Tried") < body.index("Froze")
    assert found["summary"] == "How Kenil cooks"  # kept
    # A page made by an append alone, and an entity page scope (a real entity, never a bare one).
    with pytest.raises(Problem, match="scope"):
        k.write_note("entity:", "Nobody", "x")
    with pytest.raises(Problem, match="no person or company"):
        k.write_note("entity:e_missing", "Nobody", "x")
    vikas = world.entities.resolve("person", "Vikas Badami")["entity"]
    k.append_to_page(f"entity:{vikas['id']}", "Vikas Badami", "Noticed", "Had coffee.")
    assert [p["title"] for p in k.index()] == ["Vikas Badami", "Cooking"]  # by scope
    assert k.index()[0]["summary"] == "Had coffee."  # the first line of text, not the heading


def test_the_prepack_carries_the_index_and_a_card_for_whoever_is_named(world: World) -> None:
    from alpha.context import prepack

    k = world.knowledge
    k.write_note("topic:cooking", "Cooking", "Batch on Sundays.", summary="How Kenil cooks")
    vikas = world.entities.resolve("person", "Vikas Badami",
                                   {"email": "vikas@example.com"})["entity"]
    k.record_fact(f"entity:{vikas['id']}", "works_at", "Avilo", source="stated",
                  state="accepted")
    k.append_to_page(f"entity:{vikas['id']}", "Vikas Badami", "Noticed",
                     "3 Oct 2026: Is moving to Bangalore.")
    world.journal.append("said", "promised Vikas the model", actor="person",
                         entity_ids=[vikas["id"]])
    text = prepack.build(world, "what's going on with vikas these days?")
    assert "WHAT ALPHA KNOWS" in text and "[topic:cooking] Cooking: How Kenil cooks" in text
    assert "WHO THE SENTENCE NAMES" in text
    card = text[text.index("WHO THE SENTENCE NAMES"):]
    assert "Vikas Badami (person" in card and "email=vikas@example.com" in card
    assert "works_at: Avilo (accepted" in card and "last seen:" in card
    assert "WHO THE SENTENCE NAMES" not in prepack.build(world, "what did I eat today?")
    # A first name alone finds a person; a three-letter word does not match by accident.
    assert prepack.entities_named(world, "coffee with vikas")[0]["id"] == vikas["id"]
    assert prepack.entities_named(world, "vik and the rest") == []


def test_a_sentence_that_names_a_day_looks_there(world: World) -> None:
    from datetime import UTC, datetime, timedelta

    from alpha.context import prepack

    now = datetime(2026, 10, 3, 14, 0, tzinfo=UTC)

    def named(sentence: str) -> tuple[str, str, str]:
        window = prepack.day_named(sentence, now)
        assert window is not None
        return window

    since, until, label = named("what did i say about vikas yesterday?")
    assert label == "yesterday"
    local_midnight = datetime.fromisoformat(since).astimezone()
    assert local_midnight.hour == 0 and local_midnight.date() == (now.astimezone().date()
                                                                  - timedelta(days=1))
    assert datetime.fromisoformat(until) - datetime.fromisoformat(since) == timedelta(days=1)
    assert named("3 days ago we talked")[2] == "3 days ago"
    assert named("what happened last week")[2] == "last week"
    s, u, _ = named("what happened last week")
    assert datetime.fromisoformat(u) - datetime.fromisoformat(s) == timedelta(days=7)
    assert named("on Tuesday I said")[2] == "tuesday"
    assert named("how much protein today")[2] == "today"
    assert prepack.day_named("what is my protein target", now) is None
    # The window reaches the journal: yesterday's exchange is in the pack, dated.
    said = world.journal.append("said", "remind me that i promised vikas the financial model"
                                        " by friday", actor="person")
    replied = world.journal.append("replied", "Noted: the financial model by Friday.",
                                   data={"turn": said})
    yesterday = (datetime.now(UTC) - timedelta(days=1)).replace(microsecond=0).isoformat()
    with backdating(world), world.store.tx() as db:
        db.execute("UPDATE journal SET at = ? WHERE id IN (?, ?)", (yesterday, said, replied))
    text = prepack.build(world, "what did i say about vikas yesterday?")
    assert "WHAT WAS SAID YESTERDAY" in text
    assert "person: remind me that i promised vikas the financial model" in text
    assert world.journal.between(yesterday[:10], "2999")[0]["id"] == said
    assert world.journal.search("vikas", since="2999") == []
