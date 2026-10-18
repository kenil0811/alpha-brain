"""What the model's own files and shell may reach (harness slice 6, 18 October 2026).

Reads: the folders the person connected (the watched folders, `connections` of the `files`
connector), the module's own directory, and the whole Mac when the person switched that on.
Writes: the module's own directory only. The network from the shell: never (what leaves the
world goes through `act_outward`). The walls are the sandbox and the permission callback in
`runtime/engine.py`; this module only says what was granted.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any

from alpha.connectors.base import Connections

if TYPE_CHECKING:
    from alpha.world.world import World

WHOLE_MAC = "grant_whole_mac"


def folders(world: World) -> list[Path]:
    """The folders the person connected, resolved (a symlinked path and its real one are the
    same folder to the gate)."""
    out = []
    for c in Connections(world.store).all("files"):
        if c["status"] == "off":
            continue
        try:
            out.append(Path(c["target"]).expanduser().resolve())
        except OSError:
            continue
    return out


def whole_mac(world: World) -> bool:
    row = world.store.one("SELECT value FROM meta WHERE key = ?", (WHOLE_MAC,))
    return bool(row and row["value"] == "1")


def set_whole_mac(world: World, on: bool) -> dict[str, Any]:
    with world.store.tx() as db:
        db.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
                   (WHOLE_MAC, "1" if on else "0"))
    world.journal.append("changed", "Alpha may read any folder on this Mac." if on else
                         "Alpha reads only the folders you connected.", actor="person",
                         data={"whole_mac": on})
    return {"whole_mac": on}


def module_dir(world: World, module_id: str | None) -> Path:
    """Where a turn works: the module's own directory, or a scratch directory beside the
    sessions for a turn with no module (Home's), never the world's root."""
    if module_id:
        folder = world.files.dir_of(module_id)
    else:
        folder = Path(world.path).parent / "sessions" / "scratch"
    folder.mkdir(parents=True, exist_ok=True)
    return folder.resolve()


def describe(world: World, module_id: str | None) -> list[str]:
    """The lines the pre-pack carries: where the model may read and write."""
    where = module_dir(world, module_id)
    granted = folders(world)
    lines = [f"- Your own directory, where you may write files (Write, Edit, the shell):"
             f" {where}"]
    if whole_mac(world):
        lines.append("- You may read any folder on this Mac (Read, Glob, Grep, the shell); the"
                     " person switched that on.")
    elif granted:
        lines.append("- Folders you may read (Read, Glob, Grep, the shell): "
                     + ", ".join(str(f) for f in granted))
    else:
        lines.append("- No folder is granted for reading beyond your own directory; the person"
                     " connects one (connect what=folder) or switches on the whole Mac in"
                     " Settings.")
    lines.append("- The shell has no network: what leaves the world goes through act_outward.")
    return lines
