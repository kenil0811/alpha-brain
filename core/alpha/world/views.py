"""Saved views: a named way of looking at one table (its filters, sorts, grouping, columns and
which of the eleven views draws it). The person saves them from a table's List menu; Alpha saves
them when asked ("show me open roles by company"). A view is data, never a page of its own, so
the table's page draws every one the same way.

The config is the window's `ViewConfig` as JSON. Only what the core can check is checked: the
kind, and that every field it names belongs to the table, so a view never silently filters on a
field that is not there.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from alpha.world.collections import Collections
from alpha.world.store import Problem, Store, dumps, loads, new_id, now

VIEW_KINDS = {"table", "board", "list", "timeline", "chart", "gallery", "form", "calendar",
              "map", "graph", "tree"}
FILTER_OPS = {"contains", "does_not_contain", "is", "is_not", "is_empty", "is_not_empty",
              "starts_with", "ends_with", "gt", "gte", "lt", "lte", "before", "after",
              "on_or_before", "on_or_after", "is_any_of", "is_none_of", "is_checked",
              "is_not_checked"}
SYSTEM = {"id", "created_at", "updated_at"}
# Config keys that name one field of the table.
FIELD_KEYS = ("groupBy", "subGroupBy", "dateBy", "endDateBy", "locationBy", "relationBy",
              "parentBy", "chartValueField", "frozenColumnId")


def view_of(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "collection": row["collection"],
        "title": row["title"],
        "config": loads(row["config"], {}),
        "is_default": bool(row["is_default"]),
        "created_by": row["created_by"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


class Views:
    def __init__(self, store: Store, collections: Collections) -> None:
        self.store = store
        self.collections = collections

    def _check(self, collection: str, config: dict[str, Any]) -> dict[str, Any]:
        if not isinstance(config, dict):
            raise Problem("A view's config is an object (kind, filters, sorts, …).")
        names = {f["name"] for f in self.collections.describe(collection)["fields"]} | SYSTEM
        kind = config.get("kind", "table")
        if kind not in VIEW_KINDS:
            raise Problem(f"'{kind}' is not a view; use one of {sorted(VIEW_KINDS)}.")
        unknown: list[str] = []
        for f in config.get("rowFilters") or []:
            if f.get("field") not in names:
                unknown.append(str(f.get("field")))
            if f.get("op") not in FILTER_OPS:
                raise Problem(f"'{f.get('op')}' is not a filter; use one of {sorted(FILTER_OPS)}.")
            value = f.get("value")
            # A relative day keeps a saved "this week" current: {"$today": -7} is a week ago.
            if isinstance(value, dict) and (set(value) != {"$today"} or not isinstance(
                    value["$today"], int) or isinstance(value["$today"], bool)):
                raise Problem('A filter value is words, or a day relative to today as'
                              ' {"$today": <days>}, e.g. {"$today": -7}.')
        unknown += [str(s.get("id")) for s in config.get("sorts") or [] if s.get("id") not in names]
        unknown += [str(config[k]) for k in FIELD_KEYS if config.get(k) and config[k] not in names]
        unknown += [str(h) for h in config.get("hidden") or [] if h not in names]
        if unknown:
            raise Problem(f"'{collection}' has no field {sorted(set(unknown))}; its fields are"
                          f" {sorted(names - SYSTEM)}.")
        return {**config, "kind": kind}

    def all(self, collection: str) -> list[dict[str, Any]]:
        rows = self.store.all(
            "SELECT * FROM views WHERE collection = ? ORDER BY created_at, rowid", (collection,))
        return [view_of(r) for r in rows]

    def get(self, vid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM views WHERE id = ?", (vid,))
        if row is None:
            raise Problem(f"There is no saved view {vid}.")
        return view_of(row)

    def find(self, collection: str, title: str) -> dict[str, Any] | None:
        row = self.store.one("SELECT * FROM views WHERE collection = ? AND title = ?",
                             (collection, title))
        return view_of(row) if row else None

    def create(self, collection: str, title: str, config: dict[str, Any], *, by: str,
               is_default: bool = False) -> dict[str, Any]:
        title = title.strip()
        if not title:
            raise Problem("A saved view needs a name.")
        if self.find(collection, title):
            raise Problem(f"'{collection}' has a view called {title} already; pick another name.")
        clean = self._check(collection, config)
        vid, stamp = new_id("v"), now()
        with self.store.tx() as db:
            if is_default:
                db.execute("UPDATE views SET is_default = 0 WHERE collection = ?", (collection,))
            db.execute(
                "INSERT INTO views (id, collection, title, config, is_default, created_by,"
                " created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)",
                (vid, collection, title, dumps(clean), int(is_default), by, stamp, stamp),
            )
        return self.get(vid)

    def update(self, vid: str, *, title: str | None = None, config: dict[str, Any] | None = None,
               is_default: bool | None = None) -> dict[str, Any]:
        view = self.get(vid)
        if title is not None:
            title = title.strip()
            if not title:
                raise Problem("A saved view needs a name.")
            other = self.find(view["collection"], title)
            if other and other["id"] != vid:
                raise Problem(f"There is a view called {title} already; pick another name.")
        clean = self._check(view["collection"], config) if config is not None else None
        with self.store.tx() as db:
            if is_default:
                db.execute("UPDATE views SET is_default = 0 WHERE collection = ?",
                           (view["collection"],))
            db.execute(
                "UPDATE views SET title = ?, config = ?, is_default = ?, updated_at = ?"
                " WHERE id = ?",
                (title or view["title"], dumps(clean if clean is not None else view["config"]),
                 int(view["is_default"] if is_default is None else is_default), now(), vid),
            )
        return self.get(vid)

    def delete(self, vid: str) -> dict[str, Any]:
        view = self.get(vid)
        with self.store.tx() as db:
            db.execute("DELETE FROM views WHERE id = ?", (vid,))
        return view
