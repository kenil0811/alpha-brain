"""Modules and threads.

A module is a named bundle of tables, skills, automations and a note around a goal: the tool the
person works in. It costs nothing to make (no code, no build) and grows as it is used. A module
may sit inside another (Job holds Search and Resume), to any depth: one concept, a `parent`,
nothing per level (Q31). What a module owns stays its own; a parent is the place that holds
its children, whose page, activity and conversation reach the whole subtree.

A thread is a piece of work with its own model context (a build, an automation, a long
job, or a topic the person opened deliberately). The person sees one stream; the to-and-fro of
the work lives in its thread so it never crowds the stream's context.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from alpha.world.store import Problem, Store, new_id, now

REMOVED = "removed"  # meta.network_module once the person removed Network
THREAD_KINDS = {"build", "job", "topic", "chat"}
THREAD_STATES = {"open", "working", "waiting", "done"}


def _row(row: sqlite3.Row) -> dict[str, Any]:
    return {k: row[k] for k in row.keys()}


class Modules:
    def __init__(self, store: Store) -> None:
        self.store = store

    def create(self, name: str, goal: str | None = None,
               parent: str | None = None) -> dict[str, Any]:
        name = name.strip()
        if not name:
            raise Problem("A module needs a name.")
        if self.store.one("SELECT 1 FROM modules WHERE LOWER(name) = LOWER(?)", (name,)):
            raise Problem(f"There is a module called '{name}' already.")
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
        if parent_id and parent_id == self.network_id():
            raise Problem("Network holds people and organisations, not other projects; merge"
                          f" {module['name']} into it instead.")
        if parent_id and parent_id in self.subtree(module["id"]):
            raise Problem(f"{module['name']} can't go inside itself or inside something it"
                          " holds.")
        with self.store.tx() as db:
            db.execute("UPDATE modules SET parent = ?, updated_at = ? WHERE id = ?",
                       (parent_id, now(), module["id"]))
        return self.get(module["id"])

    def network(self) -> str | None:
        """Network, the built-in project for the person's people and organisations (A6): made
        once, or taken over from a module already called Network, and known by its id in `meta`
        afterwards, so renaming it changes nothing. None once the person removed it: it is not
        made again behind their back."""
        with self.store.tx() as db:
            kept = db.execute("SELECT value FROM meta WHERE key = 'network_module'").fetchone()
            if kept:
                return None if kept["value"] == REMOVED else str(kept["value"])
            same = db.execute("SELECT id FROM modules WHERE LOWER(name) = 'network'").fetchone()
            mid = str(same["id"]) if same else new_id("m")
            if not same:
                db.execute("INSERT INTO modules (id, name, goal, parent, created_at, updated_at)"
                           " VALUES (?, 'Network', 'The people and organisations you know.',"
                           " NULL, ?, ?)", (mid, now(), now()))
            db.execute("INSERT INTO meta (key, value) VALUES ('network_module', ?)", (mid,))
        return mid

    def network_id(self) -> str | None:
        row = self.store.one("SELECT value FROM meta WHERE key = 'network_module'")
        return str(row["value"]) if row and row["value"] != REMOVED else None

    # what a module holds, by its `module` column; the journal keeps the module it was written in
    HELD = ("collections", "goals", "automations", "sources", "actions", "threads", "skills",
            "documents", "workflows")

    def merge(self, ref: str, into: str) -> dict[str, Any]:
        """Move everything a module holds (tables, the projects inside it, goals, automations,
        sources, skills, threads, documents, its page) into another, then remove the empty
        module. One change, its reads included: all of it moves or none does."""
        with self.store.tx() as db:
            def find(r: str) -> sqlite3.Row:
                row = db.execute("SELECT * FROM modules WHERE id = ? OR LOWER(name) = LOWER(?)",
                                 (r, r)).fetchone()
                if row is None:
                    raise Problem(f"There is no module '{r}'.")
                found: sqlite3.Row = row
                return found
            module, target = find(ref), find(into)
            src, dst = str(module["id"]), str(target["id"])
            if src == dst:
                raise Problem(f"{module['name']} can't be merged into itself.")
            below = {str(r["id"]) for r in db.execute(
                "WITH RECURSIVE down(id, depth) AS (SELECT id, 0 FROM modules WHERE id = ?"
                " UNION ALL SELECT m.id, depth + 1 FROM modules m JOIN down ON m.parent ="
                " down.id WHERE depth < 32) SELECT id FROM down", (src,)).fetchall()}
            if dst in below:
                raise Problem(f"{module['name']} holds {target['name']}; merge the other way,"
                              f" or move {target['name']} out first.")
            if module["workspace"]:
                raise Problem(f"{module['name']} is built as a program with its own folder;"
                              " it can't be merged, only moved inside another.")
            live = "SELECT COUNT(*) AS n FROM workflows WHERE module = ? AND state != 'removed'"
            both = [db.execute(live, (m,)).fetchone()["n"] for m in (src, dst)]
            if all(both):
                raise Problem(f"{module['name']} and {target['name']} each run as a workflow;"
                              " one module holds one, so they can't be merged.")
            # a page read by both stays once, in the module it merges into
            db.execute("DELETE FROM sources WHERE module = ? AND url IN"
                       " (SELECT url FROM sources WHERE module = ?)", (src, dst))
            moved: dict[str, int] = {}
            for table in self.HELD:
                n = db.execute(f"UPDATE {table} SET module = ? WHERE module = ?",  # noqa: S608
                               (dst, src)).rowcount
                if n:
                    moved[table] = n
            # Network never nests: what sat in a module merged into it goes to the top
            network = db.execute("SELECT value FROM meta WHERE key = 'network_module'").fetchone()
            parent = None if network and network["value"] == dst else dst
            n = db.execute("UPDATE modules SET parent = ? WHERE parent = ?", (parent, src)).rowcount
            if n:
                moved["projects"] = n
            self._merge_page(db, str(module["name"]), str(target["name"]))
            db.execute("DELETE FROM modules WHERE id = ?", (src,))
        return {"merged": _row(module), "into": self.get(dst), "moved": moved}

    @staticmethod
    def _merge_page(db: sqlite3.Connection, name: str, into: str) -> None:
        """The merged module's page joins the other's, under its own name as a heading."""
        page = db.execute("SELECT * FROM notes WHERE scope = ?", (f"module:{name}",)).fetchone()
        if page is None:
            return
        there = db.execute("SELECT * FROM notes WHERE scope = ? ORDER BY title LIMIT 1",
                           (f"module:{into}",)).fetchone()
        if there:
            db.execute("UPDATE notes SET body = ?, updated_at = ? WHERE id = ?",
                       (f"{there['body'].rstrip()}\n\n## {name}\n\n{page['body'].strip()}\n",
                        now(), there["id"]))
            db.execute("DELETE FROM notes WHERE id = ?", (page["id"],))
        else:
            db.execute("UPDATE notes SET scope = ?, title = ?, updated_at = ? WHERE id = ?",
                       (f"module:{into}", into, now(), page["id"]))

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
            raise Problem(f"There is no module '{ref}'.")
        return _row(row)

    def all(self) -> list[dict[str, Any]]:
        return [_row(r) for r in self.store.all("SELECT * FROM modules ORDER BY name")]

    def set_workspace(self, module_id: str, path: str | None) -> dict[str, Any]:
        """The folder a program module is built in (Q38); None when it is removed."""
        with self.store.tx() as db:
            db.execute("UPDATE modules SET workspace = ?, updated_at = ? WHERE id = ?",
                       (path, now(), module_id))
        return self.get(module_id)

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

    def update_thread(self, tid: str, *, state: str | None = None) -> dict[str, Any]:
        current = self.thread(tid)
        if state is not None and state not in THREAD_STATES:
            raise Problem(f"A thread's state is one of {sorted(THREAD_STATES)}; got '{state}'.")
        with self.store.tx() as db:
            db.execute(
                "UPDATE threads SET state = ?, updated_at = ? WHERE id = ?",
                (state or current["state"], now(), tid),
            )
        return self.thread(tid)

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

    def threads(self, state: str | None = None, *, done: bool = False,
                limit: int | None = None) -> list[dict[str, Any]]:
        """Open threads, newest first; `done=True` adds the finished ones (the Assistant
        page's history), the newest `limit` of all."""
        if state is None and done:
            rows = self.store.all(
                "SELECT * FROM threads ORDER BY updated_at DESC LIMIT ?", (limit or 100,)
            )
        elif state is None:
            rows = self.store.all(
                "SELECT * FROM threads WHERE state != 'done' ORDER BY updated_at DESC"
            )
        else:
            rows = self.store.all(
                "SELECT * FROM threads WHERE state = ? ORDER BY updated_at DESC", (state,)
            )
        return [_row(r) for r in rows]
