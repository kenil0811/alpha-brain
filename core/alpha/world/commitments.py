"""Commitments: what the person promised and what they are owed, with its date (design Q46).

Watson files them from what the person says ("I'll send Sania the deck before March") and
from what Alpha reads; a dated list Alpha can remind from (the pre-pack lists what is due
within a week), and that Scout reads. `who` is "person" or "entity:<id>"; `to_whom` the other
side when known. A commitment is open until the person marks it done, or it lapses."""

from __future__ import annotations

import sqlite3
from datetime import UTC, datetime, timedelta
from typing import Any

from alpha.world.store import Problem, Store, new_id, now

STATES = ("open", "done", "lapsed")


def _row(row: sqlite3.Row) -> dict[str, Any]:
    return {k: row[k] for k in row.keys()}


class Commitments:
    def __init__(self, store: Store) -> None:
        self.store = store

    def record(self, who: str, what: str, *, to_whom: str | None = None,
               due: str | None = None, source: str | None = None) -> dict[str, Any]:
        """Keep one commitment; the same open one (who and what) is not kept twice."""
        what = " ".join(what.split())
        if not what:
            raise Problem("A commitment says what was promised.")
        if not (who == "person" or who.startswith("entity:")):
            raise Problem("A commitment is the person's or an entity's (entity:<id>).")
        if due:
            try:
                due = datetime.fromisoformat(due).date().isoformat()
            except ValueError as e:
                raise Problem(f"A commitment's date is a day (YYYY-MM-DD), not {due!r}.") from e
        existing = self.store.one(
            "SELECT * FROM commitments WHERE who = ? AND lower(what) = lower(?) AND state = 'open'",
            (who, what))
        if existing:
            return _row(existing)
        cid = new_id("c")
        stamp = now()
        with self.store.tx() as db:
            db.execute(
                "INSERT INTO commitments (id, who, what, to_whom, due, state, source,"
                " created_at, updated_at) VALUES (?,?,?,?,?,'open',?,?,?)",
                (cid, who, what, (to_whom or "").strip() or None, due, source, stamp, stamp))
        return self.get(cid)

    def get(self, cid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM commitments WHERE id = ?", (cid,))
        if row is None:
            raise Problem(f"There is no commitment {cid}.")
        return _row(row)

    def of(self, who: str, states: tuple[str, ...] = ("open",)) -> list[dict[str, Any]]:
        """One side's commitments (made or owed), soonest due first."""
        marks = ",".join("?" * len(states))
        rows = self.store.all(
            f"SELECT * FROM commitments WHERE (who = ? OR to_whom = ?) AND state IN ({marks})"
            " ORDER BY due IS NULL, due, created_at", (who, who, *states))
        return [_row(r) for r in rows]

    def remind(self, what: str, at: str, *, source: str | None = None) -> dict[str, Any]:
        """A reminder: the person's own commitment with the moment to be reminded at (local
        time as given, kept in UTC). Kenil, 18 Oct 2026: a reminder is a row the Reminders
        agent owns, never an agent of its own."""
        try:
            moment = datetime.fromisoformat(at)
        except ValueError as e:
            raise Problem(f"A reminder's time is a date and time (2026-10-24T09:00), not {at!r}."
                          ) from e
        if moment.tzinfo is None:
            moment = moment.astimezone()  # the person's local time
        stamp = moment.astimezone(UTC).replace(microsecond=0).isoformat()
        row = self.record("person", what, due=moment.date().isoformat(), source=source)
        with self.store.tx() as db:
            db.execute("UPDATE commitments SET remind_at = ?, reminded_at = NULL, updated_at = ?"
                       " WHERE id = ?", (stamp, now(), row["id"]))
        return self.get(row["id"])

    def due_now(self, at: datetime | None = None) -> list[dict[str, Any]]:
        """Open reminders whose moment has come and whose card is not yet put."""
        moment = (at or datetime.now(UTC)).astimezone(UTC).isoformat()
        rows = self.store.all(
            "SELECT * FROM commitments WHERE state = 'open' AND remind_at IS NOT NULL"
            " AND remind_at <= ? AND reminded_at IS NULL ORDER BY remind_at", (moment,))
        return [_row(r) for r in rows]

    def reminded(self, cid: str) -> None:
        with self.store.tx() as db:
            db.execute("UPDATE commitments SET reminded_at = ?, updated_at = ? WHERE id = ?",
                       (now(), now(), cid))

    def snooze(self, cid: str, to: datetime) -> dict[str, Any]:
        """The reminder again at `to` (the same time tomorrow, say)."""
        self.get(cid)
        stamp = to.astimezone(UTC).replace(microsecond=0).isoformat()
        with self.store.tx() as db:
            db.execute("UPDATE commitments SET remind_at = ?, reminded_at = NULL, due = ?,"
                       " updated_at = ? WHERE id = ?",
                       (stamp, to.astimezone().date().isoformat(), now(), cid))
        return self.get(cid)

    def due_within(self, days: int) -> list[dict[str, Any]]:
        """Open commitments due within `days` from today (local), soonest first."""
        today = datetime.now(UTC).astimezone().date()
        until = (today + timedelta(days=days)).isoformat()
        rows = self.store.all(
            "SELECT * FROM commitments WHERE state = 'open' AND due IS NOT NULL AND due <= ?"
            " ORDER BY due, created_at", (until,))
        return [_row(r) for r in rows]

    def all(self, limit: int = 200) -> list[dict[str, Any]]:
        return [_row(r) for r in self.store.all(
            "SELECT * FROM commitments ORDER BY state = 'open' DESC, due IS NULL, due,"
            " created_at DESC LIMIT ?", (limit,))]

    def set_state(self, cid: str, state: str) -> dict[str, Any]:
        if state not in STATES:
            raise Problem(f"A commitment's state is one of {STATES}.")
        self.get(cid)
        with self.store.tx() as db:
            db.execute("UPDATE commitments SET state = ?, updated_at = ? WHERE id = ?",
                       (state, now(), cid))
        return self.get(cid)

    @staticmethod
    def remove_who(db: sqlite3.Connection, who: str) -> int:
        """Inside a removal's transaction: a person's commitments go with them."""
        return db.execute("DELETE FROM commitments WHERE who = ? OR to_whom = ?",
                          (who, who)).rowcount
