from __future__ import annotations

import time
from typing import Any

from conftest import building
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.mcp.tools import Tools
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world.world import World


def seeded(world: World) -> None:
    t = building(world, turn="j_seed")
    t.module_create("Job Search", "An offer by December")
    t.collection_create("openings", "Openings", [
        {"name": "title", "kind": "text"}, {"name": "company", "kind": "text"},
        {"name": "fit", "kind": "number"},
        {"name": "status", "kind": "status", "choices": ["new", "applied"]}], module="Job Search")
    t.records_add("openings", {"title": "Backend Engineer", "company": "Lumen", "fit": 88,
                               "status": "new"}, source="stated")
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


def test_intelligence_lists_connectors_connections_and_knowledge(world: World) -> None:
    seeded(world)
    data = client(world).get("/api/intelligence").json()
    assert {s["name"] for s in data["hands"]} >= {"files", "browser", "calendar"}
    assert data["skills"] == []  # know-how Alpha wrote: none in a fresh world
    assert data["knowledge"]["facts"][0]["predicate"] == "prefers"
    assert data["knowledge"]["goals"] == []


def test_a_module_summary_is_worked_out_from_its_tables(world: World) -> None:
    from datetime import date

    t = building(world)
    t.module_create("Food")
    t.collection_create("food_log", "Food log", [
        {"name": "item", "kind": "text"}, {"name": "eaten_on", "kind": "date"},
        {"name": "calories", "kind": "number", "unit": "kcal"},
        {"name": "meal", "kind": "choice", "choices": ["breakfast", "lunch"]}], module="Food")
    today = date.today().isoformat()
    t.records_add("food_log", {"item": "Eggs", "eaten_on": today, "calories": 155,
                               "meal": "breakfast"}, source="stated")
    t.records_add("food_log", {"item": "Salad", "eaten_on": today, "calories": 520,
                               "meal": "lunch"}, source="stated")
    t.records_add("food_log", {"item": "Old", "eaten_on": "2020-01-01", "calories": 999},
                  source="stated")
    data = client(world).get("/api/modules/Food/summary").json()
    table = data["tables"][0]
    assert table["rows"] == 3 and table["added_this_week"] == 3
    kcal = table["amounts"][0]
    assert kcal["today"] == 675 and kcal["this_week"] == 675 and kcal["how"] == "total"
    assert table["split"]["counts"] == {"breakfast": 1, "lunch": 1}
    assert "latest" not in table


def test_a_turn_that_worked_values_out_is_checked_in_the_background(world: World) -> None:
    from alpha.api.server import AskBody, Turns
    from alpha.mcp.tools import Tools

    building(world).collection_create("food_log", "Food log",
                                      [{"name": "item", "kind": "text"},
                                       {"name": "kcal", "kind": "number"}])
    kinds: list[str] = []

    def runner(req: TurnRequest) -> RunResult:
        kinds.append(req.kind)
        if req.kind == "independent":
            return RunResult(reply="215 kcal (ocado.com).", ok=True)
        if req.kind == "judge":
            return RunResult(reply='{"agree": true, "differences": [], "unstated": []}', ok=True)
        Tools(world, turn=req.turn_id).records_add("food_log", {"item": "Shake", "kcal": 215},
                                                   source="label on ocado.com")
        return RunResult(reply="Logged: 215 kcal from the label.", ok=True)

    turns_ = Turns(world, runner, checks=True)
    started = turns_.start(AskBody(text="i had a shake"))
    # The turn, then in the background: the check (independent, judge) and the noticing pass
    # (one judge run) side by side.
    for _ in range(100):
        if len(kinds) == 4 and world.journal.recent(1, kinds=["checked"]):
            break
        time.sleep(0.05)
    assert kinds[0] == "turn" and sorted(kinds[1:]) == ["independent", "judge", "judge"]
    assert turns_.get(started["id"])["state"] == "done"
    assert world.journal.recent(1, kinds=["checked"])[0]["text"].endswith("it agrees.")


def test_a_refused_decline_leaves_no_answer_and_starts_nothing(world: World) -> None:
    """The panel once fired resume and decline together on "Leave it": the decline must be
    refused on a building plan without journaling a No."""
    t = Tools(world, turn=world.journal.append("said", "track x", actor="person"))
    pid = t.plan_propose("Track x", "A plan.", "show me x")["plan"]
    plan = world.plans.get(pid)
    world.plans.approve(pid, "yes")
    thread = world.modules.open_thread("Build: Track x", "build", None)
    world.plans.start(pid, thread["id"])
    c = client(world)
    refused = c.post(f"/api/plans/{pid}/decline")
    assert refused.status_code == 400 and "building" in refused.json()["error"]
    assert not [e for e in world.journal.recent(10, kinds=["answered"])
                if e["data"].get("proposal") == plan["proposal"]]
    assert world.plans.get(pid)["state"] == "building"


def test_a_modules_page_is_read_and_written_from_its_own_route(world: World) -> None:
    world.modules.create("Deals", goal="find a firm")
    c = TestClient(create_app(world, live=False))
    assert c.get("/api/modules/Deals/page").json() == {"name": "Deals", "scope": "module:Deals",
                                                       "page": None}
    c.post("/api/notes", json={"scope": "module:Deals", "title": "Deals",
                               "body": "# Deals\n\nWhat this is for: a firm to buy.",
                               "summary": "A firm to buy"})
    page = c.get("/api/modules/Deals/page").json()["page"]
    assert page["summary"] == "A firm to buy" and page["body"].startswith("# Deals")


def test_a_skill_and_an_automation_have_pages(world: World) -> None:
    from alpha.runtime import automation as automation_runtime

    building(world).collection_create("deals", "Deals", [{"name": "title", "kind": "text"}])
    world.readers.save("brokers", site="b.com", url="https://b.com", script="return []",
                       description="Reads brokers", to_end=False, count=3,
                       when_to_use="Every broker listing")
    Tools(world).note_write("skill:brokers", "brokers", "The list paginates by 50.")
    t = building(world)
    pipe = t.automation_create("Daily brokers", "daily 07:00",
                               steps=[{"read": "brokers", "into": "deals", "key": "title"}])
    judged = t.automation_create("Weekly look", "weekly mon 09:00", procedure="look and say")
    c = TestClient(create_app(world, live=False))
    page = c.get("/api/skills/brokers").json()
    assert page["kind"] == "read" and page["script"] == "return []"
    assert page["notes"]["body"] == "The list paginates by 50." and page["when_to_use"]
    assert c.get("/api/skills/nothing").status_code == 400
    a = c.get(f"/api/automations/{pipe['id']}").json()
    assert a["title"] == "Daily brokers" and a["pipeline"][0]["read"] == "brokers"
    assert a["runs"] == []
    # A run of the judged one, then its page shows the run with its outcome.
    automation_runtime.run(world, judged["id"],
                           runner=lambda req: RunResult(ok=True, reply="Nothing new."))
    j = c.get(f"/api/automations/{judged['id']}").json()
    assert j["pipeline"] is None and len(j["runs"]) == 1
    assert j["runs"][0]["outcome"] == "Nothing new."


def test_a_relation_shows_the_related_records_title_and_opens_it(world: World) -> None:
    t = building(world)
    t.collection_create("clients", "Clients", [{"name": "name", "kind": "text"}],
                        title_field="name")
    t.collection_create("invoices", "Invoices", [
        {"name": "number", "kind": "text"},
        {"name": "client", "kind": "relation", "relation": "clients"},
    ])
    stated = {"source": "stated"}
    client = world.collections.add("clients", {"name": "RestoPros"}, stated)
    world.collections.add("invoices", {"number": "INV-1", "client": client["id"]}, stated)
    world.collections.add("invoices", {"number": "INV-2", "client": "r_gone"}, stated)
    c = TestClient(create_app(world, live=False))
    data = c.get("/api/tables/invoices").json()
    assert data["relations"] == {"client": {client["id"]: "RestoPros"}}
    one = c.get(f"/api/tables/clients/records/{client['id']}").json()
    assert one["table"]["name"] == "clients"
    assert one["record"]["name"] == "RestoPros"
    assert one["relations"] == {}
    assert c.get("/api/tables/clients/records/r_missing").status_code == 400
