"""A project as a file: what a module is made of, to keep or to hand to someone else.

`export_module` writes the module's structure: name, goal and icon, its tables (fields), their
saved views, the readers it uses, its note, its active goals and its automations, plus the
version of Alpha that wrote it. It never ships records unless asked (`rows=True`, "Export with
data…"). `import_module` makes a new module from such a file. The person's facts, people and
connections never go in a file: they belong to the person, not to a project. Imported
automations arrive switched off, so nothing runs on someone else's schedule until the person
turns it on.
"""

from __future__ import annotations

from importlib.metadata import PackageNotFoundError, version
from typing import Any

from alpha.world.store import Problem
from alpha.world.world import World

FORMAT = "alpha.project"
VERSION = 1
SYSTEM_FIELDS = {"id", "revision", "created_at", "updated_at", "_provenance"}


def alpha_version() -> str:
    try:
        return version("alpha")
    except PackageNotFoundError:
        return "unknown"


def export_module(world: World, ref: str, *, rows: bool = False) -> dict[str, Any]:
    m = world.modules.get(ref)
    tables = []
    for t in world.collections.overview(m["id"]):
        desc = world.collections.describe(t["name"])
        table: dict[str, Any] = {
            "name": desc["name"], "title": desc["title"], "title_field": desc["title_field"],
            "fields": desc["fields"],
            "views": [{"title": v["title"], "config": v["config"], "is_default": v["is_default"]}
                      for v in world.views.all(t["name"])],
        }
        if rows:
            table["rows"] = [{k: v for k, v in r.items() if k not in SYSTEM_FIELDS}
                             for r in world.collections.query(t["name"], order="created_at",
                                                              limit=None)]
        tables.append(table)
    autos = world.automations.all(m["id"])
    names = {t["name"] for t in tables}
    readers = [r for r in world.readers.all()
               if r["name"] in names or any(r["name"] in a["procedure"] for a in autos)]
    note = world.knowledge.find_note(f"module:{m['name']}", m["name"])
    return {
        "format": FORMAT, "version": VERSION, "alpha_version": alpha_version(),
        "module": {"name": m["name"], "goal": m["goal"], "icon": m.get("icon")},
        "tables": tables,
        "readers": [{k: r[k] for k in ("name", "site", "url", "script", "description",
                                       "to_end", "allow_posts")} for r in readers],
        "note": note["body"] if note else None,
        "goals": [g["text"] for g in world.knowledge.goals() if g["module"] == m["id"]],
        "automations": [{"title": a["title"], "schedule": a["schedule"],
                         "procedure": a["procedure"]} for a in autos],
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
        for v in t.get("views", []):
            world.views.create(table, v["title"], v.get("config") or {}, by="import",
                               is_default=bool(v.get("is_default")))
    have = set(world.readers.names())
    for r in bundle.get("readers", []):
        if r["name"] not in have:  # a reader of the same name already reads that site here
            world.readers.save(r["name"], site=r["site"], url=r["url"], script=r["script"],
                               description=r.get("description", ""),
                               to_end=bool(r.get("to_end")), count=0,
                               allow_posts=r.get("allow_posts") or None)
    if bundle.get("note"):
        world.knowledge.write_note(f"module:{name}", name, bundle["note"])
    for goal in bundle.get("goals", []):
        world.knowledge.set_goal(goal, m["id"])
    for a in bundle.get("automations", []):
        made = world.automations.create(a["title"], a["schedule"], a["procedure"], module=m["id"])
        world.automations.update(made["id"], enabled=False)
    world.journal.append("made", f"Added {name} from a file.", actor="person", module=m["id"])
    return world.modules.get(m["id"])
