from __future__ import annotations

import time
from typing import Any

import pytest
from conftest import building
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.mcp.tools import Tools
from alpha.runtime.running import RunResult, TurnRequest
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
    assert kinds == ["ask", "proposal"]  # a suggested fact is the About-you table's (4b)
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


def test_a_records_page_has_its_changes_newest_first_and_its_note(world: World) -> None:
    seeded(world)
    c = client(world)
    rec = c.get("/api/tables/openings").json()["records"][0]
    rid = rec["id"]
    one = c.patch(f"/api/tables/openings/records/{rid}",
                  json={"values": {"status": "applied"}, "revision": rec["revision"]}).json()
    c.patch(f"/api/tables/openings/records/{rid}",
            json={"values": {"fit": 90}, "revision": one["revision"]})
    page = c.get(f"/api/tables/openings/records/{rid}/history").json()
    newest, older = page["changes"]
    assert newest["fields"] == [{"field": "fit", "before": 88, "after": 90}]
    assert newest["by"]["by"] == "person" and newest["at"]
    assert older["fields"] == [{"field": "status", "before": "new", "after": "applied"}]
    assert page["more"] is False and page["added"]["by"]["by"] == "alpha"
    # a page at a time: nothing dropped, the older page is there to ask for
    first = c.get(f"/api/tables/openings/records/{rid}/history?count=1").json()
    assert len(first["changes"]) == 1 and first["more"] is True
    rest = c.get(f"/api/tables/openings/records/{rid}/history"
                 f"?before={first['changes'][0]['revision']}").json()
    assert rest["changes"] == [older]
    # its note, on its page, journaled with the record
    assert c.get(f"/api/tables/openings/records/{rid}").json()["note"] is None
    wrote = c.post("/api/notes", json={"scope": f"record:openings/{rid}", "title": "Notes",
                                       "body": "Recruiter is Priya"})
    assert wrote.status_code == 200
    note = c.get(f"/api/tables/openings/records/{rid}").json()["note"]
    assert note["body"] == "Recruiter is Priya"
    said = world.journal.recent(1)[0]
    assert said["text"] == "You wrote the note on a row of Openings."
    assert said["data"] == {"collection": "openings", "record": rid}
    nowhere = c.post("/api/notes", json={"scope": "record:openings/r_none", "title": "Notes",
                                         "body": "x"})
    assert nowhere.status_code == 400 and "no record" in nowhere.json()["error"]


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
    # a suggested fact waits on the About-you table, not in Needs you (4b, 18 Oct)
    fact = world.knowledge.facts("person", states=("suggested",))[0]
    assert c.post(f"/api/facts/{fact['id']}/decide", json={"accept": True}).json()["state"] == \
        "accepted"
    ask = next(i for i in needs if i["kind"] == "ask")
    c.post(f"/api/asks/{ask['id']}/answer", json={"text": "£85k"})
    proposal = next(i for i in needs if i["kind"] == "proposal")
    c.post(f"/api/proposals/{proposal['id']}/decide", json={"accept": False})
    assert c.get("/api/home").json()["needs_you"] == []


def test_questions_asked_together_are_answered_together_or_one_by_one(world: World) -> None:
    """Three questions in one turn (11 Oct, "I want a personal trainer"): the form answers
    two at once in one turn; the third, answered on its own card, does not close the rest."""
    seeded(world)
    said = world.journal.append("said", "I want a personal trainer", actor="person")
    asks = [world.journal.append("asked", q, data={"options": o, "turn": said})
            for q, o in [("What should it do?", ["A program", "Logging", "Both"]),
                         ("Where do you train?", ["Gym", "Home"]),
                         ("Any program already?", [])]]
    def runner(req: TurnRequest) -> RunResult:
        return RunResult(reply="Noted.", ok=True, duration_ms=1)

    c = client(world, runner=runner)
    out = c.post("/api/asks/answer", json={"answers": {asks[0]: "Both", asks[1]: "Gym",
                                                       asks[2]: ""}}).json()
    assert len(out["answered"]) == 2 and out["turn"]
    for _ in range(100):
        if c.get(f"/api/turns/{out['turn']['id']}").json()["state"] == "done":
            break
        time.sleep(0.05)
    sent = world.journal.recent(1, kinds=["said"])[0]["text"]
    assert sent == "What should it do? — Both\nWhere do you train? — Gym"
    assert [a["id"] for a in world.journal.open_asks() if a["data"].get("turn") == said] == [
        asks[2]]
    # The last one answered on its card: its own answer, nothing else closed.
    last = c.post(f"/api/asks/{asks[2]}/answer", json={"text": "No"}).json()
    assert [a for a in world.journal.open_asks() if a["data"].get("turn") == said] == []
    for _ in range(100):  # the answer's turn ends before the world closes
        if c.get(f"/api/turns/{last['turn']['id']}").json()["state"] not in ("running",
                                                                                "routing"):
            break
        time.sleep(0.05)
    assert c.post("/api/asks/answer", json={"answers": {asks[0]: ""}}).status_code == 400


def test_a_tap_on_one_card_leaves_the_cards_beside_it(world: World) -> None:
    from alpha.runtime.turn import close_answered_asks
    said = world.journal.append("said", "a trainer", actor="person")
    asks = [world.journal.append("asked", q, data={"turn": said})
            for q in ["What?", "Where?", "Already?"]]
    world.journal.append("answered", "Both", actor="person", data={"ask": asks[0]})
    close_answered_asks(world, "Both", None)  # the card's answer, as the next turn's words
    assert [a["id"] for a in world.journal.open_asks()] == asks[1:]
    # Words typed with nothing answered on a card answer every question of the turn.
    said2 = world.journal.append("said", "a trainer", actor="person")
    more = [world.journal.append("asked", q, data={"turn": said2}) for q in ["A?", "B?"]]
    close_answered_asks(world, "gym, three days, nothing yet", None)
    assert not [a for a in world.journal.open_asks() if a["id"] in more]


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
        if state["state"] not in ("running", "routing"):
            break
        time.sleep(0.05)
    assert state["state"] == "done" and state["reply"] == "Logged two eggs."
    convo = c.get("/api/conversation").json()
    assert [t["kind"] for t in convo["turns"]] == ["said", "replied"]


def test_a_running_turn_can_be_stopped_from_the_panel(world: World) -> None:
    """The Stop on a working turn (lost for a day on 12 Oct when the plan routes around it
    were removed): the route answers with the turn; the stop itself ends the model's process,
    which a fake runner has none of, so it is not what this test sees."""
    import threading

    gate = threading.Event()

    def runner(req: TurnRequest) -> RunResult:
        gate.wait(5)
        return RunResult(reply="done anyway", ok=True, duration_ms=1)

    c = client(world, runner=runner)
    started = c.post("/api/ask", json={"text": "think for a while"}).json()
    out = c.post(f"/api/turns/{started['id']}/stop")
    gate.set()
    assert out.status_code == 200, out.text
    assert out.json()["id"] == started["id"]
    assert c.post("/api/turns/nope/stop").status_code == 400


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


def test_a_turn_that_worked_values_out_is_checked_by_columbo_after_it(
        world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    from datetime import UTC, datetime, timedelta

    from alpha.api.server import AskBody, Turns
    from alpha.mcp.tools import Tools
    from alpha.runtime.agents import builtin, columbo, look_and_run

    builtin.ensure(world)
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

    turns_ = Turns(world, runner)
    started = turns_.start(AskBody(text="i had a shake"))
    for _ in range(100):
        if turns_.get(started["id"])["state"] == "done":
            break
        time.sleep(0.05)
    # the routing judgement, then the turn; nothing runs behind the turn itself any more
    assert kinds == ["judge", "turn"]
    # What the app's kick does after the turn (Q50): the agents whose kinds look at what it
    # left in the journal. Columbo gathers for about an hour, then judges and checks (Q47, Q51).
    assert look_and_run(world, "columbo", runner=runner) is None
    monkeypatch.setattr(columbo, "_now", lambda: datetime.now(UTC) + timedelta(minutes=61))
    out = look_and_run(world, "columbo", runner=runner)
    assert out and out["last_result"] == "Looked at 1 answer: 1 checked; it agrees."
    assert sorted(kinds[2:]) == ["independent", "judge", "judge", "judge"]
    checked = world.journal.recent(1, kinds=["checked"])[0]
    assert checked["text"] == "Checked against an independent answer and your world: both agree."
    row = world.collections.query("food_log")[0]
    assert row["_provenance"]["checked"]["agree"] and row["_provenance"]["source"] == \
        "label on ocado.com"


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
    from alpha.runtime.agents import runner as automation_runtime

    building(world).collection_create("deals", "Deals", [{"name": "title", "kind": "text"}])
    world.readers.save("brokers", site="b.com", url="https://b.com", script="return []",
                       description="Reads brokers", to_end=False, count=3,
                       when_to_use="Every broker listing")
    Tools(world).note_write("skill:brokers", "brokers", "The list paginates by 50.")
    t = building(world)
    pipe = t.agent_create("Daily brokers", "daily 07:00",
                               steps=[{"read": "brokers", "into": "deals", "key": "title"}])
    judged = t.agent_create("Weekly look", "weekly mon 09:00", brief="look and say")
    c = TestClient(create_app(world, live=False))
    page = c.get("/api/skills/brokers").json()
    assert page["kind"] == "read" and page["script"] == "return []"
    assert page["notes"]["body"] == "The list paginates by 50." and page["when_to_use"]
    assert c.get("/api/skills/nothing").status_code == 400
    a = c.get(f"/api/agents/{pipe['id']}").json()
    assert a["name"] == "Daily brokers" and a["pipeline"][0]["read"] == "brokers"
    assert a["runs"] == []
    # A run of the judged one, then its page shows the run with its outcome.
    automation_runtime.run(world, judged["id"],
                           runner=lambda req: RunResult(ok=True, reply="Nothing new."))
    j = c.get(f"/api/agents/{judged['id']}").json()
    assert j["pipeline"] is None and len(j["runs"]) == 1
    assert j["runs"][0]["line"] == "Nothing new." and j["runs"][0]["verdict"] == "succeeded"


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


def test_changes_say_what_moved_since_a_stamp(world: World) -> None:
    """The window asks one cheap question instead of refetching every page on a clock."""
    seeded(world)
    c = client(world)
    first = c.get("/api/changes").json()
    assert first["journal"] == 0 and first["tables"] == [] and first["working"] is False
    since = first["at"]
    time.sleep(1.05)  # the clock is whole seconds: what follows is after the stamp
    t = Tools(world, turn="j_t2")
    t.records_add("openings", {"title": "Data Engineer", "company": "Orbit", "fit": 70,
                               "status": "new"}, source="stated")
    priya = world.entities.find(name="Priya")[0]
    world.journal.append("noticed", "Priya moved teams", entity_ids=[priya["id"]])
    world.modules.open_thread("A build", "work")
    after = c.get("/api/changes", params={"since": since}).json()
    assert after["journal"] == 2 and after["tables"] == ["openings"]
    assert after["modules"] == [world.modules.get("Job Search")["id"]]
    assert after["entities"] == [priya["id"]] and set(after["kinds"]) == {"did", "noticed"}
    assert after["threads"] is True and after["workflows"] is False
    assert after["at"] >= since
    again = c.get("/api/changes", params={"since": after["at"]}).json()
    assert again["journal"] == 0 and again["threads"] is False


def test_the_companion_hears_about_runs_that_went_wrong(world: World) -> None:
    t = building(world, turn="j_1")
    t.module_create("Network", "x")
    auto = t.agent_create("Daily brokers", "daily 07:00", "read the brokers",
                               module="Network")
    world.agents.finished(auto["id"], result=None, error="brokers couldn't be reached.")
    c = client(world)
    troubles = c.get("/api/companion").json()["troubles"]
    assert [tr["words"] for tr in troubles] == ["brokers couldn't be reached."]
    assert troubles[0]["name"] == "Daily brokers" and troubles[0]["id"] == auto["id"]
    world.agents.finished(auto["id"], result="Read 1 of 1 sources.", error=None)
    assert c.get("/api/companion").json()["troubles"] == []


def test_an_automations_page_has_its_runs_with_verdicts_its_page_and_a_good_run(
        world: World) -> None:
    t = building(world, turn="j_1")
    t.module_create("Network", "x")
    auto = t.agent_create("Daily brokers", "daily 07:00", "read the brokers",
                               module="Network", goal="deals")
    rid = world.runs.start(auto["id"])
    world.journal.append("did", "Read 3 with brokers.", thread=auto["thread"])
    world.runs.finish(rid, verdict="partial", why="walled couldn't be reached.",
                      line="Read 1 of 2 sources.", model_ms=0, read=1, sources=2)
    c = client(world)
    page = c.get(f"/api/agents/{auto['id']}").json()
    assert page["goal"] == "deals" and page["brief"]["body"] == "read the brokers"
    assert page["notes"] is None and page["decisions"] == [] and page["may"]
    assert page["last_verdict"] == "partial" and page["last_why"] == "walled couldn't be reached."
    assert page["runs"][0]["verdict"] == "partial" and page["runs"][0]["read"] == 1
    assert [ln["text"] for ln in page["runs"][0]["lines"]] == ["Read 3 with brokers."]
    assert page["good_run"].startswith("it ends with its line")
    listed = c.get("/api/intelligence").json()["agents"][0]
    assert listed["last_verdict"] == "partial"


def test_the_conversations_list_adds_the_finished_ones_when_asked(world: World) -> None:
    from alpha.runtime import conversations as convs

    c = client(world)
    open_one = convs.open_item(world, "Open one", None)
    done_one = convs.open_item(world, "Done one", None)
    world.modules.update_thread(done_one["id"], state="done")
    live = [x["id"] for x in c.get("/api/conversations").json()]
    assert open_one["id"] in live and done_one["id"] in live  # done today: still listed
    with world.store.tx() as db:  # done before today: history
        db.execute("UPDATE threads SET updated_at = '2026-01-01T00:00:00+00:00' WHERE id = ?",
                   (done_one["id"],))
    live = [x["id"] for x in c.get("/api/conversations").json()]
    assert open_one["id"] in live and done_one["id"] not in live
    everything = [x["id"] for x in c.get("/api/conversations?done=true").json()]
    assert open_one["id"] in everything and done_one["id"] in everything


def test_the_folders_alpha_may_read_and_the_whole_mac_switch(world: World, tmp_path: Any) -> None:
    from alpha.connectors.base import Connections

    c = client(world)
    assert c.get("/api/folders").json() == {"folders": [], "whole_mac": False}
    folder = tmp_path / "docs"
    folder.mkdir()
    Connections(world.store).upsert("files", str(folder))
    assert c.get("/api/folders").json()["folders"] == [str(folder.resolve())]
    assert c.post("/api/folders/whole_mac", json={"on": True}).json() == {"whole_mac": True}
    assert c.get("/api/folders").json()["whole_mac"] is True
    assert world.journal.recent(1, kinds=["changed"])[-1]["text"] == (
        "Alpha may read any folder on this Mac.")


def test_an_agents_file_and_a_modules_notes_are_text_both_ways(world: World) -> None:
    from conftest import building

    t = building(world)
    t.module_create("Jobs")
    auto = t.agent_create("Daily jobs", "daily 07:00", brief="read the boards", module="Jobs")
    c = client(world)
    text = c.get(f"/api/agents/{auto['id']}/text").json()["text"]
    assert text.startswith("---\nagent: Daily jobs\n") and "read the boards" in text
    edited = text.replace("daily 07:00", "daily 08:15").replace("read the boards", "UK boards only")
    out = c.put(f"/api/agents/{auto['id']}/text", json={"text": edited}).json()
    assert "schedule: daily 08:15" in out["text"] and world.agents.get(auto["id"])["schedule"] == \
        "daily 08:15"
    assert c.get("/api/modules/Jobs/notes").json()["text"] == ""
    c.put("/api/modules/Jobs/notes", json={"text": "What this is for: a role by Q1."})
    assert c.get("/api/modules/Jobs/notes").json()["text"].startswith("What this is for")
    folder = world.files.dir_of(world.modules.get("Jobs")["id"])
    assert (folder / "NOTES.md").read_text().startswith("What this is for")
