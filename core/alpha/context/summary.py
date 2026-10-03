"""A module's summary, worked out from its own tables: nothing designed per domain.

For each table: how many rows and how many came in this week; where rows happen on a day and
carry amounts, today's and this week's totals (an average for scores and percentages); how rows
split across the first status or choice field. Plus the module's goals and when its automations
next run. No sample rows: the table's own page shows them.
"""

from __future__ import annotations

from datetime import UTC, datetime, time, timedelta
from typing import Any

from alpha.world.world import World

AVERAGED_UNITS = {"%", "/10", "/5", "score", "stars"}


def _averaged(field: dict[str, Any]) -> bool:
    unit = str(field.get("unit") or "").lower()
    name = field["name"].lower()
    return unit in AVERAGED_UNITS or any(w in name for w in ("score", "rating", "fit", "percent"))


def _day_of(row: dict[str, Any], date_field: str | None) -> str | None:
    if date_field and row.get(date_field):
        return str(row[date_field])[:10]
    created = row.get("created_at")
    if not created:
        return None
    return datetime.fromisoformat(str(created)).astimezone().date().isoformat()


def _round(value: float) -> float | int:
    return int(value) if float(value).is_integer() else round(value, 1)


def table_summary(world: World, name: str) -> dict[str, Any]:
    desc = world.collections.describe(name)
    fields = desc["fields"]
    rows = world.collections.query(name, limit=None)
    today = datetime.now().astimezone().date()
    week_start = today - timedelta(days=today.weekday())
    date_field = next((f["name"] for f in fields if f["kind"] in {"date", "datetime"}), None)
    numbers = [f for f in fields if f["kind"] == "number"]
    week_cut = datetime.combine(week_start, time(0)).astimezone().astimezone(UTC).isoformat()
    out: dict[str, Any] = {
        "name": name,
        "title": desc["title"],
        "rows": desc["records"],
        "added_this_week": sum(1 for r in rows if str(r["created_at"]) >= week_cut),
    }
    totals = []
    for f in numbers[:4]:
        dated = [(float(r[f["name"]]), _day_of(r, date_field) or "") for r in rows
                 if isinstance(r.get(f["name"]), int | float)]
        todays = [v for v, day in dated if day == today.isoformat()]
        week = [v for v, day in dated if day >= week_start.isoformat()]
        averaged = _averaged(f)

        def combine(values: list[float], averaged: bool = averaged) -> float | int | None:
            if not values:
                return None
            return _round(sum(values) / len(values) if averaged else sum(values))

        entry = {
            "field": f["name"],
            "label": f.get("label") or f["name"].replace("_", " ").capitalize(),
            "unit": f.get("unit"),
            "how": "average" if averaged else "total",
            "today": combine(todays),
            "this_week": combine(week),
        }
        if entry["today"] is not None or entry["this_week"] is not None:
            totals.append(entry)
    if totals:
        out["amounts"] = totals
        out["dated_by"] = date_field or "created_at"
    split_field = next((f for f in fields if f["kind"] == "status"), None) or next(
        (f for f in fields if f["kind"] == "choice"), None)
    if split_field and rows:
        counts: dict[str, int] = {c: 0 for c in split_field.get("choices", [])}
        for r in rows:
            value = r.get(split_field["name"])
            if value is not None:
                counts[str(value)] = counts.get(str(value), 0) + 1
        out["split"] = {"field": split_field["name"],
                        "label": split_field.get("label") or split_field["name"].replace("_", " ")
                        .capitalize(),
                        "counts": {k: v for k, v in counts.items() if v},
                        "done": split_field.get("done_choices", [])}
    return out


def module_summary(world: World, module_id: str) -> dict[str, Any]:
    """The module and everything it holds (a parent's summary rolls its children up)."""
    ids = world.modules.subtree(module_id)
    tables = [table_summary(world, t["name"]) for m in ids
              for t in world.collections.overview(m)]
    autos = [a for m in ids for a in world.automations.all(m) if a["enabled"]]
    return {
        "tables": tables,
        "goals": [g for g in world.knowledge.goals() if g["module"] in ids],
        "next_run": min((a["next_run_at"] for a in autos if a["next_run_at"]), default=None),
        "automations": len(autos),
    }
