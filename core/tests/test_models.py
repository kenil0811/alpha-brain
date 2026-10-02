from __future__ import annotations

import copy
import stat
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.models import accounts as acc
from alpha.models import claude_oauth, keychain
from alpha.models.accounts import Accounts
from alpha.models.providers import ProviderHTTPError
from alpha.runtime import api_runner, claude_account, codex_cli
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.runtime.route import Router
from alpha.world.world import World


@pytest.fixture
def offline(monkeypatch: pytest.MonkeyPatch) -> Iterator[dict[str, str]]:
    """No Claude Code, no Codex, no Ollama, an in-memory Keychain, no network."""
    keys: dict[str, str] = {}
    monkeypatch.setattr(claude_account, "status", lambda: {"installed": False, "signed_in": False})
    monkeypatch.setattr(claude_oauth, "signed_in", lambda: False)
    monkeypatch.setattr(acc, "codex_binary", lambda: None)
    monkeypatch.setattr(acc, "ollama_models", lambda timeout=1.0: None)
    monkeypatch.setattr(keychain, "get_key", lambda p: keys.get(p))
    monkeypatch.setattr(keychain, "set_key", lambda p, k: keys.__setitem__(p, k))
    monkeypatch.setattr(keychain, "delete_key", lambda p: keys.pop(p, None))
    monkeypatch.setattr(keychain, "last4", lambda p: keys[p][-4:] if p in keys else None)

    def no_network(*_: Any, **__: Any) -> Any:
        raise ProviderHTTPError("offline in tests")

    monkeypatch.setattr(acc, "list_models", no_network)
    acc._ERRORS.clear()
    yield keys
    acc._ERRORS.clear()


def test_every_way_to_a_model_is_its_own_row_and_claude_is_starred(world: World,
                                                                   offline: dict[str, str]) -> None:
    rows = Accounts(world.store).rows()
    assert [r["id"] for r in rows] == list(acc.PROVIDERS)
    assert {r["id"] for r in rows if r["default"]} == {"claude"}
    by = {r["id"]: r for r in rows}
    assert by["claude"]["state"] == "cli_missing" and by["chatgpt"]["kind"] == "sign_in"
    assert by["openrouter"]["state"] == "needs_key" and by["openrouter"]["dot"]["color"] == "grey"
    assert by["ollama"]["state"] == "not_running"
    assert by["ollama"]["dot"]["tooltip"] == "Ollama isn't running on this Mac."


def test_star_moves_the_default_and_a_conversation_can_choose_its_own(
        world: World, offline: dict[str, str]) -> None:
    a = Accounts(world.store)
    rows = a.star("deepseek")
    assert [r["id"] for r in rows if r["default"]] == ["deepseek"]
    assert a.route(None) == {"provider": "deepseek", "model": "deepseek-chat", "chosen": False}
    a.choose("t_1", "claude_api", "claude-haiku-4-5")
    assert a.route("t_1") == {"provider": "claude_api", "model": "claude-haiku-4-5",
                              "chosen": True}
    assert a.route(None)["provider"] == "deepseek"  # the stream keeps the default
    a.select_model("deepseek", "deepseek-reasoner")
    assert a.route(None)["model"] == "deepseek-reasoner"
    a.choose("t_1", None, None)
    assert a.route("t_1")["provider"] == "deepseek"
    with pytest.raises(Exception, match="no model provider"):
        a.star("nope")


def test_a_refused_key_is_not_kept_and_says_so(world: World, offline: dict[str, str],
                                               monkeypatch: pytest.MonkeyPatch) -> None:
    def refuse(*_: Any, **__: Any) -> Any:
        raise ProviderHTTPError("The key was refused.", 401)

    monkeypatch.setattr(acc, "list_models", refuse)
    http = TestClient(create_app(world, live=False))
    answer = http.put("/api/models/grok/key", json={"key": "xai-not-a-real-key"})
    assert answer.status_code == 400 and answer.json() == {"error": "Grok refused that key."}
    assert "grok" not in offline
    monkeypatch.setattr(acc, "list_models", lambda *a, **k: [{"id": "grok-4"}])
    saved = http.put("/api/models/grok/key", json={"key": "xai-fake-1234"}).json()["provider"]
    assert saved["state"] == "connected" and saved["key_last4"] == "1234"
    assert "xai-fake" not in str(http.get("/api/models").json())  # the key never comes back


def test_a_failed_call_turns_the_row_red_and_a_working_one_clears_it(
        world: World, offline: dict[str, str], monkeypatch: pytest.MonkeyPatch) -> None:
    offline["openrouter"] = "sk-or-fake"
    a = Accounts(world.store)
    a.star("openrouter")
    results = [RunResult(reply="", ok=False, error="The provider said 402: Insufficient credits"),
               RunResult(reply="Done.", ok=True)]
    seen: list[dict[str, Any]] = []

    def fake(req: TurnRequest, **kw: Any) -> RunResult:
        seen.append(kw)
        return results.pop(0)

    monkeypatch.setattr(api_runner, "run", fake)
    req = TurnRequest(sentence="hi", system="s", world_path=world.path, turn_id="j_1")
    assert not Router(a)(req).ok
    row = a.describe("openrouter")
    assert row["dot"] == {"color": "red", "tooltip": "The provider said 402: Insufficient credits"}
    assert seen[0]["model"] == "openrouter/auto" and seen[0]["key"] == "sk-or-fake"
    assert Router(a)(req).ok and a.describe("openrouter")["dot"]["color"] == "green"


def test_a_message_to_a_model_that_isnt_connected_asks_to_connect_first(
        world: World, offline: dict[str, str]) -> None:
    http = TestClient(create_app(world, live=False))
    turn = http.post("/api/ask", json={"text": "log two eggs"}).json()
    assert turn["state"] == "needs_connect" and turn["provider"] == "claude"
    assert world.journal.recent(5) == []  # nothing said until it can be answered
    http.put("/api/route", json={"provider": "ollama"})
    assert http.get("/api/route").json()["provider"] == "ollama"
    assert http.post("/api/ask", json={"text": "x"}).json()["provider"] == "ollama"


def test_the_tool_loop_runs_alphas_tools_on_anthropic_and_openai_formats(world: World) -> None:
    calls: list[dict[str, Any]] = []
    anthropic: list[dict[str, Any]] = [
        {"stop_reason": "tool_use", "usage": {"input_tokens": 10, "output_tokens": 5},
         "content": [{"type": "thinking", "thinking": ""},
                     {"type": "tool_use", "id": "tu1", "name": "note_write",
                      "input": {"scope": "person", "title": "Diet", "body": "No dairy."}}]},
        {"stop_reason": "end_turn", "usage": {"input_tokens": 20, "output_tokens": 7},
         "content": [{"type": "text", "text": "Noted: no dairy."}]},
    ]

    def post(url: str, headers: dict[str, str], body: Any, timeout: float) -> dict[str, Any]:
        calls.append({"url": url, "headers": headers, "body": copy.deepcopy(body)})
        return anthropic.pop(0)

    world.modules.open_thread("Diet", "job", None)
    thread = world.modules.threads()[0]["id"]
    world.journal.append("said", "I'm vegetarian", actor="person", thread=thread)
    world.journal.append("replied", "Got it.", thread=thread)
    said = world.journal.append("said", "and no dairy", actor="person", thread=thread)
    req = TurnRequest(sentence="and no dairy", system="RULES", world_path=world.path,
                      turn_id=said, thread_id=thread)
    out = api_runner.run(req, kind="anthropic", base_url="https://x/v1", key="k", model="m",
                         post=post)
    assert out.ok and out.reply == "Noted: no dairy." and out.num_turns == 2
    assert out.raw["usage"] == {"input_tokens": 30, "output_tokens": 12}
    first = calls[0]["body"]
    assert [m["role"] for m in first["messages"]] == ["user", "assistant", "user"]
    assert any(t["name"] == "records_add" and "properties" in t["input_schema"]
               for t in first["tools"])
    assert calls[0]["headers"]["x-api-key"] == "k"
    reply = calls[1]["body"]["messages"][-1]["content"][0]
    assert reply["type"] == "tool_result" and reply["tool_use_id"] == "tu1"
    note = world.knowledge.find_note("person", "Diet")
    assert note is not None and note["body"] == "No dairy."

    openai: list[dict[str, Any]] = [
        {"choices": [{"message": {"content": None, "tool_calls": [
            {"id": "c1", "type": "function",
             "function": {"name": "nope", "arguments": "{}"}}]}}]},
        {"choices": [{"message": {"content": "Hello."}}],
         "usage": {"prompt_tokens": 3, "completion_tokens": 2}},
    ]
    sent: list[Any] = []

    def post2(url: str, headers: dict[str, str], body: Any, timeout: float) -> dict[str, Any]:
        sent.append((url, headers, body))
        return openai.pop(0)

    req = TurnRequest(sentence="hi", system="RULES", world_path=world.path, turn_id="j_x")
    out = api_runner.run(req, kind="openai", base_url="http://127.0.0.1:11434/v1", key=None,
                         model="llama3", post=post2)
    assert out.ok and out.reply == "Hello."
    assert sent[0][0].endswith("/chat/completions") and sent[0][1] == {}
    assert sent[0][2]["messages"][0]["role"] == "system"
    assert "There is no tool nope" in sent[1][2]["messages"][-1]["content"]


def test_the_tool_loop_stops_after_its_cap(world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(api_runner, "MAX_TURNS", 3)
    loop = {"choices": [{"message": {"tool_calls": [
        {"id": "c", "function": {"name": "goals_list", "arguments": "{}"}}]}}]}
    req = TurnRequest(sentence="hi", system="s", world_path=world.path, turn_id="j")
    out = api_runner.run(req, kind="openai", base_url="u", key="k", model="m",
                         post=lambda *a: loop)
    assert not out.ok and "after 3 steps" in (out.error or "")


def test_codex_gets_only_alphas_tools_and_resumes_its_own_session(tmp_path: Path) -> None:
    req = TurnRequest(sentence="hi", system="RULES", world_path=tmp_path / "w.sqlite",
                      turn_id="j_1", thread_id="t_1", resume="codex:abc")
    args = codex_cli.argv(req, "codex", str(tmp_path))
    assert args[:6] == ["codex", "exec", "-s", "read-only", "-C", str(tmp_path)]
    assert args[6:8] == ["resume", "abc"] and "--ignore-user-config" in args
    assert "shell_tool" in args and args[-1] == "hi"
    out = codex_cli.parse('{"type":"thread.started","thread_id":"s9"}\n'
                          '{"type":"item.completed","item":{"type":"agent_message","text":"Ok"}}',
                          "")
    assert out.ok and out.session_id == "codex:s9"


def test_keys_go_to_the_keychain_on_stdin_never_in_argv(tmp_path: Path,
                                                        monkeypatch: pytest.MonkeyPatch) -> None:
    store, argv_log = tmp_path / "store.txt", tmp_path / "argv.txt"
    fake = tmp_path / "security"
    fake.write_text(
        "#!/bin/sh\n"
        f'echo "$@" >> "{argv_log}"\n'
        'if [ "$1" = "-i" ]; then\n'
        "  read -r line\n"
        "  echo \"$line\" | sed -n 's/.*-w \"\\(.*\\)\".*/\\1/p' > " f'"{store}"\n'
        'elif [ "$1" = "find-generic-password" ]; then\n'
        f'  [ -f "{store}" ] && cat "{store}" || exit 44\n'
        'elif [ "$1" = "delete-generic-password" ]; then\n'
        f'  rm -f "{store}"\n'
        "fi\n")
    fake.chmod(fake.stat().st_mode | stat.S_IEXEC)
    monkeypatch.setenv("PATH", f"{tmp_path}:/usr/bin:/bin")
    assert keychain.get_key("demo") is None
    keychain.set_key("demo", "sk-abc123")
    assert keychain.get_key("demo") == "sk-abc123" and keychain.last4("demo") == "c123"
    assert "sk-abc123" not in argv_log.read_text()
    keychain.delete_key("demo")
    assert keychain.get_key("demo") is None
    with pytest.raises(keychain.KeychainError):
        keychain.set_key("demo", "a\nb")
