"""Automations: things Alpha does on its own, on a schedule.

An automation is a sentence the person can read ("Every morning at 08:00, read my LinkedIn
connections and update Network › Connections"), a schedule, and a procedure: the instructions
Alpha follows on each run. Each one has its own thread, so its runs keep their own context and
never crowd the person's conversation. The person can switch it off or run it now.

Schedules are small and plain: `every 6h`, `every 30m`, `daily 08:00`, `weekly mon 08:00` (local
time). A run Alpha missed while the Mac was asleep or Alpha was closed happens once when Alpha
is back, never several times over.
"""

from __future__ import annotations

import re
import sqlite3
from datetime import UTC, datetime, timedelta
from typing import Any

from alpha.world.store import Problem, Store, new_id, now

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
EVERY = re.compile(r"^every\s+(\d+)\s*(m|min|minutes?|h|hours?|d|days?)$")
DAILY = re.compile(r"^daily\s+(\d{1,2}):(\d{2})$")
WEEKLY = re.compile(r"^weekly\s+(mon|tue|wed|thu|fri|sat|sun)\w*\s+(\d{1,2}):(\d{2})$")


def check_schedule(schedule: str) -> str:
    text = " ".join(schedule.lower().split())
    m = EVERY.match(text)
    if m:
        amount, unit = int(m.group(1)), m.group(2)[0]
        minutes = amount * {"m": 1, "h": 60, "d": 1440}[unit]
        if minutes < 15:
            raise Problem("An automation runs at most every 15 minutes.")
        return f"every {amount}{unit}"
    m = DAILY.match(text)
    if m and int(m.group(1)) < 24 and int(m.group(2)) < 60:
        return f"daily {int(m.group(1)):02d}:{m.group(2)}"
    m = WEEKLY.match(text)
    if m and int(m.group(2)) < 24 and int(m.group(3)) < 60:
        return f"weekly {m.group(1)} {int(m.group(2)):02d}:{m.group(3)}"
    raise Problem(
        f"'{schedule}' isn't a schedule Alpha understands: use 'every 6h', 'every 30m', "
        "'daily 08:00' or 'weekly mon 08:00'."
    )


def next_run(schedule: str, after: datetime) -> datetime:
    """The next time `schedule` fires after `after` (an aware datetime); returned in UTC."""
    local = after.astimezone()
    kind, _, rest = schedule.partition(" ")
    if kind == "every":
        unit = rest[-1]
        minutes = int(rest[:-1]) * {"m": 1, "h": 60, "d": 1440}[unit]
        return (after + timedelta(minutes=minutes)).astimezone(UTC).replace(microsecond=0)
    if kind == "daily":
        hh, mm = (int(x) for x in rest.split(":"))
        candidate = local.replace(hour=hh, minute=mm, second=0, microsecond=0)
        if candidate <= local:
            candidate += timedelta(days=1)
        return candidate.astimezone(UTC)
    if kind == "weekly":
        day, clock = rest.split(" ")
        hh, mm = (int(x) for x in clock.split(":"))
        candidate = local.replace(hour=hh, minute=mm, second=0, microsecond=0)
        candidate += timedelta(days=(DAYS.index(day) - local.weekday()) % 7)
        if candidate <= local:
            candidate += timedelta(days=7)
        return candidate.astimezone(UTC)
    raise Problem(f"Unknown schedule '{schedule}'.")


def describe(schedule: str) -> str:
    kind, _, rest = schedule.partition(" ")
    if kind == "every":
        n, unit = int(rest[:-1]), {"m": "minute", "h": "hour", "d": "day"}[rest[-1]]
        return f"every {unit}" if n == 1 else f"every {n} {unit}s"
    if kind == "daily":
        return f"every day at {rest}"
    day, clock = rest.split(" ")
    names = dict(zip(DAYS, ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
                            "Sunday"], strict=True))
    return f"every {names[day]} at {clock}"


def _view(row: sqlite3.Row) -> dict[str, Any]:
    out = {k: row[k] for k in row.keys()}
    out["enabled"] = bool(row["enabled"])
    out["when"] = describe(row["schedule"])
    return out


class Automations:
    def __init__(self, store: Store) -> None:
        self.store = store

    def create(self, title: str, schedule: str, procedure: str, *, module: str | None = None,
               thread: str | None = None) -> dict[str, Any]:
        if not title.strip() or not procedure.strip():
            raise Problem("An automation needs a sentence saying what it does and a procedure.")
        clean = check_schedule(schedule)
        aid = new_id("a")
        stamp = now()
        first = next_run(clean, datetime.now(UTC)).isoformat()
        with self.store.tx() as db:
            db.execute(
                "INSERT INTO automations (id, title, module, thread, schedule, procedure, enabled,"
                " next_run_at, created_at, updated_at) VALUES (?,?,?,?,?,?,1,?,?,?)",
                (aid, title.strip(), module, thread, clean, procedure.strip(), first, stamp, stamp),
            )
        return self.get(aid)

    def get(self, aid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM automations WHERE id = ?", (aid,))
        if row is None:
            raise Problem(f"There is no automation {aid}.")
        return _view(row)

    def all(self, module: str | None = None) -> list[dict[str, Any]]:
        if module:
            rows = self.store.all("SELECT * FROM automations WHERE module = ? ORDER BY created_at",
                                  (module,))
        else:
            rows = self.store.all("SELECT * FROM automations ORDER BY created_at")
        return [_view(r) for r in rows]

    def update(self, aid: str, *, enabled: bool | None = None, schedule: str | None = None,
               procedure: str | None = None, title: str | None = None) -> dict[str, Any]:
        current = self.get(aid)
        clean = check_schedule(schedule) if schedule else current["schedule"]
        on = current["enabled"] if enabled is None else enabled
        upcoming = next_run(clean, datetime.now(UTC)).isoformat() if on else None
        with self.store.tx() as db:
            db.execute(
                "UPDATE automations SET enabled = ?, schedule = ?, procedure = ?, title = ?,"
                " next_run_at = ?, updated_at = ? WHERE id = ?",
                (int(on), clean, procedure or current["procedure"], title or current["title"],
                 upcoming, now(), aid),
            )
        return self.get(aid)

    def set_thread(self, aid: str, thread: str) -> None:
        with self.store.tx() as db:
            db.execute("UPDATE automations SET thread = ? WHERE id = ?", (thread, aid))

    def due(self, at: datetime | None = None) -> list[dict[str, Any]]:
        moment = (at or datetime.now(UTC)).astimezone(UTC).isoformat()
        rows = self.store.all(
            "SELECT * FROM automations WHERE enabled = 1 AND next_run_at IS NOT NULL"
            " AND next_run_at <= ? ORDER BY next_run_at", (moment,),
        )
        return [_view(r) for r in rows]

    def finished(self, aid: str, *, result: str | None, error: str | None) -> dict[str, Any]:
        current = self.get(aid)
        stamp = datetime.now(UTC)
        upcoming = next_run(current["schedule"], stamp).isoformat() if current["enabled"] else None
        with self.store.tx() as db:
            db.execute(
                "UPDATE automations SET last_run_at = ?, last_result = ?, last_error = ?,"
                " next_run_at = ?, updated_at = ? WHERE id = ?",
                (stamp.replace(microsecond=0).isoformat(), result, error, upcoming, now(), aid),
            )
        return self.get(aid)
