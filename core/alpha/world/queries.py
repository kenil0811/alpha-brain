"""The world as SQL the model reads (harness design §4, §5; slice 2b, 17 October 2026).

`world_query` lets the model write its own reads over the person's world, across tables (Kenil,
17 Oct). Every query runs on a read-only connection (SQLite's `mode=ro`: a write is refused by
the database, not by a check of ours) with a view per table of the person's (`rows_<table>`,
its JSON values as columns) and a view per kind of thing the world keeps (`journal`, `facts`,
`people`, `goals`, `notes`, `agents`, `runs`, `actions`, `documents`, `events`, `modules`,
`threads`, `decisions`, `sources`, `tables`; the person's tasks as `tasks`). Rows are
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
ALIASES = {"collections": "tables", "entities": "people"}


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
            db.execute("CREATE TEMP VIEW people AS SELECT e.id, e.kind, e.name, e.created_at,"
                       " e.updated_at, (SELECT json_group_object(k.kind, k.value) FROM"
                       " entity_keys k WHERE k.entity_id = e.id) AS keys FROM entities e"
                       " WHERE e.merged_into IS NULL")
            made.append("people(id, kind, name, keys, created_at, updated_at)")
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


def views_text(world_path: Path | str) -> str:
    """The views and their columns, one line each: what `world_query` can read."""
    db = sqlite3.connect(f"file:{Path(world_path)}?mode=ro", uri=True)
    try:
        return "\n".join(_views(db))
    finally:
        db.close()


def query(world_path: Path | str, sql: str, *, limit: int = MOST_ROWS) -> dict[str, Any]:
    """Run one read over the world; the columns, the rows (at most `limit`, said when cut), and
    the views the query could use when it names none that exists."""
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
        try:
            cur = db.execute(text)
            rows = cur.fetchmany(int(limit) + 1)
        except sqlite3.OperationalError as e:
            words = str(e)
            if "no such table" in words or "no such column" in words:
                words += ". The views: " + "; ".join(views)
            if "interrupted" in words:
                words = "the query took too long and was stopped; narrow it"
            raise Problem(f"That query didn't run: {words}") from e
        columns = [d[0] for d in cur.description or []]
        cut = len(rows) > int(limit)
        out = [dict(zip(columns, tuple(r), strict=False)) for r in rows[:int(limit)]]
        return {"columns": columns, "rows": out, "count": len(out),
                **({"cut": f"only the first {limit} rows are shown; narrow the query or"
                           " aggregate"} if cut else {})}
    finally:
        db.close()
