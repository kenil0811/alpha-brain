from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.connectors.base import Connections
from alpha.mcp.tools import Tools
from alpha.runtime import automation
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.runtime.turn import ask
from alpha.world.automations import check_schedule, describe, next_run
from alpha.world.store import Problem
from alpha.world.world import World

# ---- schedules ----


def test_schedules_parse_and_describe() -> None:
    assert check_schedule("every 6 hours") == "every 6h"
    assert check_schedule("Daily 8:05") == "daily 08:05"
    assert check_schedule("weekly monday 09:00") == "weekly mon 09:00"
    assert describe("daily 08:05") == "every day at 08:05"
    assert describe("every 1h") == "every hour"
    with pytest.raises(Problem, match="15 minutes"):
        check_schedule("every 5m")
    with pytest.raises(Problem, match="understands"):
        check_schedule("whenever")


def test_next_run() -> None:
    base = datetime(2026, 10, 1, 9, 0, tzinfo=UTC)
    assert next_run("every 6h", base) == base + timedelta(hours=6)
    daily = next_run("daily 08:00", base).astimezone()
    assert daily.hour == 8 and daily > base
    weekly = next_run("weekly sun 18:00", base).astimezone()
    assert weekly.weekday() == 6 and weekly > base


# ---- upsert and page_to_table ----


def connections_table(world: World) -> None:
    world.modules.create("Network")
    world.collections.create("connections", "Connections", [
        {"name": "name", "kind": "text"}, {"name": "linkedin_url", "kind": "url"},
        {"name": "headline", "kind": "text"}, {"name": "tags", "kind": "text"},
    ], module=world.modules.get("Network")["id"])


def test_upsert_matches_on_the_key_and_keeps_the_persons_fields(world: World) -> None:
    connections_table(world)
    rows = [{"name": "Priya Raman", "linkedin_url": "https://www.linkedin.com/in/priya/",
             "headline": "Engineer"},
            {"name": "Mark Ellis", "linkedin_url": "https://www.linkedin.com/in/mark/"}]
    first = world.collections.upsert("connections", "linkedin_url", rows, {"by": "alpha"})
    assert (first["added"], first["updated"]) == (2, 0)
    priya = world.collections.query("connections", {"name": "Priya Raman"})[0]
    world.collections.update("connections", priya["id"], {"tags": "warm"}, 1, {"by": "person"})
    rows[0]["headline"] = "Engineering Manager"
    rows[0]["tags"] = "sync would overwrite"
    again = world.collections.upsert("connections", "linkedin_url", rows + rows[:1],
                                     {"by": "alpha"}, fill_only={"tags"})
    assert (again["added"], again["updated"], again["unchanged"], again["skipped"]) == (0, 1, 1, 1)
    priya = world.collections.get("connections", priya["id"])
    assert priya["headline"] == "Engineering Manager" and priya["tags"] == "warm"


def test_page_to_table_reads_a_list_through_the_signin(world: World,
                                                       monkeypatch: pytest.MonkeyPatch) -> None:
    connections_table(world)
    Connections(world.store).upsert("browser", "linkedin.com", status="connected")

    def fake_job(job: dict[str, Any], timeout: int) -> dict[str, Any]:
        assert job["scroll_to_end"] and "profile" in job
        links = []
        for slug, name, head in [("priya", "Priya Raman", "Engineering Manager at Lumen"),
                                 ("mark", "Mark Ellis", "Head of Data at Northwind")]:
            url = f"https://www.linkedin.com/in/{slug}/?mini=1"
            links.append({"text": "", "url": url, "near": ""})  # the photo
            links.append({"text": name, "url": url, "near": f"{name} {head} Connected on 1 May"})
        links.append({"text": "Jobs", "url": "https://www.linkedin.com/jobs/", "near": ""})
        return {"status": 200, "final_url": job["url"], "title": "Connections", "text": "",
                "links": links}

    monkeypatch.setattr("alpha.connectors.browser.run_job", fake_job)
    t = Tools(world, turn="j_t")
    out = t.page_to_table("https://www.linkedin.com/mynetwork/invite-connect/connections/",
                          "/in/", "connections",
                          {"name": "text", "linkedin_url": "url", "headline": "near_without_text"})
    assert out["items"] == 2 and out["added"] == 2 and out["signed_in"]
    rows = {r["name"]: r for r in world.collections.query("connections")}
    assert rows["Priya Raman"]["linkedin_url"] == "https://www.linkedin.com/in/priya/"
    assert rows["Priya Raman"]["headline"].startswith("Engineering Manager at Lumen")
    assert t.page_to_table("https://www.linkedin.com/mynetwork/invite-connect/connections/",
                           "/in/", "connections", {"name": "text", "linkedin_url": "url"}
                           )["unchanged"] == 2
    assert "error" in t.page_to_table("https://x.com/", "/in/", "connections", {"name": "text"})


# ---- running automations ----


def test_an_automation_runs_in_its_own_thread_and_reports(world: World) -> None:
    connections_table(world)
    t = Tools(world, turn="j_1")
    auto = t.automation_create("Every morning, sync LinkedIn connections", "daily 08:00",
                               "page_to_table … into connections", module="Network")
    assert auto["when"] == "every day at 08:00" and auto["thread"]
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        return RunResult(reply="Worth telling: 3 new connections, including Dana Okafor.",
                         ok=True, session_id="s-auto")

    done = automation.run(world, auto["id"], runner=runner)
    assert "nobody is watching" in seen[0].system and seen[0].thread_id == auto["thread"]
    assert done["last_result"].startswith("Worth telling") and done["last_error"] is None
    assert done["next_run_at"] > datetime.now(UTC).isoformat()
    noticed = world.journal.recent(5, kinds=["noticed"])
    assert noticed[-1]["text"] == "3 new connections, including Dana Okafor."
    # automation runs never land in the person's conversation
    assert world.journal.recent(20, stream=True, kinds=["said", "replied"]) == []


def test_due_and_switching_off(world: World) -> None:
    t = Tools(world)
    auto = t.automation_create("Sync", "every 1h", "do it")
    assert world.automations.due() == []
    later = datetime.now(UTC) + timedelta(hours=2)
    assert [a["id"] for a in world.automations.due(later)] == [auto["id"]]
    t.automation_update(auto["id"], enabled=False)
    assert world.automations.due(later) == []


def test_the_api_lists_switches_and_runs_now(world: World) -> None:
    t = Tools(world)
    auto = t.automation_create("Sync", "every 1h", "do it")
    calls: list[str] = []

    def runner(req: TurnRequest) -> RunResult:
        calls.append(req.sentence)
        return RunResult(reply="Nothing new.", ok=True)

    c = TestClient(create_app(world, live=False, runner=runner))
    assert c.get("/api/intelligence").json()["automations"][0]["title"] == "Sync"
    assert c.patch(f"/api/automations/{auto['id']}", json={"enabled": False}).json()["enabled"] \
        is False
    c.post(f"/api/automations/{auto['id']}/run")
    end = time.time() + 5
    while time.time() < end and world.automations.get(auto["id"])["last_result"] is None:
        time.sleep(0.05)
    assert world.automations.get(auto["id"])["last_result"] == "Nothing new." and calls


# ---- one conversation ----


def test_the_next_message_answers_the_previous_turns_question(world: World) -> None:
    def runner(req: TurnRequest) -> RunResult:
        if "tracker" in req.sentence:
            Tools(world, turn=req.turn_id).ask_person("What's your height?")
        return RunResult(reply="ok", ok=True)

    ask(world, "I want a weight tracker", runner=runner)
    assert len(world.journal.open_asks()) == 1
    ask(world, "178 cm", runner=runner)
    assert world.journal.open_asks() == []


def test_turn_progress_steps_are_visible_while_it_runs(world: World) -> None:
    gate = {"go": False}

    def runner(req: TurnRequest) -> RunResult:
        Tools(world, turn=req.turn_id).module_create("Network")
        while not gate["go"]:
            time.sleep(0.02)
        return RunResult(reply="Built.", ok=True)

    c = TestClient(create_app(world, live=False, runner=runner))
    started = c.post("/api/ask", json={"text": "keep my connections"}).json()
    end = time.time() + 5
    steps: list[dict[str, Any]] = []
    while time.time() < end and not steps:
        steps = c.get(f"/api/turns/{started['id']}").json()["steps"]
        time.sleep(0.05)
    assert steps and steps[0]["text"] == "Made the module Network."
    gate["go"] = True
