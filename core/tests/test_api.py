from __future__ import annotations

import time
from typing import Any

from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.mcp.tools import Tools
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world.world import World


def seeded(world: World) -> None:
    t = Tools(world, turn="j_seed")
    t.module_create("Job Search", "An offer by December")
    t.collection_create("openings", "Openings", [
        {"name": "title", "kind": "text"}, {"name": "company", "kind": "text"},
        {"name": "fit", "kind": "number"},
        {"name": "status", "kind": "status", "choices": ["new", "applied"]}], module="Job Search")
    t.records_add("openings", {"title": "Backend Engineer", "company": "Lumen", "fit": 88,
                               "status": "new"})
    priya = t.entity_resolve("person", "Priya Raman", {"email": "priya@lumen.example"})
    world.journal.append("saw", "Email from Priya about Friday", entity_ids=[
        priya["entity"]["id"]], source="connector:mail")
    t.ask_person("What salary floor should I filter by?")
    t.propose("Raise protein to 130 g on training days", "Four workouts this week")
    t.fact_record("person", "prefers", "mornings")


def client(world: World, **kw: Any) -> TestClient:
    return TestClient(create_app(world, live=False, **kw))


def test_home_lists_what_needs_the_person_and_the_modules(world: World) -> None:
    seeded(world)
    home = client(world).get("/api/home").json()
    kinds = sorted(i["kind"] for i in home["needs_you"])
    assert kinds == ["ask", "fact", "proposal"]
    card = home["modules"][0]
    assert card["name"] == "Job Search" and card["records"] == 1
    assert card["last_text"].startswith("Added Backend Engineer")
    assert home["ran_today"] >= 3


def test_tables_are_read_and_edited_by_the_person(world: World) -> None:
    seeded(world)
    c = client(world)
    data = c.get("/api/tables/openings").json()
    rec = data["records"][0]
    assert data["table"]["title"] == "Openings" and rec["company"] == "Lumen"
    edited = c.patch(f"/api/tables/openings/records/{rec['id']}",
                     json={"values": {"status": "applied"}, "revision": rec["revision"]}).json()
    assert edited["status"] == "applied" and edited["_provenance"]["by"] == "person"
    stale = c.patch(f"/api/tables/openings/records/{rec['id']}",
                    json={"values": {"fit": 1}, "revision": rec["revision"]})
    assert stale.status_code == 400 and "changed since" in stale.json()["error"]
    added = c.post("/api/tables/openings/records", json={"values": {"title": "Staff Eng"}})
    assert added.status_code == 200
    assert c.get("/api/tables/openings?q=staff").json()["records"][0]["title"] == "Staff Eng"
    mod = c.get("/api/modules/Job Search").json()
    assert mod["tables"][0]["records"] == 2
    assert mod["activity"][0]["actor"] == "person"


def test_people_and_the_timeline(world: World) -> None:
    seeded(world)
    c = client(world)
    people = c.get("/api/people").json()
    assert people[0]["name"] == "Priya Raman" and "Friday" in people[0]["last_text"]
    detail = c.get(f"/api/entities/{people[0]['id']}").json()
    assert [e["text"] for e in detail["timeline"]][0] == "Email from Priya about Friday"


def test_decisions(world: World) -> None:
    seeded(world)
    c = client(world)
    needs = c.get("/api/home").json()["needs_you"]
    fact = next(i for i in needs if i["kind"] == "fact")
    assert c.post(f"/api/facts/{fact['id']}/decide", json={"accept": True}).json()["state"] == \
        "accepted"
    ask = next(i for i in needs if i["kind"] == "ask")
    c.post(f"/api/asks/{ask['id']}/answer", json={"text": "£85k"})
    proposal = next(i for i in needs if i["kind"] == "proposal")
    c.post(f"/api/proposals/{proposal['id']}/decide", json={"accept": False})
    assert c.get("/api/home").json()["needs_you"] == []


def test_ask_runs_a_turn_in_the_background(world: World) -> None:
    def runner(req: TurnRequest) -> RunResult:
        return RunResult(reply="Logged two eggs.", ok=True, duration_ms=1200)

    c = client(world, runner=runner)
    started = c.post("/api/ask", json={"text": "log two eggs"}).json()
    for _ in range(50):
        state = c.get(f"/api/turns/{started['id']}").json()
        if state["state"] != "running":
            break
        time.sleep(0.05)
    assert state["state"] == "done" and state["reply"] == "Logged two eggs."
    convo = c.get("/api/conversation").json()
    assert [t["kind"] for t in convo["turns"]] == ["said", "replied"]


def test_token_and_errors(world: World) -> None:
    c = client(world, token="s3cret")
    assert c.get("/api/health").status_code == 401
    ok = c.get("/api/health", headers={"Authorization": "Bearer s3cret"})
    assert ok.status_code == 200 and ok.json()["ok"]
    missing = c.get("/api/tables/nope", headers={"Authorization": "Bearer s3cret"})
    assert missing.status_code == 400 and "no table" in missing.json()["error"]


def test_intelligence_lists_connectors_connections_and_knowledge(world: World) -> None:
    seeded(world)
    data = client(world).get("/api/intelligence").json()
    assert {s["name"] for s in data["skills"]} >= {"files", "browser", "calendar"}
    assert data["knowledge"]["facts"][0]["predicate"] == "prefers"
    assert data["knowledge"]["goals"] == []
