from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest

from alpha.mcp.tools import Tools
from alpha.world.world import World


def building(world: World, *, turn: str | None = None, module: str | None = None) -> Tools:
    """Tools acting inside the build of an approved plan: the only place lasting things
    (modules, tables, readers, automations, sources) can be made."""
    plan = world.plans.propose("Test build", "Build what the test needs.", module=module)
    world.plans.approve(plan["id"], "yes")
    thread = world.modules.open_thread("Test build", "build", module)
    world.plans.start(plan["id"], thread["id"])
    world.modules.update_thread(thread["id"], state="done")
    return Tools(world, turn=turn, thread=thread["id"], module=module)


@pytest.fixture
def world(tmp_path: Path) -> Iterator[World]:
    w = World(tmp_path / "world.sqlite")
    yield w
    w.close()
