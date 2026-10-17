from __future__ import annotations

import threading
import time
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from conftest import building
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.connectors.base import Connections
from alpha.mcp.tools import Tools
from alpha.runtime.agents import runner as agent_runner
from alpha.runtime.agents import scheduler
from alpha.runtime.running import RunResult, TurnRequest
from alpha.runtime.turn import ask
from alpha.world.agents import check_schedule, describe, next_run
from alpha.world.store import Problem
from alpha.world.world import World

# ---- schedules ----


def test_schedules_parse_and_describe() -> None:
    assert check_schedule("every 6 hours") == "every 6h"
    assert check_schedule("Daily 8:05") == "daily 08:05"
    assert check_schedule("weekly monday 09:00") == "weekly mon 09:00"
    assert describe("daily 08:05") == "every day at 08:05, or when your Mac next wakes"
    assert describe("every 1h") == "every hour"
    with pytest.raises(Problem, match="30 minutes"):
        check_schedule("every 20m")
    assert check_schedule("every 30m") == "every 30m"
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


# ---- running agents ----


def test_an_agent_runs_in_its_own_thread_and_reports(world: World) -> None:
    connections_table(world)
    t = building(world, turn="j_1")
    auto = t.agent_create("Every morning, sync LinkedIn connections", "daily 08:00",
                               "page_to_table … into connections", module="Network")
    assert auto["when"].startswith("every day at 08:00") and auto["thread"]
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        return RunResult(reply="Worth telling: 3 new connections, including Dana Okafor.",
                         ok=True, session_id="s-auto")

    done = agent_runner.run(world, auto["id"], runner=runner)
    assert "nobody is watching" in seen[0].system and seen[0].thread_id == auto["thread"]
    assert done["last_result"].startswith("Worth telling") and done["last_error"] is None
    assert done["next_run_at"] > datetime.now(UTC).isoformat()
    noticed = world.journal.recent(5, kinds=["noticed"])
    assert noticed[-1]["text"] == "3 new connections, including Dana Okafor."
    # an agent's runs never land in the person's conversation
    assert world.journal.recent(20, stream=True, kinds=["said", "replied"]) == []


def test_due_and_switching_off(world: World) -> None:
    t = building(world)
    auto = t.agent_create("Sync", "every 1h", "do it")
    assert world.agents.due() == []
    later = datetime.now(UTC) + timedelta(hours=2)
    assert [a["id"] for a in world.agents.due(later)] == [auto["id"]]
    t.agent_update(auto["id"], state="paused")
    assert world.agents.due(later) == []


def test_the_scheduler_waits_for_a_properly_awake_mac(world: World) -> None:
    """Ticks come every half minute; one far later than the last means the Mac slept, and a
    maintenance wake lasts seconds, so after a gap runs wait a minute without another gap."""
    now = [1000.0]
    sched = scheduler.Scheduler(world, runner=lambda req: RunResult(ok=True, reply="ok"),
                                 clock=lambda: now[0])
    assert sched.settled()  # the person just started Alpha: awake
    now[0] += 30
    assert sched.settled()
    now[0] += 15 * 60  # asleep for a quarter hour, then a maintenance wake
    assert not sched.settled()
    now[0] += 2
    assert not sched.settled()  # still inside the two-second wake
    now[0] += 15 * 60  # back to sleep; the next wake is another gap
    assert not sched.settled()
    now[0] += 30  # a real wake: ticks come every half minute again
    assert not sched.settled()
    now[0] += 30
    assert sched.settled()  # a minute awake without a break
    now[0] += 30
    assert sched.settled()


def test_the_scheduler_runs_due_agents_side_by_side(world: World) -> None:
    t = building(world)
    one = t.agent_create("Sync one", "every 1h", "do one")
    two = t.agent_create("Sync two", "every 1h", "do two")
    later = (datetime.now(UTC) + timedelta(hours=2)).isoformat()
    with world.store.tx() as db:
        db.execute("UPDATE agents SET next_run_at = ?", (later,))
    started: set[str] = set()
    both = threading.Event()
    lock = threading.Lock()

    def runner(req: TurnRequest) -> RunResult:
        with lock:
            started.add(world.agents.of_thread(req.thread_id or "")["name"])  # type: ignore[index]
            if len(started) == 2:
                both.set()
        # neither run finishes until both have started: they must be running together
        assert both.wait(5), "the second agent waited for the first to finish"
        return RunResult(ok=True, reply="done")

    sched = scheduler.Scheduler(world, runner=runner, clock=lambda: 1000.0)
    real_due = world.agents.due
    world.agents.due = lambda at=None: real_due(datetime.now(UTC) + timedelta(hours=2))  # type: ignore[method-assign]
    sched.tick()
    assert both.wait(5)
    deadline = time.time() + 5
    while sched.running and time.time() < deadline:
        time.sleep(0.05)
    assert sched.running == set() and started == {"Sync one", "Sync two"}
    assert world.agents.get(one["id"])["last_result"] == "done"
    assert world.agents.get(two["id"])["last_result"] == "done"


def test_the_api_lists_switches_and_runs_now(world: World) -> None:
    t = building(world)
    auto = t.agent_create("Sync", "every 1h", "do it")
    calls: list[str] = []

    def runner(req: TurnRequest) -> RunResult:
        calls.append(req.sentence)
        return RunResult(reply="Nothing new.", ok=True)

    c = TestClient(create_app(world, live=False, runner=runner))
    assert c.get("/api/intelligence").json()["agents"][0]["name"] == "Sync"
    assert c.patch(f"/api/agents/{auto['id']}", json={"state": "paused"}).json()["state"] \
        == "paused"
    c.post(f"/api/agents/{auto['id']}/run")
    end = time.time() + 5
    while time.time() < end and world.agents.get(auto["id"])["last_result"] is None:
        time.sleep(0.05)
    assert world.agents.get(auto["id"])["last_result"] == "Nothing new." and calls


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
        Tools(world, turn=req.turn_id).fact_record("person", "network", "LinkedIn")
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
    assert steps and steps[0]["text"] == "Suggested remembering network = LinkedIn."
    gate["go"] = True


def test_a_page_that_does_not_answer_at_wake_is_tried_again_in_a_minute(world: World) -> None:
    """7 Oct: one network error in the moment the Mac woke lost the day's run."""
    from alpha.runtime import pipeline

    connections_table(world)
    t = building(world, turn="j_1")
    world.readers.save("brokers", site="brokers.com", url="https://brokers.com", script="x",
                       description="d", to_end=False, count=2)
    auto = t.agent_create("Daily brokers", "daily 07:00", module="Network",
                               steps=[{"read": "brokers", "into": "connections",
                                       "key": "linkedin_url"}, {"tell": "connections"}])
    calls: list[int] = []
    pauses: list[float] = []

    class Browser:
        def script(self, *a: Any, **k: Any) -> dict[str, Any]:
            calls.append(1)
            if len(calls) == 1:
                raise Problem("The browser couldn't do that: page.goto: net::ERR_NETWORK_CHANGED"
                              " at https://brokers.com\nCall log:")
            return {"result": [{"name": "A", "linkedin_url": "https://x/1"}], "signed_in": True,
                    "title": "Brokers", "more_pages": False}

    line, problem = pipeline.run_pipeline(world, world.agents.get(auto["id"]),
                                          browser=Browser(), pause=pauses.append)  # type: ignore[arg-type]
    assert pauses == [pipeline.RETRY_AFTER_S] and len(calls) == 2
    assert line.startswith("Read 1 of 1 sources") and problem is None
    texts = [e["text"] for e in world.journal.recent(10)]
    assert any(t.startswith("brokers couldn't reach its page (net::ERR_NETWORK_CHANGED")
               for t in texts)

    class Down:
        def script(self, *a: Any, **k: Any) -> dict[str, Any]:
            raise Problem("The browser couldn't do that: page.goto: Timeout 30000ms exceeded.")

    pauses.clear()
    line, problem = pipeline.run_pipeline(world, world.agents.get(auto["id"]),
                                          browser=Down(), pause=pauses.append)  # type: ignore[arg-type]
    assert pauses == [pipeline.RETRY_AFTER_S]
    assert line.startswith("Read 0 of 1 sources") and problem == "brokers couldn't be reached."
    assert world.journal.recent(1, kinds=["failed"])[-1]["text"].startswith(
        "brokers couldn't reach its page twice")


def test_an_agent_that_reads_by_its_brief_converts_itself_to_steps(world: World) -> None:
    """8 Oct: the LinkedIn connections automation, made before pipelines, paid a model turn a
    day for a read and failed with the route. Reading in a run is refused; the model converts
    the agent; the steps run in the same run."""
    from alpha.runtime import pipeline

    connections_table(world)
    t = building(world, turn="j_1")
    world.readers.save("linkedin_connections", site="linkedin.com", url="https://linkedin.com/x",
                       script="x", description="d", to_end=True, count=5)
    auto = t.agent_create("Daily at 07:00, read your LinkedIn connections", "daily 07:00",
                               "Run reader_run(linkedin_connections into connections).",
                               module="Network")
    refused = Tools(world, thread=auto["thread"]).reader_run("linkedin_connections",
                                                             "connections", "linkedin_url")
    assert "error" in refused and "agent_update" in refused["error"]
    ran: list[str] = []

    def runner(req: TurnRequest) -> RunResult:
        # The model, told so by the wall, converts the agent and finishes.
        assert "never your work in a run" in req.system
        Tools(world, thread=auto["thread"]).agent_update(
            auto["id"], steps=[{"read": "linkedin_connections", "into": "connections",
                                "key": "linkedin_url", "keep": ["tags"]}, {"tell": "connections"}])
        return RunResult(reply="Converted to steps.", ok=True)

    def fake_pipeline(w: World, a: dict[str, Any], **kw: Any) -> pipeline.PipelineResult:
        ran.append(a["id"])
        return pipeline.PipelineResult("Read 1 of 1 sources.", None, read=1, sources=1)

    with pytest.MonkeyPatch.context() as m:
        m.setattr(pipeline, "run_pipeline", fake_pipeline)
        done = agent_runner.run(world, auto["id"], runner=runner)
    assert ran == [auto["id"]] and done["last_result"] == "Read 1 of 1 sources."
    assert world.agents.get(auto["id"])["steps"]
    assert any(e["text"].endswith("now runs as steps, with no model; running them now.")
               for e in world.journal.recent(10))


def test_a_run_is_kept_with_a_verdict_judged_by_code(world: World) -> None:
    """Q33: succeeded when everything was read, partial when something was not, failed when
    nothing was; the model's own time and the repairs counted; a failed run says so."""
    from alpha.runtime import pipeline

    connections_table(world)
    t = building(world, turn="j_1")
    for name in ("brokers", "walled"):
        world.readers.save(name, site=f"{name}.com", url=f"https://{name}.com", script="x",
                           description="d", to_end=False, count=2)
    auto = t.agent_create("Daily brokers", "daily 07:00", module="Network", goal="deals",
                               steps=[{"read": "brokers", "into": "connections",
                                       "key": "linkedin_url"},
                                      {"read": "walled", "into": "connections",
                                       "key": "linkedin_url"}, {"tell": "connections"}])
    assert world.agents.get(auto["id"])["goal"] == "deals"

    class Browser:
        def __init__(self, down: set[str]) -> None:
            self.down = down

        def script(self, url: str, *a: Any, **k: Any) -> dict[str, Any]:
            if any(d in url for d in self.down):
                raise Problem("The browser couldn't do that: page.goto: Timeout 30000ms exceeded.")
            return {"result": [{"name": "A", "linkedin_url": f"https://{url}/1"}],
                    "signed_in": True, "title": "T", "more_pages": False}

    def run_with(down: set[str]) -> dict[str, Any]:
        real = pipeline.run_pipeline

        def patched(w: World, a: dict[str, Any], **kw: Any) -> pipeline.PipelineResult:
            return real(w, a, browser=Browser(down), pause=lambda s: None, **kw)  # type: ignore[arg-type]

        with pytest.MonkeyPatch.context() as m:
            m.setattr(pipeline, "run_pipeline", patched)
            return agent_runner.run(world, auto["id"])

    run_with(set())
    last = world.runs.last(auto["id"])
    assert last and last["verdict"] == "succeeded" and last["read"] == 2 and last["sources"] == 2
    assert last["why"] is None and last["line"].startswith("Read 2 of 2 sources")
    run_with({"walled"})
    last = world.runs.last(auto["id"])
    assert last and last["verdict"] == "partial" and last["why"] == "walled couldn't be reached."
    run_with({"brokers", "walled"})
    last = world.runs.last(auto["id"])
    assert last and last["verdict"] == "failed" and last["read"] == 0
    assert world.journal.recent(1, kinds=["failed"])[-1]["text"].startswith(
        "Run of Daily brokers failed: brokers, walled couldn't be reached.")
    assert len(world.runs.of(auto["id"])) == 3 and world.runs.of(auto["id"])[0]["id"] == last["id"]
    listed = next(a for a in Tools(world).agents_list() if a["id"] == auto["id"])
    assert listed["last_verdict"] == "failed" and listed["last_why"].startswith("brokers")


def test_a_brief_run_has_its_pages_in_front_of_it_and_a_verdict(world: World) -> None:
    connections_table(world)
    t = building(world, turn="j_1")
    auto = t.agent_create(
        "Sunday summary", "weekly sun 18:00",
        "## What it is for\nA short honest summary: compare the week to the targets.\n"
        "## A good run\nOne line.", module="Network", goal="know how the week went")
    page = world.knowledge.find_note(f"agent:{auto['id']}", "Brief")
    assert page and page["body"].startswith("## What it is for")
    seen: list[str] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req.sentence)
        return RunResult(reply="Worth telling: protein ran 20 g under.", ok=True,
                         duration_ms=4000)

    agent_runner.run(world, auto["id"], runner=runner)
    assert "Your brief (what you are for, what to do, what to tell):" in seen[0]
    assert "A short honest summary" in seen[0]
    last = world.runs.last(auto["id"])
    assert last and last["verdict"] == "succeeded" and last["model_ms"] == 4000
    assert last["line"].startswith("Worth telling")

    def failing(req: TurnRequest) -> RunResult:
        return RunResult(reply="Approved.", ok=False,
                         error="Alpha's tools didn't answer in this run (1 of 1 call failed: x)")

    agent_runner.run(world, auto["id"], runner=failing)
    last = world.runs.last(auto["id"])
    assert last and last["verdict"] == "failed" and "tools didn't answer" in last["why"]
    Tools(world, turn="j_2").agent_update(auto["id"], brief="Replaced.")
    page = world.knowledge.find_note(f"agent:{auto['id']}", "Brief")
    assert page and page["body"] == "Replaced."


def test_a_broken_reader_is_repaired_at_most_twice_in_a_run(world: World) -> None:
    from alpha.runtime import pipeline

    connections_table(world)
    t = building(world, turn="j_1")
    world.readers.save("brokers", site="brokers.com", url="https://brokers.com", script="x",
                       description="d", to_end=False, count=5)
    auto = t.agent_create("Daily brokers", "daily 07:00", module="Network",
                               steps=[{"read": "brokers", "into": "connections",
                                       "key": "linkedin_url"}, {"tell": "connections"}])

    class Empty:
        def script(self, *a: Any, **k: Any) -> dict[str, Any]:
            return {"result": [], "signed_in": True, "title": "T", "more_pages": False}

    repairs: list[str] = []
    out = pipeline.run_pipeline(world, world.agents.get(auto["id"]), browser=Empty(),  # type: ignore[arg-type]
                                repair=lambda w, a, n, p, r: repairs.append(n))
    assert repairs == ["brokers", "brokers"] and out.repairs == 2
    assert out.verdict() == ("failed", "brokers couldn't be repaired.")


# ---- the substrate (slice A, Q50) ----


def test_automations_become_agents_under_the_same_ids(tmp_path: Any) -> None:
    """15 Oct: a world made before agents opens with its automations as custom agents, the
    same ids, so pages, looks, runs and Try again carry over; the procedure folds into the
    brief above the page it had; runs.automation becomes runs.agent."""
    import sqlite3

    path = tmp_path / "old.sqlite"
    db = sqlite3.connect(path)
    db.executescript(
        "CREATE TABLE automations (id TEXT PRIMARY KEY, title TEXT NOT NULL, module TEXT,"
        " thread TEXT, schedule TEXT NOT NULL, procedure TEXT NOT NULL, enabled INTEGER NOT NULL"
        " DEFAULT 1, next_run_at TEXT, last_run_at TEXT, last_result TEXT, last_error TEXT,"
        " created_at TEXT NOT NULL, updated_at TEXT NOT NULL, goal TEXT, steps TEXT, skill TEXT);"
        "INSERT INTO automations VALUES ('a_1','Daily deal tracker',NULL,'t_1','daily 07:00','',"
        " 1,NULL,'2026-10-14T07:00:00+00:00','Read 15 of 15 sources.',NULL,'x','x','deals',NULL,"
        " 'run_deals');"
        "INSERT INTO automations VALUES ('a_2','Sunday summary',NULL,NULL,'weekly sun 18:00',"
        " 'Compare the week to the targets.',0,NULL,NULL,NULL,NULL,'x','x',NULL,NULL,NULL);"
        "CREATE TABLE skills (name TEXT PRIMARY KEY, kind TEXT NOT NULL, site TEXT, module TEXT,"
        " url TEXT, description TEXT NOT NULL, when_to_use TEXT, script TEXT, to_end INTEGER NOT"
        " NULL DEFAULT 0, whole INTEGER NOT NULL DEFAULT 1, effect TEXT, steps TEXT, verify TEXT,"
        " fields TEXT, version INTEGER NOT NULL DEFAULT 1, health TEXT NOT NULL DEFAULT 'untried',"
        " last_problem TEXT, last_run_at TEXT, last_count INTEGER, last_ok_count INTEGER,"
        " source TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);"
        "INSERT INTO skills (name, kind, description, steps, created_at, updated_at) VALUES"
        " ('run_deals','run','Daily deal tracker','[{\"read\":\"brokers\",\"into\":\"deals\","
        "\"key\":\"title\"}]','x','x');"
        "CREATE TABLE runs (id TEXT PRIMARY KEY, automation TEXT NOT NULL, started_at TEXT NOT"
        " NULL, ended_at TEXT, verdict TEXT, why TEXT, line TEXT, model_ms INTEGER NOT NULL"
        " DEFAULT 0, repairs INTEGER NOT NULL DEFAULT 0, read INTEGER, sources INTEGER);"
        "INSERT INTO runs VALUES ('run_1','a_1','2026-10-14T07:00:00+00:00',"
        " '2026-10-14T07:05:00+00:00','succeeded',NULL,'Read 15 of 15 sources.',0,0,15,15);"
        "CREATE TABLE notes (id TEXT PRIMARY KEY, scope TEXT NOT NULL, title TEXT NOT NULL,"
        " body TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE (scope, title));"
        "INSERT INTO notes VALUES ('n_1','agent:a_2','Sunday summary','## A good run\nOne line.',"
        " 'x');"
        "CREATE TABLE preferences (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT"
        " NOT NULL);"
        "INSERT INTO preferences VALUES ('agent_looks','{\"a_1\": {\"body\": \"fox\"}}','x');"
    )
    db.commit()
    db.close()
    world = World(path)
    deals, sunday = world.agents.get("a_1"), world.agents.get("a_2")
    assert deals["kind"] == "custom" and deals["name"] == "Daily deal tracker"
    assert deals["description"] == "Daily deal tracker" and deals["goal"] == "deals"
    assert deals["on"] and deals["schedule"] == "daily 07:00"
    # its run skill is named by the current rule on open (3 Oct), from its sentence
    assert deals["skill"] == "run_deal_tracker" and world.skills.get("run_deal_tracker", "run")
    assert deals["steps"] == [{"read": "brokers", "into": "deals", "key": "title"}]
    assert deals["last_result"] == "Read 15 of 15 sources." and deals["thread"] == "t_1"
    assert deals["may"] == ["records", "notes", "facts", "goals", "asks", "proposals",
                            "agents", "threads"]
    assert not sunday["on"] and sunday["state"] == "paused"
    brief = world.knowledge.find_note("agent:a_2", "Brief")
    assert brief and brief["body"] == "Compare the week to the targets.\n\n## A good run\nOne line."
    assert world.knowledge.find_note("agent:a_2", "Sunday summary") is None
    last = world.runs.last("a_1")
    assert last and last["line"] == "Read 15 of 15 sources."
    assert world.runs.of("a_1")[0]["agent"] == "a_1"
    assert world.preferences.get("agent_looks") == {"a_1": {"body": "fox"}}
    assert world.store.one("SELECT name FROM sqlite_master WHERE name = 'automations'") is None
    world.close()
    again = World(path)  # opening again moves nothing twice
    assert len(again.agents.all()) == 2 and again.runs.last("a_1")
    again.close()


def test_an_agents_run_is_journaled_under_its_name_and_the_tools_know_it(world: World) -> None:
    t = building(world, turn="j_1")
    auto = t.agent_create("Sync", "every 1h", "do it")
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        Tools(world, turn=req.turn_id, thread=req.thread_id, actor=req.actor).journal_note(
            "saw", "Looked at the page.")
        return RunResult(reply="Nothing new.", ok=True)

    agent_runner.run(world, auto["id"], runner=runner)
    assert seen[0].actor == auto["id"] and "You are Sync, one of the person's agents" in \
        seen[0].system
    entries = world.journal.recent(5, thread=auto["thread"])
    assert {e["actor"] for e in entries} == {auto["id"]}
    assert [e["kind"] for e in entries] == ["did", "saw", "replied"]
    last = world.runs.last(auto["id"])
    assert last and last["trigger"] == "schedule"


def test_an_at_mention_makes_the_agent_answer_in_the_conversation(world: World) -> None:
    """Q44: "@Name …" picks who answers, by structure; the reply is the agent's own, in the
    same conversation, and a run with trigger `mention` is kept."""
    t = building(world, turn="j_1")
    auto = t.agent_create("Deal Scout", "daily 07:00", "Look at the deals table and say.")
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        return RunResult(reply="Three deals are new.", ok=True)

    c = TestClient(create_app(world, live=False, runner=runner))
    started = c.post("/api/ask", json={"text": "@deal scout what's new?"}).json()
    end = time.time() + 5
    while time.time() < end and c.get(f"/api/turns/{started['id']}").json()["state"] not in (
            "done", "failed"):
        time.sleep(0.05)
    turn = c.get(f"/api/turns/{started['id']}").json()
    assert turn["state"] == "done" and turn["reply"] == "Three deals are new."
    assert seen[0].actor == auto["id"] and "You are Deal Scout" in seen[0].system
    assert "Look at the deals table and say." in seen[0].system
    said = world.journal.read(turn["said"])
    replied = world.journal.read(turn["replied"])
    assert said["actor"] == "person" and said["text"] == "@deal scout what's new?"
    assert replied["actor"] == auto["id"] and said["thread"] == replied["thread"]
    run = world.runs.last(auto["id"])
    assert run and run["trigger"] == "mention" and run["verdict"] == "succeeded"
    # No agent of that name: an ordinary turn, Alpha's own.
    assert world.agents.by_mention("@nobody hello") is None
    assert world.agents.by_mention("deal scout") is None
    # anywhere in the sentence, a space after the @ allowed (16 Oct, Kenil: "hi @ scout")
    hit = world.agents.by_mention("hi @ deal scout, anything new?")
    assert hit and hit[0]["id"] == auto["id"] and hit[1] == "hi anything new?"
    hit = world.agents.by_mention("what's new @Deal Scout")
    assert hit and hit[1] == "what's new"
    assert world.agents.by_mention("mail me@deal scout") is None  # an address is not an @


def test_an_agent_may_change_only_what_its_write_list_says(world: World) -> None:
    """Q50: the tool wrapper is the wall; an agent's records writes stay in its module."""
    connections_table(world)
    world.modules.create("Deals")
    world.collections.create("deals", "Listings", [{"name": "title", "kind": "text"}],
                             module=world.modules.get("Deals")["id"])
    t = building(world, turn="j_1")
    asker = t.agent_create("Asker", "every 1h", "ask", module="Network")
    world.agents.update(asker["id"], may=["asks"])
    inside = Tools(world, turn="j_2", thread=asker["thread"], actor=asker["id"])
    refused = inside.records_add("connections", {"name": "A"}, source="stated")
    assert refused["error"].startswith("Asker may not change records; it may change asks.")
    assert "error" not in inside.ask_person("Which list?")
    assert world.collections.query("connections") == []
    writer = t.agent_create("Writer", "every 1h", "write", module="Network")
    own = Tools(world, turn="j_3", thread=writer["thread"], actor=writer["id"])
    assert own.records_add("connections", {"name": "A"}, source="stated")["id"]
    out = own.records_add("deals", {"title": "B"}, source="stated")
    assert out["error"] == "Writer works inside its own module and may not change the table deals."
    # Alpha and the person are never cut.
    assert Tools(world, turn="j_4").records_add("deals", {"title": "B"}, source="stated")["id"]


def test_a_kind_that_looks_for_work_runs_on_what_the_journal_gained(world: World) -> None:
    """Q50: the journal is the event stream; a kind's `look` reads from the agent's cursor,
    the run moves the cursor, and nothing runs twice for the same entries."""
    from alpha.runtime import agents as kinds

    t = building(world, turn="j_1")
    watcher = t.agent_create("Watcher", "weekly mon 09:00", "Say what failed.")
    with world.store.tx() as db:
        db.execute("UPDATE agents SET kind = 'watcher' WHERE id = ?", (watcher["id"],))
    looked: list[int] = []

    def look(w: World, agent: dict[str, Any]) -> kinds.Work | None:
        failures = kinds.since_cursor(w, agent, kinds=["failed"])
        looked.append(len(failures))
        upto = kinds.journal_rowid(w)
        return kinds.Work(upto, {"failures": [f["id"] for f in failures]}) if failures \
            else kinds.Work(upto)

    kinds.register("watcher", look)
    try:
        sched = scheduler.Scheduler(world, runner=lambda req: RunResult(ok=True, reply="Seen."),
                                    clock=lambda: 1000.0)
        sched.tick()  # nothing failed yet: the cursor moves, no run
        assert looked == [0] and world.runs.of(watcher["id"]) == []
        before = world.agents.get(watcher["id"])["cursor"]
        assert before > 0
        world.journal.append("failed", "The reader x looks broken.", data={"reader": "x"})
        sched.tick()
        deadline = time.time() + 5
        while sched.running and time.time() < deadline:
            time.sleep(0.05)
        runs = world.runs.of(watcher["id"])
        assert len(runs) == 1 and runs[0]["trigger"] == "event"
        assert runs[0]["verdict"] == "succeeded"
        assert world.agents.get(watcher["id"])["cursor"] > before
        sched.tick()  # the same failure is not news twice
        assert looked == [0, 1, 0] and len(world.runs.of(watcher["id"])) == 1
    finally:
        kinds.LOOKS.pop("watcher", None)


def test_a_custom_agent_goes_with_everything_it_made(world: World) -> None:
    from alpha.world import purge

    connections_table(world)
    world.readers.save("brokers", site="brokers.com", url="https://brokers.com", script="x",
                       description="d", to_end=False, count=2)
    t = building(world, turn="j_1")
    auto = t.agent_create("Sync", "every 1h", module="Network",
                          steps=[{"read": "brokers", "into": "connections",
                                  "key": "linkedin_url"}], brief="Read then tell.")
    world.decisions.record(by="person", what="Only warm leads", about={"agent": auto["id"]})
    world.preferences.set("agent_looks", {auto["id"]: {"body": "fox"}})
    rid = world.runs.start(auto["id"], trigger="now")
    world.runs.finish(rid, verdict="succeeded", line="ok")
    plan = purge.agent_removal(world, auto["id"])
    assert plan["what"] == "1 run, 1 page, 1 decision and its pipeline"
    purge.remove_agent(world, auto["id"])
    with pytest.raises(Problem):
        world.agents.get(auto["id"])
    assert world.runs.of(auto["id"]) == [] and world.decisions.about("agent", auto["id"]) == []
    assert world.knowledge.find_note(f"agent:{auto['id']}", "Brief") is None
    # its pipeline went; the reader is Alpha's know-how, shared, and stays
    assert world.skills.names() == ["brokers"] and world.preferences.get("agent_looks") == {}
    assert world.journal.recent(1)[0]["text"] == \
        "Removed Sync: 1 run, 1 page, 1 decision and its pipeline."
    assert world.journal.removals()[auto["id"]].startswith("Sync was removed on")
    # Alpha's own agents are paused, never deleted.
    own = world.agents.create("Sherlock", kind="sherlock")
    with pytest.raises(Problem, match="can't be deleted"):
        purge.agent_removal(world, own["id"])


def test_the_api_renames_pauses_and_deletes_an_agent(world: World,
                                                     monkeypatch: pytest.MonkeyPatch) -> None:
    from alpha.cli import main

    connections_table(world)
    t = building(world, turn="j_1")
    auto = t.agent_create("Sync", "every 1h", "do it", module="Network")
    c = TestClient(create_app(world, live=False))
    assert c.patch(f"/api/agents/{auto['id']}", json={}).status_code == 400
    renamed = c.patch(f"/api/agents/{auto['id']}", json={"name": "Deal Scout"}).json()
    assert renamed["name"] == "Deal Scout" and renamed["description"] == "Sync"
    assert world.journal.recent(1)[0]["text"] == "You renamed the agent Sync to Deal Scout."
    paused = c.patch(f"/api/agents/{auto['id']}", json={"state": "paused"}).json()
    assert paused["state"] == "paused" and paused["next_run_at"] is None
    assert world.journal.recent(1)[0]["text"] == "You paused Deal Scout."
    page = c.get(f"/api/agents/{auto['id']}").json()
    assert page["name"] == "Deal Scout" and page["brief"]["body"] == "do it"
    assert c.get(f"/api/agents/{auto['id']}/removal").json()["what"] == "1 page"
    assert c.delete(f"/api/agents/{auto['id']}").json()["name"] == "Deal Scout"
    assert c.get(f"/api/agents/{auto['id']}").status_code == 400
    # The CLI lists and renames (the way Kenil's five get their names, 15 Oct).
    other = t.agent_create("Daily brokers", "daily 07:00", "look", module="Network")
    monkeypatch.setenv("ALPHA_WORLD", str(world.path))
    assert main(["agent-rename", other["id"], "Deal", "Tracker"]) == 0
    assert world.agents.get(other["id"])["name"] == "Deal Tracker"
    assert world.journal.recent(1)[0]["text"] == \
        "You renamed the agent Daily brokers to Deal Tracker."
