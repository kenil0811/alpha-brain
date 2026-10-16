"""Agents: everything that works for the person on its own, in one shape (design Q44, Q50).

An agent has a name (a fun default for a built-in one, editable), a kind (`custom`, or a
built-in kind whose frame is code in `runtime/agents/`), a description the person reads
("Every morning at 08:00, read my LinkedIn connections and update Network › Connections"), a
goal, a scope (a module, or all of Alpha), triggers (a schedule, journal events since its
cursor, an @ in the conversation, on demand), a write list (`may`: the kinds of thing it may
change, never more than Alpha may), what a good run means (`done`), its pipeline (`skill`: saved
steps the scheduler runs with no model), and its own thread so its runs never crowd the
person's conversation. Its brief (the person's words for it) and its notes (what it learned)
are pages at scope `agent:<id>`; its runs are in `runs`; the decisions that bind it in
`decisions`. The person can pause it, rename it or run it now. Automations became agents on
15 Oct 2026 under the same ids.

Schedules are small and plain: `every 6h`, `every 30m`, `daily 08:00`, `weekly mon 08:00` (local
time). A run Alpha missed while the Mac was asleep or Alpha was closed happens once when Alpha
is back, never several times over.
"""

from __future__ import annotations

import re
import sqlite3
from datetime import UTC, datetime, timedelta
from typing import Any

from alpha.config import settings
from alpha.world.skills import Skills, slug
from alpha.world.store import MIGRATED_MAY, Problem, Store, dumps, loads, new_id, now

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
EVERY = re.compile(r"^every\s+(\d+)\s*(m|min|minutes?|h|hours?|d|days?)$")
DAILY = re.compile(r"^daily\s+(\d{1,2}):(\d{2})$")
WEEKLY = re.compile(r"^weekly\s+(mon|tue|wed|thu|fri|sat|sun)\w*\s+(\d{1,2}):(\d{2})$")
STATES = ("on", "paused")
# What a custom agent may write unless its page says less (Q50): what a run could before.
DEFAULT_MAY = MIGRATED_MAY


def check_schedule(schedule: str) -> str:
    text = " ".join(schedule.lower().split())
    m = EVERY.match(text)
    if m:
        amount, unit = int(m.group(1)), m.group(2)[0]
        minutes = amount * {"m": 1, "h": 60, "d": 1440}[unit]
        if minutes < settings.scheduler.least_minutes_between_runs:
            raise Problem(f"An agent runs at most every"
                          f" {settings.scheduler.least_minutes_between_runs} minutes.")
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
    # A clock time is kept only while the Mac is awake: a run due while it sleeps happens at
    # its next full wake (the scheduler's sleep rule, 3 Oct), and the words say so (8 Oct).
    if kind == "daily":
        return f"every day at {rest}, or when your Mac next wakes"
    day, clock = rest.split(" ")
    names = dict(zip(DAYS, ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
                            "Sunday"], strict=True))
    return f"every {names[day]} at {clock}, or when your Mac next wakes"


def when_words(row: dict[str, Any]) -> str:
    """When the agent works, in words: its schedule and its events (an @ wakes every agent,
    which its page says once rather than every row)."""
    parts = []
    if row.get("schedule"):
        parts.append(describe(row["schedule"]))
    parts.extend(str(e.get("words") or e.get("kind") or "") for e in row.get("events") or []
                 if isinstance(e, dict))
    return "; ".join(p for p in parts if p) or "when you ask"


def _view(row: sqlite3.Row, steps: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    out = {k: row[k] for k in row.keys()}
    out["events"] = loads(row["events"], [])
    out["may"] = loads(row["may"], [])
    out["on"] = row["state"] == "on"
    out["enabled"] = out["on"]  # the window's word until it reads `state` (slice A, group 2)
    out["when"] = when_words(out)
    out["steps"] = steps
    return out


class Agents:
    def __init__(self, store: Store) -> None:
        self.store = store
        self.skills = Skills(store)

    def _steps_of(self, row: sqlite3.Row) -> list[dict[str, Any]] | None:
        """A pipeline's steps live in its run skill."""
        if row["skill"]:
            try:
                return list(self.skills.get(row["skill"], "run")["steps"])
            except Problem:
                return None
        return None

    def _keep_steps(self, description: str, module: str | None,
                    steps: list[dict[str, Any]], current: str | None) -> str:
        """The run skill that holds an agent's steps: its own, made or replaced."""
        name = current
        if not name:
            base = slug(description, "run_")
            name, n = base, 2
            while name in self.skills.names():
                name, n = f"{base}_{n}", n + 1
        self.skills.save(name, "run", description=description, module=module, steps=steps)
        return name

    def create(self, description: str, *, name: str | None = None, kind: str = "custom",
               schedule: str | None = None, module: str | None = None,
               thread: str | None = None, steps: list[dict[str, Any]] | None = None,
               goal: str | None = None, may: list[str] | None = None,
               done: str | None = None) -> dict[str, Any]:
        description = " ".join(description.split())
        if not description:
            raise Problem("An agent needs a sentence saying what it does.")
        clean = check_schedule(schedule) if schedule else None
        aid = new_id("a")
        stamp = now()
        first = next_run(clean, datetime.now(UTC)).isoformat() if clean else None
        skill = self._keep_steps(description, module, steps, None) if steps else None
        with self.store.tx() as db:
            db.execute(
                "INSERT INTO agents (id, name, kind, description, goal, module, thread, state,"
                " schedule, skill, may, done, next_run_at, created_at, updated_at)"
                " VALUES (?,?,?,?,?,?,?,'on',?,?,?,?,?,?,?)",
                (aid, (name or "").strip() or description, kind, description,
                 (goal or "").strip() or None, module, thread, clean, skill,
                 dumps(list(may if may is not None else DEFAULT_MAY)),
                 (done or "").strip() or None, first, stamp, stamp),
            )
        return self.get(aid)

    def get(self, aid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM agents WHERE id = ?", (aid,))
        if row is None:
            raise Problem(f"There is no agent {aid}.")
        return _view(row, self._steps_of(row))

    def all(self, module: str | None = None) -> list[dict[str, Any]]:
        if module:
            rows = self.store.all("SELECT * FROM agents WHERE module = ? ORDER BY created_at",
                                  (module,))
        else:
            # a removed module's agents are stopped and out of sight with it (A4)
            rows = self.store.all(
                "SELECT * FROM agents WHERE module IS NULL OR module NOT IN (SELECT id FROM"
                " modules WHERE removed_at IS NOT NULL) ORDER BY created_at")
        return [_view(r, self._steps_of(r)) for r in rows]

    def update(self, aid: str, *, state: str | None = None, schedule: str | None = None,
               name: str | None = None, description: str | None = None,
               steps: list[dict[str, Any]] | None = None, goal: str | None = None,
               may: list[str] | None = None, done: str | None = None) -> dict[str, Any]:
        current = self.get(aid)
        if state is not None and state not in STATES:
            raise Problem(f"An agent's state is one of {STATES}.")
        clean = check_schedule(schedule) if schedule else current["schedule"]
        on = (state or current["state"]) == "on"
        upcoming = next_run(clean, datetime.now(UTC)).isoformat() if on and clean else None
        skill = current.get("skill")
        words = " ".join((description or current["description"]).split())
        if steps:
            skill = self._keep_steps(words, current["module"], steps, skill)
        with self.store.tx() as db:
            db.execute(
                "UPDATE agents SET state = ?, schedule = ?, name = ?, description = ?,"
                " skill = ?, next_run_at = ?, updated_at = ?, goal = ?, may = ?, done = ?"
                " WHERE id = ?",
                ("on" if on else "paused", clean, (name or "").strip() or current["name"],
                 words, skill, upcoming, now(), (goal or "").strip() or current.get("goal"),
                 dumps(list(may)) if may is not None else dumps(current["may"]),
                 (done or "").strip() or current.get("done"), aid),
            )
        return self.get(aid)

    def of_thread(self, thread: str) -> dict[str, Any] | None:
        """The agent whose own thread this is, if any."""
        row = self.store.one("SELECT id FROM agents WHERE thread = ?", (thread,))
        return self.get(row["id"]) if row else None

    def set_thread(self, aid: str, thread: str) -> None:
        with self.store.tx() as db:
            db.execute("UPDATE agents SET thread = ? WHERE id = ?", (thread, aid))

    def due(self, at: datetime | None = None) -> list[dict[str, Any]]:
        moment = (at or datetime.now(UTC)).astimezone(UTC).isoformat()
        rows = self.store.all(
            "SELECT * FROM agents WHERE state = 'on' AND next_run_at IS NOT NULL"
            " AND next_run_at <= ? AND (module IS NULL OR module NOT IN (SELECT id FROM modules"
            " WHERE removed_at IS NOT NULL)) ORDER BY next_run_at", (moment,),
        )
        return [_view(r, self._steps_of(r)) for r in rows]

    def working(self) -> list[dict[str, Any]]:
        """Every agent that is on and in sight: the ones whose kind looks for work on a tick."""
        rows = self.store.all(
            "SELECT * FROM agents WHERE state = 'on' AND (module IS NULL OR module NOT IN"
            " (SELECT id FROM modules WHERE removed_at IS NOT NULL)) ORDER BY created_at")
        return [_view(r, self._steps_of(r)) for r in rows]

    def advance_cursor(self, aid: str, upto: int) -> None:
        """The agent looked at the journal up to this row; a tick asks only for what came
        after. Never moves backwards."""
        with self.store.tx() as db:
            db.execute("UPDATE agents SET cursor = MAX(cursor, ?) WHERE id = ?", (int(upto), aid))

    def finished(self, aid: str, *, result: str | None, error: str | None) -> dict[str, Any]:
        current = self.get(aid)
        stamp = datetime.now(UTC)
        if current.get("skill"):
            self.skills.ran(current["skill"], problem=error)
        upcoming = (next_run(current["schedule"], stamp).isoformat()
                    if current["on"] and current["schedule"] else None)
        with self.store.tx() as db:
            db.execute(
                "UPDATE agents SET last_run_at = ?, last_result = ?, last_error = ?,"
                " next_run_at = ?, updated_at = ? WHERE id = ?",
                (stamp.replace(microsecond=0).isoformat(), result, error, upcoming, now(), aid),
            )
        return self.get(aid)

    def by_mention(self, text: str) -> tuple[dict[str, Any], str] | None:
        """The agent a sentence addresses with `@Name` anywhere in it ("hi @Scout, anything
        new?"; a space after the @ is allowed), and the rest of the sentence without the
        token. By structure only: the name exactly as the agent has it (case aside), the
        longest first, never a guess at meaning. Before 16 Oct only at the start."""
        if "@" not in text:
            return None
        for agent in sorted(self.all(), key=lambda a: -len(a["name"])):
            name = agent["name"]
            pattern = (r"(?<![\w@])@ ?" + r"[ ]*".join(re.escape(part) for part in name.split())
                       + r"(?![\w])")
            m = re.search(pattern, text, re.I)
            if m:
                after = re.sub(r"^\s*[,:]\s*", "", text[m.end():])  # "@Scout, …" → "…"
                rest = re.sub(r"\s+", " ", text[:m.start()] + " " + after)
                return agent, rest.strip(" ,:")
        return None

