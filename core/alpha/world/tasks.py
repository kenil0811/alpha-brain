"""Tasks: what the person means to do and what is owed to them, each living on the place it
concerns (Q85, Q87, Q91; `docs/design/tasks-and-cards-proposal.md`, P1, 18 Oct 2026).

A task is a row of one table the world keeps itself (`alpha_tasks`), owned by no module, so it has
everything a table has: the views, inline edits, saved lists, a record page with History, Undo,
Notes and files, `world_query`'s view, search and removal. Its fields are Alpha's and never
removed. What code owes a task happens in the write's own transaction (`TableHook`): its
defaults, the checks of its place and its owner, the next one of a repeating task.

- **Its place** (`anchor`) is a window address: a module (`#/m/<id>`), a table, a record, a
  field of a record (`#/m/<id>/<table>/<record>/<field>`, or `#/records/<table>/…` for a table
  in no module) or a module's page (`#/m/<id>/~page/<name>`). It is placed by code from what it
  was made on, or picked by the model from the conversation and said in a line; never asked.
- **Its owner** is `person`, an agent's id, or `entity:<id>` (what someone owes the person).
- **What an agent's run makes** is suggested until the person keeps it (Q91), like Watson's
  suggested facts; what the person says in passing becomes a task at once (Watson files it).
- **A reminder** is a task with the moment to be reminded at (Q81): the Reminders agent puts its
  card; Done closes it, Tomorrow moves it.

Commitments (Q46) grew into tasks: a world that kept them as rows has them moved once, on open,
and the old table goes, as the skills table did in 2b."""

from __future__ import annotations

import calendar
import logging
import re
import sqlite3
from collections.abc import Callable
from datetime import UTC, date, datetime, timedelta
from typing import TYPE_CHECKING, Any

from alpha.world.collections import _label_of, record_view
from alpha.world.store import Problem, dumps, loads, new_id, now

if TYPE_CHECKING:
    from alpha.world.world import World

log = logging.getLogger("alpha.tasks")

# Named so it can never be a table a person already keeps called "tasks"; the model reads it
# as the view `tasks` (world/queries.py) and the window titles it Tasks.
TABLE = "alpha_tasks"
OPEN, WORKING, BLOCKED, DONE, DROPPED = "Open", "Working", "Blocked", "Done", "Dropped"
STATES = (OPEN, WORKING, BLOCKED, DONE, DROPPED)
FINISHED = (DONE, DROPPED)
PRIORITIES = ("P0", "P1", "P2", "P3", "P4")
FIELDS: list[dict[str, Any]] = [
    {"name": "title", "kind": "text", "label": "Task", "required": True},
    {"name": "state", "kind": "status", "label": "State", "choices": list(STATES),
     "done_choices": list(FINISHED)},
    {"name": "due", "kind": "date", "label": "Due"},
    {"name": "priority", "kind": "choice", "label": "Priority", "choices": list(PRIORITIES)},
    {"name": "owner", "kind": "text", "label": "Owner"},
    {"name": "anchor", "kind": "text", "label": "Where it lives"},
    {"name": "about", "kind": "relation", "relation": "any", "many": True, "label": "About"},
    {"name": "parent", "kind": "relation", "relation": TABLE, "label": "Part of"},
    {"name": "blocked_by", "kind": "relation", "relation": TABLE, "many": True,
     "label": "Blocked by"},
    {"name": "repeats", "kind": "text", "label": "Repeats"},
    {"name": "remind_at", "kind": "datetime", "label": "Remind at"},
    {"name": "reminded_at", "kind": "datetime", "label": "Reminded"},
    {"name": "by", "kind": "text", "label": "Made by"},
    {"name": "suggested", "kind": "bool", "label": "Suggested"},
    # a card waits on the person for it (P3): code keeps it, from the cards
    {"name": "waiting", "kind": "bool", "label": "Waiting for your yes"},
]
# The ways of looking at the tasks every world starts with (the person and Alpha add more).
LISTS: list[dict[str, Any]] = [
    {"title": "Open", "default": True, "config": {"hide_done": True}},
    {"title": "Today", "config": {"hide_done": True, "rules": {"match": "all", "rules": [
        {"field": "due", "op": "today", "value": ""}]}}},
    {"title": "This week", "config": {"hide_done": True, "rules": {"match": "all", "rules": [
        {"field": "due", "op": "this_week", "value": ""}]}}},
    {"title": "Overdue", "config": {"hide_done": True, "rules": {"match": "all", "rules": [
        {"field": "due", "op": "before_today", "value": ""}]}}},
    {"title": "By place", "config": {"hide_done": True, "view": "tree", "group_by": "anchor"}},
    {"title": "Agents'", "config": {"hide_done": True, "rules": {"match": "all", "rules": [
        {"field": "owner", "op": "starts", "value": "a_"}]}}},
    {"title": "Blocked", "config": {"rules": {"match": "all", "rules": [
        {"field": "state", "op": "in", "value": "", "values": [BLOCKED]}]}}},
    {"title": "Waiting on others", "config": {"hide_done": True, "rules": {
        "match": "all", "rules": [{"field": "owner", "op": "starts", "value": "entity:"}]}}},
    {"title": "Suggested", "config": {"hide_done": True, "rules": {"match": "all", "rules": [
        {"field": "suggested", "op": "checked", "value": ""}]}}},
    {"title": "Waiting for my yes", "config": {"hide_done": True, "rules": {"match": "all",
        "rules": [{"field": "waiting", "op": "checked", "value": ""}]}}},
]
# The words a repeat is said in: a step from the last one (a day, N weeks, a month) or a
# weekday; anything else is refused with these examples.
REPEAT_WORDS = "'daily', 'weekly', 'every Monday', 'every 2 weeks', 'monthly on the 1st', 'yearly'"
WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
ADDRESS = re.compile(r"^#/(m/[^/]+(/[^/]+(/[^/]+(/[^/]+)?)?)?|records/[^/]+/[^/]+(/[^/]+)?)$")


def _add_months(day: date, months: int, on: int | None = None) -> date:
    month = day.month - 1 + months
    year, month = day.year + month // 12, month % 12 + 1
    last = calendar.monthrange(year, month)[1]
    return date(year, month, min(on or day.day, last))


Step = Callable[[date], date]


def _monthly_on(on: int) -> Step:
    def step(d: date) -> date:
        here = date(d.year, d.month, min(on, calendar.monthrange(d.year, d.month)[1]))
        return here if here > d else _add_months(d, 1, on)
    return step


def _days(n: int) -> Step:
    return lambda d: d + timedelta(days=n)


def _months(n: int) -> Step:
    return lambda d: _add_months(d, n)


def _weekday(wanted: int) -> Step:
    return lambda d: d + timedelta(days=(wanted - d.weekday() - 1) % 7 + 1)


def repeat_step(rule: str) -> Step:
    """What a repeat rule does to a day: a function from the last day to the next, or a
    Problem in plain words for a rule Alpha doesn't read."""
    words = " ".join(rule.lower().replace(",", " ").split())
    words = re.sub(r"^(repeats?|repeat)\s+", "", words)
    simple = {"daily": (1, 0), "every day": (1, 0), "weekly": (7, 0), "every week": (7, 0),
              "fortnightly": (14, 0), "monthly": (0, 1), "every month": (0, 1),
              "yearly": (0, 12), "annually": (0, 12), "every year": (0, 12),
              "quarterly": (0, 3), "every quarter": (0, 3)}
    if words in simple:
        days, months = simple[words]
        return _days(days) if days else _months(months)
    m = re.fullmatch(r"every (\d+) (day|week|month|year)s?", words)
    if m:
        n, unit = int(m.group(1)), m.group(2)
        if n < 1:
            raise Problem(f"A repeat steps forward; got '{rule}'.")
        if unit in ("day", "week"):
            return _days(n * (7 if unit == "week" else 1))
        return _months(n * (12 if unit == "year" else 1))
    m = re.fullmatch(r"(?:every|each|weekly on) (monday|tuesday|wednesday|thursday|friday|"
                     r"saturday|sunday)s?", words)
    if m:
        return _weekday(WEEKDAYS.index(m.group(1)))
    m = re.fullmatch(r"(?:monthly on the|on the|every month on the) (\d{1,2})(?:st|nd|rd|th)?"
                     r"(?: of (?:every|each) month)?", words)
    if m and 1 <= int(m.group(1)) <= 31:
        return _monthly_on(int(m.group(1)))
    raise Problem(f"Repeats is said like {REPEAT_WORDS}; got '{rule}'.")


def next_due(rule: str, last: date | None, today: date) -> date:
    """The next day a repeating task is due: one step on from its last due day (or from today
    when it had none), and past today, so a task done late doesn't come back overdue."""
    step = repeat_step(rule)
    day = step(last or today)
    while day <= today:
        day = step(day)
    return day


class Tasks:
    """The tasks table and what code owes it (see the module's words)."""

    def __init__(self, world: World) -> None:
        self.world = world
        self.store = world.store
        world.collections.hooks[TABLE] = self
        world.collections.on_remove.append(self._place_removed)

    # ---- the table ----

    def ensure(self) -> None:
        """The table, its fields and its first lists, made once; a field Alpha added later is
        added to a world that has the table already. Then the commitments, moved once."""
        cols = self.world.collections
        try:
            desc = cols.describe(TABLE)
        except Problem:
            cols.create(TABLE, "Tasks", FIELDS, title_field="title", world_own=True)
            for spec in LISTS:
                self.world.views.save(TABLE, spec["title"], spec["config"], source="alpha",
                                      default=bool(spec.get("default")))
        else:
            have = {f["name"] for f in desc["fields"]}
            missing = [f for f in FIELDS if f["name"] not in have]
            if missing:
                cols.add_fields(TABLE, missing)
            # a list added since the table was made (P3's Waiting for my yes), once
            kept = {v["title"] for v in self.world.views.for_table(TABLE)}
            for spec in LISTS:
                if spec["title"] not in kept and spec["title"] == "Waiting for my yes":
                    self.world.views.save(TABLE, spec["title"], spec["config"], source="alpha")
        self._move_commitments()
        self._drop_jobs()
        with self.store.tx() as db:  # Watson's write list says what it writes now
            db.execute("UPDATE agents SET may = replace(may, '\"commitments\"', '\"tasks\"')"
                       " WHERE may LIKE '%\"commitments\"%'")

    def _drop_jobs(self) -> None:
        """An agent's job is not a task (Q92, 19 Oct 2026): the jobs P2 made for the custom
        agents go, once, with their versions; a run that served one keeps its steps and serves
        none. The journal says so."""
        rows = self.store.all("SELECT id, \"values\" FROM records WHERE collection = ? AND"
                              " json_extract(provenance, '$.standing') IS NOT NULL", (TABLE,))
        if not rows:
            return
        with self.store.tx() as db:
            for r in rows:
                db.execute("DELETE FROM records WHERE collection = ? AND id = ?", (TABLE, r["id"]))
                db.execute("DELETE FROM record_versions WHERE collection = ? AND record_id = ?",
                           (TABLE, r["id"]))
                db.execute("DELETE FROM records_fts WHERE collection = ? AND record_id = ?",
                           (TABLE, r["id"]))
                db.execute("UPDATE runs SET task = NULL WHERE task = ?", (r["id"],))
        titles = "; ".join(str(loads(r["values"], {}).get("title") or r["id"])[:80] for r in rows)
        self.world.journal.append(
            "changed", f"An agent's own work is no longer a task; it shows on the agent's page."
            f" Removed from Tasks: {titles}.", actor="alpha",
            data={"collection": TABLE, "records": [r["id"] for r in rows]})

    def _move_commitments(self) -> None:
        """A world that kept commitments as rows (Q46, before 18 Oct 2026): each becomes a task
        once, its dates, state and sides kept, and the old table goes."""
        if not self.store.one("SELECT 1 FROM sqlite_master WHERE type = 'table'"
                              " AND name = 'commitments'"):
            return
        have = {r["name"] for r in self.store.all("PRAGMA table_info(commitments)")}
        watson = self.store.one("SELECT id FROM agents WHERE kind = 'watson' LIMIT 1")
        moved = 0
        with self.store.tx() as db:
            for c in db.execute("SELECT * FROM commitments").fetchall():
                remind_at = c["remind_at"] if "remind_at" in have else None
                values: dict[str, Any] = {
                    "title": c["what"],
                    "state": {"done": DONE, "lapsed": DROPPED}.get(c["state"], OPEN),
                    "owner": c["who"], "suggested": False,
                    "by": "alpha" if remind_at or not watson else watson["id"],
                }
                if c["due"]:
                    values["due"] = c["due"]
                if remind_at:
                    values["remind_at"] = remind_at
                if "reminded_at" in have and c["reminded_at"]:
                    values["reminded_at"] = c["reminded_at"]
                if c["to_whom"] and str(c["to_whom"]).startswith("entity:"):
                    values["about"] = [c["to_whom"]]
                prov = {"by": values["by"], "turn": c["source"],
                        "source": "a reminder you set" if remind_at else "from what you said"}
                rid = new_id("r")
                db.execute(
                    'INSERT INTO records (collection, id, revision, "values", provenance,'
                    " created_at, updated_at) VALUES (?,?,?,?,?,?,?)",
                    (TABLE, rid, 1, dumps(values), dumps(prov), c["created_at"],
                     c["updated_at"]))
                db.execute("INSERT INTO records_fts (collection, record_id, text)"
                           " VALUES (?,?,?)", (TABLE, rid, values["title"]))
                moved += 1
            db.execute("DROP INDEX IF EXISTS commitments_who")
            db.execute("DROP TABLE commitments")
        if moved:
            self.world.journal.append(
                "did", f"Moved {moved} commitment{'s' if moved != 1 else ''} and reminder"
                f"{'s' if moved != 1 else ''} into Tasks.", actor="alpha",
                data={"moved": moved, "into": TABLE})

    # ---- what code owes a task on every write ----

    def shape(self, values: dict[str, Any], before: dict[str, Any] | None,
              provenance: dict[str, Any]) -> dict[str, Any]:
        out = dict(values)
        out["title"] = " ".join(str(out.get("title") or "").split())
        if not out["title"]:
            raise Problem("A task says what is to be done (its title).")
        out.setdefault("state", OPEN)
        if not out.get("state"):
            out["state"] = OPEN
        owner = str(out.get("owner") or "person").strip()
        self._check_owner(owner)
        out["owner"] = owner
        if out.get("anchor"):
            out["anchor"] = self.check_anchor(str(out["anchor"]))
        if out.get("repeats"):
            repeat_step(str(out["repeats"]))  # a rule Alpha can't read is refused now
        if (before is not None and owner != before.get("owner") and out["state"] == WORKING
                and before.get("state") == WORKING and self._custom_agent(owner)):
            # assigning never starts the work (P2): Start does, or the person's Working after
            out["state"] = OPEN
        if before is None:
            # an agent's own writes carry it (`agent`, the tools' provenance in a run)
            by = str(out.get("by") or provenance.get("agent") or provenance.get("by")
                     or "alpha")
            out["by"] = by
            if by not in ("person", "alpha") and self._custom_agent(by):
                out["suggested"] = True  # an agent's run makes suggestions (Q91)
            out.setdefault("suggested", False)
        return out

    def changed(self, db: sqlite3.Connection, rid: str, before: dict[str, Any] | None,
                after: dict[str, Any]) -> None:
        """A repeating task done makes its next one, in the same transaction."""
        if before is None or before.get("state") in FINISHED or after.get("state") != DONE:
            return
        rule = after.get("repeats")
        if not rule:
            return
        today = datetime.now(UTC).astimezone().date()
        last = date.fromisoformat(after["due"]) if after.get("due") else None
        due = next_due(str(rule), last, today)
        nxt = {k: v for k, v in after.items() if k not in ("reminded_at",)}
        nxt.update({"state": OPEN, "due": due.isoformat(), "suggested": False})
        if after.get("remind_at") and last is not None:
            moment = datetime.fromisoformat(str(after["remind_at"]))
            nxt["remind_at"] = (moment + (due - last)).isoformat()
        else:
            nxt.pop("remind_at", None)
        nid = new_id("r")
        stamp = now()
        db.execute(
            'INSERT INTO records (collection, id, revision, "values", provenance, created_at,'
            " updated_at) VALUES (?,?,?,?,?,?,?)",
            (TABLE, nid, 1, dumps(nxt), dumps({"by": "alpha", "source": f"repeats ({rule})",
                                               "after": rid}), stamp, stamp))
        db.execute("INSERT INTO records_fts (collection, record_id, text) VALUES (?,?,?)",
                   (TABLE, nid, nxt["title"]))

    def _check_owner(self, owner: str) -> None:
        if owner == "person":
            return
        if owner.startswith("entity:"):
            self.world.entities.get(owner.split(":", 1)[1])
            return
        if not self.store.one("SELECT 1 FROM agents WHERE id = ?", (owner,)):
            raise Problem(f"A task's owner is 'person', an agent's id or entity:<id>; got"
                          f" '{owner}'.")

    def _custom_agent(self, actor: str) -> bool:
        row = self.store.one("SELECT kind FROM agents WHERE id = ?", (actor,))
        return bool(row and row["kind"] == "custom")

    # ---- places ----

    def check_anchor(self, address: str) -> str:
        """The address as kept, or a Problem saying what it names that doesn't exist."""
        text = address.strip()
        if not text.startswith("#"):
            text = "#" + text if text.startswith("/") else "#/" + text
        if not ADDRESS.match(text):
            raise Problem("A task's place is an address: #/m/<module>, #/m/<module>/<table>,"
                          " #/m/<module>/<table>/<record>[/<field>], #/m/<module>/~page/<name>"
                          f" or #/records/<table>/<record>[/<field>]; got '{address}'.")
        steps = self.place(text)  # raises when what it names isn't there
        return steps[-1]["address"] if steps else text

    def address(self, *, module: str | None = None, table: str | None = None,
                record: str | None = None, field: str | None = None,
                page: str | None = None) -> str:
        """The address of a place named the way the model and the window name things."""
        if table:
            desc = self.world.collections.describe(table)
            if field and field not in {f["name"] for f in desc["fields"]}:
                raise Problem(f"'{desc['title']}' has no field '{field}'.")
            if field and not record:
                raise Problem("A field's place names its record too.")
            if record:
                self.world.collections.get(table, record)
            head = f"#/m/{desc['module']}/{table}" if desc["module"] else f"#/records/{table}"
            if not desc["module"] and not record:
                raise Problem(f"'{desc['title']}' is in no module: name the record the task is"
                              " about.")
            return head + (f"/{record}" if record else "") + (f"/{field}" if field else "")
        if not module:
            raise Problem("Say where the task lives: a module, a table's record (and field), or"
                          " a module's page.")
        mid = self.world.modules.get(module)["id"]
        if page:
            if page not in self.world.pages.names(mid):
                raise Problem(f"The module has no page '{page}'.")
            return f"#/m/{mid}/~page/{page}"
        return f"#/m/{mid}"

    def place(self, address: str) -> list[dict[str, str]]:
        """What an address names, widest first: each step's kind, words and own address (the
        breadcrumb the task's page shows). A Problem when a step isn't there."""
        parts = address.removeprefix("#/").split("/")
        steps: list[dict[str, str]] = []
        if parts[0] == "m":
            module = self.world.modules.get(parts[1])
            here = f"#/m/{module['id']}"
            steps.append({"kind": "module", "words": module["name"], "address": here})
            rest = parts[2:]
            if rest and rest[0] == "~page":
                if len(rest) != 2 or rest[1] not in self.world.pages.names(module["id"]):
                    raise Problem(f"{module['name']} has no page '{'/'.join(rest[1:])}'.")
                title = next((p["title"] for p in self.world.pages.all(module["id"])
                              if p["name"] == rest[1]), rest[1])
                steps.append({"kind": "page", "words": title, "address": f"{here}/~page/{rest[1]}"})
                return steps
            table = rest[0] if rest else None
        else:
            here, rest, table = "#/records", parts[1:], parts[1]
        if not table:
            return steps
        desc = self.world.collections.describe(table)
        if parts[0] == "m" and desc["module"] != parts[1]:
            raise Problem(f"The table '{desc['title']}' isn't in that module.")
        here = f"{here}/{table}"
        steps.append({"kind": "table", "words": desc["title"], "address": here})
        if len(rest) < 2:
            return steps
        row = self.world.collections.get(table, rest[1])
        here = f"{here}/{rest[1]}"
        steps.append({"kind": "record", "words": str(row.get(desc["title_field"]) or rest[1]),
                      "address": here})
        if len(rest) > 2:
            field = next((f for f in desc["fields"] if f["name"] == rest[2]), None)
            if field is None:
                raise Problem(f"'{desc['title']}' has no field '{rest[2]}'.")
            steps.append({"kind": "field", "words": _label_of(field),
                          "address": f"{here}/{rest[2]}"})
        return steps

    def place_words(self, address: str | None) -> str | None:
        """The place in words ("RestoPros › Report values › Revenue"), or None when there is
        none or it is gone."""
        if not address:
            return None
        try:
            return " › ".join(s["words"] for s in self.place(address))
        except Problem:
            return None

    def who_words(self, ref: str | None) -> str | None:
        """An owner, a maker or a reference in words: you, an agent's name, a person's name, a
        row's title."""
        if not ref:
            return None
        if ref in ("person", "you"):
            return "You"
        if ref == "alpha":
            return "Alpha"
        if ref.startswith("entity:"):
            try:
                return str(self.world.entities.get(ref.split(":", 1)[1])["name"])
            except Problem:
                return None
        agent = self.store.one("SELECT name FROM agents WHERE id = ?", (ref,))
        if agent:
            return str(agent["name"])
        if "/" in ref:
            table, rid = ref.split("/", 1)
            try:
                desc = self.world.collections.describe(table)
                return str(self.world.collections.get(table, rid).get(desc["title_field"]) or rid)
            except Problem:
                return None
        return ref

    def words(self, row: dict[str, Any]) -> dict[str, Any]:
        """A task's references to things in words, for the window: its place, its owner, who
        made it, what it is about."""
        out: dict[str, Any] = {}
        place = self.place_words(row.get("anchor"))
        if place:
            out["anchor"] = place
        for key in ("owner", "by"):
            said = self.who_words(row.get(key))
            if said:
                out[key] = said
        refs = [w for w in (self.who_words(r) for r in row.get("about") or []) if w]
        if refs:
            out["about"] = refs
        return out

    def at(self, address: str, *, within: bool = True) -> list[dict[str, Any]]:
        """The tasks living at a place, and (within) at every place inside it, open first."""
        rows = self.store.all(
            "SELECT * FROM records WHERE collection = ? AND deleted_at IS NULL"
            " AND (json_extract(\"values\", '$.anchor') = ?"
            + (" OR substr(json_extract(\"values\", '$.anchor'), 1, ?) = ?" if within else "")
            + ")", (TABLE, address, *((len(address) + 1, address + "/") if within else ())))
        out = [record_view(r) for r in rows]
        return sorted(out, key=lambda t: (t.get("state") in FINISHED, t.get("due") or "9999",
                                          t["created_at"]))

    def _place_removed(self, db: sqlite3.Connection, table: str, rid: str) -> None:
        """A record removed takes the tasks living on it and its fields (the removal's card
        says so), inside the removal's own transaction."""
        if table == TABLE:
            return
        module = db.execute("SELECT module FROM collections WHERE name = ?", (table,)).fetchone()
        head = (f"#/m/{module['module']}/{table}/{rid}" if module and module["module"]
                else f"#/records/{table}/{rid}")
        self.remove_at(db, head)

    @staticmethod
    def remove_at(db: sqlite3.Connection, address: str, *, for_good: bool = False) -> int:
        """Inside a removal's transaction: the tasks living at a place or inside it go (for
        good with a module deleted for good, its own rows' way)."""
        rows = db.execute(
            "SELECT id FROM records WHERE collection = ? AND deleted_at IS NULL AND"
            " (json_extract(\"values\", '$.anchor') = ? OR"
            " substr(json_extract(\"values\", '$.anchor'), 1, ?) = ?)",
            (TABLE, address, len(address) + 1, address + "/")).fetchall()
        for r in rows:
            if for_good:
                db.execute("DELETE FROM records WHERE collection = ? AND id = ?", (TABLE, r["id"]))
                db.execute("DELETE FROM record_versions WHERE collection = ? AND record_id = ?",
                           (TABLE, r["id"]))
            else:
                db.execute("UPDATE records SET deleted_at = ? WHERE collection = ? AND id = ?",
                           (now(), TABLE, r["id"]))
            db.execute("DELETE FROM records_fts WHERE collection = ? AND record_id = ?",
                       (TABLE, r["id"]))
        return len(rows)

    def counted_at(self, address: str) -> int:
        """How many open tasks live at a place or inside it: what a removal's card names."""
        return sum(1 for t in self.at(address) if t.get("state") not in FINISHED)

    # ---- what is around a task (its page's "Around it", and what a turn about it sees) ----

    def around(self, tid: str) -> dict[str, Any]:
        task = self.get(tid)
        out: dict[str, Any] = {"task": tid, "where": [], "place": None, "parent": None,
                               "children": [], "blocked_by": [], "beside": [], "about": [],
                               "notes": None}
        anchor = task.get("anchor")
        if anchor:
            try:
                out["where"] = self.place(anchor)
            except Problem as e:
                out["where_gone"] = str(e)
        record_step = next((s for s in out["where"] if s["kind"] == "record"), None)
        if record_step:
            parts = record_step["address"].removeprefix("#/").split("/")
            table, rid = (parts[2], parts[3]) if parts[0] == "m" else (parts[1], parts[2])
            desc = self.world.collections.describe(table)
            row = self.world.collections.get(table, rid)
            prov = row.get("_provenance") or {}
            field = next((s["address"].rsplit("/", 1)[1] for s in out["where"]
                          if s["kind"] == "field"), None)
            values = []
            for f in desc["fields"]:
                if field and f["name"] != field:
                    continue
                v = row.get(f["name"])
                if v in (None, "", []):
                    continue
                source = ((prov.get("fields") or {}).get(f["name"]) or {}).get("source") \
                    or prov.get("source")
                values.append({"field": f["name"], "label": _label_of(f),
                               "value": v, "source": source,
                               "estimated": bool(prov.get("estimated")),
                               "kind": f["kind"], **({"unit": f["unit"]} if f.get("unit") else {})})
            out["place"] = {"table": table, "record": rid, "title": row.get(desc["title_field"]),
                            "values": values}
        if task.get("parent"):
            try:
                out["parent"] = self._brief(self.get(str(task["parent"])))
            except Problem:
                pass
        out["children"] = [self._brief(t) for t in self.children(tid)]
        for bid in task.get("blocked_by") or []:
            try:
                out["blocked_by"].append(self._brief(self.get(str(bid))))
            except Problem:
                continue
        if anchor:
            out["beside"] = [self._brief(t) for t in self.at(anchor, within=False)
                             if t["id"] != tid][:10]
        out["about"] = [{"ref": r, "words": self.who_words(r)}
                        for r in task.get("about") or [] if self.who_words(r)]
        module_step = next((s for s in out["where"] if s["kind"] == "module"), None)
        if module_step:
            note = self.world.knowledge.find_note(f"module:{module_step['words']}",
                                                  module_step["words"])
            if note and note.get("body"):
                out["notes"] = str(note["body"])[:1500]
        return out

    def around_text(self, tid: str) -> str:
        """The same as the task's page shows, as lines for a turn or a run about the task."""
        a = self.around(tid)
        task = self.get(tid)
        lines = [f"The task: {task['title']} ({task.get('state')}"
                 + (f", due {task['due']}" if task.get("due") else "") + f"; id {tid})."]
        if a["where"]:
            lines.append("Where it lives: " + " › ".join(s["words"] for s in a["where"])
                         + f" ({a['where'][-1]['address']}).")
        if a["place"]:
            lines += [f"- {v['label']}: {v['value']}" + (f" (from {v['source']})"
                                                         if v.get("source") else "")
                      for v in a["place"]["values"][:20]]
        for key, words in (("parent", "Part of"), ("children", "Under it"),
                           ("blocked_by", "Blocked by"), ("beside", "Beside it")):
            items = a[key] if isinstance(a[key], list) else [a[key]] if a[key] else []
            if items:
                lines.append(f"{words}: " + "; ".join(f"{t['title']} ({t['state']})"
                                                      for t in items))
        if a["about"]:
            lines.append("About: " + ", ".join(str(x["words"]) for x in a["about"]))
        if a["notes"]:
            lines.append("The module's notes:\n" + a["notes"])
        return "\n".join(lines)

    @staticmethod
    def _brief(t: dict[str, Any]) -> dict[str, Any]:
        return {"id": t["id"], "title": t.get("title"), "state": t.get("state"),
                "due": t.get("due")}

    # ---- runs serve tasks (P2, 18 Oct 2026) ----

    def run_started(self, tid: str, agent_id: str) -> None:
        """A run began serving the task: it is Working while the run goes."""
        if self.get(tid).get("state") != WORKING:
            self._set(tid, {"state": WORKING}, by=agent_id)

    def run_ended(self, tid: str, agent_id: str, verdict: str) -> None:
        """The run serving the task ended. A task is Done only when its agent said so in the
        run (Q93); what the run said of the task stands (found 19 Oct: a run that blocked the
        task, and succeeded, left it Done). One it left Working is Blocked, or Open when the
        person stopped the run: a run that answered is not a task done."""
        if self.get(tid).get("state") != WORKING:
            return
        self._set(tid, {"state": OPEN if verdict == "stopped" else BLOCKED}, by=agent_id)

    def waiting_to_start(self) -> list[dict[str, Any]]:
        """Tasks an agent owns that the person (or Alpha) moved to Working and no run has taken
        since: the scheduler starts them."""
        out = []
        for t in self._open_rows(" AND json_extract(\"values\", '$.state') = ?", (WORKING,)):
            owner = str(t.get("owner") or "")
            if not self._custom_agent(owner):
                continue
            last = self.store.one("SELECT started_at, ended_at FROM runs WHERE task = ?"
                                  " ORDER BY started_at DESC LIMIT 1", (t["id"],))
            if last is None or (last["ended_at"] and last["started_at"] < t["updated_at"]):
                out.append(t)
        return out

    @staticmethod
    def release_agent(db: sqlite3.Connection, agent_id: str) -> int:
        """Inside an agent's removal: what the person gave it comes back to them, Open."""
        n = 0
        for r in db.execute(
            "SELECT id, \"values\" FROM records WHERE collection = ? AND deleted_at IS NULL AND"
            " json_extract(\"values\", '$.owner') = ?", (TABLE, agent_id)).fetchall():
            values = loads(r["values"], {})
            values["owner"] = "person"
            if values.get("state") == WORKING:
                values["state"] = OPEN
            db.execute("UPDATE records SET \"values\" = ? WHERE collection = ? AND id = ?",
                       (dumps(values), TABLE, r["id"]))
            n += 1
        return n

    # ---- reading ----

    def get(self, tid: str) -> dict[str, Any]:
        return self.world.collections.get(TABLE, tid)

    def children(self, tid: str) -> list[dict[str, Any]]:
        return [record_view(r) for r in self.store.all(
            "SELECT * FROM records WHERE collection = ? AND deleted_at IS NULL AND"
            " json_extract(\"values\", '$.parent') = ? ORDER BY created_at", (TABLE, tid))]

    def _open_rows(self, extra: str = "", args: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        rows = self.store.all(
            "SELECT * FROM records WHERE collection = ? AND deleted_at IS NULL AND"
            " json_extract(\"values\", '$.state') NOT IN (?, ?)" + extra, (TABLE, *FINISHED, *args))
        return [record_view(r) for r in rows]

    def of(self, who: str, *, finished: bool = False) -> list[dict[str, Any]]:
        """One side's tasks: what they own and what is about them, soonest due first."""
        rows = self.store.all(
            "SELECT * FROM records WHERE collection = ? AND deleted_at IS NULL AND"
            " (json_extract(\"values\", '$.owner') = ? OR EXISTS (SELECT 1 FROM"
            " json_each(json_extract(\"values\", '$.about')) WHERE value = ?))",
            (TABLE, who, who))
        out = [record_view(r) for r in rows]
        if not finished:
            out = [t for t in out if t.get("state") not in FINISHED]
        return sorted(out, key=lambda t: (t.get("state") in FINISHED, t.get("due") or "9999",
                                          t["created_at"]))

    def due_within(self, days: int) -> list[dict[str, Any]]:
        """Open tasks due within `days` from today (local), soonest first."""
        until = (datetime.now(UTC).astimezone().date() + timedelta(days=days)).isoformat()
        rows = [t for t in self._open_rows() if t.get("due") and t["due"] <= until
                and not t.get("suggested")]
        return sorted(rows, key=lambda t: (t["due"], t["created_at"]))

    def due_now(self, at: datetime | None = None) -> list[dict[str, Any]]:
        """Open reminders whose moment has come and whose card is not yet put."""
        moment = (at or datetime.now(UTC)).astimezone(UTC)
        due = []
        for t in self._open_rows(" AND json_extract(\"values\", '$.remind_at') IS NOT NULL"
                                 " AND json_extract(\"values\", '$.reminded_at') IS NULL"):
            when = datetime.fromisoformat(str(t["remind_at"]))
            if when.tzinfo is None:
                when = when.astimezone()
            if when.astimezone(UTC) <= moment:
                due.append(t)
        return sorted(due, key=lambda t: str(t["remind_at"]))

    def all(self, limit: int = 200) -> list[dict[str, Any]]:
        rows = [record_view(r) for r in self.store.all(
            "SELECT * FROM records WHERE collection = ? AND deleted_at IS NULL"
            " ORDER BY created_at DESC LIMIT ?", (TABLE, limit))]
        return sorted(rows, key=lambda t: (t.get("state") in FINISHED, t.get("due") or "9999"))

    def made_in(self, turn: str) -> int:
        """How many tasks a turn made (Watson's folded line counts them)."""
        row = self.store.one(
            "SELECT COUNT(*) AS n FROM records WHERE collection = ? AND"
            " json_extract(provenance, '$.turn') = ?", (TABLE, turn))
        return int(row["n"]) if row else 0

    # ---- writing (what the world's own code makes; the model and the window write the table
    # as any table, through the hook) ----

    def make(self, title: str, *, by: str = "alpha", turn: str | None = None,
             source: str | None = None, **values: Any) -> dict[str, Any]:
        row = {"title": title, **{k: v for k, v in values.items() if v not in (None, "", [])}}
        prov: dict[str, Any] = {"by": by, "turn": turn, "source": source or "stated",
                                "estimated": False}
        return self.world.collections.add(TABLE, {**row, "by": by}, prov)

    def record(self, who: str, what: str, *, to_whom: str | None = None,
               due: str | None = None, source: str | None = None,
               by: str = "alpha") -> dict[str, Any]:
        """What the person said they will do, or someone owes them (Watson files these from
        what was said, Q46, Q91): a task at once, the same open one never twice."""
        what = " ".join(what.split())
        if not what:
            raise Problem("A task says what is to be done.")
        if not (who == "person" or who.startswith("entity:")):
            raise Problem("A promise is the person's or someone's (entity:<id>).")
        if due:
            try:
                due = datetime.fromisoformat(due).date().isoformat()
            except ValueError as e:
                raise Problem(f"A task's due date is a day (YYYY-MM-DD), not {due!r}.") from e
        for t in self.of(who):
            if t.get("owner") == who and str(t.get("title", "")).lower() == what.lower():
                return t
        refs = [to_whom] if to_whom and to_whom.startswith("entity:") else None
        return self.make(what, by=by, turn=source, source="from what you said", owner=who,
                         due=due, about=refs)

    def remind(self, what: str, at: str, *, source: str | None = None,
               anchor: str | None = None) -> dict[str, Any]:
        """A reminder: the person's own task with the moment to be reminded at (local time as
        given, kept in UTC)."""
        try:
            moment = datetime.fromisoformat(at)
        except ValueError as e:
            raise Problem(f"A reminder's time is a date and time (2026-10-24T09:00), not {at!r}."
                          ) from e
        if moment.tzinfo is None:
            moment = moment.astimezone()
        stamp = moment.astimezone(UTC).replace(microsecond=0).isoformat()
        what = " ".join(what.split())
        same = next((t for t in self.of("person") if t.get("owner") == "person"
                     and str(t.get("title", "")).lower() == what.lower()), None)
        if same is None:
            return self.make(what, turn=source, source="a reminder you set", owner="person",
                             due=moment.date().isoformat(), remind_at=stamp, anchor=anchor)
        return self._set(same["id"], {"remind_at": stamp, "reminded_at": None,
                                      "due": moment.date().isoformat()})

    def reminded(self, tid: str) -> None:
        self._set(tid, {"reminded_at": now()})

    def snooze(self, tid: str, to: datetime) -> dict[str, Any]:
        """The reminder again at `to` (the same time tomorrow, say)."""
        stamp = to.astimezone(UTC).replace(microsecond=0).isoformat()
        return self._set(tid, {"remind_at": stamp, "reminded_at": None,
                               "due": to.astimezone().date().isoformat()})

    def set_state(self, tid: str, state: str, *, by: str = "person") -> dict[str, Any]:
        chosen = next((s for s in STATES if s.lower() == state.strip().lower()), None)
        if chosen is None:
            raise Problem(f"A task's state is one of {', '.join(STATES)}.")
        return self._set(tid, {"state": chosen}, by=by)

    def _set(self, tid: str, values: dict[str, Any], *, by: str = "alpha") -> dict[str, Any]:
        current = self.get(tid)
        prov = dict(current.get("_provenance") or {})
        prov["by"] = by
        return self.world.collections.update(TABLE, tid, values, int(current["revision"]), prov)

    @staticmethod
    def remove_who(db: sqlite3.Connection, who: str) -> int:
        """Inside a removal's transaction: what someone owned goes with them, and they leave
        what the rest are about."""
        gone = 0
        for r in db.execute(
            "SELECT id, \"values\" FROM records WHERE collection = ? AND deleted_at IS NULL AND"
            " (json_extract(\"values\", '$.owner') = ? OR EXISTS (SELECT 1 FROM"
            " json_each(json_extract(\"values\", '$.about')) WHERE value = ?))",
            (TABLE, who, who)).fetchall():
            values = loads(r["values"], {})
            if values.get("owner") == who:
                db.execute("DELETE FROM records WHERE collection = ? AND id = ?", (TABLE, r["id"]))
                db.execute("DELETE FROM record_versions WHERE collection = ? AND record_id = ?",
                           (TABLE, r["id"]))
                db.execute("DELETE FROM records_fts WHERE collection = ? AND record_id = ?",
                           (TABLE, r["id"]))
                gone += 1
                continue
            values["about"] = [x for x in values.get("about") or [] if x != who]
            db.execute("UPDATE records SET \"values\" = ? WHERE collection = ? AND id = ?",
                       (dumps(values), TABLE, r["id"]))
        return gone
