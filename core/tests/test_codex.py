"""The ChatGPT route (Q32): one route in front of two runners; the Codex CLI's command line,
instructions, events and account words; the Settings routes."""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.runtime import claude_account, codex_account, codex_cli, route
from alpha.runtime.claude_cli import LIVE, NO_ANSWER, RunResult, TurnRequest
from alpha.world.world import World


def _req(world: World, kind: str = "turn", model: str | None = None, **kw: Any) -> TurnRequest:
    return TurnRequest(sentence="log two eggs", system="RULES\n\nPACK", world_path=world.path,
                       turn_id="j_1", thread_id="t_1", module_id="m_1", kind=kind, model=model,
                       **kw)


def test_the_route_follows_the_persons_choice_and_falls_back_to_claude(world: World,
                                                                        monkeypatch: Any) -> None:
    calls: list[str] = []
    from alpha.runtime import claude_cli

    def fake(which: str, reply: str) -> Any:
        def runner(req: TurnRequest) -> RunResult:
            calls.append(which)
            return RunResult(reply=reply, ok=True)
        return runner

    monkeypatch.setattr(claude_cli, "run", fake("claude", "c"))
    monkeypatch.setattr(codex_cli, "run", fake("codex", "x"))
    assert route.chosen(world.path) == "claude"
    assert route.run(_req(world)).reply == "c"
    world.preferences.set("thinks_with", "codex")
    assert route.chosen(world.path) == "codex"
    assert route.run(_req(world)).reply == "x"
    world.preferences.set("thinks_with", "something else")
    assert route.chosen(world.path) == "claude"
    assert route.chosen(Path("/nowhere/world.sqlite")) == "claude"
    assert calls == ["claude", "codex"]


def test_the_codex_command_line_and_instructions(world: World, monkeypatch: Any,
                                                 tmp_path: Path) -> None:
    monkeypatch.setattr(codex_account, "default_model", lambda: "gpt-5.5")
    args = codex_cli.argv(_req(world), tmp_path, tmp_path / "last.txt", binary="codex")
    assert args[:3] == ["codex", "exec", "--json"]
    assert "--ignore-user-config" in args and "--ephemeral" in args and "read-only" in args
    assert 'approval_policy="never"' in args and 'model_reasoning_effort="medium"' in args
    assert args[args.index("-m") + 1] == "gpt-5.5"
    env = next(a for a in args if a.startswith("mcp_servers.alpha.env="))
    assert f'ALPHA_WORLD="{world.path}"' in env and 'ALPHA_TURN="j_1"' in env
    assert args[-1] == "log two eggs"
    # a judgement: no tools, low effort; a live conversation: kept and resumed
    judge = codex_cli.argv(_req(world, kind="judge", model="haiku"), tmp_path, tmp_path / "l")
    assert not any(a.startswith("mcp_servers") for a in judge)
    assert 'model_reasoning_effort="low"' in judge
    live = codex_cli.argv(_req(world, resume="thr_1", persist=True), tmp_path, tmp_path / "l")
    assert "--ephemeral" not in live and live[-3:] == ["resume", "thr_1", "log two eggs"]
    assert codex_cli.instructions(_req(world)).startswith("You are Alpha. Work only through")
    assert codex_cli.instructions(_req(world, kind="judge")) == "RULES\n\nPACK"
    assert codex_cli.model_for(_req(world, model="gpt-5-mini")) == ("gpt-5-mini", "medium")


def test_codex_events_become_a_result(world: World) -> None:
    events: list[dict[str, Any]] = [
        {"type": "thread.started", "thread_id": "thr_9"},
        {"type": "turn.started"},
        {"type": "item.started", "item": {"type": "mcp_tool_call", "tool": "records_add",
                                          "arguments": {"collection": "food_log"}}},
        {"type": "item.completed", "item": {"type": "mcp_tool_call", "tool": "records_add"}},
        {"type": "item.completed", "item": {"type": "agent_message", "text": "Logged two eggs."}},
        {"type": "turn.completed", "usage": {"input_tokens": 10, "output_tokens": 5}},
    ]
    out = codex_cli.parse_events(events, "", "", 0, 1200)
    assert out.ok and out.reply == "Logged two eggs." and out.session_id == "thr_9"
    assert out.num_turns == 2 and out.duration_ms == 1200
    # the -o file wins when it exists; a failed turn says why, a lapsed sign-in in Alpha's words
    assert codex_cli.parse_events(events, "From the file.", "", 0, 1).reply == "From the file."
    failed: list[dict[str, Any]] = [
        {"type": "thread.started", "thread_id": "thr_2"}, {"type": "turn.started"},
              {"type": "error", "message": "Your access token could not be refreshed. Please log"
                                           " out and sign in again."},
              {"type": "turn.failed", "error": {"message": "Your access token could not be"
                                                           " refreshed."}}]
    out = codex_cli.parse_events(failed, "", "", 1, 1)
    assert not out.ok and out.error == codex_cli.SIGNED_OUT
    other: list[dict[str, Any]] = [
        {"type": "turn.failed", "error": {"message": "The model is overloaded."}}]
    assert codex_cli.parse_events(other, "", "", 1, 1).error == "The model is overloaded."
    assert codex_cli.parse_events([], "", "boom", 1, 1).error == NO_ANSWER
    # what the window sees while it runs
    codex_cli._watch(["j_w"], events[2])
    live = LIVE.progress_for("j_w")
    assert live and live["doing"] == "Adding a row: food_log" and live["tools"] == 1


def test_codex_account_words() -> None:
    assert codex_account.parse_status(0, "Logged in using ChatGPT\n") == {
        "installed": True, "signed_in": True, "via": "chatgpt"}
    assert codex_account.parse_status(0, "Logged in using API key") == {
        "installed": True, "signed_in": True, "via": "api_key"}
    assert codex_account.parse_status(1, "Not logged in") == {"installed": True,
                                                              "signed_in": False}


def test_the_thinking_routes(world: World, monkeypatch: Any) -> None:
    monkeypatch.setattr(claude_account, "status",
                        lambda: {"installed": True, "signed_in": True, "email": "k@x.com"})
    monkeypatch.setattr(codex_account, "status",
                        lambda: {"installed": True, "signed_in": False})
    c = TestClient(create_app(world, live=False))
    now = c.get("/api/thinking").json()
    assert now["route"] == "claude" and now["codex"]["signed_in"] is False
    chat = world.modules.open_thread("A chat", kind="chat")["id"]
    world.modules.set_session(chat, "claude-session")
    after = c.put("/api/thinking", json={"route": "codex"}).json()
    assert after["route"] == "codex"
    assert world.modules.thread(chat)["session_ref"] is None  # Codex can't resume Claude's
    assert world.journal.recent(1, kinds=["changed"])[-1]["text"] == \
        "You chose to think with ChatGPT."
    assert c.put("/api/thinking", json={"route": "gemini"}).status_code == 400
    assert json.loads(json.dumps(c.get("/api/thinking").json()))["route"] == "codex"


def test_only_a_model_the_account_offers_is_used(world: World, monkeypatch: Any,
                                                  tmp_path: Path) -> None:
    cache = tmp_path / "models_cache.json"
    cache.write_text(json.dumps({"models": [
        {"slug": "gpt-hidden", "visibility": "hide", "priority": 1},
        {"slug": "gpt-b", "display_name": "GPT-B", "visibility": "list", "priority": 7},
        {"slug": "gpt-a", "display_name": "GPT-A", "visibility": "list", "priority": 5}]}))
    config = tmp_path / "config.toml"
    config.write_text('model = "gpt-6-astra"\n')
    monkeypatch.setattr(codex_account, "MODELS", cache)
    monkeypatch.setattr(codex_account, "CONFIG", config)
    monkeypatch.delenv("ALPHA_CODEX_MODEL", raising=False)
    assert codex_account.models() == [{"id": "gpt-a", "name": "GPT-A"},
                                      {"id": "gpt-b", "name": "GPT-B"}]
    assert codex_account.model(world.path) == "gpt-a"  # the config's model isn't offered
    world.preferences.set(codex_account.MODEL_PREFERENCE, "gpt-b")
    assert codex_account.model(world.path) == "gpt-b"
    world.preferences.set(codex_account.MODEL_PREFERENCE, "gpt-gone")
    assert codex_account.model(world.path) == "gpt-a"
    config.write_text('model = "gpt-b"\n')
    cache.unlink()  # no list known: the person's own config stands
    world.preferences.set(codex_account.MODEL_PREFERENCE, None)
    assert codex_account.model(world.path) == "gpt-b"
