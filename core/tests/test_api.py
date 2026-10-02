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


def test_an_ask_can_be_dismissed_without_running_anything(world: World) -> None:
    ask = world.journal.append("asked", "A window is open on example.com: sign in there.")
    c = client(world)
    c.post(f"/api/asks/{ask}/dismiss")
    assert c.get("/api/home").json()["needs_you"] == []
    assert world.journal.recent(5, kinds=["said"]) == []


def test_a_connection_says_what_goes_then_goes(world: World) -> None:
    from alpha.connectors.base import Connections
    conn = Connections(world.store).upsert("browser", "example.com")
    c = client(world)
    plan = c.get(f"/api/connections/{conn['id']}/removal").json()
    assert plan["target"] == "example.com" and plan["readers"] == []
    c.delete(f"/api/connections/{conn['id']}")
    assert c.get("/api/intelligence").json()["connections"] == []


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


def test_the_companion_token_only_talks(world: World) -> None:
    c = client(world, token="main", companion_token="pal", runner=lambda r: RunResult(
        reply="Hi.", ok=True))
    pal = {"Authorization": "Bearer pal"}
    assert c.get("/api/home", headers=pal).status_code == 200
    assert c.get("/api/conversation", headers=pal).status_code == 200
    assert c.get("/api/intelligence", headers=pal).status_code == 403
    assert c.post("/api/pending/pa_x/approve", headers=pal).status_code == 403
    assert c.get("/api/intelligence", headers={"Authorization": "Bearer main"}).status_code == 200


def test_a_web_page_cannot_post_to_the_core(world: World) -> None:
    c = client(world)  # `alpha serve` with no token
    evil = c.post("/api/pending/pa_x/approve", headers={"Origin": "https://evil.example"})
    assert evil.status_code == 403
    assert c.get("/api/home", headers={"Origin": "http://localhost:5173"}).status_code == 200


def test_intelligence_lists_connectors_connections_and_knowledge(world: World) -> None:
    seeded(world)
    data = client(world).get("/api/intelligence").json()
    assert {s["name"] for s in data["skills"]} >= {"files", "browser", "calendar"}
    assert data["knowledge"]["facts"][0]["predicate"] == "prefers"
    assert data["knowledge"]["goals"] == []


def test_a_module_summary_is_worked_out_from_its_tables(world: World) -> None:
    from datetime import date

    t = Tools(world)
    t.module_create("Food")
    t.collection_create("food_log", "Food log", [
        {"name": "item", "kind": "text"}, {"name": "eaten_on", "kind": "date"},
        {"name": "calories", "kind": "number", "unit": "kcal"},
        {"name": "meal", "kind": "choice", "choices": ["breakfast", "lunch"]}], module="Food")
    today = date.today().isoformat()
    t.records_add("food_log", {"item": "Eggs", "eaten_on": today, "calories": 155,
                               "meal": "breakfast"})
    t.records_add("food_log", {"item": "Salad", "eaten_on": today, "calories": 520,
                               "meal": "lunch"})
    t.records_add("food_log", {"item": "Old", "eaten_on": "2020-01-01", "calories": 999})
    data = client(world).get("/api/modules/Food/summary").json()
    table = data["tables"][0]
    assert table["rows"] == 3 and table["added_this_week"] == 3
    kcal = table["amounts"][0]
    assert kcal["today"] == 675 and kcal["this_week"] == 675 and kcal["how"] == "total"
    assert table["split"]["counts"] == {"breakfast": 1, "lunch": 1}
    assert "latest" not in table


def test_a_project_is_renamed_given_an_icon_exported_imported_and_deleted(world: World) -> None:
    seeded(world)
    world.knowledge.write_note("module:Job Search", "Job Search", "Roles I want.")
    world.automations.create("Check the board every morning", "daily 08:00", "reader_run",
                             module=world.modules.get("Job Search")["id"])
    api = client(world)
    card = api.patch("/api/modules/Job Search", json={"name": "Jobs", "icon": "briefcase"}).json()
    assert (card["name"], card["icon"]) == ("Jobs", "briefcase")
    note = world.knowledge.find_note("module:Jobs", "Jobs")
    assert note and note["body"] == "Roles I want."
    assert api.patch("/api/modules/Jobs", json={"icon": "nope"}).status_code == 400

    world.views.create("openings", "Applied", {"filters": []}, by="person")
    # Structure only by default: never the records (Alpha's export), with views and the version.
    shape = api.get("/api/modules/Jobs/export").json()
    assert shape["format"] == "alpha.project" and shape["alpha_version"]
    assert "rows" not in shape["tables"][0]
    assert [v["title"] for v in shape["tables"][0]["views"]] == ["Applied"]
    bundle = api.get("/api/modules/Jobs/export?rows=true").json()
    assert bundle["tables"][0]["rows"] == [{"title": "Backend Engineer", "company": "Lumen",
                                            "fit": 88, "status": "new"}]
    made = api.post("/api/modules/import", json=bundle).json()
    assert made["name"] == "Jobs 2" and made["icon"] == "briefcase" and made["records"] == 1
    assert [v["title"] for v in api.get("/api/tables/openings_2").json()["views"]] == ["Applied"]
    copy = api.get(f"/api/modules/{made['id']}").json()
    assert copy["note"]["body"] == "Roles I want."
    assert [a["enabled"] for a in copy["automations"]] == [False]
    assert api.post("/api/modules/import", json={"format": "x"}).status_code == 400

    gone = api.delete("/api/modules/Jobs").json()
    assert gone["rows"] == 1
    assert [m["name"] for m in api.get("/api/modules").json()] == ["Jobs 2"]


def test_speech_goes_to_whisper_only_with_a_saved_key(world: World, monkeypatch: Any) -> None:
    from alpha.runtime import transcription

    api = client(world)
    monkeypatch.setattr(transcription, "saved_key", lambda provider: None)
    assert api.get("/api/transcribe").json() == {"available": False}
    said = api.post("/api/transcribe", json={"audio_b64": "aGk="})
    assert said.status_code == 400 and "No transcription key" in said.json()["error"]

    calls: list[tuple[str, str]] = []

    def whisper(url: str, model: str, key: str, audio: bytes, mime: str) -> str:
        calls.append((model, mime))
        return "hi"

    monkeypatch.setattr(transcription, "saved_key", lambda p: "k" if p == "chatgpt_api" else None)
    monkeypatch.setattr(transcription, "_call", whisper)
    assert api.get("/api/transcribe").json() == {"available": True}
    assert api.post("/api/transcribe", json={"audio_b64": "aGk=", "mime": "audio/mp4"}).json() \
        == {"text": "hi"}
    assert calls == [("whisper-1", "audio/mp4")]
