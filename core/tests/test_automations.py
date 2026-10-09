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


# ---- running automations ----


def test_an_automation_runs_in_its_own_thread_and_reports(world: World) -> None:
    connections_table(world)
    t = building(world, turn="j_1")
    auto = t.automation_create("Every morning, sync LinkedIn connections", "daily 08:00",
                               "page_to_table … into connections", module="Network")
    assert auto["when"].startswith("every day at 08:00") and auto["thread"]
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
    t = building(world)
    auto = t.automation_create("Sync", "every 1h", "do it")
    assert world.automations.due() == []
    later = datetime.now(UTC) + timedelta(hours=2)
    assert [a["id"] for a in world.automations.due(later)] == [auto["id"]]
    t.automation_update(auto["id"], enabled=False)
    assert world.automations.due(later) == []


def test_the_scheduler_waits_for_a_properly_awake_mac(world: World) -> None:
    """Ticks come every half minute; one far later than the last means the Mac slept, and a
    maintenance wake lasts seconds, so after a gap runs wait a minute without another gap."""
    now = [1000.0]
    sched = automation.Scheduler(world, runner=lambda req: RunResult(ok=True, reply="ok"),
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


def test_the_scheduler_runs_due_automations_side_by_side(world: World) -> None:
    t = building(world)
    one = t.automation_create("Sync one", "every 1h", "do one")
    two = t.automation_create("Sync two", "every 1h", "do two")
    later = (datetime.now(UTC) + timedelta(hours=2)).isoformat()
    with world.store.tx() as db:
        db.execute("UPDATE automations SET next_run_at = ?", (later,))
    started: set[str] = set()
    both = threading.Event()
    lock = threading.Lock()

    def runner(req: TurnRequest) -> RunResult:
        with lock:
            started.add(req.sentence.split('"')[1])
            if len(started) == 2:
                both.set()
        # neither run finishes until both have started: they must be running together
        assert both.wait(5), "the second automation waited for the first to finish"
        return RunResult(ok=True, reply="done")

    sched = automation.Scheduler(world, runner=runner, clock=lambda: 1000.0)
    real_due = world.automations.due
    world.automations.due = lambda at=None: real_due(datetime.now(UTC) + timedelta(hours=2))  # type: ignore[method-assign]
    sched.tick()
    assert both.wait(5)
    deadline = time.time() + 5
    while sched.running and time.time() < deadline:
        time.sleep(0.05)
    assert sched.running == set() and started == {"Sync one", "Sync two"}
    assert world.automations.get(one["id"])["last_result"] == "done"
    assert world.automations.get(two["id"])["last_result"] == "done"


def test_the_api_lists_switches_and_runs_now(world: World) -> None:
    t = building(world)
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
    auto = t.automation_create("Daily brokers", "daily 07:00", module="Network",
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

    line, problem = pipeline.run_pipeline(world, world.automations.get(auto["id"]),
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
    line, problem = pipeline.run_pipeline(world, world.automations.get(auto["id"]),
                                          browser=Down(), pause=pauses.append)  # type: ignore[arg-type]
    assert pauses == [pipeline.RETRY_AFTER_S]
    assert line.startswith("Read 0 of 1 sources") and problem == "brokers couldn't be reached."
    assert world.journal.recent(1, kinds=["failed"])[-1]["text"].startswith(
        "brokers couldn't reach its page twice")


def test_an_automation_that_reads_by_procedure_converts_itself_to_steps(world: World) -> None:
    """8 Oct: the LinkedIn connections automation, made before pipelines, paid a model turn a
    day for a read and failed with the route. Reading in a run is refused; the model converts
    the automation; the steps run in the same run."""
    from alpha.runtime import pipeline

    connections_table(world)
    t = building(world, turn="j_1")
    world.readers.save("linkedin_connections", site="linkedin.com", url="https://linkedin.com/x",
                       script="x", description="d", to_end=True, count=5)
    auto = t.automation_create("Daily at 07:00, read your LinkedIn connections", "daily 07:00",
                               "Run reader_run(linkedin_connections into connections).",
                               module="Network")
    refused = Tools(world, thread=auto["thread"]).reader_run("linkedin_connections",
                                                             "connections", "linkedin_url")
    assert "error" in refused and "automation_update" in refused["error"]
    ran: list[str] = []

    def runner(req: TurnRequest) -> RunResult:
        # The model, told so by the wall, converts the automation and finishes.
        assert "never your work in a run" in req.system
        Tools(world, thread=auto["thread"]).automation_update(
            auto["id"], steps=[{"read": "linkedin_connections", "into": "connections",
                                "key": "linkedin_url", "keep": ["tags"]}, {"tell": "connections"}])
        return RunResult(reply="Converted to steps.", ok=True)

    def fake_pipeline(w: World, a: dict[str, Any], **kw: Any) -> pipeline.PipelineResult:
        ran.append(a["id"])
        return pipeline.PipelineResult("Read 1 of 1 sources.", None, read=1, sources=1)

    with pytest.MonkeyPatch.context() as m:
        m.setattr(pipeline, "run_pipeline", fake_pipeline)
        done = automation.run(world, auto["id"], runner=runner)
    assert ran == [auto["id"]] and done["last_result"] == "Read 1 of 1 sources."
    assert world.automations.get(auto["id"])["steps"]
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
    auto = t.automation_create("Daily brokers", "daily 07:00", module="Network", goal="deals",
                               steps=[{"read": "brokers", "into": "connections",
                                       "key": "linkedin_url"},
                                      {"read": "walled", "into": "connections",
                                       "key": "linkedin_url"}, {"tell": "connections"}])
    assert world.automations.get(auto["id"])["goal"] == "deals"

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
            return automation.run(world, auto["id"])

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
        'Run of "Daily brokers" failed: brokers, walled couldn\'t be reached.')
    assert len(world.runs.of(auto["id"])) == 3 and world.runs.of(auto["id"])[0]["id"] == last["id"]
    listed = next(a for a in Tools(world).automations_list() if a["id"] == auto["id"])
    assert listed["last_verdict"] == "failed" and listed["last_why"].startswith("brokers")


def test_a_procedure_run_has_its_page_in_front_of_it_and_a_verdict(world: World) -> None:
    connections_table(world)
    t = building(world, turn="j_1")
    auto = t.automation_create(
        "Sunday summary", "weekly sun 18:00", "Compare the week to the targets.",
        module="Network", goal="know how the week went",
        guidelines="## What it is for\nA short honest summary.\n## A good run\nOne line.")
    page = world.knowledge.find_note(f"agent:{auto['id']}", "Sunday summary")
    assert page and page["body"].startswith("## What it is for")
    seen: list[str] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req.sentence)
        return RunResult(reply="Worth telling: protein ran 20 g under.", ok=True,
                         duration_ms=4000)

    automation.run(world, auto["id"], runner=runner)
    assert "Its page (what it is for, how to judge, what to tell):" in seen[0]
    assert "A short honest summary." in seen[0]
    last = world.runs.last(auto["id"])
    assert last and last["verdict"] == "succeeded" and last["model_ms"] == 4000
    assert last["line"].startswith("Worth telling")

    def failing(req: TurnRequest) -> RunResult:
        return RunResult(reply="Approved.", ok=False,
                         error="Alpha's tools didn't answer in this run (1 of 1 call failed: x)")

    automation.run(world, auto["id"], runner=failing)
    last = world.runs.last(auto["id"])
    assert last and last["verdict"] == "failed" and "tools didn't answer" in last["why"]
    Tools(world, turn="j_2").automation_update(auto["id"], guidelines="Replaced.")
    page = world.knowledge.find_note(f"agent:{auto['id']}", "Sunday summary")
    assert page and page["body"] == "Replaced."


def test_a_broken_reader_is_repaired_at_most_twice_in_a_run(world: World) -> None:
    from alpha.runtime import pipeline

    connections_table(world)
    t = building(world, turn="j_1")
    world.readers.save("brokers", site="brokers.com", url="https://brokers.com", script="x",
                       description="d", to_end=False, count=5)
    auto = t.automation_create("Daily brokers", "daily 07:00", module="Network",
                               steps=[{"read": "brokers", "into": "connections",
                                       "key": "linkedin_url"}, {"tell": "connections"}])

    class Empty:
        def script(self, *a: Any, **k: Any) -> dict[str, Any]:
            return {"result": [], "signed_in": True, "title": "T", "more_pages": False}

    repairs: list[str] = []
    out = pipeline.run_pipeline(world, world.automations.get(auto["id"]), browser=Empty(),  # type: ignore[arg-type]
                                repair=lambda w, a, n, p, r: repairs.append(n))
    assert repairs == ["brokers", "brokers"] and out.repairs == 2
    assert out.verdict() == ("failed", "brokers couldn't be repaired.")
