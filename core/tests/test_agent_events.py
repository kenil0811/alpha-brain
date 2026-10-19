"""Agents that wake on events (P7 of provenance-documents-triggers-proposal.md, Q96; 19 Oct
2026): a custom agent's on: lines, looked for by code on the tick, what happened in front of
one run, its own writes never waking it, and a line naming something removed never firing."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from conftest import building
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.connectors.files import Files
from alpha.mcp.tools import Tools
from alpha.runtime import pipeline
from alpha.runtime.agents import events, look_and_run
from alpha.runtime.running import RunResult, TurnRequest
from alpha.world.modfiles import ModuleFiles
from alpha.world.purge import remove_module
from alpha.world.store import Problem, new_id
from alpha.world.world import World


def deals(world: World) -> str:
    t = building(world, turn="j_0")
    mid = t.module_create("DealPilot", "the deals I look at")["id"]
    t.collection_create("deals", "Deals", [
        {"name": "name", "kind": "text"}, {"name": "stage", "kind": "text"},
        {"name": "ebitda", "kind": "number"}], module="DealPilot")
    return str(mid)


def analyst(world: World, mid: str, on: list[dict[str, Any]],
            schedule: str = "") -> dict[str, Any]:
    return building(world, turn="j_1", module=mid).agent_create(
        "When a deal comes in, look at it and say what stands out", schedule,
        "Look at each new deal; note what stands out.", module=mid, name="Deal Analyst", on=on)


class Runs:
    """A fake model run that keeps what was put in front of it, and may write as the agent."""

    def __init__(self, world: World, write: dict[str, Any] | None = None) -> None:
        self.world, self.write, self.seen = world, write, []  # type: ignore[var-annotated]

    def __call__(self, req: TurnRequest) -> RunResult:
        self.seen.append(req.sentence)
        if self.write:
            Tools(self.world, turn=req.turn_id, thread=req.thread_id, actor=req.actor,
                  run=req.run).world_write("deals", [self.write], source="worked out")
        return RunResult(ok=True, reply="Looked at it.")


def tick(world: World, agent: dict[str, Any], runs: Runs) -> dict[str, Any] | None:
    return look_and_run(world, "custom", runner=runs, agent_id=agent["id"])


def test_a_row_added_wakes_one_run_with_it_in_front(world: World) -> None:
    mid = deals(world)
    building(world, turn="j_p").world_write("deals", [{"name": "Old deal"}], source="stated")
    agent = analyst(world, mid, [{"rows_added": "deals"}], schedule="daily 08:00")
    assert agent["when"].startswith("every day at 08:00") and agent["when"].endswith(
        "; when a row is added to Deals")
    runs = Runs(world)
    assert tick(world, agent, runs) is None and runs.seen == []  # what came before is not its
    Tools(world, turn="j_2").world_write("deals", [{"name": "Midwest HVAC", "ebitda": 2.1},
                                                   {"name": "Ohio Plumbing"}], source="stated")
    out = tick(world, agent, runs)
    assert out is not None and len(runs.seen) == 1
    assert "Since your last run:\n- 2 row(s) added to Deals: Midwest HVAC, Ohio Plumbing" \
        in runs.seen[0]
    [run] = world.store.all("SELECT trigger FROM runs WHERE agent = ?", (agent["id"],))
    assert run["trigger"] == "event"
    assert tick(world, agent, runs) is None and len(runs.seen) == 1  # once, not every tick


def test_its_own_writes_never_wake_it(world: World) -> None:
    mid = deals(world)
    agent = analyst(world, mid, [{"rows_added": "deals"}, {"rows_changed": "deals"}])
    runs = Runs(world, write={"name": "A deal it found itself"})
    Tools(world, turn="j_2").world_write("deals", [{"name": "Midwest HVAC"}], source="stated")
    tick(world, agent, runs)
    assert len(runs.seen) == 1  # woken by the person's row; its run added one of its own
    assert len(world.collections.query("deals", limit=None)) == 2
    assert tick(world, agent, runs) is None and len(runs.seen) == 1


def test_a_change_wakes_it_only_for_the_fields_it_names(world: World) -> None:
    mid = deals(world)
    Tools(world, turn="j_2").world_write("deals", [{"name": "Midwest HVAC", "stage": "new"}],
                                         source="stated")
    agent = analyst(world, mid, [{"rows_changed": "deals", "fields": ["stage"]}])
    assert agent["when"] == "when stage changes in Deals"
    row = world.collections.query("deals", limit=None)[0]
    c = TestClient(create_app(world, live=False))
    c.patch(f"/api/tables/deals/records/{row['id']}",
            json={"values": {"ebitda": 2.4}, "revision": row["revision"]})
    runs = Runs(world)
    assert tick(world, agent, runs) is None and runs.seen == []
    c.patch(f"/api/tables/deals/records/{row['id']}",
            json={"values": {"stage": "LOI"}, "revision": row["revision"] + 1})
    tick(world, agent, runs)
    assert "1 row(s) changed in Deals: Midwest HVAC (stage)" in runs.seen[0]


def test_a_document_filed_and_its_own_decided_card_wake_it(world: World,
                                                           tmp_path: Path) -> None:
    mid = deals(world)
    agent = analyst(world, mid, [{"document_filed": "DealPilot"}, {"card_decided": "mine"}])
    statement = tmp_path / "CIM Midwest HVAC.pdf"
    statement.write_bytes(b"%PDF-1.4 cim")
    Files(world).take(statement, module=mid, origin="an email", by="person")
    runs = Runs(world)
    tick(world, agent, runs)
    assert "1 document(s) filed in DealPilot: CIM Midwest HVAC.pdf (d_" in runs.seen[0]
    # a staged write of its own, decided by the person, wakes it once
    world.agents.update(agent["id"], stage=["deals"])
    Tools(world, turn="j_3", actor=agent["id"], thread=agent["thread"]).world_write(
        "deals", [{"name": "Held deal"}], source="the CIM")
    held = world.store.one("SELECT id FROM staged WHERE state = 'held'")
    assert held is not None
    TestClient(create_app(world, live=False)).post(
        f"/api/staged/{held['id']}/decide", json={"accept": False, "reason": "Not needed"})
    tick(world, agent, runs)
    assert "You decided 1 of its cards: Add 1 row to Deals: no" in runs.seen[1]
    assert tick(world, agent, runs) is None and len(runs.seen) == 2  # it has heard it now


def test_an_event_coming_up_wakes_it_once(world: World) -> None:
    mid = deals(world)
    agent = analyst(world, mid, [{"before_event": 60, "matching": "vikas"}])
    assert agent["when"] == "60 minutes before an event matching “vikas”"
    soon = (datetime.now(UTC) + timedelta(minutes=30)).replace(microsecond=0)
    entity = world.entities.resolve("event", "Call with Vikas", {})["entity"]["id"]
    with world.store.tx() as db:
        for title, at in (("Call with Vikas", soon), ("Dentist", soon),
                          ("Vikas offsite", soon + timedelta(hours=5))):
            db.execute(
                "INSERT INTO events (id, entity_id, connection, uid, calendar, title, starts_at,"
                " ends_at, all_day, attendees, updated_at) VALUES (?,?,NULL,?,'Work',?,?,?,0,"
                "'[]',?)", (new_id("ev"), entity, new_id("u"), title, at.isoformat(),
                            (at + timedelta(minutes=30)).isoformat(), at.isoformat()))
    runs = Runs(world)
    tick(world, agent, runs)
    assert len(runs.seen) == 1 and "Call with Vikas starts at" in runs.seen[0]
    assert "Dentist" not in runs.seen[0] and "offsite" not in runs.seen[0]
    assert tick(world, agent, runs) is None and len(runs.seen) == 1


def test_lines_are_checked_kept_in_its_file_and_a_removed_table_never_fires(
        world: World) -> None:
    mid = deals(world)
    with pytest.raises(Problem, match="There is no table 'contacts'"):
        events.check_lines(world, [{"rows_added": "contacts"}])
    with pytest.raises(Problem, match="Deals has no field 'price'"):
        events.check_lines(world, [{"rows_changed": "deals", "fields": ["price"]}])
    with pytest.raises(Problem, match="before_event needs minutes"):
        events.check_lines(world, [{"before_event": 0, "matching": "x"}])
    agent = analyst(world, mid, [{"rows_added": "deals"}])
    text = ModuleFiles(world).agent_text(agent)
    assert "wakes_on:\n- rows_added: deals" in text
    ModuleFiles(world).read_agent_text(agent, text.replace("rows_added: deals",
                                                           "rows_changed: deals"))
    assert world.agents.get(agent["id"])["events"][0]["rows_changed"] == "deals"
    other = building(world, turn="j_5").module_create("Elsewhere", "another place")["id"]
    building(world, turn="j_6", module=other).collection_create(
        "leads", "Leads", [{"name": "name", "kind": "text"}], module="Elsewhere")
    watcher = analyst(world, mid, [{"rows_added": "leads"}])
    remove_module(world, other)
    watcher = world.agents.get(watcher["id"])
    # its table went with the module, so the line names it as it was kept
    assert watcher["when"] == ("when a row is added to leads (its table was removed, so it"
                               " never wakes it)")
    assert events.look(world, watcher) is None


def test_a_pipelines_own_rows_carry_its_agent(world: World) -> None:
    """A steps agent's reader writes under the agent's name, so they never wake it (P7)."""
    mid = deals(world)
    agent = analyst(world, mid, [{"rows_added": "deals"}])
    world.readers.save("deal_list", site="brokers.test", url="https://brokers.test/deals",
                       script="return []", description="the deal list", to_end=False, count=0)

    class Page:
        def script(self, *_: Any, **__: Any) -> dict[str, Any]:
            return {"result": [{"name": "Listed deal"}], "needs_signin": False}

    pipeline.run_reader(world, "deal_list", "deals", "name", agent=agent["id"],
                        browser=Page())  # type: ignore[arg-type]
    [row] = world.collections.query("deals", limit=None)
    assert row["_provenance"]["agent"] == agent["id"]
    work = events.look(world, world.agents.get(agent["id"]))
    assert work is not None and not work.about  # its own rows: nothing to wake it for
