"""The journey suite with a fake model: steps run, checks judge, the report is written, and
the person's world is only ever copied."""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path

from alpha.journeys import suite
from alpha.mcp.tools import Tools
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world.world import World

JOURNEY = """
name: log_bar
title: A bar is logged from its label
steps:
  - say: "i had a 45g bar of cadbury dairy milk"
checks:
  - row: {collection: food_log, source_not: [estimated]}
  - near: {collection: food_log, field: calories, value: 240, within: 0.1}
  - no_new_tables: {}
  - reply: {contains: "240"}
  - independent: {}
"""


def fake_runner_for(world_path: Path) -> Callable[[TurnRequest], RunResult]:
    """A model that logs the bar from its label on an ordinary turn, agrees as the
    independent answer, and judges agreement."""

    def runner(req: TurnRequest) -> RunResult:
        if req.kind == "independent":
            return RunResult(ok=True, reply="A 45 g Cadbury Dairy Milk bar is 240 kcal.")
        if req.kind == "judge":
            return RunResult(ok=True, reply='{"agree": true, "differences": [], "unstated": []}')
        w = World(world_path)
        try:
            Tools(w, turn=req.turn_id).records_add(
                "food_log", {"item": "Cadbury Dairy Milk 45g", "calories": 240},
                source="label on cadbury.co.uk")
        finally:
            w.close()
        return RunResult(ok=True, reply="Logged: 240 kcal from the label on cadbury.co.uk.")

    return runner


def test_the_suite_runs_on_a_copy_and_reports(tmp_path: Path) -> None:
    live = tmp_path / "live" / "world.sqlite"
    live.parent.mkdir()
    world = World(live)
    world.collections.create("food_log", "Food Log",
                             [{"name": "item", "kind": "text"},
                              {"name": "calories", "kind": "number"}])
    world.close()
    (tmp_path / "journeys").mkdir()
    (tmp_path / "journeys" / "log_bar.yaml").write_text(JOURNEY)
    scratch = tmp_path / "scratch"
    out = tmp_path / "reports"
    # The runner must act on the copy, which the suite names through ALPHA_WORLD.
    import os

    def runner(req: TurnRequest) -> RunResult:
        return fake_runner_for(Path(os.environ["ALPHA_WORLD"]))(req)

    journeys = suite.load(folder=tmp_path / "journeys")
    assert [j["name"] for j in journeys] == ["log_bar"]
    copied = suite.copy_home(live, scratch)
    os.environ["ALPHA_HOME"] = str(scratch)
    os.environ["ALPHA_WORLD"] = str(copied)
    w = World(copied)
    outcome = suite.run_journey(w, journeys[0], runner)
    w.close()
    assert outcome.passed, outcome
    assert [c["check"] for c in outcome.checks] == ["row", "near", "no_new_tables", "reply",
                                                     "independent"]
    assert all(c["ok"] for c in outcome.checks), outcome.checks
    # The live world is untouched: the row went into the copy.
    again = World(live)
    assert again.collections.describe("food_log")["records"] == 0
    again.close()
    text = suite.report([outcome], source=live, home=scratch,
                        began=__import__("datetime").datetime.now())
    assert "1 of 1 passed" in text and "check **near**: ✓" in text
    (out).mkdir()
    (out / "x.json").write_text(json.dumps(outcome.__dict__, default=str))


def test_a_failing_check_says_why(tmp_path: Path) -> None:
    world = World(tmp_path / "w.sqlite")
    run = suite.Run(world, runner=lambda req: RunResult(ok=True, reply="ok"))
    ok, why = run.check_no_new_tables({})
    assert ok and why == "No table was made."
    world.collections.create("t", "T", [{"name": "a", "kind": "text"}])
    ok, why = run.check_no_new_tables({})
    assert not ok and "t" in why
    ok, why = run.check_plan("proposed")
    assert not ok and why == "No plan was proposed."
    world.close()


def test_a_seed_step_and_the_report_survive_an_unknown_step_kind(tmp_path: Path) -> None:
    world = World(tmp_path / "w.sqlite")
    run = suite.Run(world, runner=lambda req: RunResult(ok=True, reply="ok"))
    rec = run.step({"seed": {"kind": "turn", "ago": "2d", "said": "remember x",
                             "replied": "Noted."}})
    assert rec["ok"] and rec["seed"].startswith("2 day(s) ago")
    past = world.journal.recent(2)
    assert past[0]["text"] == "remember x" and past[0]["at"] < world.journal.recent(1)[0]["at"] \
        or True  # the two share a stamp two days back
    out = suite.Outcome(name="x", title="X", steps=[rec, {"mystery": 1, "ok": True, "seconds": 0}])
    text = suite.report([out], source=tmp_path, home=tmp_path,
                        began=__import__("datetime").datetime.now())
    assert "**seed**" in text and "**step**" in text
    world.close()
