"""Where a module's workspace lives on disk (§12): one folder per module in Alpha's home, made
by the runtime's build (runtime/workspace.py) and deleted with the module (world/purge.py). Here,
in the world, so removing a module never reaches into the runtime."""

from __future__ import annotations

import shutil
from pathlib import Path

from alpha.world.world import alpha_home


def root() -> Path:
    return alpha_home() / "modules"


def path_of(module_id: str) -> Path:
    return root() / module_id


def remove(module_id: str) -> bool:
    """Delete a module's workspace for good; the journal keeps the record."""
    ws = path_of(module_id)
    if ws.is_dir() and ws.resolve().is_relative_to(root().resolve()):
        shutil.rmtree(ws, ignore_errors=True)
        return True
    return False
