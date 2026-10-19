"""Cards (P3a, 19 Oct 2026; tasks-and-cards-proposal.md items 1–4 and 8, Q86, Q91): whatever waits
on the person is one row of `cards`, written by the journal in the line's own transaction; Needs
you is the waiting cards; a card says where it came from; a twin is never made; a No keeps its
reason for the drafting agent's next run; a removal withdraws what it leaves waiting."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from conftest import building
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.api.views import needs_you
from alpha.mcp.tools import Tools
from alpha.runtime.agents import runner as agent_runner
from alpha.runtime.running import RunResult, TurnRequest
from alpha.world.purge import remove_agent
from alpha.world.store import Problem
from alpha.world.world import World

STEPS = [{"click_text": "Compose"}, {"fill": "textarea[name=to]", "value": "{to}"},
         {"click": "img[aria-label='Save & close']"}]


def client(world: World) -> TestClient:
    return TestClient(create_app(world, live=False))


def agent(world: World) -> dict[str, Any]:
    return building(world, turn="j_1").agent_create(
        "When given a task about a deal, work it out from the deal's row", "",
        "Work the task out from the row.", name="Deal Analyst")


def test_a_question_is_one_waiting_card_until_answered(world: World) -> None:
    thread = world.modules.open_thread("Trainer", "work", None)["id"]
    said = world.journal.append("said", "I want a trainer", actor="person", thread=thread)
    ask = Tools(world, turn=said, thread=thread).ask_person("Gym or home?", ["Gym", "Home"])
    card = world.cards.get(ask["asked"])
    assert card["kind"] == "question" and card["state"] == "waiting"
    assert card["drafter"] == "alpha" and card["turn"] == said
    assert card["options"] == ["Gym", "Home"]
    [need] = needs_you(world)
    assert need["kind"] == "ask" and need["id"] == ask["asked"] and need["by"] is None
    world.modules.update_thread(thread, state="needs_you")
    # closed without a turn: the item stops saying it needs the person
    client(world).post(f"/api/asks/{ask['asked']}/dismiss")
    assert world.cards.get(ask["asked"])["state"] == "skipped" and needs_you(world) == []
    assert world.modules.thread(thread)["state"] == "done"


def test_a_twin_is_never_made_and_takes_the_newer_turn(world: World) -> None:
    """A run asking the same thing every run made a new card each time (the 19 Oct map)."""
    a = agent(world)
    thread = a["thread"]
    first = Tools(world, turn="j_a", thread=thread, actor=a["id"]).ask_person(
        "Which broker site should I read?")
    again = Tools(world, turn="j_b", thread=thread, actor=a["id"]).ask_person(
        "Which  broker site should I read? ")
    assert again["asked"] == first["asked"]
    card = world.cards.get(first["asked"])
    assert card["twins"] == 1 and card["turn"] == "j_b"
    assert [o["data"]["turn"] for o in world.journal.open_asks()] == ["j_b"]
    assert len(world.journal.recent(10, kinds=["asked"])) == 1
    # another drafter, or the same words in another place, is another card
    other = Tools(world, turn="j_c", thread=thread).ask_person("Which broker site should I read?")
    assert other["asked"] != first["asked"] and len(needs_you(world)) == 2


def test_a_no_keeps_its_reason_for_the_drafting_agents_next_run(world: World) -> None:
    a = agent(world)
    proposed = Tools(world, turn="j_p", thread=a["thread"], actor=a["id"]).tell_person(
        "Add an EBITDA column to the deal list", kind="proposal", why="three deals give it")
    pid = proposed["proposed"]
    card = world.cards.get(pid)
    assert card["kind"] == "proposal" and card["drafter"] == a["id"]
    c = client(world)
    assert c.post(f"/api/proposals/{pid}/decide",
                  json={"accept": False, "reason": "Maybe later"}).status_code == 400
    c.post(f"/api/proposals/{pid}/decide", json={"accept": False, "reason": "Not needed"})
    card = world.cards.get(pid)
    assert card["state"] == "no" and card["reason"] == "Not needed"
    seen: list[str] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req.sentence)
        return RunResult(ok=True, reply="Read the deals.")

    agent_runner.run(world, a["id"], trigger="now", runner=runner)
    agent_runner.run(world, a["id"], trigger="now", runner=runner)
    assert "Add an EBITDA column to the deal list: Not needed" in seen[0]
    assert "said no to" not in seen[1]  # told once
    decisions = c.get("/api/decisions").json()
    assert decisions[0]["id"] == pid and decisions[0]["from"]["by"] == "Deal Analyst"


def test_a_removals_yes_and_no_and_an_actions_card(world: World) -> None:
    perm = world.journal.append("asked", "Remove \"Lumen\" from Openings?",
                                data={"options": ["Yes, remove it", "No, keep it"],
                                      "permission": "world_change", "turn": "j_1",
                                      "records": ["r_1"]})
    world.journal.append("answered", "No, keep it", actor="person", data={"ask": perm})
    assert world.cards.get(perm)["state"] == "no"
    # the same rows in another turn are another card: each turn waits on its own
    again = world.journal.append("asked", "Remove \"Lumen\" from Openings?",
                                 data={"options": ["Yes, remove it", "No, keep it"],
                                       "permission": "world_change", "turn": "j_2",
                                       "records": ["r_1"]})
    world.journal.append("answered", "Yes, remove it", actor="person", data={"ask": again})
    assert again != perm and world.cards.get(again)["state"] == "yes"
    proc = world.procedures.save("gmail_draft", site="google.com",
                                 url="https://mail.google.com/mail/u/0/#inbox",
                                 description="Make a draft email in Gmail", effect="prepare",
                                 steps=STEPS, fields=["to"])
    action = world.actions.propose(proc, title="Draft to the broker", payload={"to": "a@b.test"},
                                   undo="the draft can be deleted", evidence=None, module=None,
                                   thread=None, turn="j_3")
    jid = world.journal.append("proposed", "Make: Draft to the broker (google.com)",
                               data={"action": action["id"], "effect": "prepare", "turn": "j_3"})
    world.actions.set_proposal(action["id"], jid)
    assert [n["kind"] for n in needs_you(world)] == ["action"]
    refused = client(world).post(f"/api/actions/{action['id']}/decline", json={"reason": "meh"})
    assert refused.status_code == 400 and "A reason is one of" in refused.text
    client(world).post(f"/api/actions/{action['id']}/decline", json={"reason": "Wrong recipient"})
    card = world.cards.get(jid)
    assert card["kind"] == "action" and card["state"] == "no"
    assert card["reason"] == "Wrong recipient"
    assert needs_you(world) == []


def test_a_task_waits_for_the_yes_of_a_card_its_run_left(world: World) -> None:
    a = agent(world)
    task = world.tasks.make("Ask the broker for the P&L", by="person", owner=a["id"])

    def asking(req: TurnRequest) -> RunResult:
        Tools(world, turn=req.turn_id, thread=req.thread_id, actor=req.actor,
              run=req.run).ask_person("Who is the broker?")
        return RunResult(ok=True, reply="Asked who the broker is.")

    agent_runner.run(world, a["id"], trigger="task", task=task["id"], runner=asking)
    [card] = world.cards.waiting()
    assert card["task"] == task["id"] and card["run"] and card["drafter"] == a["id"]
    row = world.tasks.get(task["id"])
    assert row["waiting"] is True and row["state"] == "Blocked"
    waiting_list = next(v for v in world.views.for_table("alpha_tasks")
                        if v["title"] == "Waiting for my yes")
    assert waiting_list["config"]["rules"]["rules"][0]["field"] == "waiting"
    assert client(world).get(f"/api/tasks/{task['id']}/cards").json()["cards"][0]["id"] == \
        card["id"]
    world.journal.close_ask(card["id"], "Dismissed.")
    assert world.tasks.get(task["id"])["waiting"] is False


def test_a_removal_withdraws_what_it_left_waiting(world: World) -> None:
    a = agent(world)
    ask = Tools(world, turn="j_a", thread=a["thread"], actor=a["id"]).ask_person("Which site?")
    elsewhere = Tools(world, turn="j_b", actor=a["id"]).tell_person(
        "Read the BizBuySell feed too", kind="proposal", why="two deals came from it")
    remove_agent(world, a["id"])
    assert world.cards.get(ask["asked"])["state"] == "withdrawn"
    pid = elsewhere["proposed"]
    assert world.cards.get(pid)["state"] == "withdrawn" and needs_you(world) == []


def test_cards_are_made_once_for_a_world_from_before_them(tmp_path: Path) -> None:
    path = tmp_path / "w.sqlite"
    w = World(path)
    w.journal.cards = None  # lines written as before 19 Oct: no cards
    asked = w.journal.append("asked", "Which size?", data={"options": ["S", "M"], "turn": "j_1"})
    answered = w.journal.append("asked", "Which colour?", data={"turn": "j_1"})
    w.journal.append("answered", "Blue", actor="person", data={"ask": answered})
    proposed = w.journal.append("proposed", "Track water too", data={"why": "you mention it"})
    old_plan = w.journal.append("proposed", "A plan", data={"plan": "p_1"})
    with w.store.tx() as db:
        db.execute("DELETE FROM cards")
    w.close()
    again = World(path)
    try:
        assert again.cards.get(asked)["state"] == "waiting"
        assert again.cards.get(answered)["state"] == "answered"
        assert again.cards.get(answered)["decided_at"] is not None
        assert again.cards.get(proposed)["kind"] == "proposal"
        with pytest.raises(Problem):
            again.cards.get(old_plan)
        assert {n["id"] for n in needs_you(again)} == {asked, proposed}
    finally:
        again.close()
