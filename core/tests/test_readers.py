from __future__ import annotations

import time
from typing import Any

import pytest
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.connectors.base import Connections, skills_text
from alpha.mcp.tools import Tools
from alpha.runtime.automation import worth_telling
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.runtime.turn import ask
from alpha.world.readers import health_problem
from alpha.world.world import World

URL = "https://www.linkedin.com/mynetwork/invite-connect/connections/"


def table(world: World) -> None:
    world.modules.create("Network")
    world.collections.create("connections", "Connections", [
        {"name": "name", "kind": "text", "required": True},
        {"name": "linkedin_url", "kind": "url"}, {"name": "headline", "kind": "text"},
        {"name": "tags", "kind": "text"}], module=world.modules.get("Network")["id"])


def page(rows: list[dict[str, Any]]) -> Any:
    seen: list[dict[str, Any]] = []

    def job(j: dict[str, Any], timeout: int) -> dict[str, Any]:
        seen.append(j)
        return {"status": 200, "final_url": j["url"], "title": "Connections", "result": rows,
                "scrolls": 3, "writes_blocked": 0}

    job.seen = seen  # type: ignore[attr-defined]
    return job


def people(n: int, *, named: bool = True) -> list[dict[str, Any]]:
    return [{"name": f"Person {i}" if named else "", "linkedin_url":
             f"https://www.linkedin.com/in/p{i}/", "headline": "Engineer"} for i in range(n)]


def test_health() -> None:
    assert health_problem("x", last_ok=None) == "the reader didn't return a list of rows"
    assert health_problem([], last_ok=None) == "the reader returned no rows"
    assert "where the last good run had 100" in str(health_problem(people(30), last_ok=100))
    assert "have no name" in str(health_problem(people(10, named=False), last_ok=None,
                                                required=["name"]))
    assert health_problem(people(90), last_ok=100, required=["name"]) is None


def test_save_run_and_a_broken_reader_writes_nothing(world: World,
                                                     monkeypatch: pytest.MonkeyPatch) -> None:
    table(world)
    Connections(world.store).upsert("browser", "linkedin.com", status="connected")
    t = Tools(world, turn="j_1")
    monkeypatch.setattr("alpha.connectors.browser.run_job", page([]))
    assert "Not saved" in t.reader_save("linkedin_connections", URL, "return []", "x")["error"]
    job = page(people(100))
    monkeypatch.setattr("alpha.connectors.browser.run_job", job)
    saved = t.reader_save("linkedin_connections", URL, "return rows", "Your connections",
                          to_end=True)
    assert saved["rows"] == 100 and saved["version"] == 1
    assert job.seen[0]["op"] == "script" and job.seen[0]["scroll_to_end"]
    assert "profile" in job.seen[0]
    first = t.reader_run("linkedin_connections", "connections", "linkedin_url",
                         keep_person_fields=["tags"])
    assert first["health"] == "ok" and first["added"] == 100
    # the site changed: the reader now returns a few rows without names
    monkeypatch.setattr("alpha.connectors.browser.run_job", page(people(20, named=False)))
    broken = t.reader_run("linkedin_connections", "connections", "linkedin_url")
    assert broken["health"] == "broken" and "last good run had 100" in broken["problem"]
    assert world.collections.describe("connections")["records"] == 100
    reader = world.readers.get("linkedin_connections")
    assert reader["health"] == "broken" and reader["last_ok_count"] == 100
    # Alpha repairs it
    monkeypatch.setattr("alpha.connectors.browser.run_job", page(people(101)))
    assert t.reader_save("linkedin_connections", URL, "return fixed", "Your connections",
                         to_end=True)["version"] == 2
    again = t.reader_run("linkedin_connections", "connections", "linkedin_url")
    assert again["health"] == "ok" and again["added"] == 1
    assert world.readers.get("linkedin_connections")["health"] == "ok"


def test_one_bad_row_never_sinks_a_batch(world: World) -> None:
    table(world)
    rows = people(3) + [{"name": "", "linkedin_url": "https://www.linkedin.com/in/x/"}]
    out = world.collections.upsert("connections", "linkedin_url", rows, {"by": "alpha"})
    assert out["added"] == 3 and out["invalid"] == 1 and "needs" in out["problems"][0]


def test_page_script_is_read_only_and_summarises_long_results(
        world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("alpha.connectors.browser.run_job", page(people(50)))
    out = Tools(world).page_script("https://example.com/list", "return rows")
    assert out["rows"] == 50 and len(out["sample"]) == 15 and "result" not in out
    assert "error" in Tools(world).page_script("http://127.0.0.1/admin", "return 1")


def test_worth_telling_is_found_anywhere() -> None:
    assert worth_telling("Synced 20.\n\nWorth telling: 3 new people") == "3 new people"
    assert worth_telling("nothing new") is None


def test_the_model_gets_the_connector_skills(world: World) -> None:
    assert "Readers" in skills_text() and "---" not in skills_text().split("\n")[0]
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        return RunResult(reply="ok", ok=True)

    ask(world, "hello", runner=runner)
    assert "HOW TO USE WHAT ALPHA CAN REACH" in seen[0].system and "reader_save" in seen[0].system


def test_run_now_shows_progress_while_it_runs(world: World) -> None:
    gate = {"go": False}

    def runner(req: TurnRequest) -> RunResult:
        Tools(world, turn=req.turn_id, thread=req.thread_id).journal_note("saw", "Read the page.")
        while not gate["go"]:
            time.sleep(0.02)
        return RunResult(reply="Synced.", ok=True)

    auto = Tools(world).automation_create("Sync", "every 1h", "do it")
    c = TestClient(create_app(world, live=False, runner=runner))
    assert c.post(f"/api/automations/{auto['id']}/run").json()["running"] is True
    end = time.time() + 5
    view: dict[str, Any] = {}
    while time.time() < end:
        view = c.get("/api/automations").json()[0]
        if view["steps"]:
            break
        time.sleep(0.05)
    assert view["running"] and view["steps"][-1]["text"] == "Read the page."
    gate["go"] = True
    while time.time() < end and c.get("/api/automations").json()[0]["running"]:
        time.sleep(0.05)
    assert c.get("/api/automations").json()[0]["last_result"] == "Synced."


def test_an_automation_run_cannot_keep_a_list_with_page_to_table(world: World) -> None:
    table(world)
    auto = Tools(world).automation_create("Sync", "every 1h", "page_to_table …")
    inside = Tools(world, thread=auto["thread"])
    out = inside.page_to_table(URL, "/in/", "connections", {"name": "text", "linkedin_url": "url"})
    assert "write a reader" in out["error"].lower() or "Write a reader" in out["error"]


def test_a_reader_reading_part_of_a_list_the_table_holds_is_broken() -> None:
    problem = health_problem(people(10), last_ok=None, held=20)
    assert problem and "table already holds 20" in problem and "to_end" in problem
