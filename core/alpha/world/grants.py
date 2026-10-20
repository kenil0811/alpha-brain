"""What the model's own files and shell may reach (harness slice 6, 18 October 2026).

Reads and writes (A4, 20 Oct 2026): the folders the person connected (the watched folders,
`connections` of the `files` connector), the module's own directory, and the whole Mac when
the person switched that on; never under a `.claude` folder. The network from scripts (A3):
the hosts on the module's list and the world's list; any other host is refused at once and
asked of the person on a card, and a yes puts it on the module's list (Q109). What leaves
the world (a message, a post, a form, a payment) still goes only through `act_outward`: a host
is for reading. The walls are the
sandbox and the permission callback in `runtime/engine.py`; this module says what was granted.
"""

from __future__ import annotations

from pathlib import Path
from typing import TYPE_CHECKING, Any

from alpha.connectors.base import Connections
from alpha.world.store import dumps, loads, now

if TYPE_CHECKING:
    from alpha.world.world import World

WHOLE_MAC = "grant_whole_mac"
WORLD_HOSTS = "grant_network_hosts"


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
    world.journal.append("changed", "Alpha may read and write any folder on this Mac." if on
                         else "Alpha reads and writes only the folders you connected.",
                         actor="person",
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
    """The lines the start layer carries: where the model may read and write."""
    where = module_dir(world, module_id)
    granted = folders(world)
    lines = [f"- Your own directory, where you may write files (Write, Edit, the shell):"
             f" {where}"]
    if whole_mac(world):
        lines.append("- You may read and write any folder on this Mac (Read, Write, Edit, Glob,"
                     " Grep, the shell); the person switched that on.")
    elif granted:
        lines.append("- Folders you may read and write (Read, Write, Edit, Glob, Grep, the"
                     " shell): " + ", ".join(str(f) for f in granted))
    else:
        lines.append("- No folder is granted beyond your own directory; the person connects one"
                     " (connect what=folder) or switches on the whole Mac in Settings.")
    reach = hosts(world, module_id)
    lines.append("- Hosts your scripts may reach (the shell): " + (", ".join(reach) if reach
                 else "none listed yet") + "; any other host is refused at once and asked of the"
                 " person on a card: their yes lists it and you are told, so you run it again."
                 " Anything that leaves the world (a message, a post, a form) goes through"
                 " act_outward and their yes.")
    return lines


# ---- the network from scripts (A3) ----


def host_of(text: str) -> str:
    """A host as the sandbox lists it: no scheme, no path, no port, lower case."""
    host = str(text).strip().lower()
    for prefix in ("https://", "http://"):
        host = host.removeprefix(prefix)
    return host.split("/", 1)[0].split(":", 1)[0].strip(".")


def module_hosts(world: World, module_id: str | None) -> list[str]:
    if not module_id:
        return []
    row = world.store.one("SELECT network FROM modules WHERE id = ?", (module_id,))
    return [str(h) for h in loads(row["network"] if row else None, [])]


def world_hosts(world: World) -> list[str]:
    row = world.store.one("SELECT value FROM meta WHERE key = ?", (WORLD_HOSTS,))
    return [str(h) for h in loads(row["value"] if row else None, [])]


def hosts(world: World, module_id: str | None) -> list[str]:
    """The hosts a run's scripts may reach: its module's list and the world's, once each."""
    return list(dict.fromkeys(module_hosts(world, module_id) + world_hosts(world)))


def set_module_hosts(world: World, module_id: str, listed: list[str], *, actor: str,
                     why: str = "") -> list[str]:
    clean = sorted({host_of(h) for h in listed if host_of(h)})
    if clean == module_hosts(world, module_id):
        return clean
    with world.store.tx() as db:
        db.execute("UPDATE modules SET network = ?, updated_at = ? WHERE id = ?",
                   (dumps(clean), now(), module_id))
    name = world.modules.get(module_id)["name"]
    world.journal.append("changed", f"Scripts in {name} may reach: "
                         + (", ".join(clean) if clean else "no host") + (f" ({why})" if why
                                                                       else "."),
                         actor=actor, module=module_id, data={"network": clean})
    return clean


def allow_host(world: World, module_id: str | None, host: str, *, actor: str) -> list[str]:
    """A host the person said yes to: on the module's list, or the world's when the run has
    no module."""
    if module_id:
        return set_module_hosts(world, module_id, [*module_hosts(world, module_id), host],
                                actor=actor)
    return set_world_hosts(world, [*world_hosts(world), host], actor=actor)


def set_world_hosts(world: World, listed: list[str], *, actor: str = "person") -> list[str]:
    clean = sorted({host_of(h) for h in listed if host_of(h)})
    with world.store.tx() as db:
        db.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
                   (WORLD_HOSTS, dumps(clean)))
    world.journal.append("changed", "Scripts anywhere may reach: "
                         + (", ".join(clean) if clean else "no host") + ".", actor=actor,
                         data={"network": clean})
    return clean
