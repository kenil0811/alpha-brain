from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest

from alpha.mcp.tools import Tools
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world.world import World


def building(world: World, *, turn: str | None = None, module: str | None = None) -> Tools:
    """Tools acting inside a build that may make lasting things (modules, tables, readers,
    automations, sources): a thread of kind build that is no workflow's walled session. No
    code opens one since 12 Oct 2026 (Q40); the tests use it to make what they test on."""
    thread = world.modules.open_thread("Test build", "build", module)
    world.modules.update_thread(thread["id"], state="done")
    return Tools(world, turn=turn, thread=thread["id"], module=module)


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
