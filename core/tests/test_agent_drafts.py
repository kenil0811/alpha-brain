"""An agent drafts; only the person's yes acts (P3b, item 9 of tasks-and-cards-proposal.md, Q94;
19 Oct 2026). Found that day in Kenil's app: the Deal Analyst could not draft the broker's email
at all (an agent never acted outward, not even to propose), so it sent him to sign in to Gmail
for nothing and told him to ask in chat."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from conftest import building
from fastapi.testclient import TestClient
from test_actions import PAYLOAD, Driver, gmail_connected, keep_procedure, restore, with_fake

from alpha.api.server import create_app
from alpha.api.views import needs_you
from alpha.mcp.tools import Tools
from alpha.runtime.agents import runner as agent_runner
from alpha.runtime.running import RunResult, TurnRequest
from alpha.world.world import World


def analyst(world: World) -> dict[str, Any]:
    return building(world, turn="j_1").agent_create(
        "When given a task about a deal, work it out and draft what it needs",
        brief="Work the task out; draft any email it needs for the person's yes.",
        name="Deal Analyst")


def hands(world: World, req: TurnRequest) -> Tools:
    return Tools(world, turn=req.turn_id, thread=req.thread_id, actor=req.actor, run=req.run)


def drafting(world: World, task: str, seen: list[TurnRequest],
             title: str = "Ask the broker for 3 years of P&L",
             ) -> Callable[[TurnRequest], RunResult]:
    """A run that drafts the broker's email the first time, and settles its task on the next
    once it hears the draft was done."""
    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        if "What became of your drafts" in req.sentence:
            hands(world, req).world_remember("task", id=task, state="Done")
            return RunResult(ok=True, reply="The draft is in Gmail; done.")
        out = hands(world, req).act_outward(skill="gmail_draft", title=title, payload=PAYLOAD,
                                            undo="the draft can be deleted from Gmail",
                                            evidence="the listing names the broker")
        assert out.get("dry_run") == "none", out
        return RunResult(ok=True, reply="Drafted the request for your yes.")
    return runner


def test_an_agents_draft_waits_for_the_yes_and_the_agent_settles_after_it(
        world: World) -> None:
    gmail_connected(world)
    driver = Driver()
    with_fake(driver)
    try:
        keep_procedure(world)
        # a standing permission for drafts never covers an agent's (Q94)
        world.permissions.grant(sentence="Alpha may make Gmail drafts without asking.",
                                procedure="gmail_draft", effect="prepare", source="test")
        agent = analyst(world)
        task = world.tasks.make("Ask the broker for 3 years of P&L", by="person",
                                owner=agent["id"])
        seen: list[TurnRequest] = []
        runner = drafting(world, task["id"], seen)
        c = TestClient(create_app(world, live=False, runner=runner))
        assert c.post(f"/api/tasks/{task['id']}/start").json()["state"] == "Blocked"
        [card] = world.cards.waiting()
        assert card["kind"] == "action" and card["drafter"] == agent["id"]
        assert card["task"] == task["id"] and card["run"]
        action = world.actions.get(str(card["ref"]))
        # a draft has no dry run (Q95): its card is the payload, nothing typed until the yes
        assert action["state"] == "proposed" and action["preview"] is None
        assert world.tasks.get(task["id"])["waiting"] is True
        said = world.journal.recent(1, kinds=["did"])[0]["text"]
        assert "is waiting for your yes on the task Ask the broker" in said
        [need] = needs_you(world)
        assert need["kind"] == "action" and need["by"] == "Deal Analyst"
        assert need["from"]["task"]["id"] == task["id"]
        refused = c.post(f"/api/actions/{action['id']}/approve", json={"always": True})
        assert refused.status_code == 400 and "asks every time" in refused.text
        # the yes: the action runs, then the agent runs again for its task with what became
        # of its draft in front, and settles it
        c.post(f"/api/actions/{action['id']}/approve", json={"always": False})
        assert world.actions.get(action["id"])["state"] == "done"
        assert world.cards.get(card["id"])["state"] == "yes"
        assert "What became of your drafts since your last run:" in seen[1].sentence
        assert "the person said yes; done: Made: Ask the broker for 3 years of P&L" in \
            seen[1].sentence
        row = world.tasks.get(task["id"])
        assert row["state"] == "Done" and row["waiting"] is False
    finally:
        restore()


def test_a_no_leaves_the_task_blocked_and_its_reason_reaches_the_next_run(
        world: World) -> None:
    gmail_connected(world)
    with_fake(Driver())
    try:
        keep_procedure(world)
        agent = analyst(world)
        task = world.tasks.make("Ask the broker for 3 years of P&L", by="person",
                                owner=agent["id"])
        seen: list[TurnRequest] = []
        c = TestClient(create_app(world, live=False, runner=drafting(world, task["id"], seen)))
        c.post(f"/api/tasks/{task['id']}/start")
        [card] = world.cards.waiting()
        c.post(f"/api/actions/{card['ref']}/decline", json={"reason": "Wrong recipient"})
        assert world.cards.get(card["id"])["reason"] == "Wrong recipient"
        row = world.tasks.get(task["id"])
        assert row["state"] == "Blocked" and row["waiting"] is False
        assert len(seen) == 1  # nothing runs by itself
        c.post(f"/api/tasks/{task['id']}/start")
        assert "the person said no (Wrong recipient)" in seen[1].sentence
    finally:
        restore()


def test_a_newer_draft_for_the_task_takes_the_older_ones_place(world: World) -> None:
    gmail_connected(world)
    with_fake(Driver())
    try:
        keep_procedure(world)
        agent = analyst(world)
        task = world.tasks.make("Ask the broker for 3 years of P&L", by="person",
                                owner=agent["id"])
        seen: list[TurnRequest] = []
        agent_runner.run(world, agent["id"], trigger="task", task=task["id"],
                         runner=drafting(world, task["id"], seen, title="First wording"))
        [first] = world.cards.waiting()
        agent_runner.run(world, agent["id"], trigger="task", task=task["id"],
                         runner=drafting(world, task["id"], seen, title="Second wording"))
        assert world.cards.get(first["id"])["state"] == "withdrawn"
        assert world.actions.get(str(first["ref"]))["state"] == "declined"
        assert [n["text"] for n in needs_you(world)] == ["Second wording"]
    finally:
        restore()


def test_a_yes_to_an_agents_suggestion_goes_to_its_own_item(world: World) -> None:
    agent = analyst(world)
    out = Tools(world, turn="j_r", thread=agent["thread"], actor=agent["id"]).tell_person(
        "Draft the broker request in Gmail: set up drafting there", kind="proposal",
        why="no Gmail procedure exists yet")
    c = TestClient(create_app(world, live=False,
                              runner=lambda req: RunResult(ok=True, reply="On it.")))
    decided = c.post(f"/api/proposals/{out['proposed']}/decide", json={"accept": True}).json()
    assert decided["turn"]["conversation"]["id"] == agent["thread"]


def test_an_agent_may_keep_a_sites_procedure_in_its_run(world: World) -> None:
    """A10 (Q98 question 5): one the person let change skills may keep a site's procedure in
    its run; acting through it still needs a dry run and the person's yes (act_outward)."""
    agent = analyst(world)
    world.agents.update(agent["id"], may=[*agent["may"], "skills"])
    inside = Tools(world, turn="j_r", thread=agent["thread"], actor=agent["id"])
    out = inside.procedure_save("gmail_draft", "https://mail.google.com/mail/u/0/#inbox",
                                "Make a draft email in Gmail", "prepare",
                                [{"click_text": "Compose"}, {"click": "b"}], [])
    assert "error" not in out, out
