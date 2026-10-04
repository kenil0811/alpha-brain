"""Sources: everything a module reads from outside Alpha, and whether it works.

A source is a place data comes from (a page, a list on a site), with the reader that reads it
when there is one, and a status the platform keeps from what actually happened:

- working: its reader ran and returned rows;
- needs_signin: the site asked for a sign-in (the person can fix it);
- blocked: the site stops automated reading with a bot check or captcha (nobody can, safely);
- broken: its reader failed its health check (Alpha repairs it);
- not_built: known, but nothing reads it yet;
- unavailable: there is nothing to read (a dead link, no list on the page);
- skipped: the person chose not to read it.

Nothing falls off silently: a source Alpha could not read is still a row with a status the
person can see.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from alpha.world.sites import site_of
from alpha.world.store import Problem, Store, new_id, now

STATUSES = ("working", "needs_signin", "blocked", "broken", "not_built", "unavailable",
            "skipped")
WORDS = {"working": "working", "needs_signin": "need your sign-in", "blocked": "blocked",
         "broken": "broken", "not_built": "not read yet", "unavailable": "nothing to read",
         "skipped": "skipped by you"}


def _site(url: str) -> str:
    """The source's site by the one rule; words that aren't an address stay as they are."""
    try:
        return site_of(url)
    except Problem:
        return url.lower()


def _view(row: sqlite3.Row) -> dict[str, Any]:
    return {k: row[k] for k in row.keys()}


class Sources:
    def __init__(self, store: Store) -> None:
        self.store = store

    def add(self, title: str, url: str, *, module: str | None, reader: str | None = None,
            status: str = "not_built", detail: str | None = None) -> dict[str, Any]:
        """Add a source, or update the one with the same address in this module."""
        if status not in STATUSES:
            raise Problem(f"A source's status is one of {list(STATUSES)}; got '{status}'.")
        if not url.strip():
            raise Problem("A source needs its address.")
        stamp = now()
        existing = self.store.one("SELECT id FROM sources WHERE module IS ? AND url = ?",
                                  (module, url))
        with self.store.tx() as db:
            if existing:
                db.execute(
                    "UPDATE sources SET title = ?, reader = COALESCE(?, reader), status = ?,"
                    " detail = ?, updated_at = ? WHERE id = ?",
                    (title, reader, status, detail, stamp, existing["id"]),
                )
                sid = existing["id"]
            else:
                sid = new_id("s")
                db.execute(
                    "INSERT INTO sources (id, module, title, url, site, reader, status, detail,"
                    " created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (sid, module, title, url, _site(url), reader, status, detail, stamp,
                     stamp),
                )
        return self.get(sid)

    def get(self, sid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM sources WHERE id = ?", (sid,))
        if row is None:
            raise Problem(f"There is no source {sid}.")
        return _view(row)

    def all(self, module: str | None = None) -> list[dict[str, Any]]:
        if module is None:
            rows = self.store.all("SELECT * FROM sources ORDER BY module, title")
        else:
            rows = self.store.all("SELECT * FROM sources WHERE module = ? ORDER BY title",
                                  (module,))
        return [_view(r) for r in rows]

    def of_reader(self, reader: str) -> list[dict[str, Any]]:
        return [_view(r) for r in self.store.all("SELECT * FROM sources WHERE reader = ?",
                                                 (reader,))]

    def ran(self, reader: str, *, status: str, detail: str | None = None,
            rows: int | None = None) -> None:
        """What a run of `reader` showed, for every source it reads."""
        with self.store.tx() as db:
            db.execute(
                "UPDATE sources SET status = ?, detail = ?, last_checked = ?,"
                " last_rows = COALESCE(?, last_rows), updated_at = ? WHERE reader = ?",
                (status, detail, now(), rows, now(), reader),
            )

    def site_says(self, site: str, status: str, detail: str) -> int:
        """A page on `site` asked for a sign-in or stopped Alpha with a bot check: every
        source on that site says so (one that was working stays working until its own reader
        fails, since one page's wall isn't another's; one the person skipped stays skipped)."""
        site = site.removeprefix("www.")
        with self.store.tx() as db:
            return db.execute(
                "UPDATE sources SET status = ?, detail = ?, last_checked = ?, updated_at = ?"
                " WHERE (site = ? OR site LIKE ?) AND status NOT IN ('working', 'skipped')",
                (status, detail, now(), now(), site, f"%.{site}"),
            ).rowcount

    def coverage(self, module: str | None) -> dict[str, int]:
        counts = dict.fromkeys(STATUSES, 0)
        for s in self.all(module) if module else []:
            counts[s["status"]] += 1
        return counts

    def coverage_line(self, module: str | None) -> str | None:
        counts = self.coverage(module)
        total = sum(counts.values())
        if not total:
            return None
        parts = [f"{n} {WORDS[k]}" for k, n in counts.items() if n]
        return f"Sources: {total} in all — " + ", ".join(parts) + "."

    def remove_module(self, db: sqlite3.Connection, module: str) -> int:
        return db.execute("DELETE FROM sources WHERE module = ?", (module,)).rowcount
