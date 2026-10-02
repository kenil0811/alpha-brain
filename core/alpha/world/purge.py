"""Removing things for good, when the person asks.

A removal deletes the thing and everything that exists because of it, but never the journal:
the journal is the audit, and what happened has happened. Each removal is journaled with what
went, and history about a removed thing is marked as such wherever Alpha reads it
(`Journal.mark_removed`), so Alpha never takes it for something that still exists. Threads stay
as a record but lose the session the model would resume, and open questions are closed.

`remove_module` deletes a module's tables and their rows, the readers its automations use, its
automations, its note and its goals. Entities and facts stay (they belong to the person, not to
a module), and so do connections (a sign-in belongs to Alpha's browser).

`remove_connection` disconnects Alpha from something: for a site, Alpha's sign-in (its browser
profile on disk), the readers Alpha wrote for the sites that sign-in covers and the automations
that use them; for a folder, the documents read from it; for the calendar, its events. What
Alpha wrote into the person's tables stays: those rows are the person's, and removing the
module is how they go.

`clear_conversation` deletes the person's conversation with Alpha: everything said and replied
outside any thread, with the questions Alpha asked there and their answers. What Alpha did and
read (Activity) and every module's data stay.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from alpha.connectors.base import Connections
from alpha.connectors.browser import profile_of, signin_sites, site_of
from alpha.world.store import Problem, now
from alpha.world.world import World, alpha_home

CONVERSATION_KINDS = ("said", "replied", "failed", "asked", "answered", "proposed")


def plural(n: int, one: str) -> str:
    return f"{n:,} {one}{'' if n == 1 else 's'}"


def and_join(words: list[str]) -> str:
    return words[0] if len(words) == 1 else f"{', '.join(words[:-1])} and {words[-1]}"


def _record_removal(world: World, kind: str, rid: str, name: str, what: str,
                    *, threads: list[str], automations: list[str], readers: list[str],
                    source: str | None = None) -> None:
    world.journal.append(
        "changed", f"Removed {name}: {what}.", actor="person", source=source,
        data={"removed": {"kind": kind, "id": rid, "name": name, "threads": threads,
                          "automations": automations, "readers": readers}},
    )


def _retire_threads(db: Any, threads: list[str]) -> None:
    for tid in threads:
        db.execute("UPDATE threads SET state = 'done', session_ref = NULL WHERE id = ?", (tid,))


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
    asks = [a["id"] for a in world.journal.open_asks() if a["module"] == mid]
    counts: dict[str, Any] = {"module": name}
    with store.tx() as db:
        records = 0
        for table in tables:
            records += db.execute("DELETE FROM records WHERE collection = ?", (table,)).rowcount
            db.execute("DELETE FROM records_fts WHERE collection = ?", (table,))
            db.execute("DELETE FROM record_versions WHERE collection = ?", (table,))
            db.execute("DELETE FROM collections WHERE name = ?", (table,))
        counts["tables"], counts["rows"] = len(tables), records
        for reader in readers:
            db.execute("DELETE FROM readers WHERE name = ?", (reader,))
        counts["readers"] = len(readers)
        counts["automations"] = db.execute(
            "DELETE FROM automations WHERE module = ?", (mid,)).rowcount
        _retire_threads(db, sorted(threads))
        counts["threads"] = len(threads)
        counts["notes"] = db.execute(
            "DELETE FROM notes WHERE scope = ?", (f"module:{name}",)).rowcount
        counts["goals"] = db.execute("DELETE FROM goals WHERE module = ?", (mid,)).rowcount
        counts["sources"] = world.sources.remove_module(db, mid)
        # Plans stay as a record of what was proposed and decided; none of them goes on.
        db.execute("UPDATE plans SET state = 'stopped', report = COALESCE(report, ?),"
                   " updated_at = ? WHERE module = ? AND state IN ('proposed', 'approved',"
                   " 'building')", (f"{name} was removed.", now(), mid))
        db.execute("DELETE FROM modules WHERE id = ?", (mid,))
    for ask in asks:
        world.journal.close_ask(ask, f"{name} was removed.", actor="alpha", closed="removed")
    what = [plural(len(tables), "table") + (f" ({plural(records, 'row')})" if records else "")]
    what += [plural(len(readers), "reader")] if readers else []
    what += [plural(counts["automations"], "automation")] if counts["automations"] else []
    _record_removal(world, "module", mid, name, and_join(what), threads=sorted(threads),
                    automations=[a["id"] for a in autos], readers=readers)
    return counts


def clear_conversation(world: World) -> dict[str, int]:
    marks = ",".join("?" * len(CONVERSATION_KINDS))
    with world.store.tx() as db:
        # What the model was shown for those turns quotes the conversation too.
        db.execute("DELETE FROM turn_contexts WHERE turn IN (SELECT id FROM journal"
                   " WHERE thread IS NULL AND kind = 'said')")
        removed = db.execute(
            f"DELETE FROM journal WHERE thread IS NULL AND kind IN ({marks})", CONVERSATION_KINDS
        ).rowcount
    return {"turns": removed}


def _site(url: str) -> str | None:
    try:
        return site_of(url)
    except Problem:
        return None


def _in(column: str, values: list[str]) -> tuple[str, tuple[str, ...]]:
    return f"{column} IN ({','.join('?' * len(values))})", tuple(values)


def remove_connection(world: World, cid: str, *, dry_run: bool = False) -> dict[str, Any]:
    """Remove a connection and everything that exists because of it. With `dry_run`, only say
    what would go (the app shows it before the person confirms)."""
    store = world.store
    conn = Connections(store).get(cid)
    kind, target = conn["connector"], conn["target"]
    readers: list[str] = []
    autos: list[dict[str, Any]] = []
    profile: Path | None = None
    documents: list[str] = []
    events: list[str] = []
    entity_ids: list[str] = []
    if kind == "browser":
        sites = set(signin_sites(conn))
        readers = [r["name"] for r in store.all("SELECT name, site, url FROM readers")
                   if r["site"] in sites or _site(r["url"]) in sites]
        autos = [dict(a) for a in store.all("SELECT id, title, thread, procedure FROM automations")
                 if any(n in a["procedure"] for n in readers)
                 or any(site in a["procedure"].lower() for site in sites)]
        candidate = profile_of(conn).resolve()
        if candidate.is_relative_to((alpha_home() / "browser").resolve()) and candidate.exists():
            profile = candidate
    elif kind == "files":
        rows = store.all("SELECT id, entity_id FROM documents WHERE connection = ?", (cid,))
        documents = [r["id"] for r in rows]
        entity_ids = [r["entity_id"] for r in rows]
    elif kind == "calendar":
        rows = store.all("SELECT id, entity_id FROM events WHERE connection = ?", (cid,))
        events = [r["id"] for r in rows]
        entity_ids = [r["entity_id"] for r in rows]
    what = [w for w in (
        "Alpha's sign-in" if profile is not None else "",
        plural(len(readers), "reader") if readers else "",
        plural(len(autos), "automation") if autos else "",
        plural(len(documents), "document") if documents else "",
        plural(len(events), "event") if events else "",
    ) if w] or ["the connection"]
    plan: dict[str, Any] = {
        "connection": cid, "connector": kind, "target": target,
        "what": and_join(what),
        "readers": readers,
        "automations": [a["title"] for a in autos],
    }
    if dry_run:
        return plan
    threads = [a["thread"] for a in autos if a["thread"]]
    with store.tx() as db:
        for name in readers:
            db.execute("DELETE FROM readers WHERE name = ?", (name,))
        for a in autos:
            db.execute("DELETE FROM automations WHERE id = ?", (a["id"],))

        if documents:
            clause, args = _in("id", documents)
            db.execute("INSERT INTO documents_fts(documents_fts, rowid, title, text)"
                       f" SELECT 'delete', rowid, title, text FROM documents WHERE {clause}", args)
            db.execute(f"DELETE FROM documents WHERE {clause}", args)
        if events:
            clause, args = _in("id", events)
            db.execute(f"DELETE FROM events WHERE {clause}", args)
        if entity_ids:
            clause, args = _in("entity_id", entity_ids)
            db.execute(f"DELETE FROM entity_keys WHERE {clause}", args)
            clause, args = _in("subject", entity_ids)
            db.execute(f"DELETE FROM facts WHERE {clause}", args)
            clause, args = _in("id", entity_ids)
            db.execute(f"DELETE FROM entities WHERE {clause}", args)
        _retire_threads(db, threads)
        db.execute("DELETE FROM connections WHERE id = ?", (cid,))
    if profile is not None:
        shutil.rmtree(profile, ignore_errors=True)
    world.journal.close_asks_about(cid, f"{target} was removed.", "removed")
    _record_removal(world, "connection", cid, target, plan["what"], threads=threads,
                    automations=[a["id"] for a in autos], readers=readers,
                    source=f"connector:{kind}")
    return plan
