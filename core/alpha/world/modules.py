"""Modules and threads.

A module is a named bundle of tables, skills, automations and a note around a goal: the tool the
person works in. It costs nothing to make (no code, no build) and grows as it is used. A module
may sit inside another (Job holds Search and Resume), to any depth: one concept, a `parent`,
nothing per level (Q31). What a module owns stays its own; a parent is the place that holds
its children, whose page, activity and conversation reach the whole subtree.

A module being made through the creation process holds where that stands in
`creation` (JSON: stage, its thread, and what the page shows; runtime/turn.py CREATION_RULES).

A thread is a piece of work with its own model context (a build, research, an automation, a long
job, or a topic the person opened deliberately). The person sees one stream; the to-and-fro of
the work lives in its thread so it never crowds the stream's context.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from alpha.world.store import Problem, Store, dumps, loads, new_id, now

THREAD_KINDS = {"build", "research", "job", "topic", "chat"}
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
# "Leave the parent as it is" for `update(parent=)`, where None means "move it to the top".
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

    def create(self, name: str, goal: str | None = None,
               parent: str | None = None) -> dict[str, Any]:
        name = name.strip()
        if not name:
            raise Problem("A project needs a name.")
        if self.store.one("SELECT 1 FROM modules WHERE LOWER(name) = LOWER(?)", (name,)):
            raise Problem(f"There is a project called '{name}' already.")
        parent_id = self.get(parent)["id"] if parent else None
        mid = new_id("m")
        stamp = now()
        with self.store.tx() as db:
            db.execute(
                "INSERT INTO modules (id, name, goal, parent, created_at, updated_at)"
                " VALUES (?,?,?,?,?,?)",
                (mid, name, goal, parent_id, stamp, stamp),
            )
        return self.get(mid)

    def move(self, ref: str, parent: str | None) -> dict[str, Any]:
        """Put a module inside another, or at the top (parent None). Never inside itself or
        anything below it."""
        module = self.get(ref)
        parent_id = self.get(parent)["id"] if parent else None
        if parent_id and parent_id in self.subtree(module["id"]):
            raise Problem(f"{module['name']} can't go inside itself or inside something it"
                          " holds.")
        with self.store.tx() as db:
            db.execute("UPDATE modules SET parent = ?, updated_at = ? WHERE id = ?",
                       (parent_id, now(), module["id"]))
        return self.get(module["id"])

    def children(self, mid: str) -> list[dict[str, Any]]:
        return [_row(r) for r in self.store.all(
            "SELECT * FROM modules WHERE parent = ? ORDER BY name", (mid,))]

    def subtree(self, mid: str) -> list[str]:
        """The module's id and every id below it, parents before children."""
        rows = self.store.all(
            "WITH RECURSIVE down(id, name, depth) AS (SELECT id, name, 0 FROM modules WHERE id"
            " = ? UNION ALL SELECT m.id, m.name, down.depth + 1 FROM modules m JOIN down ON"
            " m.parent = down.id WHERE down.depth < 32) SELECT id FROM down ORDER BY depth, name",
            (mid,))
        return [str(r["id"]) for r in rows]

    def path(self, mid: str) -> list[dict[str, Any]]:
        """The module and its ancestors, top first: Job › Search."""
        out: list[dict[str, Any]] = []
        seen: set[str] = set()
        current: str | None = mid
        while current and current not in seen:
            seen.add(current)
            row = self.store.one("SELECT id, name, parent FROM modules WHERE id = ?", (current,))
            if row is None:
                break
            out.append({"id": row["id"], "name": row["name"]})
            current = row["parent"]
        return list(reversed(out))

    def path_words(self, mid: str) -> str:
        return " › ".join(m["name"] for m in self.path(mid))

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

    def update(self, ref: str, *, name: str | None = None, icon: str | None = None,
               goal: str | None = None, parent: Any = KEEP) -> dict[str, Any]:
        """Rename a module, change its icon or goal, or put it inside another (`parent`, as
        `move`; None = the top). Its note is filed under its name, so it moves with it."""
        current = self.get(ref)
        if parent is not KEEP:
            current = self.move(current["id"], parent)
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
            db.execute("UPDATE modules SET name = ?, icon = ?, goal = ?, updated_at = ?"
                       " WHERE id = ?",
                       (new_name, current["icon"] if icon is None else icon, new_goal, now(),
                        current["id"]))
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
        self, tid: str, *, state: str | None = None, title: str | None = None,
    ) -> dict[str, Any]:
        current = self.thread(tid)
        if state is not None and state not in THREAD_STATES:
            raise Problem(f"A thread's state is one of {sorted(THREAD_STATES)}; got '{state}'.")
        with self.store.tx() as db:
            db.execute(
                "UPDATE threads SET state = ?, title = ?, updated_at = ? WHERE id = ?",
                (state or current["state"], (title or "").strip()[:60] or current["title"], now(),
                 tid),
            )
        return self.thread(tid)

    def sessions(self, module: str | None, *, include_done: bool = False) -> list[dict[str, Any]]:
        """The chats the person opened in one place (a project's, or the global ones when
        `module` is None), newest first, each with how many times they spoke in it. A
        conversation (kind chat) is listed once it has closed: while live it is the place's own
        stream, and closing is not archiving."""
        rows = self.store.all(
            "SELECT t.*, (SELECT COUNT(*) FROM journal j WHERE j.thread = t.id AND j.kind ="
            " 'said' AND j.deleted_at IS NULL) AS turns FROM threads t WHERE t.module IS ? AND"
            " ((t.kind = 'topic' AND (? OR t.state != 'done')) OR (t.kind = 'chat' AND"
            " t.state = 'done')) ORDER BY t.updated_at DESC",
            (module, include_done),
        )
        return [_row(r) for r in rows]

    def set_brief(self, tid: str, brief: str) -> dict[str, Any]:
        """A thread's brief: what this work is for, what was decided, what didn't work and why,
        what is open, what comes next. Each run starts from it and the thread's own journal,
        never from a remembered model conversation."""
        self.thread(tid)
        with self.store.tx() as db:
            db.execute("UPDATE threads SET brief = ?, updated_at = ? WHERE id = ?",
                       (brief.strip(), now(), tid))
        return self.thread(tid)

    def set_session(self, tid: str, session_ref: str | None) -> None:
        """A live conversation keeps its model session between turns; nothing else does."""
        with self.store.tx() as db:
            db.execute("UPDATE threads SET session_ref = ?, updated_at = ? WHERE id = ?",
                       (session_ref, now(), tid))

    def live_chat(self, module: str | None) -> dict[str, Any] | None:
        """The live conversation in a scope (a module, or General when None): the most recent
        chat thread there that is not done."""
        row = self.store.one(
            "SELECT * FROM threads WHERE kind = 'chat' AND state != 'done' AND module IS ?"
            " ORDER BY updated_at DESC LIMIT 1", (module,))
        return _row(row) if row else None

    def chats(self, module: str | None = None, *, live: bool = True, limit: int = 20
              ) -> list[dict[str, Any]]:
        where = ["kind = 'chat'"]
        args: list[Any] = []
        if live:
            where.append("state != 'done'")
        if module is not None:
            where.append("module = ?")
            args.append(module)
        rows = self.store.all(
            f"SELECT * FROM threads WHERE {' AND '.join(where)} ORDER BY updated_at DESC LIMIT ?",
            (*args, limit))
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
