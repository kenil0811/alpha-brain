"""Runs: one row per run of an agent, with a verdict judged by code (Q33). For a pipeline:
succeeded when everything the run set out to read was read and every reader stayed healthy;
partial when something was read and something was not (a source unreachable, a reader broken
and not repaired, a sign-in needed); failed when nothing was read, or the run itself broke. A
built-in kind judges by its own rule (Q50). The verdict is never the model's opinion; the
model's own time in the run is counted, as are repairs. `trigger` says what started the run
(schedule, event, mention, now, again) and `called_by` the run that called for it."""

from __future__ import annotations

import sqlite3
from typing import Any

from alpha.world.store import Problem, Store, new_id, now

VERDICTS = ("succeeded", "partial", "failed")
TRIGGERS = ("schedule", "event", "mention", "now", "again", "called")


def _row(row: sqlite3.Row) -> dict[str, Any]:
    return {k: row[k] for k in row.keys()}


class Runs:
    def __init__(self, store: Store) -> None:
        self.store = store

    def start(self, agent: str, *, trigger: str = "schedule",
              called_by: str | None = None) -> str:
        if trigger not in TRIGGERS:
            raise Problem(f"A run's trigger is one of {TRIGGERS}.")
        rid = new_id("run")
        with self.store.tx() as db:
            db.execute("INSERT INTO runs (id, agent, started_at, trigger, called_by)"
                       " VALUES (?,?,?,?,?)", (rid, agent, now(), trigger, called_by))
        return rid

    def finish(self, rid: str, *, verdict: str, why: str | None = None, line: str | None = None,
               model_ms: int = 0, repairs: int = 0, read: int | None = None,
               sources: int | None = None) -> dict[str, Any]:
        if verdict not in VERDICTS:
            raise Problem(f"A run's verdict is one of {VERDICTS}.")
        with self.store.tx() as db:
            db.execute(
                "UPDATE runs SET ended_at = ?, verdict = ?, why = ?, line = ?, model_ms = ?,"
                " repairs = ?, read = ?, sources = ? WHERE id = ?",
                (now(), verdict, why, line, int(model_ms or 0), repairs, read, sources, rid))
        return self.get(rid)

    def get(self, rid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM runs WHERE id = ?", (rid,))
        if row is None:
            raise Problem(f"There is no run {rid}.")
        return _row(row)

    def of(self, agent: str, limit: int = 12) -> list[dict[str, Any]]:
        """Newest first."""
        return [_row(r) for r in self.store.all(
            "SELECT * FROM runs WHERE agent = ? ORDER BY started_at DESC LIMIT ?",
            (agent, limit))]

    def last(self, agent: str) -> dict[str, Any] | None:
        """The last run that ended."""
        row = self.store.one("SELECT * FROM runs WHERE agent = ? AND ended_at IS NOT NULL"
                             " ORDER BY started_at DESC LIMIT 1", (agent,))
        return _row(row) if row else None

    def open(self, agent: str) -> dict[str, Any] | None:
        """The run of this agent that has not ended, if one is going."""
        row = self.store.one("SELECT * FROM runs WHERE agent = ? AND ended_at IS NULL"
                             " ORDER BY started_at DESC LIMIT 1", (agent,))
        return _row(row) if row else None
