"""What each model call used and cost (Settings › Models, 12 Oct): recorded in `route.run`."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from alpha.runtime import claude_cli, codex_account, codex_cli, route
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world import usage
from alpha.world.world import World


def _req(world: World, **kw: Any) -> TurnRequest:
    return TurnRequest(sentence="s", system="S", world_path=world.path, turn_id="j_1", **kw)


def test_every_call_is_recorded_per_model_with_the_tools_own_price(world: World,
                                                                   monkeypatch: Any) -> None:
    # Claude Code's own result: one call that used two models, each with its list price
    claude = {"modelUsage": {
        "claude-sonnet-5-5": {"inputTokens": 10, "outputTokens": 5, "cacheReadInputTokens": 100,
                              "cacheCreationInputTokens": 50, "costUSD": 0.25},
        "claude-haiku-5-5": {"inputTokens": 3, "outputTokens": 1, "costUSD": 0.01}}}
    monkeypatch.setattr(claude_cli, "run", lambda req: RunResult(reply="c", ok=True, raw=claude,
                                                                 cost_estimate=0.26))
    monkeypatch.setattr(codex_cli, "run", lambda req: RunResult(
        reply="x", ok=True, raw={"usage": {"input_tokens": 40, "cached_input_tokens": 20,
                                           "output_tokens": 7}}))
    monkeypatch.setattr(codex_account, "default_model", lambda: "gpt-5.5")
    route.run(_req(world, thread_id="t_1", module_id="m_1"))
    world.preferences.set("thinks_with", "codex")
    route.run(_req(world, kind="judge"))
    # a run that never reached a model (signed out) costs nothing and says nothing
    monkeypatch.setattr(codex_cli, "run", lambda req: RunResult(reply="", ok=False))
    route.run(_req(world))

    rows = world.usage.since()
    got = [(r["route"], r["model"], r["kind"], r["input"], r["cache_write"], r["cost"])
           for r in rows]
    assert sorted(got, key=str) == sorted([
        ("claude", "claude-sonnet-5-5", "turn", 10, 50, 0.25),
        ("claude", "claude-haiku-5-5", "turn", 3, None, 0.01),
        ("codex", "gpt-5.5", "judge", 40, None, None),  # tokens, and no price: never a guess
    ], key=str)
    assert len({r["at"] for r in rows if r["route"] == "claude"}) == 1  # one call, one moment


def test_a_background_pass_takes_its_turns_project_and_old_answers_are_carried_over_once(
        tmp_path: Path) -> None:
    path = tmp_path / "world.sqlite"
    world = World(path)
    said = world.journal.append("said", "hi", actor="person", module=None, thread=None)
    world.journal.append("replied", "a", data={"turn": said, "cost_estimate": 0.5})
    world.journal.append("replied", "b", data={"turn": said, "cost_estimate": None})
    world.journal.append("failed", "c", data={"turn": said, "cost_estimate": None})
    world.journal.append("replied", "a build's summary, no model turn")
    world.store.close()

    world = World(path)  # opening carries the old answers over
    old = sorted((r["route"] or "", r["cost"] or 0) for r in world.usage.since())
    assert old == [("", 0), ("claude", 0.5), ("codex", 0)]
    world.store.close()
    world = World(path)  # and only once
    assert len(world.usage.since()) == 3

    health = world.modules.create("Health")
    said2 = world.journal.append("said", "eggs", actor="person", module=health["id"])
    usage.record(path, [{"turn": said2, "kind": "judge", "route": "claude", "cost": 0.1}])
    noticed = [r for r in world.usage.since() if r["turn"] == said2]
    assert noticed[0]["module"] == health["id"]
    assert world.usage.since("2999-01-01") == []
