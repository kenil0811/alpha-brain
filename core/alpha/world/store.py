"""The store: one SQLite file per person, holding every layer of the world.

Conventions: ids are `<prefix>_<12 hex>`; times are UTC ISO-8601 with seconds; JSON columns hold
JSON text. The journal is append-only (a deletion is a tombstone that blanks the text); every
other table can be rebuilt from journal rows plus the records. Several processes open the same
file (the turn runner and the MCP server it starts), so the file runs in WAL mode with a busy
timeout.
"""

from __future__ import annotations

import json
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

CREATE TABLE IF NOT EXISTS readers (
    name TEXT PRIMARY KEY,
    site TEXT NOT NULL,
    url TEXT NOT NULL,
    script TEXT NOT NULL,
    to_end INTEGER NOT NULL DEFAULT 0,
    description TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    health TEXT NOT NULL DEFAULT 'ok',
    last_problem TEXT,
    last_run_at TEXT,
    last_count INTEGER,
    last_ok_count INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
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
"""


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

    def close(self) -> None:
        with self._lock:
            self.db.close()


def fts_query(text: str) -> str | None:
    """Turn free text into a safe FTS5 query: each word quoted, joined with OR, prefix-matched.
    Returns None when nothing searchable is left."""
    words = []
    for raw in text.replace('"', " ").split():
        word = "".join(ch for ch in raw if ch.isalnum() or ch in "-_'")
        word = word.strip("-_'")
        if len(word) >= 2:
            words.append(f'"{word}"*')
    return " OR ".join(words[:16]) or None
