"""Preferences: what the person chose about how Alpha appears to them, kept in the world.

One JSON value per key; the first is the companion's look (`companion_look`: the animal and its
wardrobe, design §11 Q27). The core keeps a value as given and hands it back: the window owns
its shape and fills in its own defaults for anything missing, so a key the window no longer
knows is harmless and a value from a newer window is kept whole. These are choices of look,
never settings of Alpha's behaviour (there are none to choose, Q18), so a change is not
journaled: it changes nothing Alpha does or knows.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from alpha.world.store import Problem, Store, dumps, loads, now


class Preferences:
    def __init__(self, store: Store) -> None:
        self.store = store

    def get(self, key: str) -> Any | None:
        row = self.store.one("SELECT value FROM preferences WHERE key = ?", (key,))
        return loads(row["value"], None) if row else None

    def set(self, key: str, value: Any) -> dict[str, Any]:
        if not key or len(key) > 64 or not key.replace("_", "").isalnum():
            raise Problem("A preference's key is a short word (letters, digits, underscores).")
        try:
            text = dumps(value)
        except (TypeError, ValueError) as e:
            raise Problem("A preference's value must be plain data (JSON).") from e
        if len(text) > 20_000:
            raise Problem("A preference's value is too large to be one (over 20,000 characters).")
        with self.store.tx() as db:
            db.execute(
                "INSERT INTO preferences (key, value, updated_at) VALUES (?, ?, ?)"
                " ON CONFLICT(key) DO UPDATE SET value = excluded.value,"
                " updated_at = excluded.updated_at",
                (key, text, now()),
            )
        return {"key": key, "value": value}

    def all(self) -> dict[str, Any]:
        return {r["key"]: loads(r["value"], None)
                for r in self.store.all("SELECT key, value FROM preferences ORDER BY key")}


def read(world_path: Path | str | None, key: str) -> Any | None:
    """A preference of the world at `world_path`, or None when unset or unreadable: a read of
    its own, not the serving World's connection, for runs on other threads."""
    if not world_path or not Path(world_path).exists():
        return None
    try:
        db = sqlite3.connect(f"file:{Path(world_path)}?mode=ro", uri=True)
        try:
            row = db.execute("SELECT value FROM preferences WHERE key = ?", (key,)).fetchone()
        finally:
            db.close()
    except sqlite3.Error:
        return None
    return loads(row[0], None) if row else None
