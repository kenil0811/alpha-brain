from __future__ import annotations

from alpha.mcp.tools import Tools
from alpha.world.purge import clear_conversation, remove_module
from alpha.world.world import World


def test_removing_a_module_leaves_nothing_of_it(world: World) -> None:
    t = Tools(world, turn="j_1")
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
    out = remove_module(world, "Network")
    assert out["tables"] == 1 and out["rows"] == 1 and out["readers"] == 1
    assert out["automations"] == 1 and out["threads"] == 1 and out["goals"] == 1
    assert world.collections.names() == ["food_log"]
    assert world.readers.all() == [] and world.automations.all() == []
    assert world.modules.threads(None) == [] and world.knowledge.notes() == []
    assert world.collections.search("Priya") == [] and world.journal.search("renders") == []
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
