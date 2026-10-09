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

import json
import sqlite3
from typing import Any

from alpha.world.store import Problem, Store, new_id, now

STATES = ("proposed", "approved", "building", "done", "stopped", "declined", "replaced")
# A plan's questions (Q36, 9 Oct 2026): what the person decides before the build, each with
# its choices and the one Alpha would take if they just say build it. Six at most: more is a
# plan that hasn't done its own research.
MOST_QUESTIONS = 6
MOST_OPTIONS = 4
MOST_OPTION_CHARS = 90


def clean_questions(questions: Any) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for q in (questions or [])[:MOST_QUESTIONS]:
        if not isinstance(q, dict):
            raise Problem("Each question is {text, options, default}.")
        text = str(q.get("text") or q.get("question") or "").strip()
        if not text:
            raise Problem("A question needs its text.")
        options = [str(o).strip()[:MOST_OPTION_CHARS] for o in (q.get("options") or [])
                   if str(o).strip()][:MOST_OPTIONS]
        default = str(q.get("default") or "").strip()[:MOST_OPTION_CHARS] or None
        if default and options and default not in options:
            match = next((o for o in options if o.lower() == default.lower()), None)
            if match:
                default = match
            elif len(options) < MOST_OPTIONS:
                options.append(default)
            else:
                default = options[0]
        answer = str(q.get("answer") or "").strip() or None
        out.append({"text": text, "options": options, "default": default, "answer": answer,
                    "derived": bool(q.get("derived"))})
    return out


def decided_words(plan: dict[str, Any]) -> str:
    """What was decided on each question, for the brief: the person's answer, else Alpha's
    default, else that it is open."""
    lines = []
    for i, q in enumerate(plan.get("questions") or [], 1):
        if q.get("answer"):
            how = "their choice" if q["answer"] != q.get("default") else "Alpha's pick, kept"
            lines.append(f"{i}. {q['text']} — {q['answer']} ({how})")
        elif q.get("default"):
            lines.append(f"{i}. {q['text']} — {q['default']} (Alpha's pick; they didn't say)")
        else:
            lines.append(f"{i}. {q['text']} — not answered: decide it sensibly and say so")
    return "\n".join(lines)


def _view(row: sqlite3.Row) -> dict[str, Any]:
    out = {k: row[k] for k in row.keys()}
    raw = out.get("questions")
    try:
        out["questions"] = json.loads(raw) if raw else []
    except ValueError:
        out["questions"] = []
    return out


class Plans:
    def __init__(self, store: Store) -> None:
        self.store = store

    def propose(self, title: str, body: str, *, module: str | None = None,
                turn: str | None = None, proposal: str | None = None,
                replaces: str | None = None, trial: str | None = None,
                questions: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        """`trial` is the first thing the person will do with what gets built, in their words;
        the finished build tries it and checks the answer against an independent one.
        `questions`: what they decide before the build, each with choices and a default."""
        if not title.strip() or not body.strip():
            raise Problem("A plan needs a title and the plan itself.")
        clean = clean_questions(questions)
        stamp = now()
        pid = new_id("p")
        with self.store.tx() as db:
            if replaces:
                db.execute("UPDATE plans SET state = 'replaced', updated_at = ? WHERE id = ?"
                           " AND state = 'proposed'", (stamp, replaces))
            db.execute(
                "INSERT INTO plans (id, title, body, state, module, turn, proposal, trial,"
                " created_at, updated_at, questions) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (pid, title.strip(), body.strip(), "proposed", module, turn, proposal,
                 (trial or "").strip() or None, stamp, stamp,
                 json.dumps(clean) if clean else None),
            )
        return self.get(pid)

    def set_questions(self, pid: str, questions: list[dict[str, Any]]) -> dict[str, Any]:
        """The questions the core found in the plan's reply (none were given)."""
        clean = clean_questions(questions)
        with self.store.tx() as db:
            db.execute("UPDATE plans SET questions = ?, updated_at = ? WHERE id = ?",
                       (json.dumps(clean) if clean else None, now(), pid))
        return self.get(pid)

    def answer(self, pid: str, answers: dict[str, str]) -> dict[str, Any]:
        """The person's answers to a proposed plan's questions, by number (from 0), before
        the yes; an answer not given stays Alpha's default."""
        plan = self.get(pid)
        if plan["state"] != "proposed":
            raise Problem(f"The plan '{plan['title']}' is {plan['state']}; its questions"
                          " are settled.")
        questions = plan["questions"]
        for key, words in (answers or {}).items():
            try:
                i = int(key)
            except (TypeError, ValueError) as e:
                raise Problem("Answers go by the question's number.") from e
            if 0 <= i < len(questions) and str(words).strip():
                questions[i]["answer"] = str(words).strip()[:MOST_OPTION_CHARS * 2]
        with self.store.tx() as db:
            db.execute("UPDATE plans SET questions = ?, updated_at = ? WHERE id = ?"
                       " AND state = 'proposed'", (json.dumps(questions), now(), pid))
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
        sets = ", ".join(f"{k} = ?" for k in fields)
        marks = ", ".join("?" * len(when))
        with self.store.tx() as db:
            moved = db.execute(
                f"UPDATE plans SET state = ?{', ' + sets if sets else ''}, updated_at = ?"
                f" WHERE id = ? AND state IN ({marks})",
                (to, *fields.values(), now(), pid, *when),
            ).rowcount
        if not moved:  # atomic: the row moves only if it was still in a `when` state
            plan = self.get(pid)
            raise Problem(f"The plan '{plan['title']}' is {plan['state']}, not "
                          f"{' or '.join(when)}.")
        return self.get(pid)

    def approve(self, pid: str, approval: str) -> dict[str, Any]:
        decided = decided_words(self.get(pid))
        words = f"{approval}\nDecided:\n{decided}" if decided else approval
        return self._move(pid, "approved", when=("proposed",), approval=words)

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
        from datetime import UTC, datetime, timedelta

        cutoff = (datetime.now(UTC) - timedelta(days=2)).isoformat()  # the rows' own form
        rows = self.store.all(
            "SELECT * FROM plans WHERE state IN ('proposed', 'approved', 'building')"
            " OR (state = 'stopped' AND updated_at >= ?) ORDER BY created_at", (cutoff,))
        return [_view(r) for r in rows]

    def waiting(self) -> list[dict[str, Any]]:
        """Plans the scheduler should run now: approved, or building."""
        return self.all(("approved", "building"))
