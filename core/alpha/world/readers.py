"""Readers: know-how Alpha writes for itself, to turn a page into rows.

A reader is a small JavaScript function body Alpha wrote for one page of one site (say, a
person's LinkedIn connections): it runs in the page through the browser hand (read-only by
mechanism) and returns a list of objects. Alpha writes it after looking at the real page, keeps
it only once it has returned good rows, and repairs it when a run comes back wrong. The platform
never writes readers; it only runs them and keeps their health.

Health is checked on every run, before anything is written: no rows, far fewer rows than the
last good run, or rows missing what the target table requires mean the reader is broken, the
table is left alone, and Alpha is told to repair it.
"""

from __future__ import annotations

import re
import sqlite3
from collections.abc import Callable
from typing import Any
from urllib.parse import urlparse

from alpha.world.store import Problem, Store, dumps, loads, now

NAME = re.compile(r"^[a-z][a-z0-9_]{1,47}$")
DROP = 0.5
HELD = 0.75
MISSING = 0.2


def _view(row: sqlite3.Row) -> dict[str, Any]:
    out = {k: row[k] for k in row.keys()}
    out["to_end"] = bool(row["to_end"])
    out["whole"] = bool(row["whole"])
    out["allow_posts"] = loads(row["allow_posts"], [])
    return out


def allowed_posts(rules: list[dict[str, Any]] | None, site: str,
                  site_of: Callable[[str], str]) -> list[dict[str, str]]:
    """A reader's read-only POSTs, checked: each is an origin on the reader's own site and a path
    (`*` matches anything). Everything else a read session sends that isn't GET is blocked."""
    out = []
    for rule in rules or []:
        origin, path = str(rule.get("origin", "")), str(rule.get("path", ""))
        parsed = urlparse(origin)
        if parsed.scheme != "https" or not parsed.hostname or parsed.path not in ("", "/"):
            raise Problem(f"allow_posts origin '{origin}' must be like https://www.{site}.")
        if site_of(origin) != site:
            raise Problem(f"allow_posts may only name {site}, not {parsed.hostname}.")
        if not path.startswith("/"):
            raise Problem(f"allow_posts path '{path}' must start with /.")
        out.append({"origin": f"https://{parsed.hostname}"
                    + (f":{parsed.port}" if parsed.port else ""), "path": path})
    return out


def health_problem(rows: Any, *, last_ok: int | None,
                   required: list[str] | None = None, held: int | None = None) -> str | None:
    """Why this result means the reader is broken, or None when it looks right. `held` is how
    many rows this reader found before that are not gone (other readers' rows in the same table
    don't count): a run that returns far fewer is reading only part of the list."""
    if not isinstance(rows, list) or not all(isinstance(r, dict) for r in rows):
        return "the reader didn't return a list of rows"
    if not rows:
        return "the reader returned no rows"
    if last_ok and len(rows) < last_ok * DROP:
        return f"the reader returned {len(rows)} rows where the last good run had {last_ok}"
    if held and len(rows) < held * HELD:
        return (f"the reader returned {len(rows)} rows where it found {held} that are still "
                "listed: it is probably reading only part of the list (does it need to_end?)")
    for field in required or []:
        missing = sum(1 for r in rows if r.get(field) in (None, "", []))
        if missing > len(rows) * MISSING:
            return f"{missing} of {len(rows)} rows have no {field}"
    return None


class Readers:
    def __init__(self, store: Store) -> None:
        self.store = store

    def save(self, name: str, *, site: str, url: str, script: str, description: str,
             to_end: bool, count: int, whole: bool = True,
             allow_posts: list[dict[str, str]] | None = None) -> dict[str, Any]:
        if not NAME.match(name):
            raise Problem("A reader's name is lower-case words joined by _, e.g. "
                          "linkedin_connections.")
        stamp = now()
        prior = self.store.one("SELECT version FROM readers WHERE name = ?", (name,))
        with self.store.tx() as db:
            if prior:
                db.execute(
                    "UPDATE readers SET site = ?, url = ?, script = ?, to_end = ?, whole = ?,"
                    " description = ?, version = version + 1, health = 'ok', last_problem = NULL,"
                    " last_run_at = ?, last_count = ?, last_ok_count = ?, updated_at = ?,"
                    " allow_posts = ? WHERE name = ?",
                    (site, url, script, int(to_end), int(whole), description, stamp, count, count,
                     stamp, dumps(allow_posts or []), name),
                )
            else:
                db.execute(
                    "INSERT INTO readers (name, site, url, script, to_end, whole, description,"
                    " last_run_at, last_count, last_ok_count, created_at, updated_at, allow_posts)"
                    " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (name, site, url, script, int(to_end), int(whole), description, stamp, count,
                     count, stamp, stamp, dumps(allow_posts or [])),
                )
        return self.get(name)

    def get(self, name: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM readers WHERE name = ?", (name,))
        if row is None:
            raise Problem(f"There is no reader '{name}'. Readers: {self.names()}.")
        return _view(row)

    def names(self) -> list[str]:
        return [r["name"] for r in self.store.all("SELECT name FROM readers ORDER BY name")]

    def all(self) -> list[dict[str, Any]]:
        return [_view(r) for r in self.store.all("SELECT * FROM readers ORDER BY site, name")]

    def ran(self, name: str, *, count: int, problem: str | None) -> dict[str, Any]:
        stamp = now()
        with self.store.tx() as db:
            if problem:
                db.execute(
                    "UPDATE readers SET health = 'broken', last_problem = ?, last_run_at = ?,"
                    " last_count = ?, updated_at = ? WHERE name = ?",
                    (problem, stamp, count, stamp, name),
                )
            else:
                db.execute(
                    "UPDATE readers SET health = 'ok', last_problem = NULL, last_run_at = ?,"
                    " last_count = ?, last_ok_count = ?, updated_at = ? WHERE name = ?",
                    (stamp, count, count, stamp, name),
                )
        return self.get(name)
