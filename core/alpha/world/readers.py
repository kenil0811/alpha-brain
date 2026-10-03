"""Readers: know-how Alpha writes for itself, to turn a page into rows.

A reader is a small JavaScript function body Alpha wrote for one page of one site (say, a
person's LinkedIn connections): it runs in the page through the browser hand (read-only by
mechanism) and returns a list of objects. Alpha writes it after looking at the real page, keeps
it only once it has returned good rows, and repairs it when a run comes back wrong. The platform
never writes readers; it only runs them and keeps their health. Since 3 Oct 2026 a reader is a
skill of kind read (`skills.py`); this module keeps the reader API over that table.

Health is checked on every run, before anything is written: no rows, far fewer rows than the
last good run, or rows missing what the target table requires mean the reader is broken, the
table is left alone, and Alpha is told to repair it.
"""

from __future__ import annotations

from typing import Any

from alpha.world.names import check_name
from alpha.world.skills import Skills
from alpha.world.store import Store, now

DROP = 0.5
HELD = 0.75
MISSING = 0.2


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
    """Read skills, by the API the rest of the code has used since the first reader."""

    def __init__(self, store: Store) -> None:
        self.store = store
        self.skills = Skills(store)

    def save(self, name: str, *, site: str, url: str, script: str, description: str,
             to_end: bool, count: int, whole: bool = True, when_to_use: str | None = None,
             source: str | None = None) -> dict[str, Any]:
        check_name(name, "reader", "linkedin_connections")
        stamp = now()
        return self.skills.save(name, "read", description=description, site=site, url=url,
                                when_to_use=when_to_use, source=source, health="ok",
                                script=script, to_end=to_end, whole=whole, last_run_at=stamp,
                                last_count=count, last_ok_count=count, last_problem=None)

    def get(self, name: str) -> dict[str, Any]:
        return self.skills.get(name, "read")

    def names(self) -> list[str]:
        return self.skills.names("read")

    def all(self) -> list[dict[str, Any]]:
        return self.skills.all("read")

    def ran(self, name: str, *, count: int, problem: str | None) -> dict[str, Any]:
        return self.skills.ran(name, problem=problem, count=count)
