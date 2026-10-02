"""Project links: which project reads another, and the person's switch over each.

A project reads another when one of its tables links (a relation field) to a table of that
project. Every link is on until the person switches it off; the switched-off projects are kept
in `meta reads.<module id>` and the read tools refuse them for a run in that project.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from alpha.world.skills import meta_get, meta_put
from alpha.world.store import Problem

if TYPE_CHECKING:
    from alpha.world.world import World


def links(world: World) -> list[dict[str, Any]]:
    tables = {t["name"]: t for t in world.collections.overview()}
    found: dict[tuple[str, str], dict[str, Any]] = {}
    for t in tables.values():
        if not t["module"]:
            continue
        desc = world.collections.describe(t["name"])
        for f in desc["fields"]:
            target = tables.get(str(f.get("relation") or ""))
            if f.get("kind") != "relation" or not target or not target["module"] \
                    or target["module"] == t["module"]:
                continue
            link = found.setdefault((t["module"], target["module"]), {
                "module": t["module"], "reads": target["module"], "tables": [], "why": []})
            if target["name"] not in link["tables"]:
                link["tables"].append(target["name"])
            link["why"].append(f"{desc['title']} links to {target['title']}")
    names = {m["id"]: m["name"] for m in world.modules.all()}
    out = []
    for link in found.values():
        off = meta_get(world.store, f"reads.{link['module']}", [])
        out.append({**link, "name": names.get(link["module"], link["module"]),
                    "reads_name": names.get(link["reads"], link["reads"]),
                    "why": "; ".join(link["why"]), "enabled": link["reads"] not in off})
    return sorted(out, key=lambda x: (x["name"], x["reads_name"]))


def set_read(world: World, module: str, reads: str, enabled: bool) -> list[dict[str, Any]]:
    module_id = world.modules.get(module)["id"]
    reads_id = world.modules.get(reads)["id"]
    off = [m for m in meta_get(world.store, f"reads.{module_id}", []) if m != reads_id]
    if not enabled:
        off.append(reads_id)
    meta_put(world.store, f"reads.{module_id}", off or None)
    return links(world)


def check_read(world: World, module: str | None, table_module: str | None) -> None:
    """Refuse a read of another project's table when the person switched that link off."""
    if not module or not table_module or module == table_module:
        return
    if table_module in meta_get(world.store, f"reads.{module}", []):
        name = world.modules.get(table_module)["name"]
        raise Problem(f"This project doesn't read {name}: the person switched that off in "
                      "Intelligence › Connections.")
