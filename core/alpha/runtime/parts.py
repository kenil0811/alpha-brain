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
source and date in the row's provenance, per field. A part never touches the world itself. A
part that runs "when a row arrives" is run by the scheduler for every row whose fields it
fills are still empty; "when asked" from the thing's page; "after <part>" once that part has
filled its fields. A row a part failed on twice is left alone, with the problem on the row.
"""

from __future__ import annotations

import json
import logging
import re
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
    """Run one part for one row and write what it filled into the row, with the source and
    date of every value in the row's provenance."""
    module = world.modules.get(module_id)
    ws = module.get("workspace")
    part = next((p for p in parts_of(ws) if p["id"] == part_id), None)
    if not part or not ws:
        raise Problem(f"This module has no part '{part_id}'.")
    table = table_of(world, module["id"], part["fills"]["thing"])
    read_table = table_of(world, module["id"], part["reads"]["thing"]) or table
    if not table or not read_table:
        raise Problem(f"The module has no table for {part['fills']['thing']}.")
    row = world.collections.get(read_table, row_id)
    payload = {"id": row_id,
               **{k: v for k, v in row.items() if not k.startswith("_")
                  and k not in ("revision", "created_at", "updated_at")},
               "settings": settings_of(world, module["id"])}
    hosts = workspace_module.hosts_for({"hosts": part["reaches"]})
    code, out = workspace_module.run_script(Path(ws), part["command"], timeout_s=PART_TIMEOUT_S,
                                            hosts=hosts, stdin=json.dumps(payload))
    network = out.rsplit("[network:", 1)[1].rstrip("]\n ") if "[network:" in out else ""
    target = world.collections.get(table, row_id) if table == read_table else None
    if target is None:
        raise Problem("A part fills the thing it reads for now.")
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
    known = {f["name"] for f in world.collections.describe(table)["fields"]}
    values = {k: v for k, v in values.items() if k in known}
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


def _done(part: dict[str, Any], row: dict[str, Any]) -> bool:
    """Every field the part fills has a value, or has failed enough times."""
    fields = (row.get("_provenance") or {}).get("fields") or {}
    for f in part["fills"]["fields"]:
        if row.get(f) is not None:
            continue
        if int((fields.get(f) or {}).get("attempts") or 0) >= ATTEMPTS:
            continue
        return False
    return True


def _filled(part: dict[str, Any], row: dict[str, Any]) -> bool:
    """Every field the part fills has a value: what a part "after" it waits for."""
    return all(row.get(f) is not None for f in part["fills"]["fields"])


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
        if not table:
            continue
        before = by_id.get(part["when"][6:]) if part["when"].startswith("after:") else None
        for row in world.collections.query(table, limit=None):
            if _done(part, row):
                continue
            if before and not _filled(before, row):
                continue  # the part before it gave nothing (yet): nothing to go on
            out.append((part["id"], str(row["id"])))
    return out


def run_due(world: World, *, module_id: str | None = None) -> int:
    """Run every due part on every row, for one module or all; how many ran."""
    ran = 0
    modules = [world.modules.get(module_id)] if module_id else world.modules.all()
    for m in modules:
        if not m.get("workspace") or not (Path(m["workspace"]) / "parts.yaml").exists():
            continue
        for part_id, row_id in due(world, m["id"]):
            try:
                run_part(world, m["id"], part_id, row_id)
            except Exception:
                log.exception("part %s on %s", part_id, row_id)
            ran += 1
    return ran
