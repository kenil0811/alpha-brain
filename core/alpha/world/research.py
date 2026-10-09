"""Research passes: Alpha looking into how a thing is done before it proposes a plan (design
§6.3, Q37), and the findings each pass read.

A pass is started from the conversation once the job is known (who it is for, what it decides,
what happens today, what already exists), runs in the background in its own thread like a build,
and ends by proposing the plan, or by stopping or failing with a line in the conversation.

    waiting → running → done
                      ↘ stopped | failed

A finding is one claim with the quote and the page it came from; `resolved` says whether the
core could fetch that page (1), could not (0), or there was no page because the finding is
about the person's own world (NULL). A plan may only cite findings that resolved: the merge is
where research errors come from, so the evidence is checked by code, never by the model's word.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from alpha.world.store import Problem, Store, new_id, now

STATES = ("waiting", "running", "done", "stopped", "failed")
VERDICTS = ("succeeded", "partial", "failed")
MOST_CLAIM_CHARS = 400
MOST_QUOTE_CHARS = 600


def _row(row: sqlite3.Row) -> dict[str, Any]:
    return {k: row[k] for k in row.keys()}


def clean_findings(findings: Any) -> list[dict[str, Any]]:
    """The findings a look returned, each a claim with its page; the rest dropped."""
    out: list[dict[str, Any]] = []
    for f in findings or []:
        if not isinstance(f, dict):
            continue
        claim = " ".join(str(f.get("claim") or "").split())[:MOST_CLAIM_CHARS]
        if not claim:
            continue
        url = str(f.get("url") or "").strip() or None
        if url and not url.lower().startswith(("http://", "https://")):
            url = None
        out.append({"claim": claim,
                    "quote": " ".join(str(f.get("quote") or "").split())[:MOST_QUOTE_CHARS] or None,
                    "url": url,
                    "title": " ".join(str(f.get("title") or f.get("source") or "").split())[:160]
                    or None})
    return out


class Research:
    def __init__(self, store: Store) -> None:
        self.store = store

    def start(self, title: str, ask: str, *, job: str | None = None,
              conversation: str | None = None, module: str | None = None,
              turn: str | None = None) -> dict[str, Any]:
        if not title.strip() or not ask.strip():
            raise Problem("A research pass needs a title and the ask in the person's words.")
        rid = new_id("rs")
        stamp = now()
        with self.store.tx() as db:
            db.execute(
                "INSERT INTO research (id, title, ask, job, state, conversation, module, turn,"
                " created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (rid, title.strip(), ask.strip(), (job or "").strip() or None, "waiting",
                 conversation, module, turn, stamp, stamp))
        return self.get(rid)

    def get(self, rid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM research WHERE id = ?", (rid,))
        if row is None:
            raise Problem(f"There is no research pass {rid}.")
        return _row(row)

    def all(self, states: tuple[str, ...] | None = None) -> list[dict[str, Any]]:
        if states:
            marks = ",".join("?" * len(states))
            rows = self.store.all(f"SELECT * FROM research WHERE state IN ({marks})"
                                  " ORDER BY created_at", states)
        else:
            rows = self.store.all("SELECT * FROM research ORDER BY created_at")
        return [_row(r) for r in rows]

    def waiting(self) -> list[dict[str, Any]]:
        """Passes the scheduler should run now: waiting, or running (a run that ended before
        its work did, or the core restarted)."""
        return self.all(("waiting", "running"))

    def of_thread(self, thread: str | None) -> dict[str, Any] | None:
        if not thread:
            return None
        row = self.store.one("SELECT * FROM research WHERE thread = ?", (thread,))
        return _row(row) if row else None

    def _move(self, rid: str, to: str, *, when: tuple[str, ...], **fields: Any) -> dict[str, Any]:
        sets = ", ".join(f"{k} = ?" for k in fields)
        marks = ", ".join("?" * len(when))
        with self.store.tx() as db:
            moved = db.execute(
                f"UPDATE research SET state = ?{', ' + sets if sets else ''}, updated_at = ?"
                f" WHERE id = ? AND state IN ({marks})",
                (to, *fields.values(), now(), rid, *when)).rowcount
        if not moved:  # atomic: the row moves only if it was still in a `when` state
            current = self.get(rid)
            raise Problem(f"The research pass '{current['title']}' is {current['state']}, not "
                          f"{' or '.join(when)}.")
        return self.get(rid)

    def begin(self, rid: str, thread: str) -> dict[str, Any]:
        current = self.get(rid)
        return self._move(rid, "running", when=("waiting", "running"), thread=thread,
                          attempts=current["attempts"] + 1,
                          started_at=current["started_at"] or now())

    def finish(self, rid: str, *, plan: str, verdict: str, why: str | None,
               model_ms: int = 0) -> dict[str, Any]:
        if verdict not in VERDICTS:
            raise Problem(f"A research pass's verdict is one of {VERDICTS}.")
        return self._move(rid, "done", when=("running",), plan=plan, verdict=verdict, why=why,
                          model_ms=int(model_ms or 0), ended_at=now())

    def stop(self, rid: str, why: str | None) -> dict[str, Any]:
        return self._move(rid, "stopped", when=("waiting", "running"), why=why,
                          verdict="failed", ended_at=now())

    def fail(self, rid: str, why: str, model_ms: int = 0) -> dict[str, Any]:
        return self._move(rid, "failed", when=("waiting", "running"), why=why,
                          verdict="failed", model_ms=int(model_ms or 0), ended_at=now())

    def set_plan(self, rid: str, plan: str) -> dict[str, Any]:
        """The plan this pass proposed (set by the tool, in the model's own process; the run
        reads it back to finish the pass)."""
        with self.store.tx() as db:
            db.execute("UPDATE research SET plan = ?, updated_at = ? WHERE id = ?",
                       (plan, now(), rid))
        return self.get(rid)

    def note_model_ms(self, rid: str, model_ms: int) -> None:
        with self.store.tx() as db:
            db.execute("UPDATE research SET model_ms = model_ms + ? WHERE id = ?",
                       (int(model_ms or 0), rid))

    # ---- findings ----

    def add_findings(self, rid: str, angle: str, findings: list[dict[str, Any]],
                     resolved: dict[str, bool] | None = None) -> list[dict[str, Any]]:
        """Keep a look's findings with the pass; `resolved` says, per URL, whether the core
        fetched the page. Returns them with their ids."""
        self.get(rid)
        kept: list[dict[str, Any]] = []
        stamp = now()
        with self.store.tx() as db:
            for f in clean_findings(findings):
                fid = new_id("f")
                res = None if not f["url"] else (1 if (resolved or {}).get(f["url"]) else 0)
                db.execute(
                    "INSERT INTO findings (id, research, angle, claim, quote, url, title,"
                    " resolved, at) VALUES (?,?,?,?,?,?,?,?,?)",
                    (fid, rid, angle.strip()[:160], f["claim"], f["quote"], f["url"],
                     f["title"], res, stamp))
                kept.append({"id": fid, "angle": angle.strip()[:160], **f, "resolved": res})
        return kept

    def findings(self, rid: str) -> list[dict[str, Any]]:
        return [_row(r) for r in self.store.all(
            "SELECT * FROM findings WHERE research = ? ORDER BY at, id", (rid,))]

    def citable(self, rid: str) -> set[str]:
        """The findings a plan may cite: those whose page answered, and those about the
        person's own world (no page to check)."""
        return {r["id"] for r in self.store.all(
            "SELECT id FROM findings WHERE research = ? AND (resolved = 1 OR resolved IS NULL)",
            (rid,))}

    def remove_module(self, db: Any, module: str) -> int:
        """A removed module's passes stop; their findings go with them (the plan stays as a
        record of what was proposed, as plans do)."""
        rows = db.execute("SELECT id FROM research WHERE module = ?", (module,)).fetchall()
        for r in rows:
            db.execute("DELETE FROM findings WHERE research = ?", (r["id"],))
        return int(db.execute(
            "UPDATE research SET state = 'stopped', why = COALESCE(why, 'The module was"
            " removed.'), updated_at = ? WHERE module = ? AND state IN ('waiting', 'running')",
            (now(), module)).rowcount)
