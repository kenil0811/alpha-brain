"""Runs serve tasks (P2, 19 Oct 2026; docs/design/tasks-and-cards-proposal.md, Q85, Q91), as
changed by Q92 the same day: a run started for a task serves it, Working while it goes and
settled by its verdict; an agent's own work is no task (its scheduled runs serve none); every
line a run writes carries its id; a task given to an agent starts only on Start; an agent can
be on call; a question a run asked goes back to the agent that asked it."""

from __future__ import annotations

from collections.abc import Callable
from pathlib import Path
from typing import Any

from conftest import building
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.mcp.tools import Tools
from alpha.runtime.agents import builtin
from alpha.runtime.agents import runner as agent_runner
from alpha.runtime.running import RunResult, TurnRequest
from alpha.world.journal import RUN
from alpha.world.purge import remove_agent
from alpha.world.store import Problem
from alpha.world.tasks import TABLE
from alpha.world.world import World


def brief_agent(world: World, module: str | None = None, schedule: str = "") -> dict[str, Any]:
    t = building(world, turn="j_1", module=module)
    return t.agent_create("When given a task about a deal, work it out from the deal's row",
                          schedule, "Work the task out from the row; save what you found.",
                          module=module, name="Deal Analyst")


def replying(text: str,
             seen: list[TurnRequest] | None = None) -> Callable[[TurnRequest], RunResult]:
    def runner(req: TurnRequest) -> RunResult:
        if seen is not None:
            seen.append(req)
        return RunResult(ok=True, reply=text)
    return runner


def settling(world: World, task: str, text: str, seen: list[TurnRequest] | None = None,
             state: str = "Done") -> Callable[[TurnRequest], RunResult]:
    """A run that does its task and says so with its tools, as the rules ask (Q93)."""
    def runner(req: TurnRequest) -> RunResult:
        if seen is not None:
            seen.append(req)
        Tools(world, turn=req.turn_id, thread=req.thread_id, actor=req.actor,
              run=req.run).world_remember("task", id=task, state=state)
        return RunResult(ok=True, reply=text)
    return runner


def test_an_agent_on_call_has_no_schedule_and_no_job_of_its_own(world: World) -> None:
    mid = building(world).module_create("DealPilot", "buy a firm")["id"]
    agent = brief_agent(world, module=mid)
    assert agent["name"] == "Deal Analyst" and agent["schedule"] is None
    assert agent["next_run_at"] is None and world.agents.due() == []
    assert world.tasks.of(agent["id"]) == []  # its work is no task (Q92)
    builtin.ensure(world)
    assert all(t.get("owner") == "person" or not t.get("owner") for t in world.tasks.all())


def test_a_name_is_needed_and_steps_need_a_schedule(world: World) -> None:
    hands = Tools(world, turn="j_1")
    out = hands.agent_keep(title="When given a task about a deal, work it out", brief="Do it.")
    assert "a name (two or three words" in out["error"]
    refused = building(world).agent_create("Read the sites", steps=[{"tell": "alpha_tasks"}],
                                           name="Reader")
    assert "works on a schedule" in refused["error"]
    made = hands.agent_keep(title="When given a task, work it out", brief="Do it.",
                            name="Deal Analyst")
    assert made["name"] == "Deal Analyst" and made["schedule"] is None


def test_a_scheduled_run_serves_no_task_and_every_line_it_writes_carries_it(
        world: World) -> None:
    agent = brief_agent(world, schedule="daily 08:00")
    seen: list[TurnRequest] = []
    agent_runner.run(world, agent["id"], runner=replying("Read 3 sites, 2 new deals.", seen))
    [run] = world.runs.of(agent["id"])
    assert run["task"] is None and run["verdict"] == "succeeded"
    assert world.tasks.all() == []
    assert seen[0].run == run["id"]  # the run's tools journal under it
    steps = world.runs.steps(run["id"])
    assert [s["kind"] for s in steps][:1] == ["did"] and any(
        s["kind"] == "replied" for s in steps)
    # the tools a run serves journal under it, in their own thread too
    t = Tools(world, turn="j_9", actor=agent["id"], run="run_x")
    out = t.world_remember("task", text="Ask Thrive for the teaser")
    made = next(e for e in world.journal.recent(5, kinds=["made"]) if e["data"].get("task")
                == out["task"])
    assert made["data"]["run"] == "run_x" and RUN.get() is None


def test_jobs_made_before_go_once_on_open(tmp_path: Path) -> None:
    path = tmp_path / "w.sqlite"
    w = World(path)
    agent = w.agents.create("Every day, read the job boards", name="Job Boards",
                            schedule="daily 08:00")
    job = w.collections.add(TABLE, {"title": "Every day, read the job boards",
                                    "owner": agent["id"], "by": "alpha"},
                            {"by": "alpha", "source": "Job Boards's job", "standing": agent["id"]})
    kept = w.tasks.make("Ask the broker for the P&L", by="person")
    rid = w.runs.start(agent["id"], task=job["id"])
    w.close()
    again = World(path)
    try:
        assert [t["id"] for t in again.tasks.all()] == [kept["id"]]
        assert again.store.one("SELECT 1 FROM record_versions WHERE record_id = ?",
                               (job["id"],)) is None
        assert again.runs.get(rid)["task"] is None
        [said] = [e for e in again.journal.recent(5, kinds=["changed"])
                  if e["data"].get("records") == [job["id"]]]
        assert "no longer a task" in said["text"]
        again.tasks.ensure()  # once
        assert len(again.journal.recent(10, kinds=["changed"])) == 1
    finally:
        again.close()


def test_giving_never_starts_and_start_runs_the_task(world: World) -> None:
    agent = brief_agent(world)
    task = world.tasks.make("Ask the broker for three years of P&L", by="person")
    given = Tools(world, turn="j_2").world_remember("task", id=task["id"], about=agent["id"])
    assert given["state"] == "Open" and world.runs.of_task(task["id"]) == []
    seen: list[TurnRequest] = []
    c = TestClient(create_app(world, live=False, runner=settling(
        world, task["id"], "Asked; the P&L comes Friday.", seen)))
    started = c.post(f"/api/tasks/{task['id']}/start").json()
    assert started["state"] == "Done"
    [run] = world.runs.of_task(task["id"])
    assert run["trigger"] == "task" and run["line"].startswith("Asked")
    assert "The task: Ask the broker for three years of P&L" in seen[0].sentence
    view = c.get(f"/api/tasks/{task['id']}/runs").json()
    assert view["agent"]["name"] == "Deal Analyst" and view["agent"]["takes_tasks"]
    assert view["runs"][0]["steps"] and view["runs"][0]["agent_name"] == "Deal Analyst"
    assert any("Deal Analyst did the task Ask the broker" in e["text"]
               for e in world.journal.recent(10, kinds=["did"]))
    mine = c.get("/api/tasks", params={"owner": agent["id"], "done": True}).json()["tasks"]
    assert [t["id"] for t in mine] == [task["id"]]


def test_start_in_words_waits_for_the_scheduler_and_a_steps_agent_takes_no_task(
        world: World) -> None:
    agent = brief_agent(world)
    task = world.tasks.make("Read the CIM", by="person", owner=agent["id"])
    out = Tools(world, turn="j_3").world_remember("task", id=task["id"], state="start")
    assert out["state"] == "Working" and "within the half minute" in out["note"]
    assert [t["id"] for t in world.tasks.waiting_to_start()] == [task["id"]]
    agent_runner.run(world, agent["id"], trigger="task", task=task["id"],
                     runner=replying("Read it."))
    assert world.tasks.waiting_to_start() == []
    # giving a Working task to an agent turns it back to Open: Start is a choice
    other = world.tasks.make("Book the call", by="person", state="Working")
    world.tasks._set(other["id"], {"owner": agent["id"]}, by="person")
    assert world.tasks.get(other["id"])["state"] == "Open"
    steps = building(world).agent_create("Daily, read the sites", "daily 07:00",
                                         steps=[{"tell": "alpha_tasks"}], name="Reader")
    job = world.tasks.make("Something", by="person", owner=steps["id"])
    try:
        agent_runner.run(world, steps["id"], trigger="task", task=job["id"])
        raise AssertionError("a steps-only agent took a task")
    except Problem as e:
        assert "only runs its steps" in str(e)


def test_a_question_a_run_asked_goes_back_to_the_agent_that_asked(world: World) -> None:
    """Found 19 Oct in Kenil's app: the Deal Analyst's run asked who the broker is, and his
    answer went to Alpha's conversation as a bare sentence, which Alpha kept as his own name
    and email."""
    agent = brief_agent(world)
    task = world.tasks.make("Ask the broker for 3 years of P&L", by="person", owner=agent["id"])
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        hands = Tools(world, turn=req.turn_id, thread=req.thread_id, actor=req.actor,
                      run=req.run)
        if len(seen) == 1:
            hands.ask_person("Who is the broker, and their email?")
            return RunResult(ok=False, reply="", error="No broker on the row.")
        hands.world_remember("task", id=task["id"], state="Done")
        return RunResult(ok=True, reply="Drafted the ask to Kenil at k@x.test.")

    c = TestClient(create_app(world, live=False, runner=runner))
    assert c.post(f"/api/tasks/{task['id']}/start").json()["state"] == "Blocked"
    [asked] = world.journal.open_asks()
    assert asked["actor"] == agent["id"] and asked["data"]["run"]
    view = c.get("/api/conversation", params={"conversation": asked["thread"]}).json()
    assert [a["by"] for a in view["asks"]] == ["Deal Analyst"]
    out = c.post(f"/api/asks/{asked['id']}/answer", json={"text": "Kenil, k@x.test"}).json()
    assert out["turn"] is None and out["agent"] == agent["id"]
    assert world.journal.recent(5, kinds=["said"]) == []  # never Alpha's bare sentence
    assert world.knowledge.facts("person") == []
    runs = world.runs.of_task(task["id"])
    assert [r["trigger"] for r in runs] == ["answer", "task"]
    assert world.tasks.get(task["id"])["state"] == "Done"
    front = seen[1].sentence
    assert "You asked the person: Who is the broker, and their email?" in front
    assert "Their answer: Kenil, k@x.test" in front and "No broker on the row." in front
    assert "The task: Ask the broker for 3 years of P&L" in front
    rows = c.get("/api/conversation", params={"conversation": asked["thread"]}).json()["turns"]
    [row] = [e for e in rows if e["kind"] == "asked"]
    assert row["by"] == "Deal Analyst" and row["answer"] == "Kenil, k@x.test"


def test_what_the_run_said_of_its_task_stands(world: World) -> None:
    """Found 19 Oct in Kenil's app: the run marked the task Blocked ("I couldn't send the
    broker request"), ended without an error, and the task was left Done."""
    agent = brief_agent(world)
    task = world.tasks.make("Ask the broker for 3 years of P&L", by="person", owner=agent["id"])

    def blocking(req: TurnRequest) -> RunResult:
        world.tasks._set(task["id"], {"state": "Blocked"}, by=agent["id"])
        return RunResult(ok=True, reply="I couldn't send the broker request, so I blocked it.")

    agent_runner.run(world, agent["id"], trigger="task", task=task["id"], runner=blocking)
    assert world.runs.of_task(task["id"])[0]["verdict"] == "succeeded"
    assert world.tasks.get(task["id"])["state"] == "Blocked"
    said = world.journal.recent(1, kinds=["did"])[0]["text"]
    assert said.startswith("Deal Analyst could not finish the task Ask the broker")


def test_a_task_is_done_only_when_its_agent_says_so(world: World) -> None:
    """Found 19 Oct in Kenil's app: four runs that each said "I couldn't" left the task Done,
    since each run answered. A run that leaves its task Working leaves it Blocked (Q93)."""
    agent = brief_agent(world)
    task = world.tasks.make("Ask the broker for the P&L", by="person", owner=agent["id"])
    agent_runner.run(world, agent["id"], trigger="task", task=task["id"],
                     runner=replying("I couldn't draft the request."))
    assert world.tasks.get(task["id"])["state"] == "Blocked"
    said = world.journal.recent(1, kinds=["did"])[0]["text"]
    assert "ended without saying the task Ask the broker for the P&L was done" in said
    # a run that asked the person and left the task: it waits for the answer, Blocked

    def asking(req: TurnRequest) -> RunResult:
        Tools(world, turn=req.turn_id, thread=req.thread_id, actor=req.actor,
              run=req.run).ask_person("Who is the broker?")
        return RunResult(ok=True, reply="Asked who the broker is.")

    agent_runner.run(world, agent["id"], trigger="task", task=task["id"], runner=asking)
    assert world.tasks.get(task["id"])["state"] == "Blocked"
    said = world.journal.recent(1, kinds=["did"])[0]["text"]
    assert "is waiting for your answer on the task Ask the broker for the P&L" in said
    # and Done when the run says so
    agent_runner.run(world, agent["id"], trigger="task", task=task["id"],
                     runner=settling(world, task["id"], "Drafted it."))
    assert world.tasks.get(task["id"])["state"] == "Done"
    assert world.journal.recent(1, kinds=["did"])[0]["text"].startswith(
        "Deal Analyst did the task")


def test_an_agents_run_tells_the_person_by_a_hand(world: World) -> None:
    """What a run finds worth the person's attention goes by tell_person, never a label read
    out of its reply (Q78)."""
    agent = brief_agent(world, schedule="daily 08:00")

    def telling(req: TurnRequest) -> RunResult:
        Tools(world, turn=req.turn_id, thread=req.thread_id, actor=req.actor,
              run=req.run).tell_person("Midwest HVAC dropped its price to 850k.")
        return RunResult(ok=True, reply="Worth telling: read 3 deals.")

    agent_runner.run(world, agent["id"], runner=telling)
    [noticed] = world.journal.recent(5, kinds=["noticed"])
    assert noticed["text"] == "Midwest HVAC dropped its price to 850k."
    assert noticed["actor"] == agent["id"] and noticed["data"]["run"]
    assert world.runs.of(agent["id"])[0]["line"] == "Worth telling: read 3 deals."


def test_removing_an_agent_gives_back_its_tasks(world: World) -> None:
    agent = brief_agent(world)
    given = world.tasks.make("Read the CIM", by="person", owner=agent["id"], state="Working")
    remove_agent(world, agent["id"])
    back = world.tasks.get(given["id"])
    assert back["owner"] == "person" and back["state"] == "Open"
