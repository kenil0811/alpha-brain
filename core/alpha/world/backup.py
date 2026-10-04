"""The person's world on this Mac: where it is, and copies of it they can go back to.

A backup is a consistent copy of the world file (SQLite's own backup, safe while Alpha runs)
in `backups/` next to it, named by when it was made. Going back to one (`restore`) first keeps
the world as it is now as another backup, so going back can itself be undone.
"""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import Any

from alpha.world.store import Problem
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


def _copy(world: World, suffix: str = "") -> Path:
    folder = world.store.path.parent / "backups"
    folder.mkdir(parents=True, exist_ok=True)
    target = folder / f"world-{datetime.now().strftime('%Y%m%d-%H%M%S')}{suffix}.sqlite"
    world.store.backup_to(target)
    return target


def back_up(world: World) -> dict[str, Any]:
    _copy(world)
    return describe(world)


def restore(world: World, name: str) -> dict[str, Any]:
    """Go back to the backup called `name` (one `describe` lists; never a path)."""
    folder = world.store.path.parent / "backups"
    copies = {p.name: p for p in folder.glob("*.sqlite")} if folder.exists() else {}
    if name not in copies:
        raise Problem(f"There is no backup called {name}.")
    kept = _copy(world, "-before-restore")
    world.store.replace_with(copies[name])
    world.journal.append("changed", f"Went back to the backup {name}. Everything as it was just "
                         f"before is kept as the backup {kept.name}.",
                         data={"restored": name, "kept": kept.name})
    return describe(world)
