"""Staged writes and "Always" for a kind (P3 items 5–6 of tasks-and-cards-proposal.md, Q86, Q91;
19 Oct 2026): what an agent's run brings in from outside waits for the person on one card for
the batch; the yes lands what was ticked, with the person's changes, and the card in its
provenance; the no stores nothing; after a few unchanged yeses the card offers Always."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from conftest import building
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.api.views import needs_you
from alpha.config import settings
from alpha.mcp.tools import Tools
from alpha.runtime import staging
from alpha.runtime.agents import runner as agent_runner
from alpha.runtime.running import RunResult, TurnRequest
from alpha.world.purge import remove_agent
from alpha.world.world import World


def intake(world: World) -> tuple[dict[str, Any], str]:
    """An agent of the person's that takes contacts in from email, its table staged."""
    t = building(world, turn="j_1")
    mid = t.module_create("Network", "know who I know")["id"]
    t.collection_create("contacts", "Contacts", [
        {"name": "name", "kind": "text"}, {"name": "email", "kind": "text"}], module="Network")
    agent = building(world, turn="j_2", module=mid).agent_create(
        "Every day, add the people who emailed me to my contacts", "daily 08:00",
        "Read the inbox; add new senders to contacts.", module=mid, name="Intake",
        stage=["contacts"])
    return agent, mid


def run_writing(world: World, agent: dict[str, Any],
                rows: list[dict[str, Any]]) -> list[TurnRequest]:
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        out = Tools(world, turn=req.turn_id, thread=req.thread_id, actor=req.actor,
                    run=req.run, module=agent["module"]).world_write(
            "contacts", rows, source="the inbox")
        assert "error" not in out, out
        return RunResult(ok=True, reply=f"Brought in {len(rows)}.")

    agent_runner.run(world, agent["id"], runner=runner)
    return seen


def test_an_agents_rows_wait_on_one_card_and_land_as_ticked_and_changed(world: World) -> None:
    agent, _ = intake(world)
    assert agent["stage"] == ["contacts"]
    run_writing(world, agent, [{"name": "Anna", "email": "anna@restopros.test"},
                               {"name": "Ben", "email": "ben@x.test"}])
    run_writing(world, agent, [{"name": "Cleo", "email": "cleo@x.test"}])
    assert world.collections.query("contacts", limit=None) == []  # nothing landed yet
    [need] = needs_you(world)
    assert need["kind"] == "staged" and need["text"] == "Add 3 rows to Contacts"
    assert need["by"] == "Intake" and len(need["staged"]["rows"]) == 3
    assert [f["name"] for f in need["staged"]["fields"]][:2] == ["name", "email"]
    c = TestClient(create_app(world, live=False))
    sid = need["staged"]["id"]
    c.post(f"/api/staged/{sid}/decide", json={"accept": True, "ticks": [0, 2],
                                              "edits": {"2": {"name": "Cleo Park"}}})
    rows = world.collections.query("contacts", limit=None)
    assert sorted(r["name"] for r in rows) == ["Anna", "Cleo Park"]
    prov = rows[0]["_provenance"]
    assert prov["card"] == need["id"] and prov["agent"] == agent["id"]
    assert world.cards.get(need["id"])["state"] == "edited" and needs_you(world) == []
    # its next run hears what became of it
    seen = run_writing(world, agent, [{"name": "Dan", "email": "dan@x.test"}])
    assert "the person said yes, after changing it; 2 row(s) added" in seen[0].sentence


def test_a_no_stores_nothing_and_keeps_its_reason(world: World) -> None:
    agent, _ = intake(world)
    run_writing(world, agent, [{"name": "Spam", "email": "s@x.test"}])
    [need] = needs_you(world)
    c = TestClient(create_app(world, live=False))
    c.post(f"/api/staged/{need['staged']['id']}/decide",
           json={"accept": False, "reason": "Not needed"})
    assert world.collections.query("contacts", limit=None) == []
    card = world.cards.get(need["id"])
    assert card["state"] == "no" and card["reason"] == "Not needed"
    assert world.staged.get(need["staged"]["id"])["rows"] == []


def test_a_file_waits_out_of_the_modules_files_and_can_go_elsewhere(
        world: World, tmp_path: Path) -> None:
    agent, mid = intake(world)
    other = building(world).module_create("Accounting", "the books")["id"]
    fetched = tmp_path / "Bank statement Sept 2025.pdf"
    fetched.write_bytes(b"%PDF-1.4 statement")
    held = world.staged.hold_file(path=fetched, held=tmp_path / ".held", origin="an email from"
                                  " anna@restopros.test", module=mid, drafter=agent["id"],
                                  run=None, thread=agent["thread"], turn=None)
    assert not fetched.exists() and Path(held["path"]).exists()
    assert held["kind"] == "file" and world.store.one("SELECT 1 FROM documents") is None
    landed = staging.decide(world, held["id"], accept=True, destination=other)
    doc = landed["landed"]
    assert doc["module"] == other and not Path(held["path"]).exists()
    assert world.cards.get(held["card"])["state"] == "edited"  # it went somewhere else
    # a no deletes the held file
    again = tmp_path / "Another.pdf"
    again.write_bytes(b"%PDF-1.4")
    second = world.staged.hold_file(path=again, held=tmp_path / ".held", origin="email",
                                    module=mid, drafter=agent["id"], run=None,
                                    thread=agent["thread"], turn=None)
    staging.decide(world, second["id"], accept=False)
    assert not Path(second["path"]).exists()


def test_after_unchanged_yeses_the_card_offers_always_and_then_it_lands_at_once(
        world: World) -> None:
    agent, _ = intake(world)
    c = TestClient(create_app(world, live=False))
    for n in range(settings.staging.always_after):
        run_writing(world, agent, [{"name": f"P{n}", "email": f"p{n}@x.test"}])
        [need] = needs_you(world)
        assert need["staged"]["offers_always"] is False
        c.post(f"/api/staged/{need['staged']['id']}/decide", json={"accept": True})
    run_writing(world, agent, [{"name": "Q", "email": "q@x.test"}])
    [need] = needs_you(world)
    assert need["staged"]["offers_always"] is True
    c.post(f"/api/staged/{need['staged']['id']}/decide", json={"accept": True, "always": True})
    [granted] = [p for p in world.permissions.live() if p["agent"] == agent["id"]]
    assert granted["sentence"] == "Intake may keep what it brings into Contacts without asking."
    run_writing(world, agent, [{"name": "R", "email": "r@x.test"}])
    assert needs_you(world) == []
    assert "R" in [r["name"] for r in world.collections.query("contacts", limit=None)]
    [last] = [r for r in world.store.all("SELECT card, rows FROM staged") if '"R"' in r["rows"]]
    assert world.cards.get(last["card"])["state"] == "allowed"  # still in Decisions


def test_only_an_agents_run_stages_and_removal_takes_what_is_held(world: World) -> None:
    agent, _ = intake(world)
    # a turn in conversation never stages: what the person asks for is written at once
    out = Tools(world, turn="j_t").world_write("contacts", [{"name": "Me", "email": "m@x.test"}],
                                               source="stated")
    assert out.get("count") == 1
    run_writing(world, agent, [{"name": "Held", "email": "h@x.test"}])
    [need] = needs_you(world)
    remove_agent(world, agent["id"])
    assert world.cards.get(need["id"])["state"] == "withdrawn" and needs_you(world) == []
    assert world.store.one("SELECT 1 FROM staged") is None
