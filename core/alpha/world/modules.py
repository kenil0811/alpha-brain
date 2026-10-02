"""Modules and threads.

A module is a named bundle of tables, skills, automations and a note around a goal: the tool the
person works in. It costs nothing to make (no code, no build) and grows as it is used.

A module may be filed under another one: a sub project (`project` holds its parent's id), one
level deep. A module being made through the creation process holds where that stands in
`creation` (JSON: stage, its thread, and what the page shows; runtime/turn.py CREATION_RULES).

A thread is a piece of work with its own model context (a build, research, an automation, a long
job, or a topic the person opened deliberately). The person sees one stream; the to-and-fro of
the work lives in its thread so it never crowds the stream's context.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from alpha.world.store import Problem, Store, dumps, loads, new_id, now

THREAD_KINDS = {"build", "research", "job", "topic"}
# The icons a project may wear: lucide names the workspace draws (desktop shell/projectIcons.ts).
ICONS = {
    "folder", "boxes", "briefcase", "notebook-pen", "calendar", "users", "chart-line", "mail",
    "list-checks", "graduation-cap", "heart-pulse", "wallet", "shopping-cart", "plane", "house",
    "code", "megaphone", "book-open", "sparkles", "sticky-note", "target", "utensils", "dumbbell",
}
THREAD_STATES = {"open", "working", "waiting", "done"}
UNTITLED = "Untitled project"
# Making a project, in order (runtime/turn.py CREATION_RULES; the project page draws each).
CREATION_STAGES = ("new", "asking", "researching", "proposing", "planned", "building", "done")
# "Leave the parent as it is" for `update(project=)`, where None means "take it out".
KEEP: Any = object()


def _row(row: sqlite3.Row) -> dict[str, Any]:
    out = {k: row[k] for k in row.keys()}
    if "creation" in out:
        out["creation"] = loads(out["creation"])
    return out


class Modules:
    def __init__(self, store: Store) -> None:
        self.store = store

    def untitled(self) -> str:
        """A free "Untitled project" name ("Untitled project 2", … when taken)."""
        taken = {m["name"].lower() for m in self.all()}
        name, n = UNTITLED, 2
        while name.lower() in taken:
            name, n = f"{UNTITLED} {n}", n + 1
        return name

    def create(self, name: str, goal: str | None = None) -> dict[str, Any]:
        name = name.strip()
        if not name:
            raise Problem("A project needs a name.")
        if self.store.one("SELECT 1 FROM modules WHERE LOWER(name) = LOWER(?)", (name,)):
            raise Problem(f"There is a project called '{name}' already.")
        mid = new_id("m")
        stamp = now()
        with self.store.tx() as db:
            db.execute(
                "INSERT INTO modules (id, name, goal, created_at, updated_at) VALUES (?,?,?,?,?)",
                (mid, name, goal, stamp, stamp),
            )
        return self.get(mid)

    def get(self, ref: str) -> dict[str, Any]:
        """By id or by name (case-insensitive)."""
        row = self.store.one(
            "SELECT * FROM modules WHERE id = ? OR LOWER(name) = LOWER(?)", (ref, ref)
        )
        if row is None:
            raise Problem(f"There is no project '{ref}'.")
        return _row(row)

    def all(self) -> list[dict[str, Any]]:
        return [_row(r) for r in self.store.all("SELECT * FROM modules ORDER BY name")]

    def children(self, ref: str) -> list[dict[str, Any]]:
        """Its sub projects."""
        mid = self.get(ref)["id"]
        return [_row(r) for r in self.store.all(
            "SELECT * FROM modules WHERE project = ? ORDER BY name", (mid,))]

    def update(self, ref: str, *, name: str | None = None, icon: str | None = None,
               goal: str | None = None, project: Any = KEEP) -> dict[str, Any]:
        """Rename a module, change its icon or goal, or file it under another project (`project`
        = that project, None = back to the top level). Its note is filed under its name, so it
        moves with it. Sub projects are one level deep: a project with sub projects can't be
        filed, and nothing is filed under a sub project."""
        current = self.get(ref)
        parent = current["project"]
        if project is not KEEP:
            parent = None if project is None else self.get(project)["id"]
            if parent == current["id"]:
                raise Problem("A project can't be filed under itself.")
            if parent and self.get(parent)["project"]:
                raise Problem("That is a sub project already; file it under a top-level one.")
            if parent and self.children(current["id"]):
                raise Problem(f"{current['name']} has sub projects of its own, so it stays at"
                              " the top level.")
        new_name = current["name"] if name is None else name.strip()
        if not new_name:
            raise Problem("A project needs a name.")
        if new_name.lower() != current["name"].lower() and self.store.one(
                "SELECT 1 FROM modules WHERE LOWER(name) = LOWER(?)", (new_name,)):
            raise Problem(f"There is a project called '{new_name}' already.")
        if icon is not None and icon not in ICONS:
            raise Problem(f"'{icon}' isn't one of the project icons.")
        new_goal = current["goal"] if goal is None else (goal.strip() or None)
        with self.store.tx() as db:
            db.execute("UPDATE modules SET name = ?, icon = ?, goal = ?, project = ?,"
                       " updated_at = ? WHERE id = ?",
                       (new_name, current["icon"] if icon is None else icon, new_goal, parent,
                        now(), current["id"]))
            if new_name != current["name"]:
                db.execute("UPDATE notes SET scope = ?, title = CASE WHEN title = ? THEN ?"
                           " ELSE title END WHERE scope = ?",
                           (f"module:{new_name}", current["name"], new_name,
                            f"module:{current['name']}"))
        return self.get(current["id"])

    # ---- making a project ----

    def set_creation(self, ref: str, patch: dict[str, Any] | None) -> dict[str, Any]:
        """Merge `patch` into where making the project stands (a None value drops that key);
        `patch=None` forgets it altogether."""
        current = self.get(ref)
        if patch is None:
            state = None
        else:
            stage = patch.get("stage")
            if stage is not None and stage not in CREATION_STAGES:
                raise Problem(f"A creation stage is one of {', '.join(CREATION_STAGES)}; got"
                              f" '{stage}'.")
            state = {**(current["creation"] or {}), **patch}
            state = {k: v for k, v in state.items() if v is not None}
        with self.store.tx() as db:
            db.execute("UPDATE modules SET creation = ?, updated_at = ? WHERE id = ?",
                       (None if state is None else dumps(state), now(), current["id"]))
        return self.get(current["id"])

    def making(self, thread: str | None) -> dict[str, Any] | None:
        """The project whose creation runs in this thread, if any."""
        if not thread:
            return None
        row = self.store.one("SELECT * FROM modules WHERE json_extract(creation, '$.thread') = ?",
                             (thread,))
        return _row(row) if row else None

    # ---- threads ----

    def open_thread(self, title: str, kind: str, module: str | None = None) -> dict[str, Any]:
        if kind not in THREAD_KINDS:
            raise Problem(f"A thread is one of {sorted(THREAD_KINDS)}; got '{kind}'.")
        tid = new_id("t")
        stamp = now()
        with self.store.tx() as db:
            db.execute(
                "INSERT INTO threads (id, title, kind, state, module, created_at, updated_at)"
                " VALUES (?,?,?,?,?,?,?)",
                (tid, title, kind, "open", module, stamp, stamp),
            )
        return self.thread(tid)

    def thread(self, tid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM threads WHERE id = ?", (tid,))
        if row is None:
            raise Problem(f"There is no thread {tid}.")
        return _row(row)

    def update_thread(
        self, tid: str, *, state: str | None = None, session_ref: str | None = None,
        title: str | None = None,
    ) -> dict[str, Any]:
        current = self.thread(tid)
        if state is not None and state not in THREAD_STATES:
            raise Problem(f"A thread's state is one of {sorted(THREAD_STATES)}; got '{state}'.")
        with self.store.tx() as db:
            db.execute(
                "UPDATE threads SET state = ?, session_ref = ?, title = ?, updated_at = ?"
                " WHERE id = ?",
                (state or current["state"], session_ref or current["session_ref"],
                 (title or "").strip()[:60] or current["title"], now(), tid),
            )
        return self.thread(tid)

    def sessions(self, module: str | None, *, include_done: bool = False) -> list[dict[str, Any]]:
        """The chats the person opened in one place (a project's, or the global ones when
        `module` is None), newest first, each with how many times they spoke in it."""
        rows = self.store.all(
            "SELECT t.*, (SELECT COUNT(*) FROM journal j WHERE j.thread = t.id AND j.kind ="
            " 'said' AND j.deleted_at IS NULL) AS turns FROM threads t WHERE t.kind = 'topic'"
            " AND t.module IS ? AND (? OR t.state != 'done') ORDER BY t.updated_at DESC",
            (module, include_done),
        )
        return [_row(r) for r in rows]

    def threads(self, state: str | None = None) -> list[dict[str, Any]]:
        if state is None:
            rows = self.store.all(
                "SELECT * FROM threads WHERE state != 'done' ORDER BY updated_at DESC"
            )
        else:
            rows = self.store.all(
                "SELECT * FROM threads WHERE state = ? ORDER BY updated_at DESC", (state,)
            )
        return [_row(r) for r in rows]
