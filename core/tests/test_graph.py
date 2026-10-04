"""The map of work: nodes for what Intelligence lists, edges with their source in the world
(3 Oct 2026, the graph proposal's option C)."""
from __future__ import annotations

from typing import Any

from conftest import building
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.connectors.base import Connections
from alpha.context.graph import work_graph
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
    assert c.get("/api/graph?kind=people").status_code == 400


def test_an_empty_world_is_an_empty_map(world: World) -> None:
    assert work_graph(world, [])["nodes"] == []


def _brain(world: World) -> tuple[str, str]:
    t = building(world)
    module = t.module_create("Advisory", "help clients")["id"]
    t.collection_create("clients", "Clients", [{"name": "name", "kind": "text"}], module=module)
    world.collections.add("clients", {"name": "RestoPros"}, {"source": "stated"})
    person = world.entities.resolve("person", "Vikas Badami",
                                    keys={"email": ["v@x.com"]})["entity"]
    world.knowledge.set_goal("Keep the books honest", module=module)
    world.knowledge.write_note("module:Advisory", "Advisory", "## What this is for\\nClients.")
    world.knowledge.record_fact("person", "age", "27", source="turn:j_1", state="accepted")
    said = world.journal.append("said", "Vikas sent the exports.", actor="person",
                                module=module, entity_ids=[person["id"]])
    world.journal.append("made", f"Noted the journal entry {said}.", data={})
    doc = world.entities.resolve("document", "RestoPros P&L")["entity"]["id"]
    with world.store.tx() as db:
        db.execute("INSERT INTO documents (id, entity_id, title, kind, path, text, size,"
                   " modified_at, indexed_at, module) VALUES (?,?,?,?,?,?,?,?,?,?)",
                   ("d_1", doc, "RestoPros P&L", "xlsx", "/tmp/pl.xlsx", "Profit", 10,
                    "2026-10-01T00:00:00+00:00", "2026-10-01T00:00:00+00:00", module))
    return module, person["id"]


def test_the_map_of_the_brain_holds_what_the_world_holds(world: World) -> None:
    from alpha.context.graph import world_graph

    module, person = _brain(world)
    g = world_graph(world)
    kinds = {n["kind"] for n in g["nodes"]}
    assert {"you", "module", "table", "goal", "person", "document", "page"} <= kinds
    you = next(n for n in g["nodes"] if n["id"] == "you")
    assert you["facts"] == [{"predicate": "age", "value": "27"}]
    rel = {(e["from"], e["to"], e["kind"]) for e in g["edges"]}
    assert ("table:clients", f"module:{module}", "in") in rel
    assert ("document:d_1", f"module:{module}", "in") in rel
    assert (f"entity:{person}", f"module:{module}", "named in") in rel
    page = next(n for n in g["nodes"] if n["kind"] == "page")
    assert (page["id"], f"module:{module}", "about") in rel
    assert next(n for n in g["nodes"] if n["id"] == f"module:{module}")["activity"] >= 1
    assert "document" not in {n["kind"] for n in g["nodes"] if n["id"].startswith("entity:")}


def test_connecting_keeps_grounded_links_as_suggestions_and_drops_the_rest(world: World) -> None:
    from alpha.runtime import connecting
    from alpha.runtime.claude_cli import RunResult

    module, person = _brain(world)
    seen: dict[str, Any] = {}

    def runner(req: Any) -> RunResult:
        seen["system"] = req.system
        seen["sentence"] = req.sentence
        return RunResult(ok=True, reply=(
            '[{"from": "entity:' + person + '", "to": "document:d_1", "relation": "sent",'
            ' "why": "Vikas sent the exports the document holds.",'
            ' "source": "' + world.journal.recent(5, kinds=["said"])[-1]["id"] + '"},'
            ' {"from": "entity:' + person + '", "to": "module:' + module + '",'
            ' "relation": "works with", "why": "no evidence", "source": "a dream"},'
            ' {"from": "document:d_1", "to": "module:' + module + '", "relation": "in",'
            ' "why": "it is there", "source": "RestoPros"},'
            ' {"from": "table:clients", "to": "document:d_1", "relation": "about",'
            ' "why": "same name", "source": "RestoPros"},'
            ' {"from": "table:clients", "to": "module:' + module + '", "relation": "about",'
            ' "why": "same name", "source": "RestoPros"}]'))

    out = connecting.connect(world, runner=runner)
    assert "NOT LINKED" in seen["sentence"] and "JSON only" in seen["system"]
    kept = out["proposed"]
    # kept: the grounded one about a person, and the one about a document (the table end cannot
    # carry a fact, so the document is the subject through its entity); dropped: the ungrounded
    # one, the one already known (the document's own area), the one between a table and an area
    assert [(k["from"], k["to"]) for k in kept] == [
        (f"entity:{person}", "document:d_1"), ("document:d_1", "table:clients")]
    facts = world.knowledge.facts(f"entity:{person}", states=("suggested",))
    assert len(facts) == 1 and facts[0]["predicate"] == "related_to"
    assert facts[0]["value"] == "document:d_1" and facts[0]["why"].startswith("sent: ")
    g = world_graph_of(world)
    related = {(e["from"], e["to"]): e for e in g["edges"] if e["kind"] == "related"}
    assert set(related) == {(f"entity:{person}", "document:d_1"),
                            ("document:d_1", "table:clients")}
    mine = related[(f"entity:{person}", "document:d_1")]
    assert mine["state"] == "suggested" and mine["fact"] == facts[0]["id"]
    world.knowledge.decide_fact(facts[0]["id"], True)
    after = world_graph_of(world)["edges"]
    assert sorted(e["state"] for e in after if e["kind"] == "related") == ["accepted", "suggested"]
    assert world.journal.recent(5, kinds=["noticed"])[-1]["text"].startswith("Looked over the map")


def world_graph_of(world: World) -> dict[str, Any]:
    from alpha.context.graph import world_graph

    return world_graph(world)


def test_connecting_with_a_bad_reply_proposes_nothing(world: World) -> None:
    from alpha.runtime import connecting
    from alpha.runtime.claude_cli import RunResult

    _brain(world)
    out = connecting.connect(world, runner=lambda req: RunResult(ok=True, reply="I am not sure."))
    assert out["proposed"] == []
    assert connecting.parse("```json\n[{\"from\": \"a\"}]\n```") == [{"from": "a"}]
