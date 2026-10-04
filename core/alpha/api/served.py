"""What every route closes over: the one World the core serves, its scheduler, the turns in
flight, the model runner, whether this core runs things on its own (`live`), and the guard every
request passes, and the person's model accounts."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from alpha.api.turns import Turns
from alpha.models.accounts import Accounts
from alpha.runtime import turn as turns
from alpha.runtime.automation import Scheduler
from alpha.world.world import World


@dataclass
class Served:
    world: World
    scheduler: Scheduler
    running: Turns
    runner: turns.Runner
    live: bool
    # `Depends(guard)`: every route lists it so no request reaches the world unchecked.
    api: Any
    # Settings -> Models: the person's model rows, keys and routes.
    accounts: Accounts
