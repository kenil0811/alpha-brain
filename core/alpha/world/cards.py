"""Cards (P3 of `tasks-and-cards-proposal.md`, Q86, Q91, Q94; 19 Oct 2026): everything that waits
on the person's decision is one row here, whatever it asks. That covers a question, a removal's
yes, Scout's costly pick, a reminder, Columbo's two values, a sign-in, a proposal, an outward
action and a drafted plan page.

The journal keeps the lines (`asked`, `proposed`, `answered`), verbatim; this table is the state.
It is written by the journal in the same transaction as the line, so nothing that asks or
answers can miss it. Needs you, the rail's dot and Home count one thing: waiting cards.

A card knows where it came from: who drafted it, the turn or run, the task the run served, and
what outside content it rests on (the pages the turn or run read before it, from the journal by
code, never from the model's words). One waiting card per identical step: a twin is never
made, and the waiting one takes the newer turn. The key is the drafter, the target and the
content. A No can carry a reason, put in front of the drafting agent's next run."""

from __future__ import annotations

import hashlib
import sqlite3
from typing import TYPE_CHECKING, Any

from alpha.world.store import Problem, dumps, loads, now

if TYPE_CHECKING:
    from alpha.world.world import World

# What a card asks, from its line: a question of the person's, a removal's yes (the engine's
# permission), Scout's costly pick, a reminder, Columbo's two values, the routing judge's
# "which is this about?", a sign-in, a proposal, a standing instruction or a table offered,
# an outward action, a drafted plan page.
KINDS = ("question", "permission", "pick", "reminder", "check", "routing", "signin", "proposal",
         "instruction", "offer", "action", "workflow")
# waiting until decided; a question is answered or skipped; a decision is yes, edited (yes after
# the person changed it), no (with its reason), or allowed (a standing permission said yes);
# withdrawn when what it was about went or a newer card took its place.
STATES = ("waiting", "answered", "yes", "edited", "no", "allowed", "skipped", "withdrawn")
# A No says why, in one tap (P3 item 3): kept on the card and put in front of the drafting
# agent's next run. It tunes what the agent does, never its code.
REASONS = ("Wrong place", "Duplicate", "Not needed", "Bad timing", "Wrong recipient",
           "Something else")
# Decisions whose first option is the yes and second the no: code wrote the options, so the
# answer's words are matched against them, never read for meaning (Q78).
YES_NO = ("permission", "pick")


def reason_of(reason: str | None) -> str | None:
    """A No's reason as the window sends it: one of REASONS, or none."""
    if reason is None or not reason.strip():
        return None
    if reason not in REASONS:
        raise Problem(f"A reason is one of: {', '.join(REASONS)}.")
    return reason


def kind_of(line: str, data: dict[str, Any]) -> str | None:
    """What a line asks of the person; None for a line that is no card (Scout's picks of the
    day, which Home lists and decides on their own; a plan's proposal from before 12 Oct)."""
    if line == "asked":
        for key, kind in (("permission", "permission"), ("scout", "pick"),
                          ("reminder", "reminder"), ("columbo", "check"),
                          ("routing", "routing"), ("connection", "signin"),
                          ("reader", "signin")):
            if data.get(key):
                return kind
        return "question"
    if data.get("scout") or data.get("plan"):
        return None
    for key, kind in (("action", "action"), ("workflow", "workflow"),
                      ("instruction", "instruction"), ("offer", "offer")):
        if data.get(key):
            return kind
    return "proposal"


def _words(text: str) -> str:
    return " ".join(str(text).lower().split())


def key_of(kind: str, actor: str, text: str, data: dict[str, Any], module: str | None,
           thread: str | None) -> str:
    """The drafter, the target and the content: two cards with one key are the same step. A
    removal's yes is its turn's own (two turns may each wait on theirs)."""
    target, content = thread or module or "home", _words(text)
    if kind == "permission":
        target, content = str(data.get("turn") or ""), dumps(sorted(data.get("records") or []))
    elif kind == "reminder":
        target, content = str(data.get("reminder")), ""
    elif kind == "check":
        c = data.get("columbo") or {}
        target, content = f"{c.get('collection')}/{c.get('record')}", str(c.get("field"))
    elif kind == "signin":
        target, content = str(data.get("connection") or data.get("reader")), ""
    elif kind == "routing":
        content = _words((data.get("routing") or {}).get("text") or text)
    elif kind == "pick":
        target, content = str(data.get("proposal")), ""
    elif kind in ("action", "workflow"):
        target, content = str(data.get(kind)), ""
    elif kind == "instruction":
        content = _words(str(data.get("instruction") or text))
    elif kind == "offer":
        content = _words(str((data.get("offer") or {}).get("kind") or text))
    raw = "\x1f".join((kind, actor, target, content))
    return hashlib.sha1(raw.encode()).hexdigest()[:20]


def outcome(card: sqlite3.Row, text: str, data: dict[str, Any]) -> str:
    """The state an `answered` line leaves its card in, from the line's own keys."""
    closed = data.get("closed")
    if closed == "dismissed":
        return "skipped"
    if closed == "done":
        return "answered"
    if closed:
        return "withdrawn"  # removed, replaced: what it was about went, or a newer one came
    if data.get("allowed"):
        return "allowed"
    if "accept" in data:
        if not data["accept"]:
            return "no"
        return "edited" if data.get("edited") else "yes"
    if card["kind"] in YES_NO:
        options = loads(card["options"], [])
        if options[:1] == [text]:
            return "yes"
        if len(options) > 1 and text in options[1:]:
            return "no"
    return "answered"


def view(row: sqlite3.Row) -> dict[str, Any]:
    out = {k: row[k] for k in row.keys()}
    out["options"] = loads(row["options"], [])
    out["rests_on"] = loads(row["rests_on"], [])
    return out


class Cards:
    def __init__(self, world: World) -> None:
        self.world = world
        self.store = world.store

    # ---- written by the journal, in the line's own transaction ----

    def twin(self, db: sqlite3.Connection, line: str, actor: str, text: str,
             data: dict[str, Any], module: str | None, thread: str | None) -> str | None:
        """A waiting card for the same step, if one: the line is not written and the card
        takes the newer turn, so the next message answers it there (P3 item 4)."""
        kind = kind_of(line, data)
        if kind is None or kind == "permission":
            return None
        key = key_of(kind, actor, text, data, module, thread)
        row = db.execute("SELECT id FROM cards WHERE key = ? AND state = 'waiting'"
                         " ORDER BY created_at DESC LIMIT 1", (key,)).fetchone()
        if row is None:
            return None
        db.execute("UPDATE cards SET twins = twins + 1, turn = COALESCE(?, turn) WHERE id = ?",
                   (data.get("turn"), row["id"]))
        return str(row["id"])

    def on_line(self, db: sqlite3.Connection, jid: str, line: str, actor: str, text: str,
                data: dict[str, Any], module: str | None, thread: str | None) -> None:
        if line == "answered":
            self._decide(db, actor, text, data)
        else:
            self._put(db, jid, line, actor, text, data, module, thread)

    def _put(self, db: sqlite3.Connection, jid: str, line: str, actor: str, text: str,
             data: dict[str, Any], module: str | None, thread: str | None) -> None:
        kind = kind_of(line, data)
        if kind is None:
            return
        run, turn = data.get("run"), data.get("turn")
        task = data.get("task")
        if not task and run:
            served = db.execute("SELECT task FROM runs WHERE id = ?", (run,)).fetchone()
            task = served["task"] if served else None
        # what it rests on: the outside pages the turn or run read before it, by code
        rests: list[dict[str, Any]] = []
        if run or turn:
            for r in db.execute(
                    "SELECT text, data FROM journal WHERE kind = 'saw' AND deleted_at IS NULL"
                    " AND (json_extract(data, '$.run') = ? OR json_extract(data, '$.turn') = ?)"
                    " ORDER BY rowid", (run or "", turn or "")):
                seen = {"text": str(r["text"])[:200], "url": loads(r["data"], {}).get("url")}
                if seen not in rests:
                    rests.append(seen)
        ref = (data.get("action") or data.get("workflow") or data.get("proposal")
               or data.get("reminder") or data.get("connection") or data.get("reader"))
        db.execute(
            "INSERT OR IGNORE INTO cards (id, kind, text, options, drafter, thread, module, turn,"
            " run, task, ref, key, rests_on, state, created_at)"
            " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'waiting',?)",
            (jid, kind, text, dumps(data.get("options") or []), actor, thread, module, turn, run,
             task, ref, key_of(kind, actor, text, data, module, thread), dumps(rests), now()))

    def _decide(self, db: sqlite3.Connection, actor: str, text: str,
                data: dict[str, Any]) -> None:
        """The first answer decides; a later one is history only."""
        target = data.get("ask") or data.get("proposal")
        if not target:
            return
        card = db.execute("SELECT * FROM cards WHERE id = ?", (target,)).fetchone()
        if card is None or card["state"] != "waiting":
            return
        db.execute("UPDATE cards SET state = ?, answer = ?, reason = ?, decided_by = ?,"
                   " decided_at = ? WHERE id = ? AND state = 'waiting'",
                   (outcome(card, text, data), text, data.get("reason"), actor, now(),
                    card["id"]))
        self._settle_thread(db, card["thread"])

    @staticmethod
    def _settle_thread(db: sqlite3.Connection, thread: str | None) -> None:
        """A thread that waited only on cards no longer does once none waits there (found by
        the 19 Oct map: a card closed without a turn left its item saying it needed you)."""
        if not thread:
            return
        if db.execute("SELECT 1 FROM cards WHERE thread = ? AND state = 'waiting' LIMIT 1",
                      (thread,)).fetchone() is None:
            db.execute("UPDATE threads SET state = 'done', updated_at = ? WHERE id = ?"
                       " AND state = 'needs_you'", (now(), thread))

    def after(self, jid: str, line: str, data: dict[str, Any]) -> None:
        """After the line's transaction: the task a card waits on says so (P3 item 1)."""
        target = (data.get("ask") or data.get("proposal")) if line == "answered" else jid
        card = self.store.one("SELECT task FROM cards WHERE id = ?", (target,)) if target \
            else None
        if card is not None and card["task"]:
            self.flag_task(str(card["task"]))

    def flag_task(self, task: str) -> None:
        """A task with a waiting card is "Waiting for your yes"; one without is not."""
        waiting = self.store.one("SELECT 1 FROM cards WHERE task = ? AND state = 'waiting'"
                                 " LIMIT 1", (task,)) is not None
        try:
            row = self.world.tasks.get(task)
        except Exception:  # the task went since; the card keeps its id as history
            return
        if bool(row.get("waiting")) != waiting:
            self.world.tasks._set(task, {"waiting": waiting}, by="alpha")

    # ---- reading ----

    def get(self, cid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM cards WHERE id = ?", (cid,))
        if row is None:
            raise Problem(f"There is no card {cid}.")
        return view(row)

    def waiting(self, *, thread: str | None = None) -> list[dict[str, Any]]:
        """Everything that waits on the person, oldest first."""
        if thread:
            rows = self.store.all("SELECT * FROM cards WHERE state = 'waiting' AND thread = ?"
                                  " ORDER BY created_at", (thread,))
        else:
            rows = self.store.all("SELECT * FROM cards WHERE state = 'waiting'"
                                  " ORDER BY created_at")
        return [view(r) for r in rows]

    def of_task(self, task: str) -> list[dict[str, Any]]:
        """A task's cards, newest first: its page's Approvals section."""
        return [view(r) for r in self.store.all(
            "SELECT * FROM cards WHERE task = ? ORDER BY created_at DESC", (task,))]

    def decided(self, limit: int = 100) -> list[dict[str, Any]]:
        """Every card, newest first, waiting ones too: Activity's Decisions."""
        return [view(r) for r in self.store.all(
            "SELECT * FROM cards ORDER BY COALESCE(decided_at, created_at) DESC LIMIT ?",
            (limit,))]

    def declined_for(self, agent: str) -> list[dict[str, Any]]:
        """What the person said no to, with a reason, that the agent drafted and no run of it
        has been told yet."""
        return [view(r) for r in self.store.all(
            "SELECT * FROM cards WHERE drafter = ? AND state = 'no' AND reason IS NOT NULL"
            " AND told_at IS NULL ORDER BY decided_at", (agent,))]

    def give_reason(self, ref: str, kind: str, reason: str) -> None:
        """The reason for a No decided by its own row's move (a drafted page declined)."""
        with self.store.tx() as db:
            db.execute("UPDATE cards SET reason = ? WHERE ref = ? AND kind = ? AND state = 'no'",
                       (reason, ref, kind))

    def told(self, ids: list[str]) -> None:
        with self.store.tx() as db:
            db.executemany("UPDATE cards SET told_at = ? WHERE id = ?", [(now(), i) for i in ids])

    # ---- withdrawal ----

    @staticmethod
    def withdraw_in(db: sqlite3.Connection, *, module: str | None = None,
                    thread: str | None = None, drafter: str | None = None,
                    refs: list[str] | None = None) -> int:
        """Inside a removal's transaction: the waiting cards of what it removes are withdrawn,
        grey, never deleted (their lines stay in the journal, Activity keeps the decision)."""
        where, args = [], []
        for column, value in (("module", module), ("thread", thread), ("drafter", drafter)):
            if value:
                where.append(f"{column} = ?")
                args.append(value)
        if refs:
            where.append(f"ref IN ({','.join('?' * len(refs))})")
            args.extend(refs)
        if not where:
            return 0
        return db.execute(
            f"UPDATE cards SET state = 'withdrawn', decided_at = ?, decided_by = 'alpha'"
            f" WHERE state = 'waiting' AND ({' OR '.join(where)})", (now(), *args)).rowcount

    def sweep(self) -> int:
        """At start: the waiting cards of modules removed, agents gone and threads gone are
        withdrawn (P3 item 4: a removed module's cards never wait on)."""
        with self.store.tx() as db:
            return db.execute(
                "UPDATE cards SET state = 'withdrawn', decided_at = ?, decided_by = 'alpha'"
                " WHERE state = 'waiting' AND ("
                " module IN (SELECT id FROM modules WHERE removed_at IS NOT NULL)"
                " OR (drafter LIKE 'a\\_%' ESCAPE '\\' AND drafter NOT IN (SELECT id FROM agents))"
                " OR (thread IS NOT NULL AND thread NOT IN (SELECT id FROM threads)))",
                (now(),)).rowcount

    # ---- a world from before the cards ----

    def backfill(self) -> None:
        """A world made before 19 Oct 2026: its cards made once from the journal's own lines,
        in order, as if they had been written then (twins and all: history as it was)."""
        if self.store.one("SELECT 1 FROM cards LIMIT 1") is not None:
            return
        if self.store.one("SELECT 1 FROM journal WHERE kind IN ('asked', 'proposed')"
                          " LIMIT 1") is None:
            return
        with self.store.tx() as db:
            for r in db.execute(
                    "SELECT * FROM journal WHERE kind IN ('asked', 'proposed', 'answered')"
                    " AND deleted_at IS NULL ORDER BY rowid").fetchall():
                self.on_line(db, r["id"], r["kind"], r["actor"], r["text"],
                             loads(r["data"], {}), r["module"], r["thread"])
                if r["kind"] != "answered":
                    db.execute("UPDATE cards SET created_at = ? WHERE id = ?", (r["at"], r["id"]))
            # a card decided before it existed takes the answer's own time
            db.execute("UPDATE cards SET decided_at = (SELECT at FROM journal b WHERE"
                       " b.kind = 'answered' AND (json_extract(b.data, '$.ask') = cards.id OR"
                       " json_extract(b.data, '$.proposal') = cards.id) ORDER BY b.rowid"
                       " LIMIT 1) WHERE state != 'waiting'")
