"""Removing things for good, when the person asks: nothing related is left behind.

`remove_module` deletes a module and everything that belongs to it: its tables and their rows,
the readers its automations use, its automations and their threads (with each thread's journal
and the conversation the model resumes), its note, its goals, its journal, and the module.
Entities and facts stay (they belong to the person, not to a module), and so do connections
(a sign-in belongs to Alpha's browser).

`clear_conversation` deletes the person's conversation with Alpha: everything said and replied
outside any thread, with the questions Alpha asked there and their answers. What Alpha did and
read (Activity) and every module's data stay.
"""

from __future__ import annotations

from typing import Any

from alpha.world.world import World

CONVERSATION_KINDS = ("said", "replied", "failed", "asked", "answered", "proposed")


def remove_module(world: World, ref: str) -> dict[str, Any]:
    module = world.modules.get(ref)
    mid, name = module["id"], module["name"]
    store = world.store
    tables = [r["name"] for r in store.all("SELECT name FROM collections WHERE module = ?", (mid,))]
    autos = store.all("SELECT id, thread, procedure FROM automations WHERE module = ?", (mid,))
    readers = [r["name"] for r in store.all("SELECT name FROM readers")
               if r["name"] in tables or any(r["name"] in a["procedure"] for a in autos)]
    threads = {r["id"] for r in store.all("SELECT id FROM threads WHERE module = ?", (mid,))}
    threads |= {a["thread"] for a in autos if a["thread"]}
    counts: dict[str, Any] = {"module": name}
    with store.tx() as db:
        records = 0
        for table in tables:
            records += db.execute("DELETE FROM records WHERE collection = ?", (table,)).rowcount
            db.execute("DELETE FROM records_fts WHERE collection = ?", (table,))
            db.execute("DELETE FROM collections WHERE name = ?", (table,))
        counts["tables"], counts["rows"] = len(tables), records
        for reader in readers:
            db.execute("DELETE FROM readers WHERE name = ?", (reader,))
        counts["readers"] = len(readers)
        counts["automations"] = db.execute(
            "DELETE FROM automations WHERE module = ?", (mid,)).rowcount
        journal = 0
        for tid in threads:
            journal += db.execute("DELETE FROM journal WHERE thread = ?", (tid,)).rowcount
            db.execute("DELETE FROM threads WHERE id = ?", (tid,))
        counts["threads"] = len(threads)
        journal += db.execute("DELETE FROM journal WHERE module = ?", (mid,)).rowcount
        counts["journal"] = journal
        counts["notes"] = db.execute(
            "DELETE FROM notes WHERE scope = ?", (f"module:{name}",)).rowcount
        counts["goals"] = db.execute("DELETE FROM goals WHERE module = ?", (mid,)).rowcount
        db.execute("DELETE FROM modules WHERE id = ?", (mid,))
    return counts


def clear_conversation(world: World) -> dict[str, int]:
    marks = ",".join("?" * len(CONVERSATION_KINDS))
    with world.store.tx() as db:
        removed = db.execute(
            f"DELETE FROM journal WHERE thread IS NULL AND kind IN ({marks})", CONVERSATION_KINDS
        ).rowcount
    return {"turns": removed}
