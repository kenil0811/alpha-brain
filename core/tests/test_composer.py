"""The composer and Settings: attachments, stopping a turn, settings fields, plain failures,
the Groq row and a "Check again" that makes a real call."""

from __future__ import annotations

import base64
import stat
import threading
import time
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.models import accounts as acc
from alpha.models import claude_oauth, keychain, settings
from alpha.models.accounts import Accounts
from alpha.models.providers import ProviderHTTPError
from alpha.runtime import api_runner, claude_account, claude_cli
from alpha.runtime import turn as turns
from alpha.runtime.attachments import AttachmentIn, build_context
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.runtime.route import Router
from alpha.world import taint
from alpha.world.world import World


@pytest.fixture
def offline(monkeypatch: pytest.MonkeyPatch) -> Iterator[dict[str, str]]:
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


def wait(c: TestClient, key: str) -> dict[str, Any]:
    for _ in range(100):
        state: dict[str, Any] = c.get(f"/api/turns/{key}").json()
        if state["state"] not in ("running", "routing"):
            return state
        time.sleep(0.05)
    return state


# ---- attachments ----

def test_attachments_inline_text_walk_folders_and_never_follow_links(tmp_path: Path) -> None:
    notes = tmp_path / "notes.md"
    notes.write_text("Ship on Friday.")
    folder = tmp_path / "project"
    (folder / "src").mkdir(parents=True)
    (folder / "src" / "a.py").write_text("print('hi')")
    secret = tmp_path / "secret.txt"
    secret.write_text("do not read")
    (folder / "link.txt").symlink_to(secret)
    (tmp_path / "linked.md").symlink_to(secret)
    text = build_context([
        AttachmentIn(kind="file", name="notes.md", path=str(notes)),
        AttachmentIn(kind="folder", name="project", path=str(folder)),
        AttachmentIn(kind="file", name="linked.md", path=str(tmp_path / "linked.md")),
        AttachmentIn(kind="image", name="shot.png", mime="image/png"),
        AttachmentIn(kind="file", name="pasted.txt",
                     content_b64=base64.b64encode(b"x" * 7000).decode()),
    ])
    assert "Ship on Friday." in text and "src/a.py" in text and "print('hi')" in text
    assert "do not read" not in text and "link.txt" not in text
    assert 'file "linked.md": not text' in text
    assert "can't see images" in text
    assert "(truncated, 7000 chars total)" in text


def test_audio_without_a_key_says_why_it_isnt_transcribed(offline: dict[str, str]) -> None:
    text = build_context([AttachmentIn(kind="audio", name="memo.m4a",
                                       content_b64=base64.b64encode(b"\0" * 10).decode())])
    assert "no transcription key saved" in text


def test_an_attached_turn_keeps_names_only_and_is_tainted(world: World, tmp_path: Path) -> None:
    doc = tmp_path / "plan.txt"
    doc.write_text("Budget: 12k")
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        return RunResult(reply="Read it.", ok=True)

    c = TestClient(create_app(world, runner=runner, live=False))
    started = c.post("/api/ask", json={"text": "what's in this?", "attachments": [
        {"kind": "file", "name": "plan.txt", "path": str(doc), "size": 11}]}).json()
    assert wait(c, started["id"])["state"] == "done"
    assert "Budget: 12k" in seen[0].sentence and "ATTACHMENTS" in seen[0].sentence
    said = world.journal.recent(5, kinds=["said"])[-1]
    assert said["text"] == "what's in this?"
    assert said["data"]["attachments"] == [{"kind": "file", "name": "plan.txt", "mime": None,
                                            "size": 11}]
    assert "Budget" not in str(said["data"])
    assert taint.reason(world.store, said["id"], None) == taint.ATTACHED
    too_many = [{"kind": "file", "name": f"{i}.txt", "content_b64": ""} for i in range(11)]
    assert c.post("/api/ask", json={"text": "x", "attachments": too_many}).status_code == 422


# ---- stopping a turn ----

def test_a_running_turn_can_be_stopped(world: World) -> None:
    started_run = threading.Event()

    def runner(req: TurnRequest) -> RunResult:
        live = claude_cli.LIVE.begin(claude_cli.keys(req))
        started_run.set()
        try:
            for _ in range(200):
                if live.stopped:
                    return claude_cli.stopped_result()
                time.sleep(0.01)
            return RunResult(reply="too late", ok=True)
        finally:
            claude_cli.LIVE.end(claude_cli.keys(req), live)

    c = TestClient(create_app(world, runner=runner, live=False))
    key = c.post("/api/ask", json={"text": "build me a tracker"}).json()["id"]
    assert started_run.wait(2)
    c.post(f"/api/turns/{key}/cancel")
    final = wait(c, key)
    assert final["state"] == "cancelled" and final["reply"] == "You stopped it."
    assert world.journal.recent(1)[-1]["text"] == "You stopped it."
    assert c.post("/api/turns/nope/cancel").status_code == 400


def test_cancel_stops_the_model_process(tmp_path: Path) -> None:
    slow = tmp_path / "slow"
    slow.write_text("#!/bin/sh\nsleep 30\n")
    slow.chmod(slow.stat().st_mode | stat.S_IEXEC)
    req = TurnRequest(sentence="hi", system="s", world_path=tmp_path / "w.sqlite",
                      turn_id="j_stop_me")
    threading.Timer(0.3, claude_cli.LIVE.stop, ("j_stop_me",)).start()
    began = time.monotonic()
    out = claude_cli.run(req, binary=str(slow))
    assert out.error == "You stopped it." and time.monotonic() - began < 10


# ---- settings ----

def test_settings_are_validated_and_reach_the_turn(world: World) -> None:
    c = TestClient(create_app(world, live=False))
    fields = {f["id"]: f for f in c.get("/api/settings").json()}
    assert fields["access.mode"]["group"] == "Access"
    assert fields["look.rules"]["value"] == settings.DEFAULT_LOOK_RULES
    assert c.patch("/api/settings", json={"values": {"build.minutes": 20}}).status_code == 400
    assert c.patch("/api/settings", json={"values": {"models.effort": "max"}}).status_code == 400
    c.patch("/api/settings", json={"values": {"look.rules": "Always a board view.",
                                              "models.effort": "low"}})
    seen: list[TurnRequest] = []

    def runner(r: TurnRequest) -> RunResult:
        seen.append(r)
        return RunResult(reply="ok", ok=True)

    turns.ask(world, "make a tracker", runner=runner)
    assert "HOW PROJECTS LOOK" in seen[0].system and "Always a board view." in seen[0].system
    assert c.get("/api/access").json()["mode"] == "full"  # the test world's default
    assert c.put("/api/access", json={"thread": "t_1", "mode": "ask"}).json()["mode"] == "ask"
    assert c.put("/api/access", json={"mode": "everything"}).status_code == 400
    health = c.get("/api/health").json()
    assert health["core_version"] and health["python_version"].count(".") == 2


def test_effort_goes_to_claude_and_build_threads_get_their_own_model(
        world: World, offline: dict[str, str], monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(claude_oauth, "signed_in", lambda: True)
    monkeypatch.setattr(claude_account, "status", lambda: {"installed": True, "signed_in": True})
    monkeypatch.setattr(acc, "claude_probe", lambda b: {"version": "2.2.0", "too_old": False})
    monkeypatch.setattr(claude_account, "binary", lambda: "/bin/claude")
    seen: list[TurnRequest] = []

    def run(req: TurnRequest, **kw: Any) -> RunResult:
        seen.append(req)
        return RunResult(reply="ok", ok=True)

    monkeypatch.setattr(claude_cli, "run", run)
    settings.update(world.store, {"models.effort": "high", "build.model": "opus"})
    thread = world.modules.open_thread("Making Jobs", "build")
    Router(Accounts(world.store))(TurnRequest(sentence="hi", system="s", world_path=world.path,
                                              turn_id="j_1", thread_id=thread["id"]))
    assert seen[0].effort == "high" and seen[0].model == "opus" and seen[0].timeout is None
    assert "--effort" in claude_cli.argv(seen[0], Path("/tmp/x.json"))


# ---- models ----

def test_a_failed_call_says_it_plainly_and_asks_to_connect(
        world: World, offline: dict[str, str], monkeypatch: pytest.MonkeyPatch) -> None:
    offline["openrouter"] = "sk-or-fake"
    a = Accounts(world.store)
    a.star("openrouter")
    monkeypatch.setattr(api_runner, "run", lambda req, **kw: RunResult(
        reply="", ok=False, error="HTTP 401: invalid api key"))
    req = TurnRequest(sentence="hi", system="s", world_path=world.path, turn_id="j_1")
    out = Router(a)(req)
    assert out.raw["needs_connect"] == "openrouter" and out.raw["connect_kind"] == "key"
    assert out.error and out.error.startswith("I can't reach the model: OpenRouter refused")
    monkeypatch.setattr(api_runner, "run", lambda req, **kw: RunResult(
        reply="", ok=False, error="something odd"))
    out = Router(a)(req)
    assert out.error == "I can't reach the model right now. Try again in a moment."
    assert "needs_connect" not in out.raw


def test_a_turn_that_fails_on_connection_shows_the_connect_card(world: World) -> None:
    def runner(req: TurnRequest) -> RunResult:
        return RunResult(reply="", ok=False, error="I can't reach the model: Claude isn't signed"
                         " in.", raw={"plain": True, "needs_connect": "claude",
                                      "connect_kind": "sign_in"})

    c = TestClient(create_app(world, runner=runner, live=False))
    final = wait(c, c.post("/api/ask", json={"text": "hi"}).json()["id"])
    assert final["state"] == "needs_connect" and final["provider"] == "claude"
    assert final["connect_kind"] == "sign_in"


def test_groq_only_transcribes(world: World, offline: dict[str, str]) -> None:
    a = Accounts(world.store)
    row = a.describe("groq")
    assert row["transcribe_only"] and row["kind"] == "key"
    with pytest.raises(Exception, match="only turns speech into text"):
        a.star("groq")
    with pytest.raises(Exception, match="only turns speech into text"):
        a.choose(None, "groq", None)


def test_check_again_makes_a_real_call(world: World, offline: dict[str, str],
                                       monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(claude_oauth, "signed_in", lambda: True)
    monkeypatch.setattr(claude_account, "status", lambda: {"installed": True, "signed_in": True})
    monkeypatch.setattr(claude_account, "binary", lambda: "/bin/claude")
    monkeypatch.setattr(acc, "claude_probe", lambda b: {"version": "2.2.0", "too_old": False})
    a = Accounts(world.store)
    calls: list[TurnRequest] = []

    def refuse(r: TurnRequest) -> RunResult:
        calls.append(r)
        return RunResult(reply="", ok=False, error="Your organization disabled subscriptions")

    refused = a.test("claude", runner=refuse)
    assert calls[0].model == "haiku" and refused["dot"]["color"] == "red"
    ok = a.test("claude", runner=lambda r: RunResult(reply="OK", ok=True, duration_ms=900))
    assert ok["dot"]["color"] == "green" and ok["last_ok"]["latency_ms"] == 900


def test_an_old_claude_code_is_named_too_old(tmp_path: Path) -> None:
    old = tmp_path / "claude"
    old.write_text("#!/bin/sh\nif [ \"$1\" = --version ]; then echo '2.0.1 (Claude Code)';"
                   " else echo 'Usage: claude --model --output-format'; fi\n")
    old.chmod(old.stat().st_mode | stat.S_IEXEC)
    probe = acc.claude_probe(str(old))
    assert probe == {"version": "2.0.1", "too_old": True}


def test_codex_falls_back_to_a_listed_model(tmp_path: Path,
                                            monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(Path, "home", lambda: tmp_path)
    (tmp_path / ".codex").mkdir()
    (tmp_path / ".codex" / "config.toml").write_text('model = "gpt-old"\n')
    (tmp_path / ".codex" / "models_cache.json").write_text(
        '{"models": [{"slug": "gpt-5.5", "visibility": "list"}]}')
    assert acc.codex_fallback_model() == "gpt-5.5"
    (tmp_path / ".codex" / "config.toml").write_text('model = "gpt-5.5"\n')
    assert acc.codex_fallback_model() is None
