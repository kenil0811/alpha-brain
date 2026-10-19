"""The World: one person's store and every layer over it."""

from __future__ import annotations

import os
from pathlib import Path

from alpha.world.actions import Actions, Permissions, Procedures
from alpha.world.agents import Agents
from alpha.world.cards import Cards
from alpha.world.collections import Collections
from alpha.world.decisions import Decisions
from alpha.world.entities import Entities
from alpha.world.journal import Journal
from alpha.world.kits import Kits
from alpha.world.knowledge import Knowledge
from alpha.world.modfiles import ModuleFiles
from alpha.world.modtables import ModuleTables
from alpha.world.modules import Modules
from alpha.world.pages import Pages
from alpha.world.preferences import Preferences
from alpha.world.readers import Readers
from alpha.world.runs import Runs
from alpha.world.skills import Skills
from alpha.world.sources import Sources
from alpha.world.staged import Staged
from alpha.world.store import Store
from alpha.world.tasks import Tasks
from alpha.world.views import Views
from alpha.world.workflows import Workflows


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
        # cards (P3, 19 Oct 2026): written by the journal in the line's own transaction
        self.cards = Cards(self)
        self.journal.cards = self.cards
        # what an agent's run brought in, held until the person's yes (P3 item 5)
        self.staged = Staged(self)
        self.entities = Entities(self.store)
        self.collections = Collections(self.store, self.entities)
        self.knowledge = Knowledge(self.store)
        self.modules = Modules(self.store)
        self.agents = Agents(self.store)
        self.decisions = Decisions(self.store)
        self.runs = Runs(self.store)
        self.skills = Skills(self.store)
        self.views = Views(self.store)
        self.preferences = Preferences(self.store)
        self.readers = Readers(self.store)
        self.sources = Sources(self.store)
        self.modtables = ModuleTables(self)
        self.workflows = Workflows(self.store)
        self.procedures = Procedures(self.store)
        self.actions = Actions(self.store)
        self.permissions = Permissions(self.store)
        # A world that kept its skills as rows writes them out as files, once (17 Oct 2026).
        self.skills.migrate_from_tables()
        self.files = ModuleFiles(self)
        self.pages = Pages(self)
        self.kits = Kits(self)
        # The tasks (P1, 18 Oct 2026): a table the world keeps itself; commitments moved once.
        self.tasks = Tasks(self)
        self.tasks.ensure()
        self.cards.backfill()  # a world from before the cards, once
        self.cards.sweep()  # what a removed module, agent or thread left waiting
        self.files.sync()  # the modules' directories brought in line (slice 5)

    def close(self) -> None:
        self.store.close()
