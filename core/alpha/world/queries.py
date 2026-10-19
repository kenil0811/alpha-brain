"""The world as SQL the model reads (harness design §4, §5; slice 2b, 17 October 2026).

`world_query` lets the model write its own reads over the person's world, across tables (Kenil,
17 Oct). Every query runs on a read-only connection (SQLite's `mode=ro`: a write is refused by
the database, not by a check of ours) with a view per table of the person's (`rows_<table>`,
its JSON values as columns) and a view per kind of thing the world keeps (`journal`, `facts`,
`people`, `organisations` and `interactions` (P8), `goals`, `notes`, `agents`, `runs`,
`actions`, `documents`, `events`, `modules`, `threads`, `decisions`, `sources`, `tables`; the
person's tasks as `tasks`). Rows are
capped and long queries are stopped, both said in the result, never silently.
"""

from __future__ import annotations

import re
import sqlite3
from pathlib import Path
from typing import Any

from alpha.config import settings
from alpha.world.store import Problem, loads
from alpha.world.tasks import TABLE as TASKS

MOST_ROWS = settings.views.query_rows
MOST_STEPS = settings.views.query_steps
READS = re.compile(r"^\s*(select|with)\b", re.I)
WRITES = re.compile(r"\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|"
                    r"vacuum|reindex)\b", re.I)
# The world's own tables the model may read as they are, and the columns too long or too
# internal to carry (a document's text is read with world_file; a journal line's data is JSON).
SHOWN = {
    "journal": "id, at, kind, actor, text, module, thread, entity_ids, source, data",
    "facts": "*", "entities": None, "goals": "*", "notes": "*", "agents": "*", "runs": "*",
    "actions": "*", "documents": "id, module, path, name, title, size, kind, origin,"
                                 " created_at, updated_at, deleted_at",
    "events": "*", "modules": "*", "threads": "*", "decisions": "*",
    "sources": "*", "collections": "name, module, title, title_field, created_at, updated_at",
    "connections": "*", "record_versions": "*", "preferences": "*", "skill_state": "*",
}
ALIASES = {"collections": "tables"}


def _columns(db: sqlite3.Connection, table: str) -> list[str]:
    return [str(r[1]) for r in db.execute(f"PRAGMA table_info({table})")]


def _views(db: sqlite3.Connection) -> list[str]:
    """Make the views on a connection; return their names with their columns for the words."""
    made: list[str] = []
    have = {str(r[0]) for r in db.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    for table, cols in SHOWN.items():
        if table not in have:
            continue
        name = ALIASES.get(table, table)
        if table == "entities":
            made.extend(_people_views(db))
            continue
        chosen = _columns(db, table) if cols == "*" else [c.strip() for c in str(cols).split(",")]
        chosen = [c for c in chosen if c in _columns(db, table)]
        if name != table:
            db.execute(f"CREATE TEMP VIEW {name} AS SELECT {', '.join(chosen)} FROM {table}")
        made.append(f"{name}({', '.join(chosen)})")
    for row in db.execute("SELECT name, schema FROM collections").fetchall():
        fields = [f["name"] for f in (loads(row[1], {}) or {}).get("fields", [])
                  if isinstance(f, dict)
                  and re.fullmatch(r"[a-z][a-z0-9_]*", str(f.get("name", "")))]
        view = f"rows_{row[0]}"
        if not re.fullmatch(r"[a-z][a-z0-9_]*", str(row[0])):
            continue
        # quoted, so a field named like a word of SQL ("order", "group") still reads
        picks = ", ".join(f"json_extract(\"values\", '$.{f}') AS \"{f}\"" for f in fields)
        db.execute(
            f"CREATE TEMP VIEW {view} AS SELECT id{', ' + picks if picks else ''}, revision,"
            f" created_at, updated_at, reader, seen_at, gone_at, provenance FROM records"
            f" WHERE collection = '{row[0]}' AND deleted_at IS NULL")
        made.append(f"{view}(id, {', '.join(fields)}, revision, created_at, updated_at,"
                    " reader, seen_at, gone_at, provenance)")
        if row[0] == TASKS:
            # the person's tasks read as `tasks`, whatever tables they keep themselves
            db.execute(f"CREATE TEMP VIEW tasks AS SELECT * FROM {view}")
            made.append(f"tasks(id, {', '.join(fields)}, created_at, updated_at): the tasks")
    return made


# who started an interaction, from a direction field's words (P8)
YOU = ("sent", "out", "outgoing", "outbound", "to", "me", "you")
THEM = ("received", "in", "incoming", "inbound", "from", "them")


def _quoted(text: str) -> str:
    return "'" + str(text).replace("'", "''") + "'"


def _people_views(db: sqlite3.Connection) -> list[str]:
    """People, organisations and their interactions as the model and the window read them
    (P8, Q97; 19 Oct 2026). Merges are followed (`entity_root`: every entity and the one it
    ended up in), so a person merged from two sources is one row with both. Interactions are
    the meetings the person was at and the rows of every table that says its rows are
    interactions; last contact and the last 90 days are counted from them, in plain numbers."""
    db.execute("CREATE TEMP VIEW entity_root AS WITH RECURSIVE r(id, root) AS (SELECT id, id"
               " FROM entities WHERE merged_into IS NULL UNION ALL SELECT e.id, r.root FROM"
               " entities e JOIN r ON e.merged_into = r.id) SELECT id, root FROM r")
    parts = ["SELECT er.root AS person, ev.starts_at AS at, 'meeting' AS channel, ev.title AS"
             " title, NULL AS started_by, 'event:' || ev.id AS ref FROM events ev,"
             " json_each(ev.attendees) a JOIN entity_root er ON er.id ="
             " json_extract(a.value, '$.entity_id') WHERE ev.removed_at IS NULL"]
    name_ok = re.compile(r"[a-z][a-z0-9_]*")
    for row in db.execute("SELECT name, title, title_field, schema FROM collections").fetchall():
        identity = (loads(row[3], {}) or {}).get("identity") or {}
        date, direction = identity.get("date"), identity.get("direction")
        if identity.get("rows_are") != "interaction" or not date \
                or not name_ok.fullmatch(str(row[0])) or not name_ok.fullmatch(str(date)):
            continue
        said = (f"CASE WHEN lower(json_extract(r.\"values\", '$.{direction}')) IN"
                f" ({', '.join(map(_quoted, YOU))}) THEN 'you' WHEN"
                f" lower(json_extract(r.\"values\", '$.{direction}')) IN"
                f" ({', '.join(map(_quoted, THEM))}) THEN 'them' END"
                if direction and name_ok.fullmatch(str(direction)) else "NULL")
        title = (f"json_extract(r.\"values\", '$.{row[2]}')"
                 if row[2] and name_ok.fullmatch(str(row[2])) else "NULL")
        parts.append(
            f"SELECT er.root, json_extract(r.\"values\", '$.{date}'), {_quoted(row[1])},"
            f" {title}, {said}, 'record:{row[0]}/' || r.id FROM records r JOIN entity_root er"
            f" ON er.id = r.entity_id WHERE r.collection = {_quoted(row[0])} AND"
            " r.deleted_at IS NULL")
    db.execute("CREATE TEMP VIEW interactions AS " + " UNION ALL ".join(parts))
    now = "strftime('%Y-%m-%dT%H:%M:%S', 'now')"

    def keys(kind: str) -> str:
        return (f"(SELECT group_concat(k.value, ', ') FROM entity_keys k JOIN entity_root kr ON"
                f" kr.id = k.entity_id WHERE kr.root = e.id AND k.key = '{kind}')")

    # distinct first, then joined with ", " (group_concat(DISTINCT …) takes no separator)
    sources = ("(SELECT group_concat(source, ', ') FROM (SELECT DISTINCT s.source FROM"
               " entity_sources s JOIN entity_root sr ON sr.id = s.entity_id WHERE sr.root ="
               " e.id))")
    db.execute(
        f"CREATE TEMP VIEW people AS SELECT e.id, e.canonical AS name, {keys('email')} AS"
        f" emails, {keys('phone')} AS phones, {keys('url')} AS profiles, (SELECT"
        " group_concat(name, ', ') FROM (SELECT DISTINCT o.canonical AS name FROM entity_links l"
        " JOIN entity_root pr ON pr.id = l.entity JOIN entity_root orr ON orr.id = l.other JOIN"
        " entities o ON o.id = orr.root WHERE pr.root = e.id AND l.kind = 'member_of' AND"
        " l.ended_at IS NULL)) AS"
        f" organisations, {sources} AS sources, (SELECT MAX(i.at) FROM interactions i WHERE"
        f" i.person = e.id AND i.at <= {now}) AS last_contact, (SELECT COUNT(*) FROM"
        " interactions i WHERE i.person = e.id AND i.at >= date('now', '-90 days') AND i.at <="
        f" {now}) AS in_90_days, e.created_at, e.updated_at FROM entities e WHERE"
        " e.merged_into IS NULL AND e.kind = 'person'")
    db.execute(
        f"CREATE TEMP VIEW organisations AS SELECT e.id, e.canonical AS name, {keys('domain')}"
        " AS domains, (SELECT COUNT(DISTINCT pr.root) FROM entity_links l JOIN entity_root orr"
        " ON orr.id = l.other JOIN entity_root pr ON pr.id = l.entity WHERE orr.root = e.id AND"
        f" l.kind = 'member_of' AND l.ended_at IS NULL) AS people, {sources} AS sources,"
        " e.created_at, e.updated_at FROM entities e WHERE e.merged_into IS NULL AND e.kind ="
        " 'organisation'")
    return ["people(id, name, emails, phones, profiles, organisations, sources, last_contact,"
            " in_90_days, created_at, updated_at): everyone, merged across sources",
            "organisations(id, name, domains, people, sources, created_at, updated_at)",
            "interactions(person, at, channel, title, started_by, ref): meetings and the rows"
            " of tables whose rows are interactions, each with the person it was with",
            "entity_root(id, root): every person or organisation and the one it was merged"
            " into"]


def read(world_path: Path | str, sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    """Code's own read over the same views (the window's People list and a person's page use
    them, so the model and the window count the same way)."""
    db = sqlite3.connect(f"file:{Path(world_path)}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    try:
        _views(db)
        return [dict(r) for r in db.execute(sql, params).fetchall()]
    finally:
        db.close()


def views_text(world_path: Path | str) -> str:
    """The views and their columns, one line each: what `world_query` can read."""
    db = sqlite3.connect(f"file:{Path(world_path)}?mode=ro", uri=True)
    try:
        return "\n".join(_views(db))
    finally:
        db.close()


def query(world_path: Path | str, sql: str, *, limit: int = MOST_ROWS,
          offset: int = 0) -> dict[str, Any]:
    """Run one read over the world; the columns, the rows from `offset` (at most `limit`), the
    `total` the query has (A5: the model can tell a whole answer from a page of one), and the
    views the query could use when it names none that exists."""
    text = (sql or "").strip().rstrip(";")
    if not READS.match(text) or WRITES.search(re.sub(r"'[^']*'", "''", text)):
        raise Problem("world_query reads: one SELECT (or WITH … SELECT); it cannot change the"
                      " world. To write rows use world_write; to make a table, world_shape.")
    db = sqlite3.connect(f"file:{Path(world_path)}?mode=ro", uri=True)
    db.row_factory = sqlite3.Row
    steps = [0]

    def watch() -> int:
        steps[0] += 1
        return 1 if steps[0] > MOST_STEPS else 0

    db.set_progress_handler(watch, 10_000)
    try:
        views = _views(db)
        start = max(0, int(offset))
        try:
            cur = db.execute(f"SELECT * FROM ({text}) LIMIT ? OFFSET ?", (int(limit), start))
            rows = cur.fetchall()
            total = int(db.execute(f"SELECT COUNT(*) FROM ({text})").fetchone()[0])
        except sqlite3.OperationalError as e:
            words = str(e)
            if "no such table" in words or "no such column" in words:
                words += ". The views: " + "; ".join(views)
            if "interrupted" in words:
                words = "the query took too long and was stopped; narrow it"
            raise Problem(f"That query didn't run: {words}") from e
        columns = [d[0] for d in cur.description or []]
        out = [dict(zip(columns, tuple(r), strict=False)) for r in rows]
        rest = total - start - len(out)
        return {"columns": columns, "rows": out, "count": len(out), "total": total,
                "offset": start,
                **({"more": f"{rest} more; ask again with offset {start + len(out)} for the"
                            " rest"} if rest > 0 else {})}
    finally:
        db.close()
