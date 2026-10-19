from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

from alpha.mcp.tools import Tools
from alpha.runtime.running import RunResult, TurnRequest
from alpha.world.world import World


def building(world: World, *, turn: str | None = None, module: str | None = None) -> Tools:
    """Tools bound to a thread of their own, to make what a test needs. (Until 17 Oct 2026 a
    gate let lasting things be made only in a build thread; the gate is gone with the harness's
    slice 2a, and any turn may make them. The name stays for the tests that call it.)"""
    thread = world.modules.open_thread("Test build", "work", module)
    world.modules.update_thread(thread["id"], state="done")
    return Tools(world, turn=turn, thread=thread["id"], module=module)


@pytest.fixture(autouse=True)
def scratch_home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Every test keeps Alpha's own folders (files, actions, the browser's) in a scratch home:
    without one they went to ~/Library/Application Support/Alpha Brain (found 19 Oct 2026, a
    test's file came back as "CIM Midwest HVAC (5).pdf")."""
    monkeypatch.setenv("ALPHA_HOME", str(tmp_path / "alpha-home"))


@pytest.fixture
def world(tmp_path: Path) -> Iterator[World]:
    w = World(tmp_path / "world.sqlite")
    yield w
    w.close()


def judge_answering(answer: str, confidence: float = 0.9) -> Any:
    """A router's judge that always gives one answer."""

    def runner(req: TurnRequest) -> RunResult:
        return RunResult(ok=True, reply=f'{{"answer": "{answer}", "confidence": {confidence},'
                                        ' "why": "test"}')

    return runner
