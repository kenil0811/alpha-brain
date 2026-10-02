"""Plans: what Alpha proposes to set up, and its way from the person's yes to a finished build.

Alpha never builds on a request straight away. It understands, researches, looks at the
sources, and proposes a plan; the person says yes (in their own words, after the plan) or
presses Approve; only then does a build run, in the background, in the plan's own thread.

    proposed → approved → building → done
                                   ↘ stopped
    proposed → declined | replaced (by a revised plan)

While a plan is building, its thread is the only place where lasting things (modules, tables,
readers, automations, sources) can be made.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from alpha.world.store import Problem, Store, new_id, now

STATES = ("proposed", "approved", "building", "done", "stopped", "declined", "replaced")


def _view(row: sqlite3.Row) -> dict[str, Any]:
    return {k: row[k] for k in row.keys()}


class Plans:
    def __init__(self, store: Store) -> None:
        self.store = store

    def propose(self, title: str, body: str, *, module: str | None = None,
                turn: str | None = None, proposal: str | None = None,
                replaces: str | None = None, trial: str | None = None) -> dict[str, Any]:
        """`trial` is the first thing the person will do with what gets built, in their words;
        the finished build tries it and checks the answer against an independent one."""
        if not title.strip() or not body.strip():
            raise Problem("A plan needs a title and the plan itself.")
        stamp = now()
        pid = new_id("p")
        with self.store.tx() as db:
            if replaces:
                db.execute("UPDATE plans SET state = 'replaced', updated_at = ? WHERE id = ?"
                           " AND state = 'proposed'", (stamp, replaces))
            db.execute(
                "INSERT INTO plans (id, title, body, state, module, turn, proposal, trial,"
                " created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (pid, title.strip(), body.strip(), "proposed", module, turn, proposal,
                 (trial or "").strip() or None, stamp, stamp),
            )
        return self.get(pid)

    def checked(self, pid: str) -> dict[str, Any]:
        """One more trial of the finished build disagreed with an independent answer."""
        with self.store.tx() as db:
            db.execute("UPDATE plans SET checks = checks + 1, updated_at = ? WHERE id = ?",
                       (now(), pid))
        return self.get(pid)

    def set_module(self, pid: str, module: str) -> None:
        with self.store.tx() as db:
            db.execute("UPDATE plans SET module = ? WHERE id = ?", (module, pid))

    def set_proposal(self, pid: str, proposal: str) -> None:
        with self.store.tx() as db:
            db.execute("UPDATE plans SET proposal = ? WHERE id = ?", (proposal, pid))

    def get(self, pid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM plans WHERE id = ?", (pid,))
        if row is None:
            raise Problem(f"There is no plan {pid}.")
        return _view(row)

    def all(self, states: tuple[str, ...] | None = None) -> list[dict[str, Any]]:
        if states:
            marks = ",".join("?" * len(states))
            rows = self.store.all(f"SELECT * FROM plans WHERE state IN ({marks})"
                                  " ORDER BY created_at", states)
        else:
            rows = self.store.all("SELECT * FROM plans ORDER BY created_at")
        return [_view(r) for r in rows]

    def of_thread(self, thread: str | None) -> dict[str, Any] | None:
        if not thread:
            return None
        row = self.store.one("SELECT * FROM plans WHERE thread = ?", (thread,))
        return _view(row) if row else None

    def _move(self, pid: str, to: str, *, when: tuple[str, ...], **fields: Any) -> dict[str, Any]:
        plan = self.get(pid)
        if plan["state"] not in when:
            raise Problem(f"The plan '{plan['title']}' is {plan['state']}, not "
                          f"{' or '.join(when)}.")
        sets = ", ".join(f"{k} = ?" for k in fields)
        with self.store.tx() as db:
            db.execute(
                f"UPDATE plans SET state = ?{', ' + sets if sets else ''}, updated_at = ?"
                " WHERE id = ?", (to, *fields.values(), now(), pid),
            )
        return self.get(pid)

    def approve(self, pid: str, approval: str) -> dict[str, Any]:
        return self._move(pid, "approved", when=("proposed",), approval=approval)

    def decline(self, pid: str) -> dict[str, Any]:
        return self._move(pid, "declined", when=("proposed", "stopped"))

    def resume(self, pid: str) -> dict[str, Any]:
        """A build that stopped carries on from its brief."""
        return self._move(pid, "building", when=("stopped",), attempts=0, report=None)

    def start(self, pid: str, thread: str) -> dict[str, Any]:
        plan = self.get(pid)
        return self._move(pid, "building", when=("approved", "building"), thread=thread,
                          attempts=plan["attempts"] + 1)

    def finish(self, pid: str, report: str) -> dict[str, Any]:
        return self._move(pid, "done", when=("building",), report=report)

    def stop(self, pid: str, report: str) -> dict[str, Any]:
        return self._move(pid, "stopped", when=("approved", "building", "proposed"),
                          report=report)

    def recent(self) -> list[dict[str, Any]]:
        """Plans the person may still act on: proposed, approved, building, or stopped in the
        last two days (one that stopped can be resumed)."""
        rows = self.store.all(
            "SELECT * FROM plans WHERE state IN ('proposed', 'approved', 'building')"
            " OR (state = 'stopped' AND updated_at >= datetime('now', '-2 days'))"
            " ORDER BY created_at")
        return [_view(r) for r in rows]

    def waiting(self) -> list[dict[str, Any]]:
        """Plans the scheduler should run now: approved, or building."""
        return self.all(("approved", "building"))
