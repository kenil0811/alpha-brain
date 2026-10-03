"""The map of work: nodes for what Intelligence lists, edges with their source in the world
(3 Oct 2026, the graph proposal's option C)."""
from __future__ import annotations

from conftest import building
from fastapi.testclient import TestClient

from alpha.api.graph import work_graph
from alpha.api.server import create_app
from alpha.connectors.base import Connections
from alpha.world.world import World


def test_the_map_links_what_feeds_what(world: World) -> None:
    t = building(world)
    module = t.module_create("Deals", "find a firm")["id"]
    t.collection_create("deals", "Deals", [{"name": "title", "kind": "text"}], module=module)
    world.readers.save("brokers", site="brokers.com", url="https://brokers.com",
                       script="return []", description="Reads brokers", to_end=False,
                       count=3, when_to_use="Every broker listing")
    pipe = t.automation_create("Daily brokers", "daily 07:00", module=module,
                               steps=[{"read": "brokers", "into": "deals", "key": "title"},
                                      {"tell": "deals"}])
    world.sources.add("Brokers", "https://brokers.com/listings", module=module,
                      reader="brokers", status="working")
    world.sources.add("Walled", "https://walled.com/list", module=module, status="needs_signin",
                      detail="asks for a buyer login")
    Connections(world.store).upsert("browser", "brokers.com")
    world.journal.append("did", "Ran the reader brokers: 3 rows.", data={"reader": "brokers"})
    world.journal.append("failed", "The reader brokers broke.", data={"reader": "brokers"})

    c = TestClient(create_app(world, live=False))
    data = c.get("/api/graph").json()
    by_id = {n["id"]: n for n in data["nodes"]}
    kinds = {k: sorted(n["id"] for n in data["nodes"] if n["kind"] == k)
             for k in ("module", "table", "skill", "automation", "source", "connection")}
    assert kinds["module"] == [f"module:{module}"]
    assert kinds["table"] == ["table:deals"]
    assert kinds["automation"] == [f"automation:{pipe['id']}"]
    assert len(kinds["source"]) == 2 and len(kinds["connection"]) == 1
    run_skill = next(n for n in data["nodes"] if n["kind"] == "skill" and n["role"] == "run")
    reader = by_id["skill:brokers"]
    assert reader["role"] == "read" and reader["runs"] == 2 and reader["failed"] == 1
    assert reader["state"] == "ok"
    walled = next(n for n in data["nodes"] if n["title"] == "Walled")
    assert walled["state"] == "needs_signin" and "buyer login" in walled["detail"]

    rel = {(e["from"], e["to"], e["kind"]) for e in data["edges"]}
    assert ("table:deals", f"module:{module}", "in") in rel
    assert (f"automation:{pipe['id']}", run_skill["id"], "runs") in rel
    assert (run_skill["id"], "skill:brokers", "runs") in rel
    assert ("skill:brokers", "table:deals", "reads into") in rel
    assert (run_skill["id"], "table:deals", "tells") in rel
    source = next(n["id"] for n in data["nodes"] if n["title"] == "Brokers")
    assert (source, "skill:brokers", "read by") in rel
    conn = kinds["connection"][0]
    assert (conn, "skill:brokers", "signed in at") in rel
    feeds = next(e for e in data["edges"] if e["kind"] == "reads into")
    assert feeds["source"].startswith("step 1 of ")
    # an edge never points at a node that is not on the map
    ids = set(by_id)
    assert all(e["from"] in ids and e["to"] in ids for e in data["edges"])
    assert c.get("/api/graph?kind=world").status_code == 400


def test_an_empty_world_is_an_empty_map(world: World) -> None:
    assert work_graph(world, [])["nodes"] == []
