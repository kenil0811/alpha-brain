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

Schedules are small and plain: `every 6h`, `every 30m`, `daily 08:00`, `weekly mon 08:00`, and
`at 2026-10-24 17:00` for a time that comes once (harness slice 4, 18 Oct 2026: the reminder),
all local time; an agent with an `at` runs once and is then paused, its item done. A run
Alpha missed while the Mac was asleep or Alpha was closed happens once when Alpha is back,
never several times over.
"""

from __future__ import annotations

import re
import sqlite3
from datetime import UTC, datetime, timedelta
from typing import Any

from alpha.config import settings
from alpha.world.skills import Skills, slug
from alpha.world.store import (
    MIGRATED_MAY,
    Problem,
    Store,
    dumps,
    loads,
    local_midnight_utc,
    new_id,
    now,
)

DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
EVERY = re.compile(r"^every\s+(\d+)\s*(m|min|minutes?|h|hours?|d|days?)$")
DAILY = re.compile(r"^daily\s+(\d{1,2}):(\d{2})$")
WEEKLY = re.compile(r"^weekly\s+(mon|tue|wed|thu|fri|sat|sun)\w*\s+(\d{1,2}):(\d{2})$")
AT = re.compile(r"^at\s+(\d{4})-(\d{2})-(\d{2})[ t](\d{1,2}):(\d{2})$")
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
    m = AT.match(text)
    if m:
        try:
            moment = datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)),
                              int(m.group(4)), int(m.group(5)))
        except ValueError as e:
            raise Problem(f"'{schedule}' is not a real date and time.") from e
        return f"at {moment.strftime('%Y-%m-%d %H:%M')}"
    raise Problem(
        f"'{schedule}' isn't a schedule Alpha understands: use 'every 6h', 'every 30m', "
        "'daily 08:00', 'weekly mon 08:00', or 'at 2026-10-24 17:00' for once."
    )


def once_at(schedule: str) -> datetime | None:
    """The moment of an `at` schedule, in UTC; None for a repeating one."""
    kind, _, rest = schedule.partition(" ")
    if kind != "at":
        return None
    local = datetime.strptime(rest, "%Y-%m-%d %H:%M").astimezone()
    return local.astimezone(UTC)


def next_run(schedule: str, after: datetime) -> datetime:
    """The next time `schedule` fires after `after` (an aware datetime); returned in UTC."""
    local = after.astimezone()
    kind, _, rest = schedule.partition(" ")
    if kind == "at":
        moment = once_at(schedule)
        assert moment is not None
        return moment  # once: due from then on, however late the Mac wakes
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


def steps_words(steps: list[dict[str, Any]]) -> str:
    """A pipeline's steps in words: what it does, never when (the when is the agent's)."""
    parts = []
    for s in steps:
        if "read" in s:
            parts.append(f"reads {s['read']} into {s.get('into') or 'its table'}")
        elif "tell" in s:
            parts.append(f"tells what changed in {s['tell']}")
        elif "run" in s:
            parts.append(f"runs {s['run']}")
    return "; ".join(parts).capitalize() + "." if parts else "A pipeline."


def describe(schedule: str) -> str:
    kind, _, rest = schedule.partition(" ")
    if kind == "at":
        moment = datetime.strptime(rest, "%Y-%m-%d %H:%M")
        return f"once, on {moment.strftime('%A %d %B at %H:%M')}"
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
    parts.extend(str(e.get("words") or e.get("kind") or "")
                 + (f" ({e['gone']}, so it never wakes it)" if e.get("gone") else "")
                 for e in row.get("events") or [] if isinstance(e, dict))
    return "; ".join(p for p in parts if p) or "when you ask"


def marks_now(db: sqlite3.Connection) -> dict[str, Any]:
    """Where the store ends now, per kind of event an agent can wake on (P7): the rows
    added, the rows changed (every change keeps the old values in `record_versions`), the
    documents filed. A look reads past these."""
    def top(table: str) -> int:
        return int(db.execute(f"SELECT COALESCE(MAX(rowid), 0) FROM {table}").fetchone()[0])
    return {"records": top("records"), "versions": top("record_versions"),
            "documents": top("documents"), "fired": {}}


def _gone(store: Store, line: dict[str, Any]) -> str | None:
    """Why an event line names something that is no longer there (its table or module
    removed): said on the agent's page, and the line never fires (P7)."""
    table = line.get("rows_added") or line.get("rows_changed")
    if table and store.one("SELECT 1 FROM collections WHERE name = ? AND (module IS NULL OR"
                           " module NOT IN (SELECT id FROM modules WHERE removed_at IS NOT"
                           " NULL))", (table,)) is None:
        return "its table was removed"
    module = line.get("document_filed")
    if module and store.one("SELECT 1 FROM modules WHERE id = ? AND removed_at IS NULL",
                            (module,)) is None:
        return "its module was removed"
    return None


# what a line says on the agent's page, and what is worked out from the store (never kept)
SAID = ("words", "gone")


def line_words(store: Store, line: dict[str, Any]) -> str:
    """An on: line in the person's words, from the table, module and fields it names now."""
    table = line.get("rows_added") or line.get("rows_changed")
    if table:
        row = store.one("SELECT title, schema FROM collections WHERE name = ?", (table,))
        title = row["title"] if row else str(table)
        if "rows_added" in line:
            return f"when a row is added to {title}"
        labels = {f["name"]: f.get("label") or f["name"]
                  for f in (loads(row["schema"], {}).get("fields") or [] if row else [])}
        fields = [labels.get(f, f) for f in line.get("fields") or []]
        return (f"when {', '.join(fields)} changes in {title}" if fields else
                f"when a row changes in {title}")
    if line.get("document_filed"):
        row = store.one("SELECT name FROM modules WHERE id = ?", (line["document_filed"],))
        return f"when a document is filed in {row['name'] if row else 'a module'}"
    if line.get("card_decided"):
        return "when you decide one of its cards"
    if line.get("before_event"):
        return f"{line['before_event']} minutes before an event matching “{line.get('matching')}”"
    return ""


def kept_lines(lines: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Lines as they are kept: without what the page works out."""
    return [{k: v for k, v in e.items() if k not in SAID} for e in lines if isinstance(e, dict)]


def _view(row: sqlite3.Row, steps: list[dict[str, Any]] | None = None,
          store: Store | None = None) -> dict[str, Any]:
    out = {k: row[k] for k in row.keys()}
    out["events"] = [{**e, **({"words": line_words(store, e)} if store else {}),
                      **({"gone": why} if store and (why := _gone(store, e)) else {})}
                     for e in kept_lines(loads(row["events"], []))]
    out["wake_marks"] = loads(row["wake_marks"], {}) if "wake_marks" in row.keys() else {}
    out["may"] = loads(row["may"], [])
    out["stage"] = loads(row["stage"], []) if "stage" in row.keys() else []
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
        self.skills.save(name, "run", description=steps_words(steps), module=module,
                         steps=steps)
        return name

    def create(self, description: str, *, name: str | None = None, kind: str = "custom",
               schedule: str | None = None, module: str | None = None,
               thread: str | None = None, steps: list[dict[str, Any]] | None = None,
               goal: str | None = None, may: list[str] | None = None,
               done: str | None = None, stage: list[str] | None = None,
               events: list[dict[str, Any]] | None = None) -> dict[str, Any]:
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
                " schedule, skill, may, done, next_run_at, created_at, updated_at, stage,"
                " events, wake_marks) VALUES (?,?,?,?,?,?,?,'on',?,?,?,?,?,?,?,?,?,?)",
                (aid, (name or "").strip() or description, kind, description,
                 (goal or "").strip() or None, module, thread, clean, skill,
                 dumps(list(may if may is not None else DEFAULT_MAY)),
                 (done or "").strip() or None, first, stamp, stamp, dumps(list(stage or [])),
                 dumps(kept_lines(events or [])), dumps(marks_now(db) if events else {})),
            )
        return self.get(aid)

    def get(self, aid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM agents WHERE id = ?", (aid,))
        if row is None:
            raise Problem(f"There is no agent {aid}.")
        return _view(row, self._steps_of(row), self.store)

    def all(self, module: str | None = None) -> list[dict[str, Any]]:
        if module:
            rows = self.store.all("SELECT * FROM agents WHERE module = ? ORDER BY created_at",
                                  (module,))
        else:
            # a removed module's agents are stopped and out of sight with it (A4)
            rows = self.store.all(
                "SELECT * FROM agents WHERE module IS NULL OR module NOT IN (SELECT id FROM"
                " modules WHERE removed_at IS NOT NULL) ORDER BY created_at")
        return [_view(r, self._steps_of(r), self.store) for r in rows]

    def update(self, aid: str, *, state: str | None = None, schedule: str | None = None,
               name: str | None = None, description: str | None = None,
               steps: list[dict[str, Any]] | None = None, goal: str | None = None,
               may: list[str] | None = None, done: str | None = None,
               stage: list[str] | None = None,
               events: list[dict[str, Any]] | None = None) -> dict[str, Any]:
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
                " skill = ?, next_run_at = ?, updated_at = ?, goal = ?, may = ?, done = ?,"
                " stage = ? WHERE id = ?",
                ("on" if on else "paused", clean, (name or "").strip() or current["name"],
                 words, skill, upcoming, now(), (goal or "").strip() or current.get("goal"),
                 dumps(list(may)) if may is not None else dumps(current["may"]),
                 (done or "").strip() or current.get("done"),
                 dumps(list(stage)) if stage is not None else dumps(current["stage"]), aid),
            )
            if on and not current["on"] and current["kind"] != "custom":
                # one of Alpha's own set going again looks back to the start of that day,
                # never further: what came while it was paused is not its business (A11, Q106)
                db.execute(
                    "UPDATE agents SET cursor = MAX(cursor, COALESCE("
                    "(SELECT MIN(rowid) - 1 FROM journal WHERE at >= ?),"
                    " (SELECT MAX(rowid) FROM journal), 0)) WHERE id = ?",
                    (local_midnight_utc(), aid))
            if events is not None:
                fresh = kept_lines(events)
                same = fresh == kept_lines(current["events"])
                # new lines look from now on: what happened before them is not their business
                marks = current["wake_marks"] if same else marks_now(db) if fresh else {}
                db.execute("UPDATE agents SET events = ?, wake_marks = ? WHERE id = ?",
                           (dumps(fresh), dumps(marks), aid))
        return self.get(aid)

    def set_marks(self, aid: str, marks: dict[str, Any]) -> None:
        """How far the agent's look for its events has read (P7), once its run is over."""
        with self.store.tx() as db:
            db.execute("UPDATE agents SET wake_marks = ? WHERE id = ?", (dumps(marks), aid))

    def of_thread(self, thread: str) -> dict[str, Any] | None:
        """The agent whose own thread this is, if any."""
        row = self.store.one("SELECT id FROM agents WHERE thread = ?", (thread,))
        return self.get(row["id"]) if row else None

    def attach_skill(self, aid: str, skill: str) -> dict[str, Any]:
        """An existing run skill becomes the agent's steps (a kit's agent with its skill
        copied beside it, slice 5), instead of a second skill made from the same steps."""
        self.get(aid)
        self.skills.get(skill, "run")
        with self.store.tx() as db:
            db.execute("UPDATE agents SET skill = ?, updated_at = ? WHERE id = ?",
                       (skill, now(), aid))
        return self.get(aid)

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
        return [_view(r, self._steps_of(r), self.store) for r in rows]

    def working(self) -> list[dict[str, Any]]:
        """Every agent that is on and in sight: the ones whose kind looks for work on a tick."""
        rows = self.store.all(
            "SELECT * FROM agents WHERE state = 'on' AND (module IS NULL OR module NOT IN"
            " (SELECT id FROM modules WHERE removed_at IS NOT NULL)) ORDER BY created_at")
        return [_view(r, self._steps_of(r), self.store) for r in rows]

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
        once = bool(current["schedule"]) and once_at(current["schedule"]) is not None
        if once:
            upcoming = None  # a time that comes once has come: the agent is paused
        with self.store.tx() as db:
            db.execute(
                "UPDATE agents SET last_run_at = ?, last_result = ?, last_error = ?,"
                " next_run_at = ?, updated_at = ?, state = CASE WHEN ? THEN 'paused' ELSE state"
                " END WHERE id = ?",
                (stamp.replace(microsecond=0).isoformat(), result, error, upcoming, now(),
                 once, aid),
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

