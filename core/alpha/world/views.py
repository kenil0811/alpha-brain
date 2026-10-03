"""Saved lists: a named way of looking at a table, kept in the world.

A saved list is the search, the filters, the columns shown, the sort and the kind of view
(table, board, …) under a title the person gave it ("Open deals in Missouri"). It belongs to
the world, not to one window: it follows the person to another Mac, Alpha can make one when
asked ("keep a list of the sold ones"), and removing the table removes its lists. One list per
table may be the default the table opens on. The config is the page's own shape, kept as JSON;
the core only checks that the table exists and that the fields a list names are its fields.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from alpha.world.store import Problem, Store, dumps, loads, new_id, now

CONFIG_KEYS = {"search", "filters", "hide_done", "hidden", "sort", "view"}


def _view(row: sqlite3.Row) -> dict[str, Any]:
    out = {k: row[k] for k in row.keys()}
    out["config"] = loads(row["config"], {})
    out["is_default"] = bool(row["is_default"])
    return out


class Views:
    def __init__(self, store: Store) -> None:
        self.store = store

    def _check(self, collection: str, config: dict[str, Any]) -> dict[str, Any]:
        row = self.store.one("SELECT schema FROM collections WHERE name = ?", (collection,))
        if row is None:
            raise Problem(f"There is no table '{collection}' to keep a list on.")
        fields = {f["name"] for f in loads(row["schema"], {}).get("fields", [])}
        clean: dict[str, Any] = {}
        for key, value in (config or {}).items():
            if key not in CONFIG_KEYS:
                raise Problem(f"A list's config holds {sorted(CONFIG_KEYS)}; not '{key}'.")
            clean[key] = value
        for name in (clean.get("filters") or {}):
            if name not in fields:
                raise Problem(f"'{collection}' has no field '{name}' to filter on.")
        sort = clean.get("sort")
        if sort and sort.get("field") not in fields:
            raise Problem(f"'{collection}' has no field '{sort.get('field')}' to sort by.")
        clean["hidden"] = [h for h in clean.get("hidden") or [] if h in fields]
        return clean

    def save(self, collection: str, title: str, config: dict[str, Any], *,
             source: str | None = None, default: bool = False) -> dict[str, Any]:
        if not title.strip():
            raise Problem("A list needs a title.")
        clean = self._check(collection, config)
        stamp = now()
        vid = new_id("v")
        with self.store.tx() as db:
            if default:
                db.execute("UPDATE views SET is_default = 0 WHERE collection = ?", (collection,))
            db.execute(
                "INSERT INTO views (id, collection, title, config, is_default, source, created_at,"
                " updated_at) VALUES (?,?,?,?,?,?,?,?)",
                (vid, collection, title.strip(), dumps(clean), int(default), source, stamp, stamp))
        return self.get(vid)

    def get(self, vid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM views WHERE id = ?", (vid,))
        if row is None:
            raise Problem(f"There is no saved list {vid}.")
        return _view(row)

    def for_table(self, collection: str) -> list[dict[str, Any]]:
        return [_view(r) for r in self.store.all(
            "SELECT * FROM views WHERE collection = ? ORDER BY created_at", (collection,))]

    def update(self, vid: str, *, title: str | None = None,
               config: dict[str, Any] | None = None,
               default: bool | None = None) -> dict[str, Any]:
        current = self.get(vid)
        clean = self._check(current["collection"], config) if config is not None else None
        with self.store.tx() as db:
            if default:
                db.execute("UPDATE views SET is_default = 0 WHERE collection = ?",
                           (current["collection"],))
            db.execute(
                "UPDATE views SET title = ?, config = ?, is_default = ?, updated_at = ?"
                " WHERE id = ?",
                ((title or current["title"]).strip(), dumps(clean if clean is not None
                                                             else current["config"]),
                 int(current["is_default"] if default is None else default), now(), vid))
        return self.get(vid)

    def delete(self, vid: str) -> dict[str, Any]:
        current = self.get(vid)
        with self.store.tx() as db:
            db.execute("DELETE FROM views WHERE id = ?", (vid,))
        return current

    @staticmethod
    def remove_table(db: sqlite3.Connection, collection: str) -> int:
        return db.execute("DELETE FROM views WHERE collection = ?", (collection,)).rowcount
