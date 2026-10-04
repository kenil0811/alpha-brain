"""Acting outward: procedures, actions and standing permissions.

A **procedure** is know-how Alpha writes for one task on one site ("make a draft in Gmail",
"send a LinkedIn message"): declarative steps the browser hand performs in the person's own
session. Fills and typing take only fields of an action's payload, never text of the
procedure's own, so what reaches a site is exactly what the person saw and approved. A
procedure declares its effect: `prepare` (the result stays in the person's account and reaches
nobody: a draft, an unsent message) or `send` (it reaches someone or something). Its last step
is the commit (save, close, send); a dry run performs everything before it.

An **action** is one outward effect Alpha proposes: the procedure, the payload, what it rests
on, what cannot be undone. It is a card the person decides on; nothing leaves Alpha's space
until they say yes, in the app or in their own words after the card.

    proposed → approved → running → done | failed
    proposed → declined

A **permission** is a sentence the person granted ("Alpha may make drafts in gmail.com without
asking"): a prepare-level procedure with one runs without a card. Sends ask every time.
"""

from __future__ import annotations

import re
import sqlite3
from typing import Any

from alpha.world.names import check_name
from alpha.world.skills import Skills
from alpha.world.store import Problem, Store, dumps, loads, new_id, now

FIELD_REF = re.compile(r"^\{([a-z][a-z0-9_]*)\}$")
EFFECTS = ("prepare", "send")
STATES = ("proposed", "approved", "running", "done", "failed", "declined")
STEP_KINDS = {"goto", "click", "click_text", "fill", "type", "press", "wait", "wait_ms",
              "expect", "expect_text", "upload"}
COMMITS = {"click", "click_text", "press"}


def check_steps(steps: Any, fields: list[str], *, effect: str,
                verify: Any = None) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Validate a procedure's steps. Returns (steps, verify) cleaned, or raises a Problem that
    says exactly what is wrong."""
    if effect not in EFFECTS:
        raise Problem(f"effect must be one of {EFFECTS}.")
    if not isinstance(steps, list) or not steps:
        raise Problem("steps must be a non-empty list.")
    for name in fields:
        if not re.match(r"^[a-z][a-z0-9_]*$", name):
            raise Problem(f"'{name}' is not a field name (lower-case words joined by _).")
    clean: list[dict[str, Any]] = []
    for i, step in enumerate(steps, 1):
        if not isinstance(step, dict) or not step:
            raise Problem(f"Step {i} must be an object like {{\"click\": \"button.send\"}}.")
        kinds = [k for k in step if k in STEP_KINDS]
        if len(kinds) != 1:
            raise Problem(f"Step {i} must have exactly one of {sorted(STEP_KINDS)}.")
        kind = kinds[0]
        extra = set(step) - {kind, "value", "note"}
        if extra:
            raise Problem(f"Step {i} has unknown keys {sorted(extra)}.")
        if kind in ("fill", "type", "upload"):
            value = step.get("value")
            m = FIELD_REF.match(str(value or ""))
            if not m:
                raise Problem(f"Step {i}: a {kind} value must be one field of the payload, like"
                              " \"{body}\" (for upload, the field that names the document);"
                              " text of the procedure's own is never typed.")
            if m.group(1) not in fields:
                raise Problem(f"Step {i} types {{{m.group(1)}}}, which is not in fields.")
        elif kind == "wait_ms":
            if not isinstance(step[kind], int) or not 0 < step[kind] <= 30000:
                raise Problem(f"Step {i}: wait_ms is a number of milliseconds up to 30000.")
        elif "value" in step:
            raise Problem(f"Step {i}: only fill, type and upload take a value.")
        if not isinstance(step[kind], str | int) or (isinstance(step[kind], str)
                                                      and not step[kind].strip()):
            raise Problem(f"Step {i}: {kind} needs a selector, text or key.")
        clean.append({k: v for k, v in step.items()})
    for i, step in enumerate(clean, 1):
        for key, value in step.items():
            if key in ("value", "note"):
                continue
            for ref in re.findall(r"\{([a-z][a-z0-9_]*)\}", str(value)):
                if ref not in fields:
                    raise Problem(f"Step {i} uses {{{ref}}}, which is not in fields; a"
                                  " placeholder in an address, a selector or a text is filled"
                                  " from the payload.")
    last = next(k for k in clean[-1] if k in STEP_KINDS)
    if last not in COMMITS:
        raise Problem("The last step is the commit (save, close, send): a click, click_text or"
                      " press. A dry run performs everything before it.")
    checks: list[dict[str, Any]] = []
    for i, step in enumerate(verify or [], 1):
        if not isinstance(step, dict) or len(step) != 1 or next(iter(step)) not in (
                "expect", "expect_text", "goto", "wait", "wait_ms"):
            raise Problem(f"verify step {i} must be one of expect, expect_text, goto, wait,"
                          " wait_ms.")
        checks.append(dict(step))
    return clean, checks


def file_fields(steps: list[dict[str, Any]]) -> set[str]:
    """The payload fields an upload step sends: their values are document ids."""
    out = set()
    for step in steps:
        if "upload" in step:
            m = FIELD_REF.match(str(step.get("value") or ""))
            if m:
                out.add(m.group(1))
    return out


def payload_problem(payload: Any, fields: list[str]) -> str | None:
    if not isinstance(payload, dict):
        return "payload must be an object: field → text."
    missing = [f for f in fields if not str(payload.get(f, "")).strip()]
    if missing:
        return f"payload is missing {', '.join(missing)}."
    extra = sorted(set(payload) - set(fields))
    if extra:
        return f"payload has fields the procedure doesn't use: {', '.join(extra)}."
    return None


def _action(row: sqlite3.Row) -> dict[str, Any]:
    out = {k: row[k] for k in row.keys()}
    out["payload"] = loads(row["payload"], {})
    out["shots"] = loads(row["shots"], [])
    return out


class Procedures:
    """Act skills, by the API the acting route has used since the first procedure."""

    def __init__(self, store: Store) -> None:
        self.store = store
        self.skills = Skills(store)

    def save(self, name: str, *, site: str, url: str, description: str, effect: str,
             steps: list[dict[str, Any]], fields: list[str],
             verify: list[dict[str, Any]] | None = None, when_to_use: str | None = None,
             source: str | None = None) -> dict[str, Any]:
        check_name(name, "procedure", "gmail_draft")
        if not description.strip():
            raise Problem("A procedure needs a description: what it does, in a sentence.")
        clean, checks = check_steps(steps, fields, effect=effect, verify=verify)
        for ref in re.findall(r"\{([a-z][a-z0-9_]*)\}", url):
            if ref not in fields:
                raise Problem(f"The address uses {{{ref}}}, which is not in fields.")
        return self.skills.save(name, "act", description=description, site=site, url=url,
                                when_to_use=when_to_use, source=source, health="untried",
                                effect=effect, steps=clean, verify=checks, fields=list(fields),
                                last_problem=None)

    def get(self, name: str) -> dict[str, Any]:
        return self.skills.get(name, "act")

    def names(self) -> list[str]:
        return self.skills.names("act")

    def all(self) -> list[dict[str, Any]]:
        return self.skills.all("act")

    def ran(self, name: str, *, problem: str | None) -> dict[str, Any]:
        return self.skills.ran(name, problem=problem)


class Actions:
    def __init__(self, store: Store) -> None:
        self.store = store

    def propose(self, procedure: dict[str, Any], *, title: str, payload: dict[str, Any],
                undo: str, evidence: str | None, module: str | None, thread: str | None,
                turn: str | None) -> dict[str, Any]:
        if not title.strip():
            raise Problem("An action needs a title: what it does, in the person's words.")
        if not undo.strip():
            raise Problem("An action says what can be undone and what cannot (undo).")
        problem = payload_problem(payload, procedure["fields"])
        if problem:
            raise Problem(problem)
        stamp = now()
        aid = new_id("act")
        with self.store.tx() as db:
            db.execute(
                "INSERT INTO actions (id, procedure, title, payload, evidence, undo, effect, site,"
                " state, module, thread, turn, created_at, updated_at)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (aid, procedure["name"], title.strip(),
                 dumps({k: str(v) for k, v in payload.items()}), evidence, undo.strip(),
                 procedure["effect"], procedure["site"], "proposed", module, thread, turn,
                 stamp, stamp))
        return self.get(aid)

    def get(self, aid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM actions WHERE id = ?", (aid,))
        if row is None:
            raise Problem(f"There is no action {aid}.")
        return _action(row)

    def all(self, states: tuple[str, ...] | None = None, *, limit: int = 50,
            module: str | None = None) -> list[dict[str, Any]]:
        where: list[str] = ["1=1"]
        args: list[Any] = []
        if states:
            where.append(f"state IN ({','.join('?' * len(states))})")
            args.extend(states)
        if module:
            where.append("module = ?")
            args.append(module)
        rows = self.store.all(
            f"SELECT * FROM actions WHERE {' AND '.join(where)} ORDER BY created_at DESC"
            " LIMIT ?", (*args, limit))
        return [_action(r) for r in rows]

    def _set(self, aid: str, **values: Any) -> dict[str, Any]:
        values["updated_at"] = now()
        cols = ", ".join(f"{k} = ?" for k in values)
        with self.store.tx() as db:
            db.execute(f"UPDATE actions SET {cols} WHERE id = ?", (*values.values(), aid))
        return self.get(aid)

    def _move(self, aid: str, to: str, when: tuple[str, ...], **values: Any) -> dict[str, Any]:
        """One state change, atomic: the row moves only if it is still in a `when` state at
        the moment of the write, so two threads cannot both start (and perform) one action
        (found by the 3 Oct review: the approval route and the scheduler's catch-up could
        race to a duplicate send)."""
        current = self.get(aid)
        values["updated_at"] = now()
        cols = ", ".join(f"{k} = ?" for k in values)
        marks = ", ".join("?" * len(when))
        with self.store.tx() as db:
            moved = db.execute(
                f"UPDATE actions SET state = ?, {cols} WHERE id = ? AND state IN ({marks})",
                (to, *values.values(), aid, *when)).rowcount
        if not moved:
            current = self.get(aid)
            raise Problem(f"The action \"{current['title']}\" is {current['state']}; it can't"
                          f" become {to}.")
        return self.get(aid)

    def set_proposal(self, aid: str, proposal: str) -> None:
        self._set(aid, proposal=proposal)

    def previewed(self, aid: str, *, preview: str | None, note: str | None,
                  shots: list[str]) -> dict[str, Any]:
        return self._set(aid, preview=preview, preview_note=note, shots=dumps(shots))

    def edit(self, aid: str, payload: dict[str, Any], fields: list[str]) -> dict[str, Any]:
        current = self.get(aid)
        if current["state"] != "proposed":
            raise Problem("Only a proposed action can be changed.")
        merged = {**current["payload"], **{k: str(v) for k, v in payload.items()}}
        problem = payload_problem(merged, fields)
        if problem:
            raise Problem(problem)
        return self._set(aid, payload=dumps(merged))

    def approve(self, aid: str, approval: str) -> dict[str, Any]:
        return self._move(aid, "approved", ("proposed",), approval=approval)

    def decline(self, aid: str) -> dict[str, Any]:
        return self._move(aid, "declined", ("proposed", "failed"))

    def start(self, aid: str) -> dict[str, Any]:
        return self._move(aid, "running", ("approved",))

    def finish(self, aid: str, result: str, shots: list[str]) -> dict[str, Any]:
        return self._move(aid, "done", ("running",), result=result, error=None,
                          shots=dumps(shots))

    def fail(self, aid: str, error: str, shots: list[str] | None = None) -> dict[str, Any]:
        current = self.get(aid)
        values: dict[str, Any] = {"error": error}
        if shots is not None:
            values["shots"] = dumps(shots)
        return self._move(aid, "failed", ("proposed", "approved", "running"), **values) \
            if current["state"] != "failed" else current

    def remove_module(self, db: sqlite3.Connection, module: str) -> int:
        return int(db.execute("DELETE FROM actions WHERE module = ? AND state IN"
                              " ('proposed', 'approved')", (module,)).rowcount)


class Permissions:
    def __init__(self, store: Store) -> None:
        self.store = store

    def grant(self, *, sentence: str, procedure: str, effect: str,
              source: str | None = None) -> dict[str, Any]:
        if effect != "prepare":
            raise Problem("A standing permission covers what stays in the person's account"
                          " (prepare); anything sent asks every time.")
        live = self.for_procedure(procedure)
        if live:
            return live
        pid = new_id("perm")
        with self.store.tx() as db:
            db.execute(
                "INSERT INTO permissions (id, sentence, procedure, effect, granted_at, source)"
                " VALUES (?,?,?,?,?,?)", (pid, sentence.strip(), procedure, effect, now(), source))
        return self.get(pid)

    def get(self, pid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM permissions WHERE id = ?", (pid,))
        if row is None:
            raise Problem(f"There is no permission {pid}.")
        return {k: row[k] for k in row.keys()}

    def for_procedure(self, procedure: str) -> dict[str, Any] | None:
        row = self.store.one(
            "SELECT * FROM permissions WHERE procedure = ? AND revoked_at IS NULL", (procedure,))
        return {k: row[k] for k in row.keys()} if row else None

    def live(self) -> list[dict[str, Any]]:
        return [{k: r[k] for k in r.keys()} for r in self.store.all(
            "SELECT * FROM permissions WHERE revoked_at IS NULL ORDER BY granted_at")]

    def revoke(self, pid: str) -> dict[str, Any]:
        with self.store.tx() as db:
            db.execute("UPDATE permissions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL",
                       (now(), pid))
        return self.get(pid)
