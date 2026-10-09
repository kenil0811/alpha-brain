from __future__ import annotations

import json
import re
from pathlib import Path

from alpha.context import prepack
from alpha.runtime import claude_cli
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.runtime.turn import ask, timings
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
    assert "THIS CONVERSATION" in system and "log two boiled eggs" in system
    assert "Module Food" in system and "food_log (1 row)" in system
    assert "MATCHES FOR THIS SENTENCE" in system and "Two boiled [eggs]" in system
    assert seen[0].turn_id == out.said and seen[0].world_path == world.path
    replied = world.journal.read(out.replied)
    assert replied["kind"] == "replied" and replied["data"]["duration_ms"] == 4200


def test_a_failed_turn_is_journaled_plainly(world: World) -> None:
    out = ask(world, "hello", runner=lambda r: RunResult(reply="", ok=False, error="timed out"))
    assert not out.ok and "timed out" in out.reply
    assert world.journal.read(out.replied)["kind"] == "failed"


def test_a_thread_starts_fresh_from_its_brief_and_history(world: World) -> None:
    t = world.modules.open_thread("Salary column", "build")
    world.modules.set_brief(t["id"], "Salaries are in GBP; the site hides them for some roles.")
    runs: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        runs.append(req)
        return RunResult(reply="ok", ok=True, session_id="sess-7")

    ask(world, "add a salary column", thread=t["id"], runner=runner)
    ask(world, "flag the ones without", thread=t["id"], runner=runner)
    assert world.modules.thread(t["id"])["session_ref"] is None
    second = runs[1].system
    assert "THIS THREAD" in second and "Salaries are in GBP" in second
    assert "add a salary column" in second  # its own history, not a remembered session
    args = claude_cli.argv(runs[1], Path("/tmp/mcp.json"))
    assert "--no-session-persistence" in args and "--resume" not in args
    # thread turns stay out of the stream
    assert all(e["thread"] is None for e in world.journal.recent(50, stream=True))


def test_what_the_model_saw_is_kept_with_dates(world: World) -> None:
    def runner(req: TurnRequest) -> RunResult:
        return RunResult(reply="Noted.", ok=True)

    ask(world, "log two boiled eggs", runner=runner)
    out = ask(world, "what did I eat yesterday", runner=runner)
    kept = world.journal.context(out.said)
    assert kept is not None and "THIS CONVERSATION" in kept["context"]
    line = next(x for x in kept["context"].splitlines() if "log two boiled eggs" in x)
    assert re.match(r"- (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2} \d\d:\d\d ", line)


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
    assert not bad.ok and bad.error == claude_cli.SIGNED_OUT
    # Any other failure reaches the person in plain words; the detail goes to the log.
    crashed = claude_cli.parse("", "Traceback (most recent call last): boom", 1)
    assert crashed.error == claude_cli.NO_ANSWER


def test_prepack_states_the_clock_and_emptiness(world: World) -> None:
    text = prepack.build(world, "anything")
    assert "Today's date is" in text and "created_at >=" in text
    assert "Nothing yet: no modules, no tables." in text
    assert "This is the first." in text


def test_signed_out_says_where_to_sign_in() -> None:
    out = claude_cli.parse(json.dumps({"type": "result", "is_error": True,
                                       "result": "Not logged in · Please run /login"}), "", 1)
    assert not out.ok and out.error == claude_cli.SIGNED_OUT


def test_a_streamed_run_is_watched_and_its_result_read() -> None:
    """stream-json: the window sees what the model is doing; the result event ends it."""
    from alpha.runtime.claude_cli import LIVE, _watch, plain_tool

    keys = ["j_live"]
    _watch(keys, {"type": "assistant", "message": {"content": [
        {"type": "text", "text": "Let me look at the inbox first."}]}})
    _watch(keys, {"type": "assistant", "message": {"content": [
        {"type": "tool_use", "name": "mcp__alpha__page_read",
         "input": {"url": "https://mail.google.com/mail/u/0/#inbox"}}]}})
    _watch(keys, {"type": "rate_limit_event"})
    live = LIVE.progress_for("j_live")
    assert live and live["thought"] == "Let me look at the inbox first."
    assert live["doing"].startswith("Reading a page: https://mail.google.com")
    assert live["tools"] == 1
    assert plain_tool("WebSearch", {"query": "cadbury dairy milk 45g calories"}).startswith(
        "Searching the web for cadbury")
    assert plain_tool("mcp__alpha__records_add", {"collection": "food_log"}) == \
        "Adding a row: food_log"
    assert plain_tool("mcp__alpha__ask_person", {"question": "Which size?"}) == "Asking you"
    LIVE.progress.clear()
    stream = "\n".join([
        json.dumps({"type": "system", "subtype": "init"}),
        json.dumps({"type": "assistant", "message": {"content": [{"type": "text", "text": "Hi"}]}}),
        "not json",
        json.dumps({"type": "result", "subtype": "success", "is_error": False, "result": "Done.",
                    "session_id": "s", "num_turns": 3, "duration_ms": 1200,
                    "total_cost_usd": 0.01}),
    ])
    out = claude_cli.parse(stream, "", 0)
    assert out.ok and out.reply == "Done." and out.num_turns == 3


def test_the_prepack_lists_each_tables_fields_and_keeps_every_section_within_its_budget(
        world: World) -> None:
    """A data question is one query, not a describe and a query (3 Oct: every such turn paid
    the step); a long section says what it left out instead of the tail being cut blind."""
    from conftest import building

    t = building(world)
    module = t.module_create("Nutrition", "eat well")["id"]
    t.collection_create("food_log", "Food log", [
        {"name": "date", "kind": "date"}, {"name": "meal", "kind": "choice",
                                           "choices": ["Breakfast", "Lunch"]},
        {"name": "item", "kind": "text"}, {"name": "calories", "kind": "number", "unit": "kcal"},
        {"name": "client", "kind": "relation", "relation": "clients"}], module=module)
    text = prepack.build(world, "how much did I eat")
    assert "WHAT ALPHA HOLDS (each table with its fields: query it straight away)" in text
    assert ("  food_log (0 rows): date date, meal choice[Breakfast|Lunch], item,"
            " calories number kcal, client relation->clients") in text
    assert f"- Module Nutrition ({module}) — eat well" in text
    # Twelve long turns overflow the conversation's budget: the newest stay, the count is said.
    for i in range(12):
        world.journal.append("said", f"turn {i} " + "words " * 80, actor="person")
        world.journal.append("replied", f"reply {i} " + "words " * 80)
    text = prepack.build(world, "anything")
    convo = text[text.index("THIS CONVERSATION"):text.index("MATCHES") if "MATCHES" in text
                 else len(text)]
    assert "reply 11" in convo and "turn 0 " not in convo
    assert "earlier lines left out for room" in convo
    assert len(convo) <= prepack.BUDGET["THIS CONVERSATION"] + 80
    # A world with a long index still fits: the whole shrinks by section, never cut short.
    for i in range(300):
        world.knowledge.write_note(f"topic:t{i}", f"Topic {i}", "Body.", summary="s" * 120)
    text = prepack.build(world, "anything")
    assert len(text) <= prepack.MAX_CHARS and "cut short" not in text
    assert "MATCHES" in text or "THIS CONVERSATION" in text
    assert "lines left out for room" in text[text.index("WHAT ALPHA KNOWS"):]


def test_turn_timings_are_measured_from_the_journal(world: World) -> None:
    def runner(req: TurnRequest) -> RunResult:
        return RunResult(reply="Done.", ok=True, duration_ms=1200, num_turns=3, session_id="s1")

    ask(world, "log two eggs", runner=runner)
    ask(world, "and a banana", runner=runner)
    rows = timings(world)
    assert [r["model_s"] for r in rows] == [1.2, 1.2] and [r["steps"] for r in rows] == [3, 3]
    assert [r["resumed"] for r in rows] == [False, True] and all(r["ok"] for r in rows)
    assert rows[0]["wall_s"] >= 0 and rows[0]["text"] == "log two eggs"


def test_a_turn_whose_tool_calls_all_failed_is_a_failed_turn() -> None:
    """8 Oct: a route that refused every tool call still produced text that claimed a build
    was approved. Every call failed means no answer, whatever the words."""
    from typing import Any

    from alpha.runtime.claude_cli import TOOLS_DOWN, count_tools, parse_result, tools_verdict

    tools: dict[str, Any] = {"called": 0, "failed": 0, "first": ""}
    count_tools({"type": "assistant", "message": {"content": [
        {"type": "tool_use", "name": "mcp__alpha__plan_approve", "input": {}}]}}, tools)
    count_tools({"type": "user", "message": {"content": [
        {"type": "tool_result", "is_error": True, "content": [
            {"type": "text", "text": "MCP server alpha is not connected"}]}]}}, tools)
    assert tools == {"called": 1, "failed": 1, "first": "MCP server alpha is not connected"}
    done = parse_result({"type": "result", "result": "Approved. The build will run."}, "", 0)
    out = tools_verdict(done, 1, 1, tools["first"])
    assert not out.ok and out.error and out.error.startswith(TOOLS_DOWN)
    assert "MCP server alpha is not connected" in out.error
    assert "nothing it said counts" in out.error
    # one answered call among failed ones is still an answer
    again = parse_result({"type": "result", "result": "Logged two eggs."}, "", 0)
    assert tools_verdict(again, 3, 2, "x").ok and again.tools_failed == 2
    assert tools_verdict(parse_result({"type": "result", "result": "Hello."}, "", 0), 0, 0, "").ok
