"""Parts: the steps Alpha does in a person's workflow, as scripts with a contract (design §12).

A module's build writes `parts.yaml` in its workspace:

    parts:
      - id: households
        step: check_households            # the step on the workflow page it does
        title: Households within 3 miles
        reads: {thing: site, fields: [address, lat, lon]}
        fills: {thing: site, fields: [households_3mi, density]}
        when: arrives                     # arrives | asked | after:<part id>
        reaches: [api.census.gov]
        command: [".venv/bin/python", "parts/households.py"]

The core runs a part for one row: the row's values and the module's settings go in as JSON on
stdin, under the profile with Alpha's proxy as the one road out; the part answers with one
JSON object, {"values": {field: value}, "sources": {field: {"source", "fetched_at"}},
"problems": {field: "why not"}}, and the core writes the values into the row with their
source and date in the row's provenance, per field. A part never touches the world itself.

A part fills the thing it reads, or a thing linked to it (a Score linked to a Site): then it
fills one row of that thing per row it reads, linked to it and marked as the part's own, made
the first time the part runs and named after the part unless the part names it. A field the
part reads that is a link (or the name of a linked thing) comes in as the linked rows, so a
part can read what earlier parts filled on them.

A part that runs "when a row arrives" is run by the scheduler for every row whose fields it
fills are still empty; "when asked" from the thing's page; "after <part>" once that part has
run on the row (every field it fills has a value or a recorded problem). A row a part failed
on twice is left alone, with the problem on the row.
"""

from __future__ import annotations

import json
import logging
import re
from collections.abc import Callable
from pathlib import Path
from typing import Any

import yaml

from alpha.runtime import workspace as workspace_module
from alpha.world.store import Problem, now
from alpha.world.world import World

log = logging.getLogger("alpha.parts")
PART_TIMEOUT_S = 600
ATTEMPTS = 2
WHEN = re.compile(r"^(arrives|asked|after:[a-z0-9_]+)$")


def parts_of(workspace: Path | str | None) -> list[dict[str, Any]]:
    if not workspace:
        return []
    path = Path(workspace) / "parts.yaml"
    if not path.exists():
        return []
    try:
        data = yaml.safe_load(path.read_text()) or {}
    except (yaml.YAMLError, OSError):
        return []
    out: list[dict[str, Any]] = []
    for p in data.get("parts") or []:
        if not isinstance(p, dict) or not p.get("id") or not p.get("command"):
            continue
        reads = p.get("reads") or {}
        fills = p.get("fills") or {}
        if not isinstance(reads, dict) or not isinstance(fills, dict) or not fills.get("thing"):
            continue
        when = str(p.get("when") or "asked").strip().lower()
        if not WHEN.match(when):
            when = "asked"
        command = p["command"] if isinstance(p["command"], list) else str(p["command"]).split()
        out.append({"id": str(p["id"]), "step": str(p.get("step") or ""),
                    "title": str(p.get("title") or p["id"]),
                    "reads": {"thing": str(reads.get("thing") or fills["thing"]),
                              "fields": [str(f) for f in reads.get("fields") or []]},
                    "fills": {"thing": str(fills["thing"]),
                              "fields": [str(f) for f in fills.get("fields") or []]},
                    "when": when, "reaches": [str(h) for h in p.get("reaches") or []],
                    "command": [str(c) for c in command]})
    return out


def table_of(world: World, module_id: str, thing: str) -> str | None:
    """The module's table for a thing on the page: named after the thing's key, prefixed by
    the module when the plain name was taken (runtime/workflow_build.py)."""
    for t in world.collections.overview(module_id):
        if t["name"] == thing or t["name"].endswith("_" + thing):
            return str(t["name"])
    return None


def settings_of(world: World, module_id: str) -> dict[str, Any]:
    table = table_of(world, module_id, "settings")
    if not table:
        return {}
    out: dict[str, Any] = {}
    for row in world.collections.query(table, limit=None):
        if row.get("key"):
            out[str(row["key"])] = row.get("value")
    return out


def parse_output(text: str) -> dict[str, Any]:
    """The part's one JSON object, the last one on its output; unreadable is a problem."""
    candidates = [m.group(0) for m in re.finditer(r"\{.*\}", text, re.S)]
    for raw in reversed(candidates):
        try:
            data = json.loads(raw)
        except ValueError:
            # try the last line that is an object
            for line in reversed(raw.splitlines()):
                line = line.strip()
                if line.startswith("{") and line.endswith("}"):
                    try:
                        data = json.loads(line)
                        break
                    except ValueError:
                        continue
            else:
                continue
        if isinstance(data, dict) and ("values" in data or "problems" in data):
            return {"values": dict(data.get("values") or {}),
                    "sources": dict(data.get("sources") or {}),
                    "problems": dict(data.get("problems") or {})}
    raise Problem("The part did not answer with {values, sources, problems} as JSON.")


def run_part(world: World, module_id: str, part_id: str, row_id: str, *,
             thread: str | None = None) -> dict[str, Any]:
    """Run one part for one row and write what it filled into the row (or the row of the
    linked thing it fills), with the source and date of every value in the row's provenance.
    The row may be the one the part reads or the one it filled (Try again from either page)."""
    module = world.modules.get(module_id)
    ws = module.get("workspace")
    part = next((p for p in parts_of(ws) if p["id"] == part_id), None)
    if not part or not ws:
        raise Problem(f"This module has no part '{part_id}'.")
    table = table_of(world, module["id"], part["fills"]["thing"])
    read_table = table_of(world, module["id"], part["reads"]["thing"]) or table
    if not table or not read_table:
        raise Problem(f"The module has no table for {part['fills']['thing']}.")
    link = _link_field(world, table, read_table) if table != read_table else None
    if table != read_table and not link:
        raise Problem(f"{table} has no field linking it to {read_table}: a part fills the thing"
                      " it reads or one linked to it.")
    row, row_id = _read_row(world, read_table, table, link, row_id)
    known = [f["name"] for f in world.collections.describe(read_table)["fields"]]
    payload = {"id": row_id, **{k: None for k in known}, **_plain(row),
               **_related(world, module["id"], read_table, row, part["reads"]["fields"]),
               "settings": settings_of(world, module["id"])}
    hosts = workspace_module.hosts_for({"hosts": part["reaches"]})
    code, out = workspace_module.run_script(Path(ws), part["command"], timeout_s=PART_TIMEOUT_S,
                                            hosts=hosts, stdin=json.dumps(payload))
    network = out.rsplit("[network:", 1)[1].rstrip("]\n ") if "[network:" in out else ""
    if link:
        target = _made_rows(world, table, link, part_id).get(row_id) or _make(
            world, table, link, row_id, part)
    else:
        target = world.collections.get(table, row_id)
    row_id = str(target["id"])
    prov = dict(target.get("_provenance") or {})
    fields: dict[str, Any] = dict(prov.get("fields") or {})
    stamp = now()
    if code != 0:
        tail = " ".join(out.strip().splitlines()[-3:])[:300]
        for f in part["fills"]["fields"]:
            entry = dict(fields.get(f) or {})
            entry.update({"problem": f"{part['title']} failed (exit {code}): {tail}",
                          "attempts": int(entry.get("attempts") or 0) + 1, "at": stamp,
                          "part": part_id})
            fields[f] = entry
        prov["fields"] = fields
        world.collections.update(table, row_id, {}, target["revision"], prov)
        world.journal.append("failed", f"{part['title']} failed on a row of {table}"
                             f" (exit {code}): {tail}", actor="alpha", module=module["id"],
                             thread=thread, data={"part": part_id, "record": row_id,
                                                  "collection": table, "network": network})
        return {"ok": False, "exit": code, "output": out[-2000:]}
    answer = parse_output(out)
    values: dict[str, Any] = {}
    for f in part["fills"]["fields"]:
        entry = dict(fields.get(f) or {})
        entry.pop("problem", None)
        if f in answer["values"] and answer["values"][f] is not None:
            values[f] = answer["values"][f]
            src = answer["sources"].get(f) or {}
            entry.update({"source": str(src.get("source") or part["title"]),
                          "fetched_at": str(src.get("fetched_at") or stamp), "part": part_id,
                          "attempts": 0})
        elif f in answer["problems"]:
            entry.update({"problem": str(answer["problems"][f])[:300],
                          "attempts": int(entry.get("attempts") or 0) + 1, "at": stamp,
                          "part": part_id})
        else:
            entry.update({"problem": f"{part['title']} gave nothing for this field.",
                          "attempts": int(entry.get("attempts") or 0) + 1, "at": stamp,
                          "part": part_id})
        fields[f] = entry
    prov["fields"] = fields
    prov.setdefault("by", "alpha")
    fillable = {f["name"] for f in world.collections.describe(table)["fields"]}
    values = {k: v for k, v in values.items() if k in fillable}
    world.collections.update(table, row_id, values, target["revision"], prov)
    filled = ", ".join(f"{k} = {str(v)[:40]}" for k, v in values.items())
    problems = "; ".join(f"{k}: {v}" for k, v in answer["problems"].items())
    world.journal.append(
        "did", f"{part['title']} on a row of {table}: " + (filled or "nothing filled")
        + (f". Could not: {problems}" if problems else "") + ".",
        actor="alpha", module=module["id"], thread=thread,
        data={"part": part_id, "record": row_id, "collection": table, "values": values,
              "problems": answer["problems"], "network": network})
    return {"ok": True, "exit": 0, "values": values, "problems": answer["problems"],
            "output": out[-2000:]}


def _plain(row: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in row.items() if not k.startswith("_")
            and k not in ("id", "revision", "created_at", "updated_at")}


def _link_field(world: World, table: str, other: str) -> str | None:
    """The field of `table` that links a row to one of `other`."""
    for f in world.collections.describe(table)["fields"]:
        if f["kind"] == "relation" and f.get("relation") == other:
            return str(f["name"])
    return None


def _read_row(world: World, read_table: str, table: str, link: str | None,
              row_id: str) -> tuple[dict[str, Any], str]:
    """The row the part reads: the id given, or the one a row it filled links to."""
    try:
        return world.collections.get(read_table, row_id), row_id
    except Problem:
        if not link:
            raise
        made = world.collections.get(table, row_id)
        if not made.get(link):
            raise Problem(f"Row {row_id} of {table} is linked to no row of {read_table}.") from None
        return world.collections.get(read_table, str(made[link])), str(made[link])


def _related(world: World, module_id: str, read_table: str, row: dict[str, Any],
             fields: list[str]) -> dict[str, list[dict[str, Any]]]:
    """For each field the part reads that is a link or the name of a linked thing: the rows
    of that thing linked to this row, as the part sees them."""
    out: dict[str, list[dict[str, Any]]] = {}
    desc = world.collections.describe(read_table)
    by_name = {f["name"]: f for f in desc["fields"]}
    for name in fields:
        field = by_name.get(name)
        if field is not None and field["kind"] == "relation":
            other = str(field.get("relation") or "")
        elif field is None:
            other = table_of(world, module_id, name) or ""
        else:
            continue
        if not other or other.startswith("entity:") or other == read_table:
            continue
        back = _link_field(world, other, read_table)
        rows = world.collections.query(other, {back: row["id"]}, limit=None) if back else []
        if not rows and field is not None and row.get(name):
            try:
                rows = [world.collections.get(other, str(row[name]))]
            except Problem:
                rows = []
        out[name] = [{"id": r["id"], **_plain(r)} for r in rows]
    return out


def _made_rows(world: World, table: str, link: str, part_id: str) -> dict[str, dict[str, Any]]:
    """The rows of `table` a part made, by the row they are linked to."""
    out: dict[str, dict[str, Any]] = {}
    for r in world.collections.query(table, limit=None):
        if (r.get("_provenance") or {}).get("part") == part_id and r.get(link):
            out[str(r[link])] = r
    return out


def _make(world: World, table: str, link: str, row_id: str,
          part: dict[str, Any]) -> dict[str, Any]:
    """The row a part fills on a linked thing, made the first time it runs: linked to the row
    it read, named after the part unless the part fills the name itself."""
    values: dict[str, Any] = {link: row_id}
    title_field = world.collections.describe(table).get("title_field")
    if title_field and title_field != link:
        values[title_field] = part["title"]
    return world.collections.add(table, values, {"by": "alpha", "part": part["id"],
                                                 "fields": {}})


def made_row(world: World, module_id: str, part: dict[str, Any],
             row_id: str) -> dict[str, Any] | None:
    """The row a part's values land on for a row it reads: that row itself, or the row it
    made on the linked thing; None when it made none yet."""
    table = table_of(world, module_id, part["fills"]["thing"])
    read_table = table_of(world, module_id, part["reads"]["thing"]) or table
    if not table or not read_table:
        return None
    if table == read_table:
        try:
            return world.collections.get(table, row_id)
        except Problem:
            return None
    link = _link_field(world, table, read_table)
    return _made_rows(world, table, link, part["id"]).get(row_id) if link else None


def ran(part: dict[str, Any], made: dict[str, Any] | None) -> bool:
    """The part has run on the row: every field it fills has a value or a recorded problem.
    What a part "after" it waits for."""
    if made is None:
        return False
    fields = (made.get("_provenance") or {}).get("fields") or {}
    return all(made.get(f) is not None or (fields.get(f) or {}).get("problem")
               for f in part["fills"]["fields"])


def _done(part: dict[str, Any], made: dict[str, Any] | None) -> bool:
    """Every field the part fills has a value, or has failed enough times."""
    if made is None:
        return False
    fields = (made.get("_provenance") or {}).get("fields") or {}
    for f in part["fills"]["fields"]:
        if made.get(f) is not None:
            continue
        if int((fields.get(f) or {}).get("attempts") or 0) >= ATTEMPTS:
            continue
        return False
    return True


def due(world: World, module_id: str) -> list[tuple[str, str]]:
    """(part id, row id) pairs the scheduler should run now: parts that run when a row arrives
    (or after another part) for rows whose fields they fill are still empty."""
    module = world.modules.get(module_id)
    parts = parts_of(module.get("workspace"))
    by_id = {p["id"]: p for p in parts}
    out: list[tuple[str, str]] = []
    for part in parts:
        if part["when"] == "asked":
            continue
        table = table_of(world, module["id"], part["fills"]["thing"])
        read_table = table_of(world, module["id"], part["reads"]["thing"]) or table
        if not table or not read_table:
            continue
        made = _lands(world, table, read_table, part)
        if made is None:
            continue
        before = by_id.get(part["when"][6:]) if part["when"].startswith("after:") else None
        before_made = None
        if before:
            b_table = table_of(world, module["id"], before["fills"]["thing"])
            b_read = table_of(world, module["id"], before["reads"]["thing"]) or b_table
            before_made = _lands(world, b_table, b_read, before) if b_table and b_read else None
            if before_made is None:
                continue
        for row in world.collections.query(read_table, limit=None):
            rid = str(row["id"])
            if _done(part, made(row)):
                continue
            if before and before_made is not None and not ran(before, before_made(row)):
                continue  # the part before it has not run on this row (yet)
            out.append((part["id"], rid))
    return out


def _lands(world: World, table: str, read_table: str, part: dict[str, Any]
           ) -> Callable[[dict[str, Any]], dict[str, Any] | None] | None:
    """Where a part's values land for a row it reads: the row itself, or the row it made on
    the linked thing (None when none yet); None when the things are not linked."""
    if table == read_table:
        return lambda row: row
    link = _link_field(world, table, read_table)
    if not link:
        return None
    made = _made_rows(world, table, link, part["id"])
    return lambda row: made.get(str(row["id"]))


def run_due(world: World, *, module_id: str | None = None) -> int:
    """Run every due part on every row, for one module or all, round after round until
    nothing more is due (a part after another becomes due once that one has run);
    how many ran."""
    ran_count = 0
    modules = [world.modules.get(module_id)] if module_id else world.modules.all()
    for m in modules:
        if not m.get("workspace") or not (Path(m["workspace"]) / "parts.yaml").exists():
            continue
        rounds = len(parts_of(m["workspace"])) + 1
        for _ in range(rounds):
            pending = due(world, m["id"])
            if not pending:
                break
            for part_id, row_id in pending:
                try:
                    run_part(world, m["id"], part_id, row_id)
                except Exception:
                    log.exception("part %s on %s", part_id, row_id)
                ran_count += 1
    return ran_count
