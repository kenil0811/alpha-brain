"""About you (add, correct, forget), skills, first steps, project links and row actions."""

from __future__ import annotations

import json
from typing import Any

from conftest import building
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.mcp.tools import Tools
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world import taint
from alpha.world.world import World


def client(world: World, reply: str = "ok") -> tuple[TestClient, list[TurnRequest]]:
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        return RunResult(reply=reply, ok=True)

    return TestClient(create_app(world, live=False, runner=runner)), seen


def test_a_fact_is_added_corrected_and_forgotten(world: World) -> None:
    c, _ = client(world)
    first = c.post("/api/facts", json={"predicate": "Target roles", "value": "PM, Ops"}).json()
    assert first["predicate"] == "target_roles" and first["source"] == "person"
    fixed = c.post("/api/facts", json={"predicate": "target_roles", "value": "PM"}).json()
    facts = c.get("/api/intelligence").json()["knowledge"]["facts"]
    assert [f["value"] for f in facts] == ["PM"]
    # The model recorded one too: forgetting blanks the journal entry that holds the words.
    t = building(world, turn="j_t")
    noted = t.fact_record("person", "salary_floor", "150k", stated=True)
    assert c.delete(f"/api/facts/{noted['id']}").json() == {"forgotten": noted["id"]}
    assert c.delete(f"/api/facts/{fixed['id']}").status_code == 200
    assert c.get("/api/intelligence").json()["knowledge"]["facts"] == []
    words = " ".join(e["text"] for e in world.journal.recent(50))
    assert "150k" not in words and "forget your salary floor" in words
    assert world.knowledge.fact(noted["id"])["value"] == ""
    assert c.delete(f"/api/facts/{noted['id']}").status_code == 400


def test_a_fact_in_a_project_says_so(world: World) -> None:
    t = building(world, turn="j_seed")
    m = t.module_create("Job Search", "An offer")
    fact = Tools(world, turn="j_t", module=m["id"]).fact_record("person", "degree", "MSc")
    assert fact["source"] == f"module:{m['id']}"


def test_a_skill_is_made_run_and_retired(world: World) -> None:
    reply = ('Found two.\n{"summary": "Two people worth calling.", "items": [{"name": "Dana",'
             ' "why": "Runs ops"}, {"name": "Lee"}], "evidence": [{"title": "Site",'
             ' "url": "https://example.com"}]}')
    c, seen = client(world, reply)
    skill = c.post("/api/skills", json={
        "title": "Find people to cold call", "description": "Finds people worth calling",
        "instructions": "Search.\nRead.", "inputs": [{"name": "Industry"},
                                                    {"name": "city", "required": False}],
        "sources": ["LinkedIn"], "produces": "a list"}).json()
    assert [i["name"] for i in skill["inputs"]] == ["industry", "city"]
    assert c.post(f"/api/skills/{skill['id']}/run", json={"inputs": {}}).status_code == 400
    run = c.post(f"/api/skills/{skill['id']}/run", json={"inputs": {"industry": "HVAC"}}).json()
    assert run["summary"] == "Two people worth calling." and len(run["items"]) == 2
    assert "propose_action" in seen[0].sentence and "HVAC" in seen[0].sentence
    assert seen[0].thread_id and world.modules.thread(seen[0].thread_id)["kind"] == "job"
    page = c.get(f"/api/skills/{skill['id']}").json()
    assert page["runs"][0]["evidence"][0]["url"] == "https://example.com"
    assert [s["id"] for s in Tools(world).skills_list()] == [skill["id"]]
    c.delete(f"/api/skills/{skill['id']}")
    assert c.get("/api/skills").json() == []


def test_a_reply_without_json_is_its_own_summary(world: World) -> None:
    c, _ = client(world, "Nothing found today.")
    sid = c.post("/api/skills", json={"title": "Look", "instructions": "Look."}).json()["id"]
    run = c.post(f"/api/skills/{sid}/run", json={}).json()
    assert run["summary"] == "Nothing found today." and run["items"] == []


def test_reading_skills_taints_the_run(world: World) -> None:
    assert "skills_list" in taint.READS
    turn = world.journal.append("said", "what skills do I have?", actor="person")
    Tools(world, turn=turn).skills_list()
    assert taint.reason(world.store, turn, None) == "read the person's skills"


def test_a_row_action_runs_a_skill_on_one_row(world: World) -> None:
    c, seen = client(world, '{"summary": "Researched Lumen.", "items": []}')
    t = building(world, turn="j_seed")
    t.collection_create("companies", "Companies", [{"name": "name", "kind": "text"}])
    row = t.records_add("companies", {"name": "Lumen"})
    sid = c.post("/api/skills", json={"title": "Research", "instructions": "Look."}).json()["id"]
    t.table_row_action("companies", sid)
    actions = c.get("/api/tables/companies/row-actions").json()
    assert actions == [{"skill": sid, "title": "Research"}]
    rid = row["id"] if "id" in row else row["records"][0]["id"]
    out = c.post(f"/api/tables/companies/rows/{rid}/run/{sid}").json()
    assert out["summary"] == "Researched Lumen." and "Lumen" in seen[0].sentence


def test_first_steps_record_facts_and_propose(world: World) -> None:
    proposal = {"intro": "Start here.", "options": [
        {"title": "Courses", "request": "Keep a list of my courses", "why": "Your week."}]}
    c, seen = client(world, json.dumps(proposal))
    status = c.get("/api/onboarding").json()
    assert not status["done"] and [q["id"] for q in status["questions"]] == [
        "occupation", "week", "goal", "tools", "begin"]
    assert c.post("/api/onboarding", json={"answers": {"goal": " "}}).status_code == 400
    done = c.post("/api/onboarding", json={"answers": {"occupation": "Student",
                                                       "goal": "A PM job"}}).json()
    assert done["done"] and done["proposal"] == proposal
    facts = {f["predicate"]: f for f in world.knowledge.facts("person")}
    assert facts["occupation"]["value"] == "Student"
    assert facts["current_goal"]["state"] == "accepted"
    assert "A PM job" in seen[0].sentence
    assert c.post("/api/onboarding/skip").json()["proposal"]["options"] == []


def test_first_steps_fall_back_when_the_reply_is_not_json(world: World) -> None:
    c, _ = client(world, "Sorry.")
    done = c.post("/api/onboarding", json={"answers": {"occupation": "Nurse"}}).json()
    assert done["proposal"]["intro"].startswith("Thanks. Describe anything")


def test_a_project_link_can_be_switched_off(world: World) -> None:
    t = building(world, turn="j_seed")
    crm = t.module_create("CRM", "Know everyone")
    jobs = t.module_create("Job Search", "An offer")
    t.collection_create("contacts", "Contacts", [{"name": "name", "kind": "text"}], module="CRM")
    t.collection_create("openings", "Openings", [
        {"name": "title", "kind": "text"},
        {"name": "contact", "kind": "relation", "relation": "contacts"}], module="Job Search")
    c, _ = client(world)
    links: list[dict[str, Any]] = c.get("/api/links").json()
    assert [(x["name"], x["reads_name"], x["enabled"]) for x in links] == [
        ("Job Search", "CRM", True)]
    in_jobs = Tools(world, turn="j_t", module=jobs["id"])
    assert in_jobs.records_query("contacts") == []
    c.put(f"/api/modules/{jobs['id']}/reads", json={"reads": crm["id"], "enabled": False})
    assert c.get("/api/links").json()[0]["enabled"] is False
    assert "switched that off" in in_jobs.records_query("contacts")["error"]  # type: ignore[call-overload]
    assert Tools(world, turn="j_t", module=crm["id"]).records_query("contacts") == []
