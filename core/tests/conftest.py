from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import pytest

from alpha.world.world import World


@pytest.fixture
def world(tmp_path: Path) -> Iterator[World]:
    w = World(tmp_path / "world.sqlite")
    yield w
    w.close()
