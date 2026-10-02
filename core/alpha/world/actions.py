"""Pending actions: the one way anything is written outside Alpha's own space.

Alpha never writes outward itself. It proposes (`propose`): the exact payload is stored with
its kind and connector, and the person is asked (an `asked` journal entry, shown on Home). Only
the person's approve runs it (`approve`, reached from the app's HTTP API and nowhere else):
the stored payload, exactly once, fail-closed. The row is claimed as approved before anything
runs, so a crash or a second click never runs it again. The decision is journaled as the ask's
`answered`, and the result as `did` or `failed`. The outcomes are DeepSeek Harness's:
allowed once, rejected, or unavailable (nothing in Alpha can do that kind yet, or it is never
allowed); a proposal not decided within a week expires.

Executors are registered per kind (`register`). AB has no outward-write connector yet, so the
registry ships empty and every approval comes back unavailable; a connector that gains a write
registers its executor here, and that is the only place it may run from.

The never list (`never`) is checked before anything else, on proposing and again on approving:
moving money, permanent deletion outside Alpha's space, and passwords, card numbers or similar
secrets in a payload. Typing into password and card fields is refused by the browser driver
itself. Installing a plug-in is someone else's code: it can only ever be a pending action here.
"""

from __future__ import annotations

import os
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from alpha.world.store import Problem, dumps, loads, new_id, now
from alpha.world.world import World

EFFECT = "write_outward"
EXPIRES_AFTER = timedelta(days=7)
STATES = ("pending", "approved", "rejected", "expired", "unavailable")


@dataclass(frozen=True)
class Executor:
    connector: str
    run: Callable[[dict[str, Any]], dict[str, Any]]


EXECUTORS: dict[str, Executor] = {}


def register(kind: str, connector: str, run: Callable[[dict[str, Any]], dict[str, Any]]) -> None:
    """Make an outward write of `kind` possible: `run` gets the approved payload, once."""
    EXECUTORS[kind] = Executor(connector, run)


MONEY = {"pay", "payment", "payout", "transfer", "purchase", "buy", "sell", "trade", "withdraw",
         "deposit", "wire", "checkout", "donate", "refund", "money", "invest", "bet", "tip"}
PERMANENT = {"purge", "wipe", "erase", "shred", "permanent", "permanently", "expunge"}
SECRET_KEYS = re.compile(r"(?i)^(password|passwd|passcode|pin|cvc|cvv|csc|iban|ssn|"
                         r"card_?number|security_?code|secret|api_?key|token)$")
DIGITS = re.compile(r"(?:\d[ -]?){13,19}")


def _luhn(number: str) -> bool:
    digits = [int(d) for d in number if d.isdigit()]
    total = 0
    for i, d in enumerate(reversed(digits)):
        if i % 2:
            d = d * 2 - 9 if d > 4 else d * 2
        total += d
    return total % 10 == 0


def _walk(value: Any) -> list[tuple[str, Any]]:
    if isinstance(value, dict):
        return [(str(k), v) for k, v in value.items()] + [
            kv for v in value.values() for kv in _walk(v)]
    if isinstance(value, list):
        return [kv for v in value for kv in _walk(v)]
    return []


def never(kind: str, payload: dict[str, Any]) -> str | None:
    """Why this is never done, whatever Alpha or a page says, or None."""
    words = set(re.split(r"[^a-z]+", kind.lower()))
    if words & MONEY:
        return "Alpha never moves money"
    pairs = _walk(payload)
    if (("trash" in words and words & {"empty", "delete"}) or words & PERMANENT
            or any(k == "permanent" and v for k, v in pairs)):
        return "Alpha never deletes anything permanently outside its own space"
    if any(SECRET_KEYS.match(k) for k, _ in pairs):
        return "Alpha never enters passwords, card numbers or other secrets"
    strings = [v for _, v in pairs if isinstance(v, str)]
    if any(_luhn(m.group()) for s in strings for m in DIGITS.finditer(s)):
        return "Alpha never enters passwords, card numbers or other secrets"
    return None


def _view(row: Any) -> dict[str, Any]:
    out = {k: row[k] for k in row.keys()}
    out["payload"] = loads(row["payload"], {})
    out["result"] = loads(row["result"], None)
    return out


class Actions:
    def __init__(self, world: World) -> None:
        self.world = world
        self.store = world.store

    def get(self, aid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM pending_actions WHERE id = ?", (aid,))
        if row is None:
            raise Problem(f"There is no pending action {aid}.")
        return _view(row)

    def by_ask(self, ask_id: str) -> dict[str, Any] | None:
        row = self.store.one("SELECT * FROM pending_actions WHERE asked = ?", (ask_id,))
        return _view(row) if row else None

    def propose(self, kind: str, summary: str, payload: dict[str, Any], *,
                connector: str | None = None, turn: str | None = None,
                thread: str | None = None, module: str | None = None) -> dict[str, Any]:
        refused = never(kind, payload)
        if refused:
            self.world.journal.append("failed", f"Refused to propose {kind}: {refused}.",
                                      data={"kind": kind, "never": refused, "turn": turn},
                                      module=module, thread=thread)
            raise Problem(f"{refused}; this can't be proposed.")
        if not summary.strip():
            raise Problem("Say what the action does, in one sentence the person reads.")
        executor = EXECUTORS.get(kind)
        aid = new_id("pa")
        stamp = now()
        expires = (datetime.fromisoformat(stamp) + EXPIRES_AFTER).isoformat()
        asked = self.world.journal.append(
            "asked", summary, module=module, thread=thread,
            data={"pending_action": aid, "kind": kind, "effect": EFFECT,
                  "options": ["Approve", "Reject"], "turn": turn},
        )
        with self.store.tx() as db:
            db.execute(
                "INSERT INTO pending_actions (id, kind, effect, connector, payload, summary,"
                " created_by, thread, module, asked, state, created_at, expires_at)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,'pending',?,?)",
                (aid, kind, EFFECT, executor.connector if executor else connector or "unknown",
                 dumps(payload), summary, turn, thread, module, asked, stamp, expires),
            )
        return self.get(aid)

    def pending(self) -> list[dict[str, Any]]:
        self.expire()
        return [_view(r) for r in self.store.all(
            "SELECT * FROM pending_actions WHERE state = 'pending' ORDER BY created_at")]

    def expire(self) -> None:
        for row in self.store.all("SELECT id, asked FROM pending_actions WHERE state = 'pending'"
                                  " AND expires_at <= ?", (now(),)):
            if self._claim(row["id"], "expired"):
                self._answer(self.get(row["id"]), "Expired without a decision.", "expired",
                             actor="alpha")

    def _claim(self, aid: str, state: str) -> bool:
        """Move a pending action to its decision, once: False if it was already decided."""
        with self.store.tx() as db:
            return db.execute(
                "UPDATE pending_actions SET state = ?, decided_at = ? WHERE id = ?"
                " AND state = 'pending'", (state, now(), aid)).rowcount == 1

    def _answer(self, action: dict[str, Any], words: str, outcome: str, *,
                actor: str = "person") -> str:
        return self.world.journal.append(
            "answered", words, actor=actor, module=action["module"], thread=action["thread"],
            data={"ask": action["asked"], "pending_action": action["id"], "outcome": outcome},
        )

    def _only_the_person(self, by: str) -> None:
        # A model run (a turn or an automation) has ALPHA_TURN set in its tools' process; the
        # app's HTTP API never does. Neither can decide.
        if by != "person" or os.environ.get("ALPHA_TURN"):
            raise Problem("Only the person decides on an action, in the app.")

    def reject(self, aid: str, *, by: str) -> dict[str, Any]:
        self._only_the_person(by)
        action = self.get(aid)
        if not self._claim(aid, "rejected"):
            raise Problem(f"That action was already {action['state']}.")
        self._answer(action, "Rejected.", "rejected")
        return self.get(aid)

    def approve(self, aid: str, *, by: str) -> dict[str, Any]:
        """Run exactly the stored payload, once."""
        self._only_the_person(by)
        self.expire()
        action = self.get(aid)
        refused = never(action["kind"], action["payload"])
        executor = EXECUTORS.get(action["kind"])
        state = "unavailable" if refused or executor is None else "approved"
        if not self._claim(aid, state):
            raise Problem(f"That action was already {action['state']}.")
        if executor is None or refused:
            why = refused or f"nothing in Alpha can do {action['kind']} yet"
            self._answer(action, "Approved, but it can't be done.", "unavailable")
            self.world.journal.append("failed", f"Couldn't {action['summary']}: {why}.",
                                      data={"pending_action": aid}, module=action["module"],
                                      thread=action["thread"])
            with self.store.tx() as db:
                db.execute("UPDATE pending_actions SET result = ? WHERE id = ?",
                           (dumps({"error": why}), aid))
            return self.get(aid)
        self._answer(action, "Approved.", "allowed_once")
        try:
            result = executor.run(dict(action["payload"]))
            done, text = "did", f"Done: {action['summary']}"
        except Exception as e:  # it ran once and failed: say so, never retry
            result = {"error": str(e)}
            done, text = "failed", f"Tried once and it failed: {action['summary']} ({e})"
        with self.store.tx() as db:
            db.execute("UPDATE pending_actions SET result = ? WHERE id = ?", (dumps(result), aid))
        self.world.journal.append(done, text, actor="alpha", module=action["module"],
                                  thread=action["thread"],
                                  data={"pending_action": aid, "result": result,
                                        "connector": action["connector"]})
        return self.get(aid)

