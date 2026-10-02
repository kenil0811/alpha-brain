from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest

from alpha.models import settings
from alpha.world.world import World


@pytest.fixture
def world(tmp_path: Path) -> Iterator[World]:
    w = World(tmp_path / "world.sqlite")
    # Tool tests call the tools directly, as with Full access; test_access covers the modes.
    settings.update(w.store, {"access.mode": "full"})
    yield w
    w.close()
