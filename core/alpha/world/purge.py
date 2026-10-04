"""Removing things for good, when the person asks.

A removal deletes the thing and everything that exists because of it, but never the journal:
the journal is the audit, and what happened has happened. Each removal is journaled with what
went, and history about a removed thing is marked as such wherever Alpha reads it
(`Journal.mark_removed`), so Alpha never takes it for something that still exists. Threads stay
as a record but lose the session the model would resume, and open questions are closed.

`remove_module` deletes a module's tables and their rows, the readers its automations use, its
automations, its note and its goals, and every module inside it, the same way. Entities and
facts stay (they belong to the person, not to a module), and so do connections (a sign-in
belongs to Alpha's browser).

`remove_connection` disconnects Alpha from something: for a site, Alpha's sign-in (its browser
profile on disk), the readers Alpha wrote for the sites that sign-in covers and the automations
that use them; for a folder, the documents read from it; for the calendar, its events. What
Alpha wrote into the person's tables stays: those rows are the person's, and removing the
module is how they go.

`clear_conversation` forgets the person's conversation with Alpha: everything said and replied
outside any thread, with the questions Alpha asked there and their answers, is blanked (the
journal's tombstone: the rows stay, their words go, and the clearing itself is journaled). What
Alpha did and read (Activity) and every module's data stay.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from alpha.connectors.base import Connections
from alpha.connectors.browser import profile_of, signin_sites
from alpha.world.sites import site_of
from alpha.world.store import Problem, now
from alpha.world.views import Views
from alpha.world.world import World, alpha_home

CONVERSATION_KINDS = ("said", "replied", "failed", "asked", "answered", "proposed")


def _unlink_files(paths: list[str]) -> None:
    """Delete files Alpha kept for a module, only inside its own files folder."""
    from alpha.world.world import alpha_home

    root = (alpha_home() / "files").resolve()
    for p in paths:
        path = Path(p).resolve()
        if path.is_relative_to(root) and path.is_file():
            path.unlink(missing_ok=True)


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
    # What it holds goes first, each with everything of its own.
    inside = [remove_module(world, child["id"]) for child in world.modules.children(mid)]
    tables = [r["name"] for r in store.all("SELECT name FROM collections WHERE module = ?", (mid,))]
    autos = [dict(a) | {"steps": _steps_text(store, a["skill"])} for a in store.all(
        "SELECT id, thread, procedure, skill FROM automations WHERE module = ?", (mid,))]
    # The readers that feed this module: named after its tables, used by its automations
    # (procedure or steps), recorded on its sources, or the readers its rows came from.
    fed = {r["reader"] for t in tables for r in store.all(
        "SELECT DISTINCT reader FROM records WHERE collection = ? AND reader IS NOT NULL", (t,))}
    fed |= {r["reader"] for r in store.all(
        "SELECT reader FROM sources WHERE module = ? AND reader IS NOT NULL", (mid,))}
    readers = [r["name"] for r in store.all("SELECT name FROM skills WHERE kind = 'read'")
               if r["name"] in tables or r["name"] in fed
               or any(r["name"] in (a["procedure"] or "") or r["name"] in (a["steps"] or "")
                      for a in autos)]
    threads = {r["id"] for r in store.all("SELECT id FROM threads WHERE module = ?", (mid,))}
    threads |= {a["thread"] for a in autos if a["thread"]}
    asks = [a["id"] for a in world.journal.open_asks() if a["module"] == mid]
    counts: dict[str, Any] = {"module": name}
    if inside:
        counts["inside"] = inside
    with store.tx() as db:
        records = 0
        for table in tables:
            records += db.execute("DELETE FROM records WHERE collection = ?", (table,)).rowcount
            db.execute("DELETE FROM records_fts WHERE collection = ?", (table,))
            db.execute("DELETE FROM record_versions WHERE collection = ?", (table,))
            db.execute("DELETE FROM collections WHERE name = ?", (table,))
            counts["lists"] = counts.get("lists", 0) + Views.remove_table(db, table)
        counts["tables"], counts["rows"] = len(tables), records
        for reader in readers:
            db.execute("DELETE FROM skills WHERE name = ? AND kind = 'read'", (reader,))
        counts["readers"] = len(readers)
        for a in autos:
            if a["skill"]:
                db.execute("DELETE FROM skills WHERE name = ? AND kind = 'run'", (a["skill"],))
        counts["automations"] = db.execute(
            "DELETE FROM automations WHERE module = ?", (mid,)).rowcount
        _retire_threads(db, sorted(threads))
        counts["threads"] = len(threads)
        counts["notes"] = db.execute(
            "DELETE FROM notes WHERE scope = ?", (f"module:{name}",)).rowcount
        counts["goals"] = db.execute("DELETE FROM goals WHERE module = ?", (mid,)).rowcount
        counts["sources"] = world.sources.remove_module(db, mid)
        counts["actions"] = world.actions.remove_module(db, mid)
        files = [r["path"] for r in db.execute("SELECT path FROM documents WHERE module = ?",
                                               (mid,)).fetchall()]
        for did in [r["id"] for r in db.execute("SELECT id FROM documents WHERE module = ?",
                                                (mid,)).fetchall()]:
            db.execute("INSERT INTO documents_fts(documents_fts, rowid, title, text) SELECT"
                       " 'delete', rowid, title, text FROM documents WHERE id = ?", (did,))
        counts["files"] = db.execute("DELETE FROM documents WHERE module = ?", (mid,)).rowcount
        _unlink_files(files)
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
            "UPDATE journal SET text = '', data = '{}', deleted_at = ?"
            f" WHERE thread IS NULL AND deleted_at IS NULL AND kind IN ({marks})",
            (now(), *CONVERSATION_KINDS),
        ).rowcount
    world.journal.append("changed", f"You cleared the conversation ({plural(removed, 'message')}).",
                         actor="person")
    return {"turns": removed}


def _steps_text(store: Any, skill: str | None) -> str | None:
    """A pipeline's steps as text, for matching reader names (they live in its run skill)."""
    if not skill:
        return None
    row = store.one("SELECT steps FROM skills WHERE name = ?", (skill,))
    return str(row["steps"]) if row and row["steps"] else None


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
    procedures: list[str] = []
    autos: list[dict[str, Any]] = []
    profile: Path | None = None
    documents: list[str] = []
    events: list[str] = []
    entity_ids: list[str] = []
    if kind == "browser":
        sites = set(signin_sites(conn))
        readers = [r["name"] for r in store.all(
                       "SELECT name, site, url FROM skills WHERE kind = 'read'")
                   if r["site"] in sites or _site(r["url"]) in sites]
        autos = [a for a in (dict(a) | {"steps": _steps_text(store, a["skill"])} for a in
                             store.all("SELECT id, title, thread, procedure, skill FROM"
                                       " automations"))
                 if any(n in (a["procedure"] or "") or n in (a["steps"] or "") for n in readers)
                 or any(site in (a["procedure"] or "").lower() for site in sites)]
        procedures = [p["name"] for p in store.all(
                          "SELECT name, site, url FROM skills WHERE kind = 'act'")
                      if p["site"] in sites or _site(p["url"]) in sites]
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
        plural(len(procedures), "procedure") if procedures else "",
        plural(len(autos), "automation") if autos else "",
        plural(len(documents), "document") if documents else "",
        plural(len(events), "event") if events else "",
    ) if w] or ["the connection"]
    plan: dict[str, Any] = {
        "connection": cid, "connector": kind, "target": target,
        "what": and_join(what),
        "readers": readers,
        "procedures": procedures,
        "automations": [a["title"] for a in autos],
    }
    if dry_run:
        return plan
    threads = [a["thread"] for a in autos if a["thread"]]
    with store.tx() as db:
        for name in readers:
            db.execute("DELETE FROM skills WHERE name = ? AND kind = 'read'", (name,))
        for name in procedures:
            db.execute("DELETE FROM skills WHERE name = ? AND kind = 'act'", (name,))
            db.execute("UPDATE permissions SET revoked_at = ? WHERE procedure = ?"
                       " AND revoked_at IS NULL", (now(), name))
            db.execute("UPDATE actions SET state = 'declined', updated_at = ? WHERE procedure = ?"
                       " AND state IN ('proposed', 'approved')", (now(), name))
            # The module still reads from that place; it just has no reader for it now.
            db.execute("UPDATE sources SET reader = NULL, status = 'not_built', detail = ?,"
                       " updated_at = ? WHERE reader = ?",
                       (f"Its reader went with the {target} connection.", now(), name))
        for a in autos:
            if a.get("skill"):
                db.execute("DELETE FROM skills WHERE name = ? AND kind = 'run'", (a["skill"],))
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
