"""Doc, the healer (design Q49, on Q50's substrate): the one fixer of Alpha's know-how, called
by the run that met the break, one repair of a thing at a time, every fix a version that can
be undone; whose fault first; the Mac's and Alpha's own faults reported, never touched."""

from __future__ import annotations

import threading
import time
from typing import Any

from conftest import building
from fastapi.testclient import TestClient
from test_actions import PAYLOAD, Driver, gmail_connected, keep_procedure, restore, said, with_fake
from test_agents import connections_table

from alpha.api.server import create_app
from alpha.runtime import acting, pipeline
from alpha.runtime.agents import builtin, doc, look_and_run
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world.world import World


def with_doc(world: World) -> dict[str, Any]:
    return next(a for a in builtin.ensure(world) if a["kind"] == "doc")


class Readers:
    """A site whose list comes back only once the reader's script was changed."""

    def script(self, url: str, script: str = "", *a: Any, **k: Any) -> dict[str, Any]:
        rows = [] if script == "return []" else [{"name": "A", "linkedin_url": "https://x/1"}]
        return {"result": rows, "signed_in": True, "title": "T", "more_pages": False}


def broken_reader_agent(world: World) -> dict[str, Any]:
    connections_table(world)
    world.readers.save("brokers", site="brokers.com", url="https://brokers.com",
                       script="return []", description="d", to_end=False, count=5)
    t = building(world, turn="j_1")
    return t.agent_create("Daily brokers", "daily 07:00", module="Network",
                          steps=[{"read": "brokers", "into": "connections",
                                  "key": "linkedin_url"}, {"tell": "connections"}])


def test_whose_fault_from_the_failures_shape() -> None:
    assert doc.diagnose("The browser didn't answer: on.33.dylib (no such file), '/opt/homebrew/"
                        "Cellar/simdjson/5.0.5/lib/libsimdjson.33.dylib'")[0] == "alpha"
    assert doc.diagnose("page.goto: net::ERR_NETWORK_CHANGED at https://x")[0] == "passing"
    assert doc.diagnose("brokers.com needs your sign-in")[0] == "yours"
    assert doc.diagnose("wellfound.com stops automated reading.")[0] == "yours"
    assert doc.diagnose("the reader returned 20 rows where the last good run had 1,553")[0] \
        == "know_how"


def test_doc_repairs_a_reader_the_run_met_broken_and_the_fix_can_be_undone(world: World) -> None:
    agent = broken_reader_agent(world)
    me = with_doc(world)
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        world.readers.save("brokers", site="brokers.com", url="https://brokers.com",
                           script="return rows", description="d", to_end=False, count=1,
                           by=req.actor)
        return RunResult(ok=True, reply="The list moved into a new container; fixed the"
                                        " selector.", duration_ms=2500)

    rid = world.runs.start(agent["id"], trigger="now")
    hand: Any = Readers()
    out = pipeline.run_pipeline(world, world.agents.get(agent["id"]), runner=runner,
                                browser=hand, pause=lambda s: None, run_id=rid)
    assert out.repairs == 1 and out.read == 1 and out.verdict() == ("succeeded", None)
    assert out.model_ms == 2500
    # Doc did the turn, in the agent's thread, with its own name on it
    assert seen[0].actor == me["id"] and seen[0].thread_id == agent["thread"]
    assert "repairing one of your own readers" in seen[0].system
    assert "Repair it and save it under the same name (brokers)" in seen[0].sentence
    run = world.runs.last(me["id"])
    assert run and (run["trigger"], run["called_by"]) == ("called", rid)
    assert run["verdict"] == "succeeded"
    assert run["line"].startswith("Doc fixed the reader brokers: The list moved")
    fixed = world.journal.recent(5, kinds=["changed"])[-1]
    assert fixed["actor"] == me["id"] and fixed["thread"] == agent["thread"]
    assert (fixed["data"]["skill"], fixed["data"]["from"], fixed["data"]["to"]) == ("brokers", 1, 2)
    assert world.skills.versions("brokers") == [{"version": 1, "saved_at": fixed["at"],
                                                  "replaced_by": me["id"], "description": "d"}]
    notes = world.knowledge.find_note(f"agent:{me['id']}", "Notes")
    assert notes and "## brokers" in notes["body"] and "fixed (The list moved" in notes["body"]
    # the next real run reads it fine without a repair: the fix held, said once
    out2 = pipeline.run_pipeline(world, world.agents.get(agent["id"]), runner=runner,
                                 browser=hand, pause=lambda s: None,
                                 run_id=world.runs.start(agent["id"]))
    assert out2.repairs == 0 and out2.read == 1
    held = world.journal.recent(3, kinds=["did"])[-1]
    assert held["text"] == "Doc's repair of brokers held on the next run."
    assert held["data"]["held"] == fixed["id"] and doc.mark_held(world, "brokers") is None
    assert "held on the next run" in world.knowledge.find_note(f"agent:{me['id']}", "Notes")["body"]  # type: ignore[index]
    # Undo: the version before comes back as a new version, journaled as the person's
    c = TestClient(create_app(world, live=False))
    page = c.get("/api/skills/brokers").json()
    assert [v["version"] for v in page["versions"]] == [1] and page["version"] == 2
    back = c.post("/api/skills/brokers/restore/1").json()
    assert back["version"] == 3 and back["script"] == "return []" and back["health"] == "untried"
    assert world.journal.recent(1)[0]["text"] == "You took brokers back to version 1 (it was 2;" \
                                                 " now 3)."
    assert [v["version"] for v in world.skills.versions("brokers")] == [2, 1]
    assert c.post("/api/skills/brokers/restore/9").status_code == 400
    # the agent's page carries what Doc changed on the run's line, so the window can offer Undo
    lines = c.get(f"/api/agents/{me['id']}").json()["runs"][0]["lines"]
    assert any(ln.get("data", {}).get("skill") == "brokers" and ln["data"].get("from") == 1
               for ln in lines)


def test_one_repair_of_a_thing_at_a_time_a_second_caller_takes_the_fix(world: World) -> None:
    agent = broken_reader_agent(world)
    with_doc(world)
    gate = threading.Event()
    calls: list[str] = []

    def slow(req: TurnRequest) -> RunResult:
        calls.append(req.turn_id)
        assert gate.wait(5)
        world.readers.save("brokers", site="brokers.com", url="https://brokers.com",
                           script="return rows", description="d", to_end=False, count=1,
                           by=req.actor)
        return RunResult(ok=True, reply="fixed")

    results: dict[str, doc.Repair] = {}

    def call(key: str) -> None:
        results[key] = doc.repair_reader(world, agent, "brokers", "no rows", slow, run_id=key)

    first = threading.Thread(target=call, args=("a",))
    second = threading.Thread(target=call, args=("b",))
    first.start()
    time.sleep(0.2)
    second.start()
    time.sleep(0.2)
    gate.set()
    first.join(5)
    second.join(5)
    assert len(calls) == 1  # one repair turn, not two
    assert not results["a"].waited and results["a"].after == 2
    assert results["b"].waited and results["b"].after == 2 and results["b"].run_id is None


def test_doc_repairs_a_procedure_after_an_approved_action_failed(world: World) -> None:
    from test_actions import FIELDS, STEPS

    from alpha.mcp.tools import Tools

    gmail_connected(world)
    me = with_doc(world)
    driver = Driver()
    with_fake(driver)
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        Tools(world, turn=req.turn_id, actor=req.actor).procedure_save(
            "gmail_draft", "https://mail.google.com/mail/u/0/#inbox", "Make a draft email in"
            " Gmail", "prepare", STEPS, FIELDS, verify=[{"expect_text": "Draft saved"}])
        return RunResult(ok=True, reply="The compose button moved; fixed and proposed again.")

    try:
        t = keep_procedure(world, turn=said(world, "draft"))
        aid = t.action_propose("gmail_draft", "Draft", PAYLOAD, "deletable")["action"]
        driver.fail_at = 3
        out = acting.approve(world, aid, "yes", runner=runner)
        assert out["ok"] is False
        assert seen and seen[0].actor == me["id"] and "Repair the procedure" in seen[0].sentence
        assert "repairing one of your own procedures" in seen[0].system
        assert world.procedures.get("gmail_draft")["version"] == 2
        assert world.skills.versions("gmail_draft")[0]["replaced_by"] == me["id"]
        run = world.runs.last(me["id"])
        assert run and run["trigger"] == "called" and run["verdict"] == "succeeded"
        fixed = [e for e in world.journal.recent(8, kinds=["changed"]) if e["actor"] == me["id"]]
        assert fixed and fixed[-1]["text"].startswith("Doc fixed the procedure gmail_draft:")
        assert (fixed[-1]["data"]["from"], fixed[-1]["data"]["to"]) == (1, 2)
    finally:
        restore()




def test_the_macs_own_failures_are_reported_not_fixed(world: World) -> None:
    me = with_doc(world)
    agent = building(world).agent_create("Deal Tracker", "daily 07:00", "read the brokers")
    world.journal.append("failed", "Run of Deal Tracker failed: The browser didn't answer:"
                         " on.33.dylib (no such file), '/opt/homebrew/Cellar/simdjson/5.0.5/lib/"
                         "libsimdjson.33.dylib'", actor=agent["id"],
                         data={"agent": agent["id"], "run": "run_x"})
    calls: list[str] = []
    def no_model(req: TurnRequest) -> RunResult:
        calls.append(req.kind)
        return RunResult(ok=True, reply="x")

    out = look_and_run(world, "doc", runner=no_model)
    assert out and out["last_result"] == "Reported 1 failure that is not Alpha's know-how."
    assert calls == []  # no model, no repair: nothing of Alpha's know-how to fix
    report = world.journal.recent(2, kinds=["did"])[-1]
    assert report["actor"] == me["id"] and report["data"]["fault"] == "alpha"
    assert report["text"].startswith("Doc: Deal Tracker failed because of Alpha itself or your Mac")
    assert "libsimdjson.33.dylib" in report["text"]
    assert "Nothing of yours needs changing" in report["text"]
    assert look_and_run(world, "doc", runner=lambda req: RunResult(ok=True, reply="x")) is None
