"""Decisions: who decided what, why, what else was considered, on what evidence, and what it
replaces (design Q44, Q50; Kenil, 12 Oct 2026: "all decisions / checkpoints should be
persisted").

Recorded where people decide, at the plan and choice level, never per step: the person's yes
or no to a suggestion on their workflow page, an agent's choice of method, Alpha's judgement
on how much to look into something. The person's decisions bind every agent (changed only by
asking them); Alpha's and an agent's own are open to revision with the reason kept. `about`
names what a decision concerns (a module, a workflow, an agent, a thing), so a page can list
the decisions about it and a removal can take them with what they were about."""

from __future__ import annotations

import sqlite3
from typing import Any

from alpha.world.store import Problem, Store, dumps, loads, new_id, now

STATES = ("binding", "open", "revised")


def _row(row: sqlite3.Row) -> dict[str, Any]:
    out = {k: row[k] for k in row.keys()}
    out["alternatives"] = loads(row["alternatives"], [])
    out["evidence"] = loads(row["evidence"], {})
    out["about"] = loads(row["about"], {})
    return out


class Decisions:
    def __init__(self, store: Store) -> None:
        self.store = store

    def record(self, *, by: str, what: str, why: str | None = None,
               alternatives: list[str] | None = None, evidence: dict[str, Any] | None = None,
               replaces: str | None = None, about: dict[str, Any] | None = None,
               state: str | None = None) -> dict[str, Any]:
        """One decision. `by` is "person", "alpha" or an agent's id; a person's is binding
        unless said otherwise, anyone else's is open."""
        what = " ".join(what.split())
        if not what:
            raise Problem("A decision says what was decided.")
        state = state or ("binding" if by == "person" else "open")
        if state not in STATES:
            raise Problem(f"A decision's state is one of {STATES}.")
        did = new_id("d")
        stamp = now()
        with self.store.tx() as db:
            if replaces:
                db.execute("UPDATE decisions SET state = 'revised', updated_at = ? WHERE id = ?",
                           (stamp, replaces))
            db.execute(
                "INSERT INTO decisions (id, at, by, what, why, alternatives, evidence,"
                " replaces, about, state, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (did, stamp, by, what, (why or "").strip() or None,
                 dumps([a for a in (alternatives or []) if a]), dumps(evidence or {}),
                 replaces, dumps(about or {}), state, stamp))
        return self.get(did)

    def get(self, did: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM decisions WHERE id = ?", (did,))
        if row is None:
            raise Problem(f"There is no decision {did}.")
        return _row(row)

    def about(self, key: str, value: str, *, limit: int = 100) -> list[dict[str, Any]]:
        """The decisions about one thing (`about[key] == value`), newest first."""
        rows = self.store.all(
            "SELECT * FROM decisions WHERE json_extract(about, ?) = ?"
            " ORDER BY at DESC, rowid DESC LIMIT ?",
            (f"$.{key}", value, limit))
        return [_row(r) for r in rows]

    def binding(self, key: str, value: str) -> list[dict[str, Any]]:
        """The person's decisions about a thing that still stand, oldest first: what an
        agent reads before it works on it."""
        rows = self.store.all(
            "SELECT * FROM decisions WHERE json_extract(about, ?) = ? AND state = 'binding'"
            " ORDER BY at", (f"$.{key}", value))
        return [_row(r) for r in rows]

    def recent(self, limit: int = 50) -> list[dict[str, Any]]:
        return [_row(r) for r in self.store.all(
            "SELECT * FROM decisions ORDER BY at DESC, rowid DESC LIMIT ?", (limit,))]

    @staticmethod
    def remove_about(db: sqlite3.Connection, key: str, value: str) -> int:
        """Inside a removal's transaction: the decisions about a thing go with it."""
        return db.execute("DELETE FROM decisions WHERE json_extract(about, ?) = ?",
                          (f"$.{key}", value)).rowcount
