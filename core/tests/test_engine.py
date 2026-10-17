"""The SDK engine (harness slice 1): the options it builds from a request, the stream mapped
onto what the window shows, the result read, the stop, the silence, and the world's tools
served in-process. No model, no network: a scripted client stands in for the SDK's."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

import pytest
from claude_agent_sdk import (
    AssistantMessage,
    ResultMessage,
    StreamEvent,
    TextBlock,
    ToolResultBlock,
    ToolUseBlock,
    UserMessage,
)

from alpha.runtime import claude_cli, engine
from alpha.runtime.claude_cli import LIVE, STALLED, STOPPED, TurnRequest
from alpha.world.world import World


def request(tmp_path: Path, **kw: Any) -> TurnRequest:
    base: dict[str, Any] = dict(sentence="log two eggs", system="RULES",
                                world_path=tmp_path / "w.sqlite", turn_id="j_1", thread_id="t_1",
                                kind="judge")
    base.update(kw)
    return TurnRequest(**base)


def result(**kw: Any) -> ResultMessage:
    base: dict[str, Any] = dict(subtype="success", duration_ms=1500, duration_api_ms=1400,
                                is_error=False, num_turns=2, session_id="s-1",
                                total_cost_usd=0.01, result="Done.")
    base.update(kw)
    return ResultMessage(**base)


def delta(text: str) -> StreamEvent:
    return StreamEvent(uuid="u", session_id="s-1",
                       event={"type": "content_block_delta",
                              "delta": {"type": "text_delta", "text": text}})


START_TEXT = StreamEvent(uuid="u", session_id="s-1",
                         event={"type": "content_block_start", "content_block": {"type": "text"}})


class Scripted:
    """A client that plays a script of messages; `interrupt` ends the script with a result."""

    made: list[Scripted] = []

    def __init__(self, options: Any, script: list[Any] | None = None, pause_s: float = 0.0,
                 raises: Exception | None = None) -> None:
        self.options = options
        self.script = list(script or [])
        self.pause_s = pause_s
        self.raises = raises
        self.queried: list[str] = []
        self.interrupted = asyncio.Event()
        Scripted.made.append(self)

    async def __aenter__(self) -> Scripted:
        if self.raises:
            raise self.raises
        return self

    async def __aexit__(self, *exc: Any) -> bool:
        return False

    async def query(self, prompt: str, session_id: str = "default") -> None:
        self.queried.append(prompt)

    async def interrupt(self) -> None:
        self.interrupted.set()

    async def receive_response(self) -> AsyncIterator[Any]:
        for message in self.script:
            if message == "WAIT_FOR_STOP":
                await self.interrupted.wait()
                yield result(result="", subtype="success", stop_reason="interrupted")
                return
            if message == "PAUSE":
                await asyncio.sleep(self.pause_s)
                continue
            yield message


def factory(script: list[Any], **kw: Any) -> Any:
    return lambda options: Scripted(options, script, **kw)


@pytest.fixture(autouse=True)
def clean_live() -> None:
    LIVE.progress.clear()
    LIVE.handles.clear()
    Scripted.made.clear()


def test_options_carry_the_route_walls(tmp_path: Path) -> None:
    opts = engine.options_for(request(tmp_path, kind="turn", resume="s-9", persist=True,
                                      model="sonnet"))
    assert opts.model == "sonnet" and opts.resume == "s-9"
    assert opts.permission_mode == "dontAsk" and opts.setting_sources == []
    assert opts.strict_mcp_config and opts.include_partial_messages
    assert opts.allowed_tools == ["mcp__alpha", "WebSearch", "WebFetch"]
    assert "Bash" in opts.disallowed_tools and "WebSearch" not in opts.disallowed_tools
    assert dict(opts.system_prompt or {})["append"] == "RULES"  # type: ignore[arg-type]
    assert opts.extra_args == {"permission-prompts": "none"}  # a live conversation persists
    assert opts.env["USER"] and opts.env["ENABLE_TOOL_SEARCH"] == "false"
    assert opts.cwd == str(tmp_path / "sessions") and Path(opts.cwd).is_dir()


def test_a_stateless_run_keeps_no_session_and_a_judge_has_no_tools(tmp_path: Path) -> None:
    opts = engine.options_for(request(tmp_path, kind="judge"))
    assert opts.allowed_tools == [] and "WebSearch" in opts.disallowed_tools
    assert opts.extra_args == {"permission-prompts": "none", "no-session-persistence": None}
    assert opts.mcp_servers == {}
    independent = engine.options_for(request(tmp_path, kind="independent"))
    assert independent.allowed_tools == ["WebSearch", "WebFetch"]


def test_the_stream_is_shown_and_the_result_read(tmp_path: Path) -> None:
    steps: list[str] = []
    script = [
        START_TEXT, delta("Let me "), delta("look."),
        AssistantMessage(content=[TextBlock(text="Let me look.")], model="m"),
        AssistantMessage(content=[ToolUseBlock(id="t1", name="mcp__alpha__records_add",
                                               input={"collection": "food_log"})], model="m"),
        UserMessage(content=[ToolResultBlock(tool_use_id="t1", content="ok")]),
        AssistantMessage(content=[ToolUseBlock(id="t2", name="mcp__alpha__page_read",
                                               input={"url": "https://x.test"})], model="m"),
        UserMessage(content=[ToolResultBlock(tool_use_id="t2", is_error=True,
                                             content=[{"type": "text", "text": "No such page"}])]),
        START_TEXT, delta("Logged."),
        result(result="Logged two eggs.", num_turns=3),
    ]
    seen: dict[str, Any] = {}
    real_note = LIVE.note

    def spy(keys: list[str], **what: Any) -> None:
        if what.get("doing"):
            seen.setdefault("doing", []).append(what["doing"])
        real_note(keys, **what)

    LIVE.note = spy  # type: ignore[method-assign]
    try:
        out = engine.run(request(tmp_path, on_step=steps.append), client_factory=factory(script))
    finally:
        LIVE.note = real_note  # type: ignore[method-assign]
    assert out.ok and out.reply == "Logged two eggs." and out.session_id == "s-1"
    assert out.num_turns == 3 and out.duration_ms == 1500 and out.cost_estimate == 0.01
    assert out.tools_called == 2 and out.tools_failed == 1
    assert out.first_text_ms is not None
    assert seen["doing"] == ["Adding a row: food_log", "Reading a page: https://x.test"]
    assert steps == ["Adding a row: food_log", "Reading a page: https://x.test"]
    assert Scripted.made[0].queried == ["log two eggs"]
    assert LIVE.progress_for("j_1") is None  # forgotten once the run is over


def test_every_tool_failing_is_no_answer(tmp_path: Path) -> None:
    script = [
        AssistantMessage(content=[ToolUseBlock(id="t1", name="mcp__alpha__search",
                                               input={"text": "x"})], model="m"),
        UserMessage(content=[ToolResultBlock(tool_use_id="t1", is_error=True,
                                             content="MCP server alpha not connected")]),
        result(result="I found nothing, so the plan is approved."),
    ]
    out = engine.run(request(tmp_path), client_factory=factory(script))
    assert not out.ok and out.error and claude_cli.TOOLS_DOWN in out.error


def test_a_run_out_of_steps_is_cut_off_not_failed(tmp_path: Path) -> None:
    out = engine.run(request(tmp_path),
                     client_factory=factory([result(subtype="error_max_turns", is_error=True,
                                                    result="", num_turns=50)]))
    assert not out.ok and out.cut_off and out.error == claude_cli.OUT_OF_STEPS
    assert out.session_id == "s-1" and out.num_turns == 50


def test_signed_out_is_said_in_words(tmp_path: Path) -> None:
    out = engine.run(request(tmp_path),
                     client_factory=factory([result(is_error=True,
                                                    result="Not logged in · Please run /login")]))
    assert not out.ok and out.error == claude_cli.SIGNED_OUT
    crashed = engine.run(request(tmp_path),
                         client_factory=factory([], raises=RuntimeError("Not logged in")))
    assert not crashed.ok and crashed.error == claude_cli.SIGNED_OUT
    broke = engine.run(request(tmp_path),
                       client_factory=factory([], raises=RuntimeError("process exited 1")))
    assert not broke.ok and broke.error == claude_cli.NO_ANSWER and broke.raw["failure"]


def test_the_person_stops_a_run(tmp_path: Path) -> None:
    script = [AssistantMessage(content=[TextBlock(text="Working…")], model="m"), "WAIT_FOR_STOP"]
    stopped: list[bool] = []

    def stop_soon() -> None:
        import threading
        import time

        def go() -> None:
            deadline = time.monotonic() + 5
            while time.monotonic() < deadline and not LIVE.running("j_1"):
                time.sleep(0.01)
            # The thread's key stops it too, as the window's Stop on a build does.
            stopped.append(LIVE.stop("t_1"))
        threading.Thread(target=go, daemon=True).start()

    stop_soon()
    # A turn (not a judge's run): its live keys are the turn's and the thread's ids.
    out = engine.run(request(tmp_path, kind="turn"), client_factory=factory(script))
    assert stopped == [True]
    assert out.stopped and out.error == STOPPED and not out.ok
    assert Scripted.made[0].interrupted.is_set()
    assert not LIVE.running("j_1") and not LIVE.running("t_1")


def test_a_silent_run_is_ended(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(engine, "SILENCE_S", 0.2)
    script = [AssistantMessage(content=[TextBlock(text="…")], model="m"), "PAUSE", result()]
    out = engine.run(request(tmp_path), client_factory=factory(script, pause_s=1.0))
    assert not out.ok and out.error == STALLED
    quick = engine.run(request(tmp_path), client_factory=factory(script, pause_s=0.0))
    assert quick.ok


def test_the_worlds_tools_are_served_in_process(tmp_path: Path) -> None:
    """The same tools, names and words as the stdio server: fastmcp validates the arguments,
    the handler runs the tool on a worker thread and hands back its JSON."""
    from concurrent.futures import ThreadPoolExecutor

    from alpha.mcp import inprocess
    from alpha.mcp.tools import Tools

    world = World(tmp_path / "w.sqlite")
    world.collections.create("food_log", "Food log", [{"name": "item", "kind": "text"}])
    world.close()
    assert engine.server_builder is not None  # installed when the tools were imported

    async def go() -> dict[str, Any]:
        executor = ThreadPoolExecutor(max_workers=1)
        served = await inprocess.alpha_server(Tools, request(tmp_path, kind="turn"), executor)
        bound = served.world
        try:
            assert served.config["type"] == "sdk" and served.config["name"] == "alpha"
            tools = {t.name: t for t in served.tools}
            listed = await tools["world_query"].handler({"sql": "SELECT name FROM tables"})
            bad = await tools["world_write"].handler({"table": 3})
            return {"names": sorted(tools), "listed": listed, "bad": bad}
        finally:
            executor.shutdown(wait=False)
            bound.close()

    out = asyncio.run(go())
    assert "world_query" in out["names"] and "ask_person" in out["names"]
    assert len(out["names"]) >= 20
    text = out["listed"]["content"][0]["text"]
    assert "food_log" in text and not out["listed"].get("is_error")
    assert out["bad"].get("is_error") and "table" in out["bad"]["content"][0]["text"]


def test_a_turn_without_the_tools_wired_fails_in_words(tmp_path: Path,
                                                        monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(engine, "server_builder", None)
    out = engine.run(request(tmp_path, kind="turn"), client_factory=factory([result()]))
    assert not out.ok and out.error == engine.NO_TOOLS
