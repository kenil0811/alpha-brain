"""Modules and threads.

A module is a named bundle of tables, skills, automations and a note around a goal: the tool the
person works in. It costs nothing to make (no code, no build) and grows as it is used.

A thread is a piece of work with its own model context (a build, research, an automation, a long
job, or a topic the person opened deliberately). The person sees one stream; the to-and-fro of
the work lives in its thread so it never crowds the stream's context.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from alpha.world.store import Problem, Store, new_id, now

THREAD_KINDS = {"build", "research", "job", "topic"}
THREAD_STATES = {"open", "working", "waiting", "done"}


def _row(row: sqlite3.Row) -> dict[str, Any]:
    return {k: row[k] for k in row.keys()}


class Modules:
    def __init__(self, store: Store) -> None:
        self.store = store

    def create(self, name: str, goal: str | None = None) -> dict[str, Any]:
        name = name.strip()
        if not name:
            raise Problem("A module needs a name.")
        if self.store.one("SELECT 1 FROM modules WHERE LOWER(name) = LOWER(?)", (name,)):
            raise Problem(f"There is a module called '{name}' already.")
        mid = new_id("m")
        stamp = now()
        with self.store.tx() as db:
            db.execute(
                "INSERT INTO modules (id, name, goal, created_at, updated_at) VALUES (?,?,?,?,?)",
                (mid, name, goal, stamp, stamp),
            )
        return self.get(mid)

    def get(self, ref: str) -> dict[str, Any]:
        """By id or by name (case-insensitive)."""
        row = self.store.one(
            "SELECT * FROM modules WHERE id = ? OR LOWER(name) = LOWER(?)", (ref, ref)
        )
        if row is None:
            raise Problem(f"There is no module '{ref}'.")
        return _row(row)

    def all(self) -> list[dict[str, Any]]:
        return [_row(r) for r in self.store.all("SELECT * FROM modules ORDER BY name")]

    # ---- threads ----

    def open_thread(self, title: str, kind: str, module: str | None = None) -> dict[str, Any]:
        if kind not in THREAD_KINDS:
            raise Problem(f"A thread is one of {sorted(THREAD_KINDS)}; got '{kind}'.")
        tid = new_id("t")
        stamp = now()
        with self.store.tx() as db:
            db.execute(
                "INSERT INTO threads (id, title, kind, state, module, created_at, updated_at)"
                " VALUES (?,?,?,?,?,?,?)",
                (tid, title, kind, "open", module, stamp, stamp),
            )
        return self.thread(tid)

    def thread(self, tid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM threads WHERE id = ?", (tid,))
        if row is None:
            raise Problem(f"There is no thread {tid}.")
        return _row(row)

    def update_thread(
        self, tid: str, *, state: str | None = None, session_ref: str | None = None
    ) -> dict[str, Any]:
        current = self.thread(tid)
        if state is not None and state not in THREAD_STATES:
            raise Problem(f"A thread's state is one of {sorted(THREAD_STATES)}; got '{state}'.")
        with self.store.tx() as db:
            db.execute(
                "UPDATE threads SET state = ?, session_ref = ?, updated_at = ? WHERE id = ?",
                (state or current["state"], session_ref or current["session_ref"], now(), tid),
            )
        return self.thread(tid)

    def threads(self, state: str | None = None) -> list[dict[str, Any]]:
        if state is None:
            rows = self.store.all(
                "SELECT * FROM threads WHERE state != 'done' ORDER BY updated_at DESC"
            )
        else:
            rows = self.store.all(
                "SELECT * FROM threads WHERE state = ? ORDER BY updated_at DESC", (state,)
            )
        return [_row(r) for r in rows]
