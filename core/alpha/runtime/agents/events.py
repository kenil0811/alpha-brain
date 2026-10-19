"""Agents that wake on events (P7 of provenance-documents-triggers-proposal.md, Q96; 19 Oct
2026): a custom agent's `on:` lines, beside its schedule or instead of it.

The kinds of line:
- `{"rows_added": table}`: a row added to the table;
- `{"rows_changed": table, "fields": [...]}`: a row of it changed (only those fields, when
  named);
- `{"document_filed": module}`: a document kept in the module;
- `{"card_decided": "mine"}`: the person decided one of its own drafts or staged writes;
- `{"before_event": minutes, "matching": words}`: a calendar event whose title holds the words,
  that many minutes before it starts.

The look is code, by data, never by words: on the scheduler's tick it reads the store past the
agent's marks (rows by their place in `records`, changes by the old values every change keeps in
`record_versions`, documents by their place in `documents`, its decided cards it hasn't heard
of, the calendar between now and the lead time) and puts what matched in front of one run as
its work; the marks move once the run is over. No loops: what the agent's own runs wrote never
wakes it (a row carries the agent that wrote it, or the turn in the agent's own thread), and
each agent runs once per tick, so a chain (Intake files a document, Extractor wakes on it) is
one run per agent. A line naming a table or module that was removed says so on the agent's
page and never fires.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

from alpha.connectors.calendar import Calendar
from alpha.runtime.agents import Work, journal_rowid, register
from alpha.world.agents import marks_now
from alpha.world.store import Problem, loads
from alpha.world.world import World

KINDS = ("rows_added", "rows_changed", "document_filed", "card_decided", "before_event")
SHAPES = ('{"rows_added": table}, {"rows_changed": table, "fields": [...]}, {"document_filed":'
          ' module}, {"card_decided": "mine"}, or {"before_event": minutes, "matching": words}')
# the most rows a run is shown by name; the rest are counted
NAMED = 10


def check_lines(world: World, lines: list[Any] | None) -> list[dict[str, Any]]:
    """`on:` lines as they are kept: each one kind, naming what is there (the agent's page
    words them from the store). Raises Problem in plain words for a line that doesn't hold."""
    out: list[dict[str, Any]] = []
    for raw in lines or []:
        if not isinstance(raw, dict):
            raise Problem(f"An on: line is one of {SHAPES}.")
        kinds = [k for k in KINDS if k in raw]
        if len(kinds) != 1:
            raise Problem(f"An on: line is one of {SHAPES}; got {json.dumps(raw)[:120]}.")
        kind = kinds[0]
        if kind in ("rows_added", "rows_changed"):
            desc = world.collections.describe(str(raw[kind]))
            line: dict[str, Any] = {kind: desc["name"]}
            if kind == "rows_changed":
                names = [f["name"] for f in desc["fields"]]
                fields = [str(f) for f in raw.get("fields") or []]
                bad = [f for f in fields if f not in names]
                if bad:
                    raise Problem(f"{desc['title']} has no field {bad[0]!r}; its fields are"
                                  f" {', '.join(names)}.")
                if fields:
                    line["fields"] = fields
        elif kind == "document_filed":
            module = world.modules.get(str(raw[kind]))
            line = {kind: module["id"]}
        elif kind == "card_decided":
            if raw[kind] != "mine":
                raise Problem('card_decided is "mine": the agent wakes when you decide one of'
                              " its own drafts or staged writes.")
            line = {kind: "mine"}
        else:
            try:
                minutes = int(raw[kind])
            except (TypeError, ValueError):
                minutes = 0
            words = " ".join(str(raw.get("matching") or "").split())
            if minutes <= 0 or not words:
                raise Problem("before_event needs minutes (more than 0) and matching: the words"
                              " an event's title holds.")
            line = {kind: minutes, "matching": words}
        out.append(line)
    return out


def _own(world: World, agent: dict[str, Any], prov: dict[str, Any]) -> bool:
    """Whether the agent's own run wrote it: its id on the row, or the turn in its thread."""
    if prov.get("agent") == agent["id"]:
        return True
    turn = prov.get("turn")
    return bool(turn and agent.get("thread") and world.store.one(
        "SELECT 1 FROM journal WHERE id = ? AND thread = ?", (turn, agent["thread"])))


def _title(world: World, table: str, values: dict[str, Any]) -> str:
    try:
        field = world.collections.describe(table).get("title_field")
    except Problem:
        field = None
    named = values.get(str(field)) if field else None
    return str(named or next((v for v in values.values() if v), "a row"))[:80]


def _named(things: list[str]) -> str:
    shown = ", ".join(things[:NAMED])
    return shown + (f" and {len(things) - NAMED} more" if len(things) > NAMED else "")


def _added(world: World, agent: dict[str, Any], table: str,
           since: int) -> tuple[list[str], int]:
    rows = world.store.all(
        "SELECT rowid AS n, \"values\", provenance FROM records WHERE collection = ? AND"
        " rowid > ? AND deleted_at IS NULL ORDER BY rowid", (table, since))
    found = [_title(world, table, loads(r["values"], {})) for r in rows
             if not _own(world, agent, loads(r["provenance"], {}))]
    return found, max([since, *(int(r["n"]) for r in rows)])


def _changed(world: World, agent: dict[str, Any], table: str, fields: list[str] | None,
             since: int) -> tuple[list[str], int]:
    """Rows of the table changed past the mark: the oldest values kept since then against the
    row as it is now; a row the agent's own run changed last is its own."""
    versions = world.store.all(
        "SELECT rowid AS n, record_id, \"values\" FROM record_versions WHERE collection = ?"
        " AND rowid > ? ORDER BY rowid", (table, since))
    upto = max([since, *(int(v["n"]) for v in versions)])
    before: dict[str, dict[str, Any]] = {}
    for v in versions:
        before.setdefault(str(v["record_id"]), loads(v["values"], {}))
    found: list[str] = []
    for rid, old in before.items():
        row = world.store.one(
            "SELECT \"values\", provenance FROM records WHERE collection = ? AND id = ? AND"
            " deleted_at IS NULL", (table, rid))
        if row is None or _own(world, agent, loads(row["provenance"], {})):
            continue
        now_values = loads(row["values"], {})
        moved = [k for k in {*old, *now_values} if old.get(k) != now_values.get(k)]
        if fields:
            moved = [k for k in moved if k in fields]
        if moved:
            found.append(f"{_title(world, table, now_values)} ({', '.join(sorted(moved))})")
    return found, upto


def _filed(world: World, agent: dict[str, Any], module: str,
           since: int) -> tuple[list[str], int]:
    rows = world.store.all(
        "SELECT rowid AS n, id, title FROM documents WHERE rowid > ? AND module = ? AND"
        " removed_at IS NULL ORDER BY rowid", (since, module))
    found = []
    for r in rows:
        mine = world.store.one(
            "SELECT 1 FROM staged WHERE drafter = ? AND json_extract(landed, '$.document') = ?",
            (agent["id"], r["id"])) or world.store.one(
            "SELECT 1 FROM journal WHERE actor = ? AND json_extract(data, '$.document') = ?",
            (agent["id"], r["id"]))
        if not mine:
            found.append(f"{r['title']} ({r['id']})")
    return found, max([since, *(int(r["n"]) for r in rows)])


def _decided(world: World, agent: dict[str, Any]) -> list[str]:
    """Its drafts the person decided that no run of it has heard of yet."""
    return [f"{c['text'][:120]}: {c['state']}" for c in world.cards.decided_for(agent["id"])
            if c["state"] not in ("withdrawn", "allowed")]  # an Always isn't a decision now


def _coming(world: World, minutes: int, matching: str, fired: dict[str, str],
            moment: datetime) -> list[tuple[str, str, str]]:
    """Events whose title holds the words and that start within the lead time, not yet
    fired: (id, title, start)."""
    found = []
    for e in Calendar(world).between(moment.isoformat(),
                                     (moment + timedelta(minutes=minutes)).isoformat()):
        try:
            starts = datetime.fromisoformat(str(e["starts_at"]))
        except ValueError:
            continue
        if starts.tzinfo is None:
            starts = starts.replace(tzinfo=UTC)
        if moment <= starts <= moment + timedelta(minutes=minutes) and e["id"] not in fired \
                and matching.lower() in str(e["title"]).lower():
            found.append((str(e["id"]), str(e["title"]), starts.isoformat()))
    return found


def look(world: World, agent: dict[str, Any], *, at: datetime | None = None) -> Work | None:
    """What happened since the agent's marks that its `on:` lines wake it for. None when it
    has no lines. Work with no `about` when nothing matched (the marks move without a run);
    else `about` holds the lines for the run (`events`) and the marks to keep after it."""
    lines = [e for e in agent.get("events") or [] if not e.get("gone")]
    if not lines:
        return None
    moment = (at or datetime.now(UTC)).astimezone(UTC)
    marks = dict(agent.get("wake_marks") or {})
    if not {"records", "versions", "documents"} <= marks.keys():
        with world.store.tx() as db:
            marks = {**marks_now(db), "fired": dict(marks.get("fired") or {})}
    fired: dict[str, str] = {k: v for k, v in dict(marks.get("fired") or {}).items()
                             if v >= (moment - timedelta(days=1)).isoformat()}
    said: list[str] = []
    upto = dict(marks)
    for line in lines:
        if "rows_added" in line:
            found, upto["records"] = _added(world, agent, line["rows_added"], marks["records"])
            if found:
                title = world.collections.describe(line["rows_added"])["title"]
                said.append(f"{len(found)} row(s) added to {title}: {_named(found)}")
        elif "rows_changed" in line:
            found, upto["versions"] = _changed(world, agent, line["rows_changed"],
                                               line.get("fields"), marks["versions"])
            if found:
                title = world.collections.describe(line["rows_changed"])["title"]
                said.append(f"{len(found)} row(s) changed in {title}: {_named(found)}")
        elif "document_filed" in line:
            found, upto["documents"] = _filed(world, agent, line["document_filed"],
                                              marks["documents"])
            if found:
                said.append(f"{len(found)} document(s) filed in"
                            f" {world.modules.get(line['document_filed'])['name']}:"
                            f" {_named(found)}")
        elif "card_decided" in line:
            found = _decided(world, agent)
            if found:
                said.append(f"You decided {len(found)} of its cards: {_named(found)}")
        elif "before_event" in line:
            coming = _coming(world, int(line["before_event"]), str(line["matching"]), fired,
                             moment)
            for eid, title, starts in coming:
                fired[eid] = starts
                said.append(f"{title} starts at {starts} (within {line['before_event']}"
                            " minutes)")
    upto["fired"] = fired
    if not said:
        if upto != marks:
            world.agents.set_marks(agent["id"], upto)
        return Work(upto=journal_rowid(world))
    return Work(upto=journal_rowid(world), about={"events": said, "marks": upto})


def front(work: Work | None) -> str | None:
    """What woke the run, in front of it: "Since your last run: 3 row(s) added to Deals: …"."""
    if work is None or not work.about.get("events"):
        return None
    return "Since your last run:\n" + "\n".join(f"- {e}" for e in work.about["events"])


def ran(world: World, agent_id: str, work: Work | None) -> None:
    """Once its run is over, the marks move past what it was woken for."""
    if work is not None and isinstance(work.about.get("marks"), dict):
        world.agents.set_marks(agent_id, work.about["marks"])


register("custom", look)
