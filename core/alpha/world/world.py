"""The World: one person's store and every layer over it."""

from __future__ import annotations

import os
from pathlib import Path

from alpha.world.actions import Actions, Permissions, Procedures
from alpha.world.automations import Automations
from alpha.world.collections import Collections
from alpha.world.entities import Entities
from alpha.world.journal import Journal
from alpha.world.knowledge import Knowledge
from alpha.world.modules import Modules
from alpha.world.plans import Plans
from alpha.world.preferences import Preferences
from alpha.world.readers import Readers
from alpha.world.runs import Runs
from alpha.world.skills import Skills
from alpha.world.sources import Sources
from alpha.world.store import Store
from alpha.world.views import Views


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
        self.entities = Entities(self.store)
        self.collections = Collections(self.store, self.entities)
        self.knowledge = Knowledge(self.store)
        self.modules = Modules(self.store)
        self.automations = Automations(self.store)
        self.runs = Runs(self.store)
        self.skills = Skills(self.store)
        self.views = Views(self.store)
        self.preferences = Preferences(self.store)
        self.readers = Readers(self.store)
        self.sources = Sources(self.store)
        self.plans = Plans(self.store)
        self.procedures = Procedures(self.store)
        self.actions = Actions(self.store)
        self.permissions = Permissions(self.store)

    def close(self) -> None:
        self.store.close()
