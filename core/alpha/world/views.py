"""Saved lists: a named way of looking at a table, kept in the world.

A saved list is the search, the filters and filter rules, the columns shown, the sorts and the
kind of view (table, board, …) under a title the person gave it ("Open deals in Missouri"). It
belongs to the world, not to one window: it follows the person to another Mac, Alpha can make
one when asked ("keep a list of the sold ones"), and removing the table removes its lists. One
list per table may be the default the table opens on. The config is the page's own shape, kept
as JSON; the core only checks that the table exists and that the fields a list names are its
fields.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from alpha.world.store import Problem, Store, dumps, loads, new_id, now

CONFIG_KEYS = {"search", "filters", "rules", "hide_done", "show_gone", "hidden", "sort", "sorts",
               "view", "group_by", "date_by", "measure", "footers"}
# The ways the window can show a table (desktop/src/modules/views); a board groups rows by a
# field, a calendar, a timeline and a chart lay them on a date field, a chart adds up a
# numeric one (or counts).
VIEW_KINDS = ("table", "list", "board", "gallery", "calendar", "timeline", "chart", "form")
BY_DATE = ("calendar", "timeline", "chart")


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
        for sort in [clean.get("sort"), *(clean.get("sorts") or [])]:
            if sort and sort.get("field") not in fields:
                raise Problem(f"'{collection}' has no field '{sort.get('field')}' to sort by.")
        # each column's chosen total (13 Oct): a field of this table
        for name in (clean.get("footers") or {}):
            if name not in fields:
                raise Problem(f"'{collection}' has no field '{name}' to total.")
        # the Filter button's rules (13 Oct): each names a field of this table
        for rule in (clean.get("rules") or {}).get("rules") or []:
            if rule.get("field") not in fields:
                raise Problem(f"'{collection}' has no field '{rule.get('field')}' to filter on.")
        for key in ("group_by", "date_by", "measure"):
            if clean.get(key) and clean[key] not in fields:
                raise Problem(f"'{collection}' has no field '{clean[key]}' ({key}).")
        view = clean.get("view")
        if view and view not in VIEW_KINDS:
            raise Problem(f"A list shows a table as one of {', '.join(VIEW_KINDS)}; not '{view}'.")
        if view == "board" and not clean.get("group_by"):
            raise Problem("A board needs group_by: the choice or status field its columns are.")
        if view in BY_DATE and not clean.get("date_by"):
            raise Problem(f"A {view} needs date_by: the date field it lays the rows on.")
        clean["hidden"] = [h for h in clean.get("hidden") or [] if h in fields]
        return clean

    def _check_title(self, collection: str, title: str, vid: str | None = None) -> None:
        """A list's title never repeats its table's title or another list's of that table
        (13 Oct, slice 2 A2)."""
        clean = title.strip().lower()
        table = self.store.one("SELECT title FROM collections WHERE name = ?", (collection,))
        if table and str(table["title"]).strip().lower() == clean:
            raise Problem(f"'{title}' is the table's own name; name the list for what it shows"
                          " (e.g. 'Applied this week').")
        if self.store.one("SELECT 1 FROM views WHERE collection = ? AND LOWER(TRIM(title)) = ?"
                          " AND id IS NOT ?", (collection, clean, vid)):
            raise Problem(f"There is a list called '{title}' on this table already.")

    def save(self, collection: str, title: str, config: dict[str, Any], *,
             source: str | None = None, default: bool = False) -> dict[str, Any]:
        if not title.strip():
            raise Problem("A list needs a title.")
        self._check_title(collection, title)
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
        if title is not None and title.strip() and title.strip() != current["title"]:
            self._check_title(current["collection"], title, vid)
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
