from __future__ import annotations

import json
from pathlib import Path

import pytest
from conftest import building

from alpha.connectors.base import Connections
from alpha.connectors.files import Files
from alpha.mcp.tools import Tools
from alpha.world.purge import remove_connection, remove_document, remove_module
from alpha.world.world import World


def test_removing_a_module_leaves_nothing_of_it_but_its_history(world: World) -> None:
    t = building(world, turn="j_1")
    t.module_create("Network", "Keep my connections")
    t.module_create("Food")
    t.collection_create("connections", "Connections", [{"name": "name", "kind": "text"},
                        {"name": "url", "kind": "url"}], module="Network")
    t.collection_create("food_log", "Food log", [{"name": "item", "kind": "text"}], module="Food")
    priya_row = t.records_add("connections", {"name": "Priya", "url": "https://x.com/in/p/"},
                              source="stated")
    eggs = t.records_add("food_log", {"item": "Eggs"}, source="stated")
    world.knowledge.write_note(f"record:connections/{priya_row['id']}", "Notes", "Met at a talk")
    world.knowledge.write_note(f"record:food_log/{eggs['id']}", "Notes", "Free range")
    t.goal_set("Keep my connections", module="Network")
    t.note_write("module:Network", "Network", "Notes")
    world.readers.save("connections", site="x.com", url="https://x.com", script="return []",
                       description="d", to_end=False, count=1)
    auto = t.agent_create("Sync", "daily 08:00", "reader_run connections", module="Network")
    world.journal.append("replied", "LinkedIn only renders 20", thread=auto["thread"])
    entity = world.entities.resolve("person", "Priya", {"email": "p@x.com"})["entity"]
    world.readers.save("people_feed", site="x.com", url="https://x.com/feed", script="return []",
                       description="d", to_end=False, count=1)
    world.collections.upsert("connections", "url", [{"name": "Sam", "url": "https://x.com/in/s/"}],
                             {"by": "alpha", "reader": "people_feed"}, seen_by="people_feed")
    world.runs.finish(world.runs.start(auto["id"]), verdict="succeeded", line="Read 1 of 1.")
    world.knowledge.write_note(f"agent:{auto['id']}", "Sync", "Its page.")
    network, food = (world.modules.get(n)["id"] for n in ("Network", "Food"))
    world.preferences.set("colours_connections", {"tint": None, "values": {}, "rules": {}})
    world.preferences.set("colours_food_log", {"tint": None, "values": {}, "rules": {}})
    world.preferences.set("sidebar_order", [food, network])
    world.preferences.set("sidebar_hidden", [network])
    world.preferences.set("module_icons", {network: "people", food: "food"})
    world.preferences.set("agent_looks", {auto["id"]: {"animal": "fox"}, "a_x": {"animal": "cat"}})
    out = remove_module(world, "Network")
    assert world.preferences.get("agent_looks") == {"a_x": {"animal": "cat"}}  # its agent's look
    # the window's colours for its table and its place in the sidebar go; the others' stay
    assert world.preferences.get("colours_connections") is None
    assert world.preferences.get("colours_food_log") is not None
    assert world.preferences.get("sidebar_order") == [food]
    assert world.preferences.get("sidebar_hidden") == []
    assert world.preferences.get("module_icons") == {food: "food"}
    assert out["tables"] == 1 and out["rows"] == 2 and out["readers"] == 2
    assert world.runs.of(auto["id"]) == []
    assert world.knowledge.find_note(f"agent:{auto['id']}", "Sync") is None
    assert out["agents"] == 1 and out["threads"] == 1 and out["goals"] == 1
    assert world.collections.names() == ["food_log"]
    assert world.readers.all() == [] and world.agents.all() == []
    assert world.modules.threads(None) == []
    # a row's note goes with its table; another module's row keeps its own
    assert [n["scope"] for n in world.knowledge.notes()] == [f"record:food_log/{eggs['id']}"]
    assert out["record notes"] == 1
    assert world.collections.search("Priya") == []
    # What happened stays, marked as history about something removed.
    history = world.journal.mark_removed(world.journal.search("renders"))
    assert history[0]["removed"].startswith("Network was removed on ")
    assert world.modules.thread(auto["thread"])["session_ref"] is None
    assert world.journal.recent(1)[0]["text"] == (
        "Removed Network: 1 table (2 rows), 2 readers and 1 agent.")
    assert [m["name"] for m in world.modules.all()] == ["Food"]
    assert world.entities.get(entity["id"])["name"] == "Priya"  # the person's, not the module's
    assert world.collections.describe("food_log")["records"] == 1


def test_a_module_deleted_takes_its_files_entities_skill_notes_and_workflow_page(
    world: World, tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    """14 Oct review: the entity each of its files is (with that entity's facts), the notes of
    the readers that go, and its workflow page with every version went with nothing before."""
    monkeypatch.setenv("ALPHA_HOME", str(tmp_path / "home"))
    t = building(world)
    t.module_create("Advisory")
    t.collection_create("statements", "Statements", [{"name": "subject", "kind": "text"}],
                        module="Advisory")
    mid = world.modules.get("Advisory")["id"]
    src = tmp_path / "march.txt"
    src.write_text("march numbers")
    doc = Files(world).take(src, module=mid, origin="upload")
    eid = str(doc["entity_id"])
    world.knowledge.record_fact(f"entity:{eid}", "pages", "1", source="stated")
    world.knowledge.write_note(f"entity:{eid}", "march.txt", "Its page.")
    world.readers.save("statements", site="x.com", url="https://x.com/s", script="return []",
                       description="d", to_end=False, count=1)
    world.knowledge.write_note("skill:statements", "statements", "What the site does.")
    body = {"purpose": "Keep statements.", "steps": [
        {"title": "A statement arrives", "what": "You drop it.", "who": "you",
         "gives": "a statement", "when": "monthly"}], "keeps": [{"thing": "Statement",
                                                                 "fields": ["subject"]}]}
    wf = world.workflows.draft("Statements", body, module=mid)
    world.workflows.revise(wf["id"], {**body, "purpose": "Keep the monthly statements."})
    remove_module(world, "Advisory")
    for sql, args in [("SELECT 1 FROM entities WHERE id = ?", (eid,)),
                      ("SELECT 1 FROM entity_keys WHERE entity_id = ?", (eid,)),
                      ("SELECT 1 FROM facts WHERE subject = ?", (f"entity:{eid}",)),
                      ("SELECT 1 FROM notes WHERE scope = ?", (f"entity:{eid}",)),
                      ("SELECT 1 FROM notes WHERE scope = 'skill:statements'", ()),
                      ("SELECT 1 FROM workflows WHERE id = ?", (wf["id"],)),
                      ("SELECT 1 FROM workflow_versions WHERE workflow = ?", (wf["id"],))]:
        assert world.store.one(sql, args) is None, sql


def test_a_plans_old_build_thread_becomes_a_topic_and_alpha_opens_only_topics(
    tmp_path: Path,
) -> None:
    """14 Oct review: a plan's build thread (before 11 Oct) still opened the gate on making
    lasting things to any turn in it, and Alpha's own thread_open could open new ones."""
    path = tmp_path / "w.sqlite"
    w = World(path)
    old = w.modules.open_thread("Build: Car Wash Site Screener", "build", None)
    wf = w.workflows.draft("Car wash", {"purpose": "Score sites.", "steps": [
        {"title": "A site arrives", "what": "You type it.", "who": "you", "gives": "a site",
         "when": "when one arrives"}], "keeps": [{"thing": "Site", "fields": ["address"]}]})
    built = w.modules.open_thread("Build: Car wash", "build", None)
    with w.store.tx() as db:
        db.execute("UPDATE workflows SET thread = ? WHERE id = ?", (built["id"], wf["id"]))
    w.close()
    w = World(path)  # the migration runs as a world opens
    assert w.modules.thread(old["id"])["kind"] == "topic"
    assert w.modules.thread(built["id"])["kind"] == "build"  # a workflow's build keeps its own
    assert Tools(w).thread_open("Next steps")["kind"] == "topic"
    w.close()


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
    t.records_add("connections", {"name": "Priya"}, source="stated")
    world.readers.save("linkedin_connections", site="linkedin.com",
                       url="https://www.linkedin.com/mynetwork/", script="return []",
                       description="d", to_end=True, count=1)
    auto = t.agent_create("Daily LinkedIn sync", "daily 07:00",
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
    assert plan["what"] == "Alpha's sign-in, 1 reader and 1 agent"
    assert plan["readers"] == ["linkedin_connections"]
    assert plan["agents"] == ["Daily LinkedIn sync"] and profile.exists()

    world.preferences.set("agent_looks", {auto["id"]: {"animal": "fox"}})
    remove_connection(world, conn["id"])
    assert world.preferences.get("agent_looks") == {}  # the removed agent's look goes too
    assert not profile.exists()
    assert [c["target"] for c in Connections(world.store).all()] == [other["target"]]
    assert world.readers.all() == [] and world.agents.all() == []
    assert world.journal.open_asks() == []
    thread = world.modules.thread(auto["thread"])
    assert thread["session_ref"] is None  # its old beliefs can never be resumed
    # What happened stays in the journal: the reads, the thread's run, and the removal itself.
    assert world.journal.search("caps") and len(world.journal.recent(20, kinds=["saw"])) == 2
    assert world.journal.recent(1)[0]["text"] == (
        "Removed linkedin.com: Alpha's sign-in, 1 reader and 1 agent.")
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


def test_a_deleted_row_never_breaks_the_list_of_removals(world: World) -> None:
    """2 Oct 18:51: Alpha deleted one row, its values rode under `removed`, and every pre-pack
    (so every turn) crashed on the missing `name` until the app was shut."""
    from conftest import building

    t = building(world, turn="j_x")
    t.collection_create("things", "Things", [{"name": "title", "kind": "text"}])
    rec = t.records_add("things", {"title": "Data"}, source="stated")
    t.records_delete("things", rec["id"], rec["revision"])
    # An old-shaped entry from before the fix is tolerated too.
    world.journal.append("changed", "Removed Data from Things.",
                         data={"collection": "things", "record": "r_old",
                               "removed": {"id": "r_old", "title": "Data"}})
    assert world.journal.removals() == {}
    from alpha.context import prepack

    assert "Things" in prepack.build(world, "what did I remove")


def test_a_deleted_file_leaves_search_by_itself(world: World, tmp_path: Path,
                                                monkeypatch: pytest.MonkeyPatch) -> None:
    """14 Oct review: the documents' index had no delete trigger; purge deleted from it by hand
    in three places. Now the database does it, whichever way a document goes."""
    monkeypatch.setenv("ALPHA_HOME", str(tmp_path / "home"))
    src = tmp_path / "invoice.txt"
    src.write_text("the quarterly invoice from Acme")
    doc = Files(world).take(src, module=None, origin="upload")
    assert [d["id"] for d in Files(world).search("Acme")] == [doc["id"]]
    remove_document(world, doc["id"])
    assert Files(world).search("Acme") == []
    # and the index still takes new files after a delete
    src.write_text("a second invoice from Acme")
    again = Files(world).take(src, module=None, origin="upload", name="invoice2.txt")
    assert [d["id"] for d in Files(world).search("Acme")] == [again["id"]]
