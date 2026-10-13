"""Preferences: what the person chose about how Alpha appears to them, kept in the world.

One JSON value per key; the first is the companion's look (`companion_look`: the animal and its
wardrobe, design §11 Q27). The core keeps a value as given and hands it back: the window owns
its shape and fills in its own defaults for anything missing, so a key the window no longer
knows is harmless and a value from a newer window is kept whole. These are choices of look,
never settings of Alpha's behaviour (there are none to choose, Q18), so a change is not
journaled: it changes nothing Alpha does or knows. The one thing the core does with a value is
take a removed module and its tables out of the keys that name them (`forget_module`).
"""

from __future__ import annotations

import re
import sqlite3
from typing import Any

from alpha.world.store import Problem, Store, dumps, loads, now

# The window's keys that name modules and tables (13 Oct, Q42 sections 4d and 5): removing a
# module takes it out of these, so nothing kept points at what is gone (removal deletes
# everything related).
MODULE_LISTS = ("sidebar_order", "sidebar_hidden")
MODULE_MAPS = ("module_icons",)


def colours_key(table: str) -> str:
    """The key a table's colours are kept under, as the window makes it (`DataPage`)."""
    return re.sub(r"[^A-Za-z0-9_]", "_", f"colours_{table}")[:64]


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

    @staticmethod
    def forget_module(db: sqlite3.Connection, module: str, tables: list[str]) -> int:
        """Inside a removal's transaction: drop the module's tables' colours and take the module
        out of the sidebar's order, hidden list and icons. How many keys changed."""
        changed = 0
        for table in tables:
            changed += db.execute("DELETE FROM preferences WHERE key = ?",
                                  (colours_key(table),)).rowcount
        for key in MODULE_LISTS + MODULE_MAPS:
            row = db.execute("SELECT value FROM preferences WHERE key = ?", (key,)).fetchone()
            value = loads(row["value"], None) if row else None
            if isinstance(value, list) and module in value:
                kept: Any = [v for v in value if v != module]
            elif isinstance(value, dict) and module in value:
                kept = {k: v for k, v in value.items() if k != module}
            else:
                continue
            db.execute("UPDATE preferences SET value = ?, updated_at = ? WHERE key = ?",
                       (dumps(kept), now(), key))
            changed += 1
        return changed
