"""The person's world on this Mac: where it is, and copies of it they can go back to.

A backup is a consistent copy of the world file (SQLite's own backup, safe while Alpha runs)
in `backups/` next to it, named by when it was made.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from alpha.world.world import World


def _size(path: Path) -> int:
    return sum(p.stat().st_size for p in (path, Path(f"{path}-wal")) if p.exists())


def describe(world: World) -> dict[str, Any]:
    world_file = world.store.path
    folder = world_file.parent / "backups"
    copies = sorted(folder.glob("*.sqlite"), key=lambda p: p.stat().st_mtime, reverse=True) \
        if folder.exists() else []
    return {
        "folder": str(world_file.parent),
        "size": _size(world_file),
        "backups": [{"name": p.name, "size": p.stat().st_size,
                     "at": datetime.fromtimestamp(p.stat().st_mtime).astimezone().isoformat()}
                    for p in copies],
    }


def back_up(world: World) -> dict[str, Any]:
    folder = world.store.path.parent / "backups"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"world-{datetime.now().strftime('%Y%m%d-%H%M%S')}.sqlite"
    world.store.backup_to(target)
    return describe(world)
