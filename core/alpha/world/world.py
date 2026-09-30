"""The World: one person's store and every layer over it."""

from __future__ import annotations

import os
from pathlib import Path

from alpha.world.collections import Collections
from alpha.world.entities import Entities
from alpha.world.journal import Journal
from alpha.world.knowledge import Knowledge
from alpha.world.modules import Modules
from alpha.world.store import Store


def alpha_home() -> Path:
    """Where the person's world lives: `ALPHA_HOME`, else Application Support."""
    configured = os.environ.get("ALPHA_HOME")
    if configured:
        return Path(configured).expanduser()
    return Path.home() / "Library" / "Application Support" / "Alpha Brain"


def default_world_path() -> Path:
    configured = os.environ.get("ALPHA_WORLD")
    return Path(configured).expanduser() if configured else alpha_home() / "world.sqlite"


class World:
    def __init__(self, path: Path | str | None = None) -> None:
        self.path = Path(path) if path is not None else default_world_path()
        self.store = Store(self.path)
        self.journal = Journal(self.store)
        self.collections = Collections(self.store)
        self.knowledge = Knowledge(self.store)
        self.entities = Entities(self.store)
        self.modules = Modules(self.store)

    def close(self) -> None:
        self.store.close()
