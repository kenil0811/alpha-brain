from __future__ import annotations

import json
from pathlib import Path

import pytest
from conftest import building

from alpha.connectors.base import Connections
from alpha.world.purge import clear_conversation, remove_connection, remove_module
from alpha.world.world import World


def test_removing_a_module_leaves_nothing_of_it_but_its_history(world: World) -> None:
    t = building(world, turn="j_1")
    t.module_create("Network", "Keep my connections")
    t.module_create("Food")
    t.collection_create("connections", "Connections", [{"name": "name", "kind": "text"},
                        {"name": "url", "kind": "url"}], module="Network")
    t.collection_create("food_log", "Food log", [{"name": "item", "kind": "text"}], module="Food")
    t.records_add("connections", {"name": "Priya", "url": "https://x.com/in/p/"})
    t.records_add("food_log", {"item": "Eggs"})
    t.goal_set("Keep my connections", module="Network")
    t.note_write("module:Network", "Network", "Notes")
    world.readers.save("connections", site="x.com", url="https://x.com", script="return []",
                       description="d", to_end=False, count=1)
    auto = t.automation_create("Sync", "daily 08:00", "reader_run connections", module="Network")
    world.journal.append("replied", "LinkedIn only renders 20", thread=auto["thread"])
    entity = world.entities.resolve("person", "Priya", {"email": "p@x.com"})["entity"]
    world.readers.save("people_feed", site="x.com", url="https://x.com/feed", script="return []",
                       description="d", to_end=False, count=1)
    world.collections.upsert("connections", "url", [{"name": "Sam", "url": "https://x.com/in/s/"}],
                             {"by": "alpha", "reader": "people_feed"}, seen_by="people_feed")
    out = remove_module(world, "Network")
    assert out["tables"] == 1 and out["rows"] == 2 and out["readers"] == 2
    assert out["automations"] == 1 and out["threads"] == 1 and out["goals"] == 1
    assert world.collections.names() == ["food_log"]
    assert world.readers.all() == [] and world.automations.all() == []
    assert world.modules.threads(None) == [] and world.knowledge.notes() == []
    assert world.collections.search("Priya") == []
    # What happened stays, marked as history about something removed.
    history = world.journal.mark_removed(world.journal.search("renders"))
    assert history[0]["removed"].startswith("Network was removed on ")
    assert world.modules.thread(auto["thread"])["session_ref"] is None
    assert world.journal.recent(1)[0]["text"] == (
        "Removed Network: 1 table (2 rows), 2 readers and 1 automation.")
    assert [m["name"] for m in world.modules.all()] == ["Food"]
    assert world.entities.get(entity["id"])["name"] == "Priya"  # the person's, not the module's
    assert world.collections.describe("food_log")["records"] == 1


def test_clearing_the_conversation_keeps_activity(world: World) -> None:
    world.journal.append("said", "hello", actor="person")
    world.journal.append("replied", "hi")
    world.journal.append("did", "Added Eggs to Food log.")
    world.journal.append("said", "in a thread", actor="person", thread="t_1")
    assert clear_conversation(world)["turns"] == 2
    assert [e["kind"] for e in world.journal.recent(10)] == ["did", "said"]


def test_removing_a_site_connection_keeps_the_persons_rows_and_the_audit(
    world: World, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("ALPHA_HOME", str(tmp_path / "home"))
    profile = tmp_path / "home" / "browser" / "linkedin.com"
    profile.mkdir(parents=True)
    (profile / "Cookies").write_text("session")
    conn = Connections(world.store).upsert("browser", "linkedin.com",
                                           config={"profile": str(profile)})
    other = Connections(world.store).upsert("browser", "example.com")
    t = building(world, turn="j_1")
    t.module_create("Network")
    t.collection_create("connections", "Connections", [{"name": "name", "kind": "text"}],
                        module="Network")
    t.records_add("connections", {"name": "Priya"})
    world.readers.save("linkedin_connections", site="linkedin.com",
                       url="https://www.linkedin.com/mynetwork/", script="return []",
                       description="d", to_end=True, count=1)
    auto = t.automation_create("Daily LinkedIn sync", "daily 07:00",
                               'reader_run(name="linkedin_connections")', module="Network")
    world.journal.append("replied", "LinkedIn caps the list", thread=auto["thread"])
    world.journal.append("saw", "Read My Network (linkedin.com, signed in).",
                         data={"url": "https://www.linkedin.com/mynetwork/"},
                         source="connector:browser")
    world.journal.append("saw", "Read Example (example.com).",
                         data={"url": "https://example.com/"}, source="connector:browser")
    world.journal.append("asked", "A window is open on linkedin.com: sign in there.",
                         data={"connection": conn["id"]}, source="connector:browser")

    plan = remove_connection(world, conn["id"], dry_run=True)
    assert plan["what"] == "Alpha's sign-in, 1 reader and 1 automation"
    assert plan["readers"] == ["linkedin_connections"]
    assert plan["automations"] == ["Daily LinkedIn sync"] and profile.exists()

    remove_connection(world, conn["id"])
    assert not profile.exists()
    assert [c["target"] for c in Connections(world.store).all()] == [other["target"]]
    assert world.readers.all() == [] and world.automations.all() == []
    assert world.journal.open_asks() == []
    thread = world.modules.thread(auto["thread"])
    assert thread["session_ref"] is None  # its old beliefs can never be resumed
    # What happened stays in the journal: the reads, the thread's run, and the removal itself.
    assert world.journal.search("caps") and len(world.journal.recent(20, kinds=["saw"])) == 2
    assert world.journal.recent(1)[0]["text"] == (
        "Removed linkedin.com: Alpha's sign-in, 1 reader and 1 automation.")
    assert world.journal.mark_removed(world.journal.search("caps"))[0]["removed"].startswith(
        "linkedin.com was removed")
    assert world.collections.describe("connections")["records"] == 1  # the person's rows stay


def test_removing_a_signin_takes_the_sites_it_passed_through(
    world: World, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("ALPHA_HOME", str(tmp_path / "home"))
    profile = tmp_path / "home" / "browser" / "gmail.com"
    profile.mkdir(parents=True)
    (profile / "alpha-signin.json").write_text(json.dumps(
        {"hosts": ["www.gmail.com", "accounts.google.com", "mail.google.com"]}))
    conn = Connections(world.store).upsert("browser", "gmail.com",
                                           config={"profile": str(profile)})
    world.journal.append("saw", "Read Inbox (google.com).",
                         data={"url": "https://mail.google.com/mail/u/0/"},
                         source="connector:browser")
    remove_connection(world, conn["id"])
    assert not profile.exists() and len(world.journal.recent(5, kinds=["saw"])) == 1
