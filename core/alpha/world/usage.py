"""Usage: what each model call used and cost (Settings › Models, 12 Oct 2026), one row per model
a call used. Written where every call passes (`route.run`), so the background passes (noticing,
checking, judging, connecting) count as well as answers. Like the journal, it is the record of
what happened: removing a module keeps its rows, which then name a module that is gone.

`cost` is the tool's own API-equivalent estimate (Claude Code's `costUSD`, at list prices),
never Alpha's guess: the Codex CLI reports tokens and no price, so a ChatGPT row has none.
Rows from before this table (answers only, model unknown) are carried over from the journal once,
their route taken from the price: a priced answer was Claude's, an unpriced reply ChatGPT's."""

from __future__ import annotations

import logging
import sqlite3
from pathlib import Path
from typing import Any

from alpha.world.store import Store, new_id, now

log = logging.getLogger(__name__)

COLUMNS = ("turn", "thread", "module", "kind", "route", "model", "input", "output", "cache_read",
           "cache_write", "cost")


def record(world_path: Path | str, rows: list[dict[str, Any]]) -> None:
    """Add a call's rows, through a connection of its own (calls run on many threads, without
    the serving World). A failure is logged and never stops the answer it was for."""
    if not rows:
        return
    at = now()  # one call's rows share their moment
    try:
        db = sqlite3.connect(Path(world_path), timeout=10, isolation_level=None)
        try:
            db.execute("BEGIN IMMEDIATE")
            db.executemany(
                f"INSERT INTO usage (id, at, {', '.join(COLUMNS)})"
                f" VALUES (?, ?, {', '.join('?' * len(COLUMNS))})",
                [(new_id("u"), at, *(r.get(c) for c in COLUMNS)) for r in rows])
            db.execute("COMMIT")
        finally:
            db.close()
    except sqlite3.Error as e:
        log.warning("couldn't record model usage: %s", e)


class Usage:
    def __init__(self, store: Store) -> None:
        self.store = store

    def since(self, at: str | None = None) -> list[dict[str, Any]]:
        """Rows from `at` on, oldest first. A background pass's row knows only its turn: its
        project and conversation are the turn's own."""
        rows = self.store.all(
            "SELECT u.id, u.at, u.turn, u.kind, u.route, u.model, u.input, u.output, u.cache_read,"
            " u.cache_write, u.cost, COALESCE(u.module, j.module) AS module,"
            " COALESCE(u.thread, j.thread) AS thread FROM usage u"
            " LEFT JOIN journal j ON j.id = u.turn"
            + (" WHERE u.at >= ?" if at else "") + " ORDER BY u.at", (at,) if at else ())
        return [{k: r[k] for k in r.keys()} for r in rows]
