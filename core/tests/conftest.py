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


def researching(world: World, *, turn: str | None = None, module: str | None = None,
                conversation: str | None = None, ask: str = "i want a tracker") -> Tools:
    """Tools acting inside a running research pass (Q37): the only place a plan is proposed.
    The pass has one resolved finding, `f_ok`, a piece can cite."""
    made = world.research.start("Test pass", ask, job="For the person; to decide things;"
                                " nothing today.", conversation=conversation, module=module,
                                turn=turn)
    thread = world.modules.open_thread("Looking into: Test pass", "research", module)
    world.research.begin(made["id"], thread["id"])
    with world.store.tx() as db:
        db.execute("INSERT INTO findings (id, research, angle, claim, quote, url, title,"
                   " resolved, at) VALUES ('f_ok', ?, 'products', 'Such things have a list.',"
                   " 'a list', 'https://example.com/a', 'Example', 1, '2026-10-09T00:00:00')",
                   (made["id"],))
    return Tools(world, turn=turn, thread=thread["id"], module=module)


PIECES = [{"title": "A list", "what": "The things, one row each.", "evidence": ["f_ok"],
           "kind": "kept", "build": "One table."}]


@pytest.fixture
def world(tmp_path: Path) -> Iterator[World]:
    w = World(tmp_path / "world.sqlite")
    yield w
    w.close()
