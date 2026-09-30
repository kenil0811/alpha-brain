from __future__ import annotations

import json
from pathlib import Path

from alpha.context import prepack
from alpha.runtime import claude_cli
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.runtime.turn import ask
from alpha.world.world import World


def test_a_turn_journals_both_sides_and_carries_the_world(world: World) -> None:
    world.modules.create("Food")
    world.collections.create("food_log", "Food log", [{"name": "food", "kind": "text"}],
                             module=world.modules.get("Food")["id"])
    world.collections.add("food_log", {"food": "Two boiled eggs"}, {"by": "alpha"})
    world.journal.append("said", "log two boiled eggs", actor="person")
    world.journal.append("replied", "Logged two boiled eggs in Food.")
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        return RunResult(reply="You've had two boiled eggs today.", ok=True, session_id="s1",
                         num_turns=3, duration_ms=4200)

    out = ask(world, "how many eggs have I eaten", runner=runner)
    assert out.ok and out.reply.startswith("You've had")
    system = seen[0].system
    assert "RECENT CONVERSATION" in system and "log two boiled eggs" in system
    assert "Module Food" in system and "food_log (1)" in system
    assert "MATCHES FOR THIS SENTENCE" in system and "Two boiled [eggs]" in system
    assert seen[0].turn_id == out.said and seen[0].world_path == world.path
    replied = world.journal.read(out.replied)
    assert replied["kind"] == "replied" and replied["data"]["duration_ms"] == 4200


def test_a_failed_turn_is_journaled_plainly(world: World) -> None:
    out = ask(world, "hello", runner=lambda r: RunResult(reply="", ok=False, error="timed out"))
    assert not out.ok and "timed out" in out.reply
    assert world.journal.read(out.replied)["kind"] == "failed"


def test_a_thread_resumes_its_own_session(world: World) -> None:
    t = world.modules.open_thread("Salary column", "build")
    runs: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        runs.append(req)
        return RunResult(reply="ok", ok=True, session_id="sess-7")

    ask(world, "add a salary column", thread=t["id"], runner=runner)
    ask(world, "flag the ones without", thread=t["id"], runner=runner)
    assert runs[0].resume is None and runs[1].resume == "sess-7"
    # thread turns stay out of the stream
    assert all(e["thread"] is None for e in world.journal.recent(50, stream=True))


def test_cli_invocation_is_locked_down(tmp_path: Path) -> None:
    req = TurnRequest(sentence="hi", system="rules", world_path=tmp_path / "w.sqlite",
                      turn_id="j_1")
    args = claude_cli.argv(req, tmp_path / "mcp.json")
    assert args[:3] == ["claude", "-p", "hi"]
    assert "--strict-mcp-config" in args and "--no-session-persistence" in args
    assert args[args.index("--permission-mode") + 1] == "dontAsk"
    assert args[args.index("--setting-sources") + 1] == ""
    config = claude_cli.mcp_config(req)["mcpServers"]["alpha"]
    assert config["args"] == ["-m", "alpha.mcp.server"]
    assert config["env"]["ALPHA_TURN"] == "j_1"


def test_parse_reads_the_cli_json() -> None:
    line = json.dumps({"type": "result", "subtype": "success", "is_error": False,
                       "result": "Logged.", "session_id": "s", "num_turns": 4,
                       "duration_ms": 9000, "total_cost_usd": 0.03})
    r = claude_cli.parse(line, "", 0)
    assert r.ok and r.reply == "Logged." and r.num_turns == 4
    bad = claude_cli.parse("", "Not logged in", 1)
    assert not bad.ok and "Not logged in" in (bad.error or "")


def test_prepack_states_the_clock_and_emptiness(world: World) -> None:
    text = prepack.build(world, "anything")
    assert "Today's date is" in text and "created_at >=" in text
    assert "Nothing yet: no modules, no tables." in text
    assert "This is the first." in text
