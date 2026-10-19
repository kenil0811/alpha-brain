"""Modules and threads.

A module is a named bundle of tables, skills, agents and a note around a goal: the tool the
person works in. A plain one costs nothing to make; one made from a workflow page has its
parts built in its workspace (§12). It grows as it is used. A module
may sit inside another (Job holds Search and Resume), to any depth: one concept, a `parent`,
nothing per level (Q31). What a module owns stays its own; a parent is the place that holds
its children, whose page, activity and conversation reach the whole subtree.

A module can be removed with its data kept (13 Oct, slice 2 A4): it and what it holds leave every
list (the sidebar, Home, Alpha's context), its agents stop, nothing of it is changed, and it
can be restored or deleted for good from Settings. The modules removed together carry the id of the
one the removal was asked of (`removed_with`), so a restore brings back exactly those.

A thread is one of two things (harness design §7, slice 3, 18 Oct 2026): **Home**, the one
conversation, whose session coordinates, and a **work item**, a piece of work with its own
model session, a state, one plain line (its card) and its own box: a build, a watch with its
runs, a long answer, an agent's work. The to-and-fro of the work lives in its item so it never
crowds Home.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from alpha.world.store import Problem, Store, new_id, now

THREAD_KINDS = {"home", "work"}
# open: nothing running (an item between turns, an agent's between runs); working; needs_you:
# a question or a yes waits; done: its last turn ended well; stopped: it failed or was stopped.
THREAD_STATES = {"open", "working", "needs_you", "done", "stopped"}
HOME_TITLE = "Home"


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
        if parent_id and parent_id in self.subtree(module["id"]):
            raise Problem(f"{module['name']} can't go inside itself or inside something it"
                          " holds.")
        with self.store.tx() as db:
            db.execute("UPDATE modules SET parent = ?, updated_at = ? WHERE id = ?",
                       (parent_id, now(), module["id"]))
        return self.get(module["id"])

    def rename(self, ref: str, name: str) -> dict[str, Any]:
        """A new name for a module, everywhere at once; its page (the note `module:<name>`)
        goes with it. Refused when empty or when another module has the name already."""
        module = self.get(ref)
        clean = name.strip()
        if not clean:
            raise Problem("A module needs a name.")
        if clean == module["name"]:
            return module
        taken = self.store.one("SELECT id FROM modules WHERE LOWER(name) = LOWER(?) AND id != ?",
                               (clean, module["id"]))
        if taken:
            raise Problem(f"There is a module called '{clean}' already.")
        old = module["name"]
        with self.store.tx() as db:
            db.execute("UPDATE modules SET name = ?, updated_at = ? WHERE id = ?",
                       (clean, now(), module["id"]))
            db.execute("UPDATE notes SET scope = ?, title = CASE WHEN title = ? THEN ? ELSE title"
                       " END WHERE scope = ?", (f"module:{clean}", old, clean, f"module:{old}"))
        return self.get(module["id"])

    def remove(self, ref: str) -> dict[str, Any]:
        """Remove a module with its data kept: it and whatever it holds (not removed already)
        leave every list, stamped together."""
        module = self.get(ref)
        if module.get("removed_at"):
            raise Problem(f"{module['name']} is removed already; restore it from Settings.")
        stamp = now()
        ids = self.subtree(module["id"])
        with self.store.tx() as db:
            for mid in ids:
                db.execute("UPDATE modules SET removed_at = ?, removed_with = ?, updated_at = ?"
                           " WHERE id = ? AND removed_at IS NULL",
                           (stamp, module["id"], stamp, mid))
        return self.get(module["id"])

    def restore(self, ref: str) -> dict[str, Any]:
        """Put a removed module back where it was, with what was removed together with it."""
        module = self.get(ref)
        if not module.get("removed_at"):
            raise Problem(f"{module['name']} isn't removed.")
        if module.get("parent"):
            parent = self.get(module["parent"])
            if parent.get("removed_at"):
                raise Problem(f"Restore {parent['name']} first: {module['name']} sits inside it.")
        with self.store.tx() as db:
            for mid in self.subtree(module["id"]):
                db.execute("UPDATE modules SET removed_at = NULL, removed_with = NULL, updated_at"
                           " = ? WHERE id = ? AND removed_with = ?", (now(), mid, module["id"]))
        return self.get(module["id"])

    def removed(self) -> list[dict[str, Any]]:
        """The modules removed with their data kept that were removed themselves (not only as
        part of a module above them), newest first."""
        rows = self.store.all(
            "SELECT * FROM modules WHERE removed_at IS NOT NULL AND removed_with = id"
            " ORDER BY removed_at DESC, name")
        return [_row(r) for r in rows]

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
        """The modules in use: a removed one (and what was removed with it) is left out."""
        return [_row(r) for r in self.store.all(
            "SELECT * FROM modules WHERE removed_at IS NULL ORDER BY name")]

    def set_workspace(self, module_id: str, path: str | None) -> dict[str, Any]:
        """The folder a module's workflow is built in (§12); None when it has none."""
        with self.store.tx() as db:
            db.execute("UPDATE modules SET workspace = ?, updated_at = ? WHERE id = ?",
                       (path, now(), module_id))
        return self.get(module_id)

    # ---- threads ----

    def home_thread(self) -> dict[str, Any]:
        """Home, the one conversation (made the first time it is needed)."""
        row = self.store.one(
            "SELECT * FROM threads WHERE kind = 'home' ORDER BY created_at LIMIT 1")
        if row is not None:
            return _row(row)
        return self.open_thread(HOME_TITLE, "home")

    def open_thread(self, title: str, kind: str = "work",
                    module: str | None = None) -> dict[str, Any]:
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

    def update_thread(self, tid: str, *, state: str | None = None,
                      last_line: str | None = None) -> dict[str, Any]:
        """A thread's state and its one plain line (what its card shows)."""
        current = self.thread(tid)
        if state is not None and state not in THREAD_STATES:
            raise Problem(f"A thread's state is one of {sorted(THREAD_STATES)}; got '{state}'.")
        line = " ".join(last_line.split())[:200] if last_line is not None else None
        with self.store.tx() as db:
            db.execute(
                "UPDATE threads SET state = ?, last_line = COALESCE(?, last_line), updated_at = ?"
                " WHERE id = ?", (state or current["state"], line, now(), tid),
            )
        return self.thread(tid)

    def retitle(self, tid: str, title: str, *, by_person: bool) -> dict[str, Any]:
        """A thread's title: the person's (kept from then on), or the first message's while the
        person hasn't named it."""
        self.thread(tid)
        # not activity: a renamed conversation keeps its place in the lists (by its last turn)
        with self.store.tx() as db:
            db.execute("UPDATE threads SET title = ?, titled = COALESCE(?, titled) WHERE id = ?",
                       (title, "person" if by_person else None, tid))
        return self.thread(tid)

    def title_agents_items(self) -> None:
        """An agent's own work item is titled with the agent's name, unless the person named it
        (19 Oct 2026: Deal Analyst's item read "Make an agent called Deal Analyst that...", the
        request that made it, and its answers there were not found). Kept on every open, so a
        renamed agent's item follows."""
        with self.store.tx() as db:
            db.execute("UPDATE threads SET title = (SELECT a.name FROM agents a WHERE"
                       " a.thread = threads.id) WHERE kind = 'work' AND (titled IS NULL OR"
                       " titled != 'person') AND id IN (SELECT thread FROM agents WHERE thread"
                       " IS NOT NULL) AND title != (SELECT a.name FROM agents a WHERE"
                       " a.thread = threads.id)")

    def set_brief(self, tid: str, brief: str) -> dict[str, Any]:
        """A thread's brief: what this work is for, what was decided, what didn't work and why,
        what is open, what comes next. Each run starts from it and the thread's own journal,
        never from a remembered model conversation."""
        self.thread(tid)
        with self.store.tx() as db:
            db.execute("UPDATE threads SET brief = ?, updated_at = ? WHERE id = ?",
                       (brief.strip(), now(), tid))
        return self.thread(tid)

    def set_session(self, tid: str, session_ref: str | None, *,
                    tools: str | None = None) -> None:
        """Home and every work item keep their model session between turns, with the
        fingerprint of the tools it was made with: a session is resumed only on the same
        tools (18 Oct 2026: one resumed across a change of the hands called a tool it did not
        have)."""
        with self.store.tx() as db:
            db.execute("UPDATE threads SET session_ref = ?, session_tools = ? WHERE id = ?",
                       (session_ref, tools if session_ref else None, tid))

    def items(self, *, module: str | None = None, limit: int = 50) -> list[dict[str, Any]]:
        """Work items, newest first; `module` narrows to one module's."""
        where = ["kind = 'work'"]
        args: list[Any] = []
        if module is not None:
            where.append("module = ?")
            args.append(module)
        rows = self.store.all(
            f"SELECT * FROM threads WHERE {' AND '.join(where)} ORDER BY updated_at DESC LIMIT ?",
            (*args, limit))
        return [_row(r) for r in rows]

    def threads(self, state: str | None = None, *, done: bool = False,
                limit: int | None = None) -> list[dict[str, Any]]:
        """Work items that are not over (open, working, needs you), newest first; `done=True`
        adds the finished and stopped ones (the Assistant page's history), the newest `limit`
        of all. Home is never among them."""
        if state is None and done:
            rows = self.store.all(
                "SELECT * FROM threads WHERE kind = 'work' ORDER BY updated_at DESC LIMIT ?",
                (limit or 100,))
        elif state is None:
            rows = self.store.all(
                "SELECT * FROM threads WHERE kind = 'work' AND state NOT IN ('done', 'stopped')"
                " ORDER BY updated_at DESC")
        else:
            rows = self.store.all(
                "SELECT * FROM threads WHERE state = ? ORDER BY updated_at DESC", (state,)
            )
        return [_row(r) for r in rows]
