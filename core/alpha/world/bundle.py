"""A project as a file: what a module is made of, to keep or to hand to someone else.

`export_module` writes the module's name, goal and icon, its tables (fields and rows), its note,
its active goals and its automations. `import_module` makes a new module from such a file. The
person's facts, people and connections never go in a file: they belong to the person, not to a
project. Imported automations arrive switched off, so nothing runs on someone else's schedule
until the person turns it on.
"""

from __future__ import annotations

from typing import Any

from alpha.world.store import Problem
from alpha.world.world import World

FORMAT = "alpha.project"
VERSION = 1
SYSTEM_FIELDS = {"id", "revision", "created_at", "updated_at", "_provenance"}


def export_module(world: World, ref: str) -> dict[str, Any]:
    m = world.modules.get(ref)
    tables = []
    for t in world.collections.overview(m["id"]):
        desc = world.collections.describe(t["name"])
        rows = world.collections.query(t["name"], order="created_at", limit=None)
        tables.append({
            "name": desc["name"], "title": desc["title"], "title_field": desc["title_field"],
            "fields": desc["fields"],
            "rows": [{k: v for k, v in r.items() if k not in SYSTEM_FIELDS} for r in rows],
        })
    note = world.knowledge.find_note(f"module:{m['name']}", m["name"])
    return {
        "format": FORMAT, "version": VERSION,
        "module": {"name": m["name"], "goal": m["goal"], "icon": m.get("icon")},
        "tables": tables,
        "note": note["body"] if note else None,
        "goals": [g["text"] for g in world.knowledge.goals() if g["module"] == m["id"]],
        "automations": [{"title": a["title"], "schedule": a["schedule"],
                         "procedure": a["procedure"]} for a in world.automations.all(m["id"])],
    }


def _free(taken: set[str], wanted: str, sep: str = " ") -> str:
    name, n = wanted, 2
    while name.lower() in taken:
        name, n = f"{wanted}{sep}{n}", n + 1
    return name


def import_module(world: World, bundle: dict[str, Any]) -> dict[str, Any]:
    if bundle.get("format") != FORMAT or not isinstance(bundle.get("module"), dict):
        raise Problem("That file isn't a project exported from Alpha.")
    if bundle.get("version", 0) > VERSION:
        raise Problem("That project was exported by a newer Alpha. Update Alpha, then add it.")
    head = bundle["module"]
    name = _free({m["name"].lower() for m in world.modules.all()},
                 str(head.get("name") or "Imported project"))
    m = world.modules.create(name, head.get("goal"))
    if head.get("icon"):
        m = world.modules.update(m["id"], icon=head["icon"])
    tables = set(world.collections.names())
    provenance = {"by": "import", "file": name}
    for t in bundle.get("tables", []):
        table = _free(tables, t["name"], "_")
        tables.add(table)
        world.collections.create(table, t.get("title") or table, t["fields"], module=m["id"],
                                 title_field=t.get("title_field"))
        for values in t.get("rows", []):
            world.collections.add(table, values, provenance)
    if bundle.get("note"):
        world.knowledge.write_note(f"module:{name}", name, bundle["note"])
    for goal in bundle.get("goals", []):
        world.knowledge.set_goal(goal, m["id"])
    for a in bundle.get("automations", []):
        made = world.automations.create(a["title"], a["schedule"], a["procedure"], module=m["id"])
        world.automations.update(made["id"], enabled=False)
    world.journal.append("made", f"Added {name} from a file.", actor="person", module=m["id"])
    return world.modules.get(m["id"])
