"""The store: one SQLite file per person, holding every layer of the world.

Conventions: ids are `<prefix>_<12 hex>`; times are UTC ISO-8601 with seconds; JSON columns hold
JSON text. The journal is append-only (a deletion is a tombstone that blanks the text); every
other table can be rebuilt from journal rows plus the records. Several processes open the same
file (the turn runner and the MCP server it starts), so the file runs in WAL mode with a busy
timeout.
"""

from __future__ import annotations

import json
import re
import sqlite3
import threading
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS journal (
    id TEXT PRIMARY KEY,
    at TEXT NOT NULL,
    kind TEXT NOT NULL,
    actor TEXT NOT NULL,
    text TEXT NOT NULL,
    data TEXT NOT NULL DEFAULT '{}',
    module TEXT,
    thread TEXT,
    entity_ids TEXT NOT NULL DEFAULT '[]',
    source TEXT,
    deleted_at TEXT
);
CREATE INDEX IF NOT EXISTS journal_at ON journal(at);
CREATE INDEX IF NOT EXISTS journal_thread ON journal(thread, at);
CREATE INDEX IF NOT EXISTS journal_module ON journal(module, at);
CREATE VIRTUAL TABLE IF NOT EXISTS journal_fts USING fts5(
    text, content='journal', content_rowid='rowid', tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS journal_ai AFTER INSERT ON journal BEGIN
    INSERT INTO journal_fts(rowid, text) VALUES (new.rowid, new.text);
END;
CREATE TRIGGER IF NOT EXISTS journal_ad AFTER DELETE ON journal BEGIN
    INSERT INTO journal_fts(journal_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
END;
CREATE TRIGGER IF NOT EXISTS journal_au AFTER UPDATE OF text ON journal BEGIN
    INSERT INTO journal_fts(journal_fts, rowid, text) VALUES ('delete', old.rowid, old.text);
    INSERT INTO journal_fts(rowid, text) VALUES (new.rowid, new.text);
END;

CREATE TABLE IF NOT EXISTS collections (
    name TEXT PRIMARY KEY,
    module TEXT,
    title TEXT NOT NULL,
    schema TEXT NOT NULL,
    title_field TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS records (
    collection TEXT NOT NULL REFERENCES collections(name),
    id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    "values" TEXT NOT NULL,
    provenance TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    deleted_at TEXT,
    PRIMARY KEY (collection, id)
);
CREATE INDEX IF NOT EXISTS records_created ON records(collection, created_at);
-- what a record was before each change: the world changed, and history keeps the old values
CREATE TABLE IF NOT EXISTS record_versions (
    collection TEXT NOT NULL,
    record_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    "values" TEXT NOT NULL,
    provenance TEXT NOT NULL,
    replaced_at TEXT NOT NULL,
    PRIMARY KEY (collection, record_id, revision)
);
CREATE VIRTUAL TABLE IF NOT EXISTS records_fts USING fts5(
    collection UNINDEXED, record_id UNINDEXED, text, tokenize='porter unicode61'
);

CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (scope, title)
);

CREATE TABLE IF NOT EXISTS goals (
    id TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    state TEXT NOT NULL,
    module TEXT,
    since TEXT NOT NULL,
    until TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS facts (
    id TEXT PRIMARY KEY,
    subject TEXT NOT NULL,
    predicate TEXT NOT NULL,
    value TEXT NOT NULL,
    valid_from TEXT NOT NULL,
    valid_to TEXT,
    recorded_at TEXT NOT NULL,
    superseded_by TEXT,
    source TEXT NOT NULL,
    why TEXT,
    confidence REAL NOT NULL,
    state TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS facts_subject ON facts(subject, predicate);

CREATE TABLE IF NOT EXISTS entities (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    canonical TEXT NOT NULL,
    aliases TEXT NOT NULL DEFAULT '[]',
    keys TEXT NOT NULL DEFAULT '{}',
    merged_into TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS entities_name ON entities(kind, canonical);
CREATE TABLE IF NOT EXISTS entity_keys (
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    entity_id TEXT NOT NULL REFERENCES entities(id),
    PRIMARY KEY (key, value)
);

CREATE TABLE IF NOT EXISTS modules (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    goal TEXT,
    project TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS connections (
    id TEXT PRIMARY KEY,
    connector TEXT NOT NULL,
    target TEXT NOT NULL,
    status TEXT NOT NULL,
    config TEXT NOT NULL DEFAULT '{}',
    last_sync TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (connector, target)
);

CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL REFERENCES entities(id),
    connection TEXT,
    path TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    text TEXT NOT NULL,
    size INTEGER NOT NULL,
    modified_at TEXT NOT NULL,
    indexed_at TEXT NOT NULL,
    removed_at TEXT
);
CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
    title, text, content='documents', content_rowid='rowid', tokenize='porter unicode61'
);
CREATE TRIGGER IF NOT EXISTS documents_ai AFTER INSERT ON documents BEGIN
    INSERT INTO documents_fts(rowid, title, text) VALUES (new.rowid, new.title, new.text);
END;
CREATE TRIGGER IF NOT EXISTS documents_au AFTER UPDATE ON documents BEGIN
    INSERT INTO documents_fts(documents_fts, rowid, title, text)
        VALUES ('delete', old.rowid, old.title, old.text);
    INSERT INTO documents_fts(rowid, title, text) VALUES (new.rowid, new.title, new.text);
END;

CREATE TABLE IF NOT EXISTS events (
    id TEXT PRIMARY KEY,
    entity_id TEXT NOT NULL REFERENCES entities(id),
    connection TEXT,
    uid TEXT NOT NULL UNIQUE,
    calendar TEXT,
    title TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    all_day INTEGER NOT NULL DEFAULT 0,
    location TEXT,
    notes TEXT,
    url TEXT,
    organiser TEXT,
    attendees TEXT NOT NULL DEFAULT '[]',
    updated_at TEXT NOT NULL,
    removed_at TEXT
);
CREATE INDEX IF NOT EXISTS events_start ON events(starts_at);

CREATE TABLE IF NOT EXISTS automations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    module TEXT,
    thread TEXT,
    schedule TEXT NOT NULL,
    procedure TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    next_run_at TEXT,
    last_run_at TEXT,
    last_result TEXT,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);


-- what Alpha proposed to set up, and its way from the person's yes to a finished build
CREATE TABLE IF NOT EXISTS plans (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    state TEXT NOT NULL,
    module TEXT,
    thread TEXT,
    turn TEXT,
    proposal TEXT,
    approval TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    report TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- everything a module reads from outside Alpha, and whether it works
CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    module TEXT,
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    site TEXT NOT NULL,
    reader TEXT,
    status TEXT NOT NULL,
    detail TEXT,
    last_checked TEXT,
    last_rows INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (module, url)
);

-- know-how Alpha writes to act in a web app: declarative steps for one task on one site

-- an outward effect Alpha proposed; nothing leaves Alpha's space until the person's yes
CREATE TABLE IF NOT EXISTS actions (
    id TEXT PRIMARY KEY,
    procedure TEXT NOT NULL,
    title TEXT NOT NULL,
    payload TEXT NOT NULL,
    evidence TEXT,
    undo TEXT NOT NULL,
    effect TEXT NOT NULL,
    site TEXT NOT NULL,
    state TEXT NOT NULL,
    module TEXT,
    thread TEXT,
    turn TEXT,
    proposal TEXT,
    approval TEXT,
    preview TEXT,
    preview_note TEXT,
    shots TEXT NOT NULL DEFAULT '[]',
    result TEXT,
    error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS actions_state ON actions(state, created_at);

-- standing permissions, as sentences the person granted and can revoke
CREATE TABLE IF NOT EXISTS permissions (
    id TEXT PRIMARY KEY,
    sentence TEXT NOT NULL,
    procedure TEXT NOT NULL,
    effect TEXT NOT NULL,
    granted_at TEXT NOT NULL,
    revoked_at TEXT,
    source TEXT
);

-- what the model was given for each turn, so a wrong answer can be traced to what it saw
CREATE TABLE IF NOT EXISTS turn_contexts (
    turn TEXT PRIMARY KEY,
    at TEXT NOT NULL,
    context TEXT NOT NULL,
    rules TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    state TEXT NOT NULL,
    module TEXT,
    session_ref TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
-- Know-how, one table (design §3.7 point 7, 3 Oct 2026): a skill of kind read (a page
-- script that returns rows), act (steps that do one task on one site) or run (a pipeline of
-- steps the scheduler runs with no model). Readers and procedures were tables of their own
-- until 3 Oct; a world made before then moves them here on open.
CREATE TABLE IF NOT EXISTS skills (
    name TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    site TEXT,
    module TEXT,
    url TEXT,
    description TEXT NOT NULL,
    when_to_use TEXT,
    script TEXT,
    to_end INTEGER NOT NULL DEFAULT 0,
    whole INTEGER NOT NULL DEFAULT 1,
    effect TEXT,
    steps TEXT,
    verify TEXT,
    fields TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    health TEXT NOT NULL DEFAULT 'untried',
    last_problem TEXT,
    last_run_at TEXT,
    last_count INTEGER,
    last_ok_count INTEGER,
    source TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS skills_kind ON skills(kind, site);

-- Saved lists (3 Oct 2026): a named way of looking at a table (the search, the filters, the
-- columns, the sort, the view) that follows the person and that Alpha can make when asked.
-- One per table may be the default it opens on.
CREATE TABLE IF NOT EXISTS views (
    id TEXT PRIMARY KEY,
    collection TEXT NOT NULL,
    title TEXT NOT NULL,
    config TEXT NOT NULL,
    is_default INTEGER NOT NULL DEFAULT 0,
    source TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS views_collection ON views(collection, title);

-- Preferences (3 Oct 2026): what the person chose about how Alpha appears to them (the
-- companion's look), kept in the world so it follows them. One JSON value per key; the window
-- owns the shape. Choices of look, never settings of behaviour.
CREATE TABLE IF NOT EXISTS preferences (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


# Columns added after a world file was first made; added in place when the file is opened.
ADDED_COLUMNS = [
    ("modules", "parent", "TEXT"),  # a module inside a module (3 Oct night, Q31)
    ("records", "entity_id", "TEXT"),
    ("notes", "source", "TEXT"),
    ("entities", "source", "TEXT"),
    ("threads", "brief", "TEXT"),
    # rows a reader keeps: which reader last returned it, when, and when it stopped returning it
    ("records", "reader", "TEXT"),
    ("records", "seen_at", "TEXT"),
    ("records", "gone_at", "TEXT"),
    # an automation that is a pipeline of saved steps, run with no model
    ("automations", "steps", "TEXT"),
    # an automation's pipeline is a skill of kind run; the old steps column moves there
    ("automations", "skill", "TEXT"),
    # the first thing the person will do with what a plan builds, as they would say it, and how
    # many times the build's trial of it disagreed with an independent answer
    ("plans", "trial", "TEXT"),
    ("plans", "checks", "INTEGER NOT NULL DEFAULT 0"),
    # a file Alpha fetched or the person added: whose module it is, and where it came from
    ("documents", "module", "TEXT"),
    ("documents", "origin", "TEXT"),
    # a page of the wiki carries a one-line summary for the always-loaded index
    ("notes", "summary", "TEXT"),
]


class Problem(Exception):
    """Something the caller asked for cannot be done; the message is plain words for the model
    and the person, never a stack trace."""


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat()


def dumps(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def loads(text: str | None, default: Any = None) -> Any:
    if text is None:
        return default
    return json.loads(text)


class Store:
    """A connection to one world file. Writes go through `tx()`, one transaction each."""

    def __init__(self, path: Path | str) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = threading.RLock()
        self.db = sqlite3.connect(self.path, check_same_thread=False, isolation_level=None)
        self.db.row_factory = sqlite3.Row
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA busy_timeout=10000")
        self.db.execute("PRAGMA foreign_keys=ON")
        # executescript commits on its own, so the schema is applied outside `tx()`.
        self.db.executescript(SCHEMA)
        self._migrate()

    def _migrate(self) -> None:
        with self.tx() as db:
            self._move_know_how(db)
            for table, column, decl in ADDED_COLUMNS:
                have = {r["name"] for r in db.execute(f"PRAGMA table_info({table})")}
                if column not in have:
                    db.execute(f"ALTER TABLE {table} ADD COLUMN {column} {decl}")
            db.execute("CREATE INDEX IF NOT EXISTS records_entity ON records(entity_id)")
            db.execute("CREATE INDEX IF NOT EXISTS records_reader ON records(collection, reader)")
            # The journal's hot paths (3 Oct review): entries by kind in time, the reply of a
            # turn, the answer to a question. Expression indexes match the queries' own text.
            db.execute("CREATE INDEX IF NOT EXISTS journal_kind ON journal(kind, at)")
            db.execute("CREATE INDEX IF NOT EXISTS journal_turn ON journal("
                       "json_extract(data, '$.turn'))")
            db.execute("CREATE INDEX IF NOT EXISTS journal_ask ON journal("
                       "json_extract(data, '$.ask'))")
            # Rows a reader wrote before rows knew their reader.
            db.execute("UPDATE records SET reader = json_extract(provenance, '$.reader')"
                       " WHERE reader IS NULL AND json_extract(provenance, '$.reader') IS NOT NULL")
            # Addresses are one key: the old 'linkedin' key kind becomes 'url' (2 Oct).
            db.execute("INSERT OR IGNORE INTO entity_keys (key, value, entity_id)"
                       " SELECT 'url', value, entity_id FROM entity_keys WHERE key = 'linkedin'")
            db.execute("DELETE FROM entity_keys WHERE key = 'linkedin'")
            for row in db.execute("SELECT id, keys FROM entities WHERE keys LIKE '%\"linkedin\"%'"
                                  ).fetchall():
                keys = loads(row["keys"])
                urls = list(dict.fromkeys(keys.get("url", []) + keys.pop("linkedin", [])))
                if urls:
                    keys["url"] = urls
                db.execute("UPDATE entities SET keys = ? WHERE id = ?", (dumps(keys), row["id"]))
            # Threads are records, not remembered model sessions: nothing resumes one.
            # Only a live conversation (a chat) keeps a session; builds and automations never do.
            db.execute("UPDATE threads SET session_ref = NULL WHERE session_ref IS NOT NULL"
                       " AND (kind != 'chat' OR state = 'done')")
            # Each world is one person's; its id travels with the file.
            db.execute("INSERT OR IGNORE INTO meta (key, value) VALUES ('world_id', ?)",
                       (new_id("w"),))
            # When the world began: its first journal entry, for a file older than this field.
            first = db.execute("SELECT MIN(at) AS at FROM journal").fetchone()
            db.execute("INSERT OR IGNORE INTO meta (key, value) VALUES ('created_at', ?)",
                       ((first["at"] if first and first["at"] else None) or now(),))
            self._move_pipelines(db)

    @staticmethod
    def _move_know_how(db: sqlite3.Connection) -> None:
        """Readers and procedures, tables of their own before 3 Oct 2026, become skills of
        kind read and act; the old tables are dropped once moved."""
        tables = {r["name"] for r in db.execute("SELECT name FROM sqlite_master"
                                                 " WHERE type = 'table'")}
        if "readers" in tables:
            have = {r["name"] for r in db.execute("PRAGMA table_info(readers)")}
            whole = "whole" if "whole" in have else "1"
            db.execute(
                "INSERT OR IGNORE INTO skills (name, kind, site, url, description, script, to_end,"
                f" whole, version, health, last_problem, last_run_at, last_count, last_ok_count,"
                " created_at, updated_at) SELECT name, 'read', site, url, description, script,"
                f" to_end, {whole}, version, health, last_problem, last_run_at, last_count,"
                " last_ok_count, created_at, updated_at FROM readers")
            db.execute("DROP TABLE readers")
        if "procedures" in tables:
            db.execute(
                "INSERT OR IGNORE INTO skills (name, kind, site, url, description, effect, steps,"
                " verify, fields, version, health, last_problem, last_run_at, created_at,"
                " updated_at) SELECT name, 'act', site, url, description, effect, steps, verify,"
                " fields, version, health, last_problem, last_run_at, created_at, updated_at"
                " FROM procedures")
            db.execute("DROP TABLE procedures")

    @staticmethod
    def _move_pipelines(db: sqlite3.Connection) -> None:
        """An automation's saved steps become a skill of kind run named after it (3 Oct); a
        run skill named by an earlier rule is renamed to the current one when that is free."""
        from alpha.world.skills import slug

        rows = db.execute("SELECT id, title, module, steps, last_run_at, last_error FROM"
                          " automations WHERE steps IS NOT NULL AND skill IS NULL").fetchall()
        taken = {r["name"] for r in db.execute("SELECT name FROM skills")}
        stamp = now()
        for row in rows:
            base = slug(row["title"], "run_")
            name, n = base, 2
            while name in taken:
                name, n = f"{base}_{n}", n + 1
            taken.add(name)
            db.execute(
                "INSERT INTO skills (name, kind, module, description, steps, health,"
                " last_problem, last_run_at, created_at, updated_at)"
                " VALUES (?, 'run', ?, ?, ?, ?, ?, ?, ?, ?)",
                (name, row["module"], row["title"], row["steps"],
                 "broken" if row["last_error"] else ("ok" if row["last_run_at"] else "untried"),
                 row["last_error"], row["last_run_at"], stamp, stamp))
            db.execute("UPDATE automations SET skill = ?, steps = NULL WHERE id = ?",
                       (name, row["id"]))
        # Names by the current rule: a run skill is named from its automation's title.
        for row in db.execute("SELECT id, title, skill FROM automations WHERE skill IS NOT NULL"
                              ).fetchall():
            wanted = slug(row["title"], "run_")
            current = str(row["skill"])
            if current == wanted or wanted in taken or re.fullmatch(
                    re.escape(wanted) + r"_\d+", current):
                continue
            db.execute("UPDATE skills SET name = ? WHERE name = ? AND kind = 'run'",
                       (wanted, current))
            db.execute("UPDATE automations SET skill = ? WHERE id = ?", (wanted, row["id"]))
            # The pipelines that call it by the old name follow (steps are JSON, parsed,
            # never matched as text: found 3 Oct, the text match missed the compact form).
            for other in db.execute("SELECT name, steps FROM skills WHERE kind = 'run'"
                                    " AND steps LIKE ?", (f"%{current}%",)).fetchall():
                steps = loads(other["steps"], [])
                changed = [{"run": wanted} if st.get("run") == current else st
                           for st in steps]
                if changed != steps:
                    db.execute("UPDATE skills SET steps = ? WHERE name = ?",
                               (dumps(changed), other["name"]))
            taken.discard(current)
            taken.add(wanted)

    @contextmanager
    def tx(self) -> Iterator[sqlite3.Connection]:
        with self._lock:
            self.db.execute("BEGIN IMMEDIATE")
            try:
                yield self.db
            except BaseException:
                self.db.execute("ROLLBACK")
                raise
            else:
                self.db.execute("COMMIT")

    def one(self, sql: str, args: tuple[Any, ...] = ()) -> sqlite3.Row | None:
        with self._lock:
            row: sqlite3.Row | None = self.db.execute(sql, args).fetchone()
            return row

    def all(self, sql: str, args: tuple[Any, ...] = ()) -> list[sqlite3.Row]:
        with self._lock:
            return list(self.db.execute(sql, args).fetchall())

    def backup_to(self, path: Path) -> None:
        """A consistent copy of the whole file, safe while Alpha runs."""
        copy = sqlite3.connect(path)
        try:
            with self._lock:
                self.db.backup(copy)
        finally:
            copy.close()

    def close(self) -> None:
        with self._lock:
            self.db.close()


# Words that carry no subject: a sentence's "who is … and when did i last deal with her" must
# search for the name and "deal", not for "with", "last" and "her" (3 Oct 2026, build-plan
# §4.23: those matched hundreds of unrelated rows and buried the one that mattered).
FUNCTION_WORDS = frozenset("""
a an the and or but if so as of in on at by to for from with without about into over under
than then there here up down out again also just only very not no yes is are was were be been
being am do does did done have has had having i me my mine you your yours he him his she her
hers it its we us our ours they them their theirs this that these those what when where who
whom which why how can could should would will shall may might must any some all more most
much many few each every both other another such own same last first next now today tonight
yesterday tomorrow please tell say said says know knew think thought want wanted need get got
give gave show let like ok okay thanks thank hi hello yet still ever never always often
""".split())


def fts_query(text: str) -> str | None:
    """Turn free text into a safe FTS5 query: each word that carries meaning quoted, joined
    with OR, prefix-matched; function words are left out unless nothing else remains.
    Returns None when nothing searchable is left."""
    words = []
    for raw in text.replace('"', " ").split():
        word = "".join(ch for ch in raw if ch.isalnum() or ch in "-_'")
        word = word.strip("-_'")
        if len(word) >= 2:
            words.append(word)
    meaningful = [w for w in words if w.lower() not in FUNCTION_WORDS]
    chosen = meaningful or words
    return " OR ".join(f'"{w}"*' for w in chosen[:16]) or None
