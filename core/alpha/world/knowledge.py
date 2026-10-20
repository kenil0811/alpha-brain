"""What Alpha knows beyond the records: notes it maintains, goals, and facts with time validity.

Notes are Markdown the person can read and edit (a profile, standing instructions, one page per
module); they go with what they are about. Goals are durable intentions proactivity is
organised around. Facts are claims about the person or an entity with world time
(valid_from/valid_to) and system time (recorded_at/superseded_by): a new value of a
single-valued predicate closes the old one instead of keeping both live, so "works at A" then
"works at B" keeps history without contradiction.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from alpha.world.skills import Skills
from alpha.world.store import Problem, Store, new_id, now

INSTRUCTIONS = "Standing instructions"
# Notes that shape how Alpha behaves: changed only on the person's own words.
GATED_NOTES = ("Standing instructions", "Permissions")
GOAL_STATES = {"active", "done", "dropped"}
# the title of a record's note (scope `record:<table>/<id>`): one note per record, on its page
RECORD_NOTE = "Notes"
FACT_STATES = {"accepted", "suggested", "rejected"}


def _note(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "scope": row["scope"],
        "title": row["title"],
        "body": row["body"],
        "source": row["source"],
        "summary": row["summary"] if "summary" in row.keys() else None,
        "updated_at": row["updated_at"],
    }


def _fact(row: sqlite3.Row) -> dict[str, Any]:
    return {k: row[k] for k in row.keys()}


def _first_line(body: str) -> str:
    """A page's one line when none was given: its first line of text, a heading only when
    there is nothing else."""
    heading = ""
    for line in body.splitlines():
        words = line.strip().lstrip("#- ").strip()
        if not words:
            continue
        if line.lstrip().startswith("#"):
            heading = heading or words[:160]
            continue
        return words[:160]
    return heading


class Knowledge:
    def __init__(self, store: Store) -> None:
        self.store = store

    # ---- notes ----

    def write_note(self, scope: str, title: str, body: str,
                   source: str | None = None, summary: str | None = None) -> dict[str, Any]:
        """Create or replace a page of the wiki; `source` is the journal entry (the turn) it
        came from; `summary` is its one line in the always-loaded index (the first line of
        the body when not given)."""
        kind, _, ref = scope.partition(":")
        # `conversation:<thread id>`: a conversation's checkpoint, what a fresh session there
        # is told (A12); written by Watson, never listed in the index
        if not (scope == "person" or (kind in ("module", "topic", "entity", "skill", "agent",
                                                "record", "conversation") and ref.strip())):
            raise Problem("A page's scope is 'person', 'module:<name>', 'topic:<slug>',"
                          " 'entity:<id>', 'skill:<name>', 'agent:<agent id>' or"
                          " 'record:<table>/<record id>'.")
        if kind == "record":
            table, _, rid = ref.partition("/")
            if self.store.one("SELECT 1 AS x FROM records WHERE collection = ? AND id = ?"
                              " AND deleted_at IS NULL", (table, rid)) is None:
                raise Problem(f"There is no record {rid} in '{table}' to write a note on.")
        if kind == "entity" and self.store.one(
                "SELECT 1 AS x FROM entities WHERE id = ? AND merged_into IS NULL", (ref,)) is None:
            raise Problem(f"There is no person or company {ref} to write a page about.")
        if kind == "skill" and Skills(self.store).path_of(ref) is None:
            raise Problem(f"There is no skill {ref} to write notes about.")
        if not title.strip():
            raise Problem("A page needs a title.")
        line = " ".join((summary or _first_line(body)).split())[:160]
        stamp = now()
        with self.store.tx() as db:  # the check and the write under one lock, no race
            existing = db.execute("SELECT id FROM notes WHERE scope = ? AND title = ?",
                                  (scope, title)).fetchone()
            if existing:
                db.execute(
                    "UPDATE notes SET body = ?, source = ?, summary = ?, updated_at = ?"
                    " WHERE id = ?",
                    (body, source, line, stamp, existing["id"]),
                )
                nid = str(existing["id"])
            else:
                nid = new_id("n")
                db.execute(
                    "INSERT INTO notes (id, scope, title, body, source, summary, updated_at)"
                    " VALUES (?,?,?,?,?,?,?)",
                    (nid, scope, title, body, source, line, stamp),
                )
        return self.read_note(nid)

    # ---- standing instructions: the person's own words only ----

    def instructions(self) -> list[str]:
        note = self.find_note("person", INSTRUCTIONS)
        return [line[2:].strip() for line in (note["body"] if note else "").splitlines()
                if line.startswith("- ")]

    def add_instruction(self, sentence: str, source: str) -> dict[str, Any]:
        sentence = " ".join(sentence.split())
        if not any(c.isalnum() for c in sentence):
            # two quote marks once stood in ALPHA.md as an instruction (20 Oct 2026)
            raise Problem("An instruction needs words.")
        current = self.instructions()
        if sentence not in current:
            current.append(sentence)
        return self.write_note("person", INSTRUCTIONS, "\n".join(f"- {s}" for s in current),
                               source=source)

    def remove_instruction(self, sentence: str, source: str) -> dict[str, Any]:
        sentence = " ".join(sentence.split())
        current = self.instructions()
        if sentence not in current:
            raise Problem(f"There is no standing instruction '{sentence}'. They are: {current}.")
        return self.write_note("person", INSTRUCTIONS,
                               "\n".join(f"- {s}" for s in current if s != sentence),
                               source=source)

    def append_to_page(self, scope: str, title: str, heading: str, line: str,
                       source: str | None = None) -> dict[str, Any]:
        """Add one dated line under a heading of a page (made if missing). Alpha's noticing
        writes here; the person's own text elsewhere on the page is never touched."""
        page = self.find_note(scope, title)
        body = page["body"] if page else ""
        mark = f"## {heading}"
        if mark not in body:
            body = (body.rstrip() + "\n\n" if body.strip() else "") + mark + "\n"
        head, _, tail = body.partition(mark)
        tail_lines = tail.split("\n")
        # The heading's own section ends at the next heading.
        end = next((i for i, text in enumerate(tail_lines) if text.startswith("## ")),
                   len(tail_lines))
        section = [text for text in tail_lines[:end] if text.strip()]
        if line.strip() in {text.strip().lstrip("- ").strip() for text in section}:
            return page or self.write_note(scope, title, body, source=source)
        section.append(f"- {line.strip()}")
        rest = "\n".join(tail_lines[end:]).strip()
        new_body = head + mark + "\n" + "\n".join(section) + "\n" + (f"\n{rest}\n" if rest else "")
        return self.write_note(scope, title, new_body, source=source,
                               summary=page.get("summary") if page else None)

    def index(self) -> list[dict[str, Any]]:
        """Every page's one line: scope, title, summary. The part of the wiki always in
        context."""
        rows = self.store.all("SELECT scope, title, summary, body FROM notes ORDER BY scope, title")
        return [{"scope": r["scope"], "title": r["title"],
                 "summary": r["summary"] or _first_line(r["body"])} for r in rows]

    def read_note(self, nid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM notes WHERE id = ?", (nid,))
        if row is None:
            raise Problem(f"There is no note {nid}.")
        return _note(row)

    def find_note(self, scope: str, title: str) -> dict[str, Any] | None:
        row = self.store.one("SELECT * FROM notes WHERE scope = ? AND title = ?", (scope, title))
        return _note(row) if row else None

    def notes(self, scope: str | None = None) -> list[dict[str, Any]]:
        if scope is None:
            rows = self.store.all("SELECT * FROM notes ORDER BY scope, title")
        else:
            rows = self.store.all("SELECT * FROM notes WHERE scope = ? ORDER BY title", (scope,))
        return [_note(r) for r in rows]

    # ---- goals ----

    def set_goal(self, text: str, module: str | None = None) -> dict[str, Any]:
        if not text.strip():
            raise Problem("A goal needs words.")
        gid = new_id("g")
        stamp = now()
        with self.store.tx() as db:
            db.execute(
                "INSERT INTO goals (id, text, state, module, since, updated_at)"
                " VALUES (?,?,?,?,?,?)",
                (gid, text, "active", module, stamp, stamp),
            )
        return self.goal(gid)

    def goal(self, gid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM goals WHERE id = ?", (gid,))
        if row is None:
            raise Problem(f"There is no goal {gid}.")
        return {k: row[k] for k in row.keys()}

    def update_goal(self, gid: str, state: str) -> dict[str, Any]:
        if state not in GOAL_STATES:
            raise Problem(f"A goal is {sorted(GOAL_STATES)}; got '{state}'.")
        stamp = now()
        with self.store.tx() as db:
            cur = db.execute(
                "UPDATE goals SET state = ?, until = ?, updated_at = ? WHERE id = ?",
                (state, None if state == "active" else stamp, stamp, gid),
            )
            if cur.rowcount == 0:
                raise Problem(f"There is no goal {gid}.")
        return self.goal(gid)

    def edit_goal(self, gid: str, text: str) -> dict[str, Any]:
        """A goal's words, rewritten by the person (13 Oct, slice 2 D1)."""
        clean = " ".join(text.split())
        if not clean:
            raise Problem("A goal needs words.")
        self.goal(gid)
        with self.store.tx() as db:
            db.execute("UPDATE goals SET text = ?, updated_at = ? WHERE id = ?",
                       (clean, now(), gid))
        return self.goal(gid)

    def goals(self, state: str | None = "active") -> list[dict[str, Any]]:
        if state is None:
            rows = self.store.all("SELECT * FROM goals ORDER BY since")
        else:
            rows = self.store.all("SELECT * FROM goals WHERE state = ? ORDER BY since", (state,))
        return [{k: r[k] for k in r.keys()} for r in rows]

    # ---- facts ----

    def record_fact(
        self,
        subject: str,
        predicate: str,
        value: str,
        *,
        source: str,
        state: str = "suggested",
        confidence: float = 0.7,
        why: str | None = None,
        single: bool = True,
        valid_from: str | None = None,
    ) -> dict[str, Any]:
        if not (subject == "person" or subject.startswith("entity:")):
            raise Problem("A fact is about 'person' or 'entity:<id>'.")
        if state not in FACT_STATES:
            raise Problem(f"A fact's state is {sorted(FACT_STATES)}; got '{state}'.")
        predicate = predicate.strip().lower().replace(" ", "_")
        if not predicate:
            raise Problem("A fact needs a predicate, e.g. 'height_cm' or 'works_at'.")
        stamp = now()
        fid = new_id("f")
        with self.store.tx() as db:
            same = db.execute(
                "SELECT id FROM facts WHERE subject = ? AND predicate = ? AND value = ?"
                " AND state = ? AND valid_to IS NULL AND superseded_by IS NULL",
                (subject, predicate, value, state),
            ).fetchone()
            if same:
                return self.fact(str(same["id"]))
            db.execute(
                "INSERT INTO facts (id, subject, predicate, value, valid_from, recorded_at,"
                " source, why, confidence, state) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (fid, subject, predicate, value, valid_from or stamp, stamp, source, why,
                 confidence, state),
            )
            if single and state == "accepted":
                db.execute(
                    "UPDATE facts SET valid_to = ?, superseded_by = ? WHERE subject = ?"
                    " AND predicate = ? AND id != ? AND state = 'accepted' AND valid_to IS NULL",
                    (stamp, fid, subject, predicate, fid),
                )
        return self.fact(fid)

    def fact(self, fid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM facts WHERE id = ?", (fid,))
        if row is None:
            raise Problem(f"There is no fact {fid}.")
        return _fact(row)

    def facts(
        self, subject: str = "person", *, states: tuple[str, ...] = ("accepted", "suggested"),
        current: bool = True,
    ) -> list[dict[str, Any]]:
        where = f"subject = ? AND state IN ({','.join('?' * len(states))})"
        if current:
            where += " AND valid_to IS NULL AND superseded_by IS NULL"
        rows = self.store.all(
            f"SELECT * FROM facts WHERE {where} ORDER BY predicate, recorded_at",
            (subject, *states),
        )
        return [_fact(r) for r in rows]

    def correct_fact(self, fid: str, value: str) -> dict[str, Any]:
        """The person's own value for a known fact (13 Oct, slice 2 D1): a new fact, stated,
        that replaces this one; the old one is kept as replaced (its history)."""
        f = self.fact(fid)
        clean = value.strip()
        if not clean:
            raise Problem("A fact needs a value; to have Alpha stop knowing it, forget it.")
        if f["state"] != "accepted" or f["valid_to"]:
            raise Problem("Only a fact Alpha knows now can be corrected.")
        if clean == f["value"]:
            return f
        stamp = now()
        new = new_id("f")
        with self.store.tx() as db:
            db.execute(
                "INSERT INTO facts (id, subject, predicate, value, valid_from, recorded_at,"
                " source, why, confidence, state) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (new, f["subject"], f["predicate"], clean, stamp, stamp, "stated",
                 "You corrected it.", 1.0, "accepted"))
            db.execute("UPDATE facts SET valid_to = ?, superseded_by = ? WHERE id = ?",
                       (stamp, new, fid))
        return self.fact(new)

    def forget_fact(self, fid: str) -> dict[str, Any]:
        """The person asks Alpha to forget a fact (D1): it and the values it replaced are
        deleted, so Alpha no longer knows it; the journal keeps what was said."""
        f = self.fact(fid)
        gone = [fid]
        with self.store.tx() as db:
            frontier = [fid]
            while frontier:
                rows = db.execute(f"SELECT id FROM facts WHERE superseded_by IN"
                                  f" ({','.join('?' * len(frontier))})", frontier).fetchall()
                frontier = [r["id"] for r in rows if r["id"] not in gone]
                gone += frontier
            db.execute(f"DELETE FROM facts WHERE id IN ({','.join('?' * len(gone))})", gone)
        return {**f, "forgotten": len(gone)}

    def decide_fact(self, fid: str, accept: bool) -> dict[str, Any]:
        """The person's yes or no on a suggested fact. A yes supersedes the accepted value."""
        f = self.fact(fid)
        if f["state"] != "suggested":
            raise Problem(f"Fact {fid} is not waiting for a yes or no.")
        stamp = now()
        with self.store.tx() as db:
            db.execute(
                "UPDATE facts SET state = ?, recorded_at = ? WHERE id = ?",
                ("accepted" if accept else "rejected", stamp, fid),
            )
            if accept:
                db.execute(
                    "UPDATE facts SET valid_to = ?, superseded_by = ? WHERE subject = ?"
                    " AND predicate = ? AND id != ? AND state = 'accepted' AND valid_to IS NULL",
                    (stamp, fid, f["subject"], f["predicate"], fid),
                )
        return self.fact(fid)
