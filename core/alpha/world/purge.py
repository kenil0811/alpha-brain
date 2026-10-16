"""Removing things for good, when the person asks.

A removal deletes the thing and everything that exists because of it, but never the journal:
the journal is the audit, and what happened has happened. Each removal is journaled with what
went, and history about a removed thing is marked as such wherever Alpha reads it
(`Journal.mark_removed`), so Alpha never takes it for something that still exists. A removed
module's or connection's threads stay as a record but lose the session the model would resume;
a conversation deleted on its own leaves the lists (its turns stay in the journal); open
questions are closed.

`remove_module` deletes a module's tables and their rows, its files (with the entity each file
is and that entity's facts), the readers its agents use and their notes, its agents with their
runs, pages and decisions, its workflow page with every version of it, its note and its goals.
People, companies and their facts stay (they belong to the person, not to a module), and so do
connections (a sign-in belongs to Alpha's browser).

`remove_connection` disconnects Alpha from something: for a site, Alpha's sign-in (its browser
profile on disk), the readers Alpha wrote for the sites that sign-in covers and the agents
that use them; for a folder, the documents read from it; for the calendar, its events. What
Alpha wrote into the person's tables stays: those rows are the person's, and removing the
module is how they go.

`remove_agent` deletes a custom agent with everything it made: its runs, its brief and notes,
the decisions about it, its pipeline, its look; its thread stays as a record. Alpha's own
agents are paused, never deleted.
"""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import Any

from alpha.connectors.base import Connections
from alpha.connectors.browser import profile_of, signin_sites
from alpha.connectors.files import Files
from alpha.world import workspaces
from alpha.world.commitments import Commitments
from alpha.world.decisions import Decisions
from alpha.world.preferences import Preferences
from alpha.world.sites import site_of
from alpha.world.store import Problem, now
from alpha.world.views import Views
from alpha.world.world import World, alpha_home


def _unlink_files(paths: list[str]) -> None:
    """Delete files Alpha kept for a module, only inside its own files folder."""
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
                    *, threads: list[str], agents: list[str], readers: list[str],
                    source: str | None = None) -> None:
    world.journal.append(
        "changed", f"Removed {name}: {what}.", actor="person", source=source,
        data={"removed": {"kind": kind, "id": rid, "name": name, "threads": threads,
                          "agents": agents, "readers": readers}},
    )


def _forget_entities(db: Any, ids: list[str]) -> None:
    """The entities a removed thing was (a file is one), with their keys, their facts and
    their page (both kept under `entity:<id>`; before 14 Oct the facts were looked for under
    the bare id and stayed)."""
    if not ids:
        return
    clause, args = _in("entity_id", ids)
    db.execute(f"DELETE FROM entity_keys WHERE {clause}", args)
    clause, args = _in("subject", [f"entity:{i}" for i in ids])
    db.execute(f"DELETE FROM facts WHERE {clause}", args)
    for i in ids:
        Commitments.remove_who(db, f"entity:{i}")  # what they promised and were owed (Q46)
    clause, args = _in("scope", [f"entity:{i}" for i in ids])
    db.execute(f"DELETE FROM notes WHERE {clause}", args)
    clause, args = _in("id", ids)
    db.execute(f"DELETE FROM entities WHERE {clause}", args)


def _forget_skill_note(db: Any, name: str) -> None:
    """A removed skill's page of notes (what Alpha learned about its site)."""
    db.execute("DELETE FROM notes WHERE scope = ?", (f"skill:{name}",))


def _retire_threads(db: Any, threads: list[str]) -> None:
    for tid in threads:
        db.execute("UPDATE threads SET state = 'done', session_ref = NULL WHERE id = ?", (tid,))


def _brief_text(store: Any, aid: str) -> str | None:
    row = store.one("SELECT body FROM notes WHERE scope = ? AND title = 'Brief'", (f"agent:{aid}",))
    return str(row["body"]) if row else None


def _agents_of(store: Any, where: str, args: tuple[Any, ...]) -> list[dict[str, Any]]:
    """Agents with the text of their pipeline and their brief, for matching reader names."""
    rows = store.all(f"SELECT id, name, thread, skill FROM agents WHERE {where}", args)
    return [dict(a) | {"steps": _steps_text(store, a["skill"]),
                       "brief": _brief_text(store, a["id"])} for a in rows]


def _readers_of(store: Any, mid: str, tables: list[str], autos: list[dict[str, Any]]
                ) -> list[str]:
    """The readers that feed a module: named after its tables, used by its agents (brief or
    steps), recorded on its sources, or the readers its rows came from."""
    fed = {r["reader"] for t in tables for r in store.all(
        "SELECT DISTINCT reader FROM records WHERE collection = ? AND reader IS NOT NULL", (t,))}
    fed |= {r["reader"] for r in store.all(
        "SELECT reader FROM sources WHERE module = ? AND reader IS NOT NULL", (mid,))}
    return [r["name"] for r in store.all("SELECT name FROM skills WHERE kind = 'read'")
            if r["name"] in tables or r["name"] in fed
            or any(r["name"] in (a["brief"] or "") or r["name"] in (a["steps"] or "")
                   for a in autos)]


def _count(store: Any, sql: str, args: tuple[Any, ...]) -> int:
    row = store.one(sql, args)
    return int(row["n"]) if row else 0


def removal_plan(world: World, ref: str) -> dict[str, Any]:
    """What deleting a module for good would take, before anything goes (13 Oct, slice 2 A3):
    every table and row, file, reader and agent in it and in the modules inside it, and
    those modules' names; `what` says it in words."""
    module = world.modules.get(ref)
    store = world.store
    ids = world.modules.subtree(module["id"])
    tables = rows = files = agents = 0
    readers: set[str] = set()
    for mid in ids:
        names = [r["name"] for r in store.all("SELECT name FROM collections WHERE module = ?",
                                              (mid,))]
        tables += len(names)
        for t in names:
            rows += _count(store, "SELECT COUNT(*) AS n FROM records WHERE collection = ?", (t,))
        autos = _agents_of(store, "module = ?", (mid,))
        agents += len(autos)
        readers |= set(_readers_of(store, mid, names, autos))
        files += _count(store, "SELECT COUNT(*) AS n FROM documents WHERE module = ?", (mid,))
    inside = [world.modules.get(i)["name"] for i in ids[1:]]
    what = [plural(tables, "table") + (f" ({plural(rows, 'row')})" if rows else "")]
    what += [plural(files, "file")] if files else []
    what += [plural(len(readers), "reader")] if readers else []
    what += [plural(agents, "agent")] if agents else []
    words = and_join(what) + (f", with {and_join(inside)} inside it" if inside else "")
    return {"module": module["name"], "tables": tables, "rows": rows, "files": files,
            "readers": sorted(readers), "agents": agents, "inside": inside,
            "what": words}


def remove_module(world: World, ref: str) -> dict[str, Any]:
    module = world.modules.get(ref)
    mid, name = module["id"], module["name"]
    store = world.store
    # What it holds goes first, each with everything of its own.
    inside = [remove_module(world, child["id"]) for child in world.modules.children(mid)]
    tables = [r["name"] for r in store.all("SELECT name FROM collections WHERE module = ?", (mid,))]
    autos = _agents_of(store, "module = ?", (mid,))
    readers = _readers_of(store, mid, tables, autos)
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
            prefix = f"record:{table}/"  # each record's note goes with its table
            counts["record notes"] = counts.get("record notes", 0) + db.execute(
                "DELETE FROM notes WHERE substr(scope, 1, ?) = ?", (len(prefix), prefix)).rowcount
            db.execute("DELETE FROM collections WHERE name = ?", (table,))
            counts["lists"] = counts.get("lists", 0) + Views.remove_table(db, table)
        counts["tables"], counts["rows"] = len(tables), records
        for reader in readers:
            db.execute("DELETE FROM skills WHERE name = ? AND kind = 'read'", (reader,))
            _forget_skill_note(db, reader)
        counts["readers"] = len(readers)
        for a in autos:
            if a["skill"]:
                db.execute("DELETE FROM skills WHERE name = ? AND kind = 'run'", (a["skill"],))
                _forget_skill_note(db, a["skill"])
        db.execute("DELETE FROM runs WHERE agent IN (SELECT id FROM agents WHERE module = ?)",
                   (mid,))
        for a in autos:
            db.execute("DELETE FROM notes WHERE scope = ?", (f"agent:{a['id']}",))
            Decisions.remove_about(db, "agent", a["id"])
        Decisions.remove_about(db, "module", mid)
        counts["agents"] = db.execute(
            "DELETE FROM agents WHERE module = ?", (mid,)).rowcount
        _retire_threads(db, sorted(threads))
        counts["threads"] = len(threads)
        counts["notes"] = db.execute(
            "DELETE FROM notes WHERE scope = ?", (f"module:{name}",)).rowcount
        counts["goals"] = db.execute("DELETE FROM goals WHERE module = ?", (mid,)).rowcount
        counts["sources"] = world.sources.remove_module(db, mid)
        counts["actions"] = world.actions.remove_module(db, mid)
        docs = db.execute("SELECT id, path, entity_id FROM documents WHERE module = ?",
                          (mid,)).fetchall()
        counts["files"] = db.execute("DELETE FROM documents WHERE module = ?", (mid,)).rowcount
        _forget_entities(db, [d["entity_id"] for d in docs if d["entity_id"]])
        _unlink_files([d["path"] for d in docs])
        counts["workflow pages"] = world.workflows.delete_module(db, mid)
        Preferences.forget_module(db, mid, tables)  # its colours, its place in the sidebar
        Preferences.forget_agents(db, [a["id"] for a in autos])  # its agents' looks
        db.execute("DELETE FROM modules WHERE id = ?", (mid,))
    # A module's workspace (§12) goes with it; the journal keeps what it was.
    if workspaces.remove(mid):
        counts["workspace"] = 1
    for ask in asks:
        world.journal.close_ask(ask, f"{name} was removed.", actor="alpha", closed="removed")
    what = [plural(len(tables), "table") + (f" ({plural(records, 'row')})" if records else "")]
    what += [plural(len(readers), "reader")] if readers else []
    what += [plural(counts["agents"], "agent")] if counts["agents"] else []
    _record_removal(world, "module", mid, name, and_join(what), threads=sorted(threads),
                    agents=[a["id"] for a in autos], readers=readers)
    return counts


def document_removal(world: World, did: str) -> dict[str, Any]:
    """What deleting a file would do, before it does (13 Oct, slice 2 G4): the records whose
    file fields hold it, which are emptied; the rows Alpha read from it stay (Kenil, 13 Oct:
    "keep the rows"; a row names its source in words, not by the file). A connected folder's
    file is the person's own and is refused here."""
    files = Files(world)
    doc = files.document(did)
    if doc["from_folder"]:
        raise Problem(f"{doc['title']} is in a folder you connected: it is your own file. Remove"
                      " it in that folder, or disconnect the folder in Intelligence ›"
                      " Connections.")
    used = files.used_by(did)
    what = "its text Alpha read" + (
        f", and the file is taken out of {plural(len(used), 'record')}" if used else "")
    return {"document": did, "title": doc["title"], "used_by": used, "what": what}


def remove_document(world: World, did: str) -> dict[str, Any]:
    """Delete a file given to Alpha: its copy in Alpha's folder, the text read from it, and the
    file fields that held it (each emptied as the person's edit, kept in the record's history);
    the journal keeps that it was here."""
    plan = document_removal(world, did)
    for use in plan["used_by"]:
        rec = world.collections.get(use["collection"], use["record"])
        prov = dict(rec.get("_provenance") or {})
        fields = dict(prov.get("fields") or {})
        fields[use["field"]] = {"source": "you", "fetched_at": now()}
        prov.update({"by": "person", "fields": fields})
        world.collections.update(use["collection"], use["record"], {use["field"]: None},
                                 rec["revision"], prov)
    row = world.store.one("SELECT path, entity_id FROM documents WHERE id = ?", (did,))
    with world.store.tx() as db:
        db.execute("DELETE FROM documents WHERE id = ?", (did,))
        if row and row["entity_id"]:
            _forget_entities(db, [row["entity_id"]])
    if row:
        _unlink_files([row["path"]])
    _record_removal(world, "document", did, plan["title"], plan["what"], threads=[],
                    agents=[], readers=[])
    return plan


def conversation_removal(world: World, cid: str) -> dict[str, Any]:
    """What deleting a conversation would do, before it does (13 Oct, slice 2 C9): its open
    questions closed, the actions proposed in it and not yet decided declined; what Alpha
    learned from it stays, and Activity keeps its turns."""
    thread = world.modules.thread(cid)
    if thread["kind"] != "chat":
        raise Problem("Only a conversation can be deleted here; a build or an agent's work keeps"
                      " its thread with its module.")
    if thread["state"] == "working":
        raise Problem("Alpha is working in this conversation; stop the turn first.")
    asks = [a["id"] for a in world.journal.open_asks() if a["thread"] == cid]
    actions = [r["id"] for r in world.store.all(
        "SELECT id FROM actions WHERE thread = ? AND state IN ('proposed', 'approved')", (cid,))]
    what = [plural(len(asks), "open question")] if asks else []
    what += [plural(len(actions), "undecided action")] if actions else []
    closed = f"its {and_join(what)} closed; " if what else ""
    return {"conversation": cid, "title": thread["title"], "asks": asks, "actions": actions,
            "what": f"{closed}what Alpha learned from it stays"}


def remove_conversation(world: World, cid: str) -> dict[str, Any]:
    """Delete a conversation from the lists: its thread and model session; its open questions
    closed and undecided actions declined; a workflow page drafted in it stays with its module.
    The journal keeps its turns, marked as from a removed conversation."""
    plan = conversation_removal(world, cid)
    thread = world.modules.thread(cid)
    for ask in plan["asks"]:
        world.journal.close_ask(ask, f"\"{thread['title']}\" was deleted.", actor="person",
                                closed="removed")
    with world.store.tx() as db:
        for aid in plan["actions"]:
            db.execute("UPDATE actions SET state = 'declined', updated_at = ? WHERE id = ?",
                       (now(), aid))
        db.execute("UPDATE workflows SET conversation = NULL WHERE conversation = ?", (cid,))
        db.execute("UPDATE agents SET thread = NULL WHERE thread = ?", (cid,))
        db.execute("DELETE FROM threads WHERE id = ?", (cid,))
    # the companion's focus on it reads as none once the thread is gone (conversations.focus)
    _record_removal(world, "conversation", cid, f"the conversation \"{thread['title']}\"",
                    plan["what"], threads=[cid], agents=[], readers=[])
    return plan


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
        autos = [a for a in _agents_of(store, "1 = 1", ())
                 if any(n in (a["brief"] or "") or n in (a["steps"] or "") for n in readers)
                 or any(site in (a["brief"] or "").lower() for site in sites)]
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
        plural(len(autos), "agent") if autos else "",
        plural(len(documents), "document") if documents else "",
        plural(len(events), "event") if events else "",
    ) if w] or ["the connection"]
    plan: dict[str, Any] = {
        "connection": cid, "connector": kind, "target": target,
        "what": and_join(what),
        "readers": readers,
        "procedures": procedures,
        "agents": [a["name"] for a in autos],
    }
    if dry_run:
        return plan
    threads = [a["thread"] for a in autos if a["thread"]]
    with store.tx() as db:
        for name in readers:
            db.execute("DELETE FROM skills WHERE name = ? AND kind = 'read'", (name,))
            _forget_skill_note(db, name)
        for name in procedures:
            db.execute("DELETE FROM skills WHERE name = ? AND kind = 'act'", (name,))
            _forget_skill_note(db, name)
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
            db.execute("DELETE FROM runs WHERE agent = ?", (a["id"],))
            db.execute("DELETE FROM notes WHERE scope = ?", (f"agent:{a['id']}",))
            Decisions.remove_about(db, "agent", a["id"])
            db.execute("DELETE FROM agents WHERE id = ?", (a["id"],))
        Preferences.forget_agents(db, [a["id"] for a in autos])  # their looks

        if documents:
            clause, args = _in("id", documents)
            db.execute(f"DELETE FROM documents WHERE {clause}", args)
        if events:
            clause, args = _in("id", events)
            db.execute(f"DELETE FROM events WHERE {clause}", args)
        _forget_entities(db, entity_ids)
        _retire_threads(db, threads)
        db.execute("DELETE FROM connections WHERE id = ?", (cid,))
    if profile is not None:
        shutil.rmtree(profile, ignore_errors=True)
    world.journal.close_asks_about(cid, f"{target} was removed.", "removed")
    _record_removal(world, "connection", cid, target, plan["what"], threads=threads,
                    agents=[a["id"] for a in autos], readers=readers,
                    source=f"connector:{kind}")
    return plan


def agent_removal(world: World, aid: str) -> dict[str, Any]:
    """What deleting a custom agent takes, before anything goes; `what` says it in words."""
    agent = world.agents.get(aid)
    if agent["kind"] != "custom":
        raise Problem(f"{agent['name']} is one of Alpha's own agents: pause it, or rename it;"
                      " it can't be deleted.")
    store = world.store
    runs = _count(store, "SELECT COUNT(*) AS n FROM runs WHERE agent = ?", (aid,))
    pages = _count(store, "SELECT COUNT(*) AS n FROM notes WHERE scope = ?", (f"agent:{aid}",))
    decisions = len(world.decisions.about("agent", aid))
    what = [plural(runs, "run")] if runs else []
    what += [plural(pages, "page")] if pages else []
    what += [plural(decisions, "decision")] if decisions else []
    what += ["its pipeline"] if agent.get("skill") else []
    return {"agent": aid, "name": agent["name"], "runs": runs, "pages": pages,
            "decisions": decisions, "skill": agent.get("skill"),
            "what": and_join(what) if what else "the agent"}


def remove_agent(world: World, aid: str) -> dict[str, Any]:
    """Delete a custom agent and everything it made (design Q44): its runs, its brief and
    notes, the decisions about it, its pipeline and its look. Its thread stays as a record;
    the journal keeps every line. The questions it asked are closed."""
    plan = agent_removal(world, aid)
    agent = world.agents.get(aid)
    asks = [a["id"] for a in world.journal.open_asks()
            if a.get("thread") and a["thread"] == agent.get("thread")]
    with world.store.tx() as db:
        db.execute("DELETE FROM runs WHERE agent = ?", (aid,))
        db.execute("DELETE FROM notes WHERE scope = ?", (f"agent:{aid}",))
        Decisions.remove_about(db, "agent", aid)
        if agent.get("skill"):
            db.execute("DELETE FROM skills WHERE name = ? AND kind = 'run'", (agent["skill"],))
            _forget_skill_note(db, agent["skill"])
        if agent.get("thread"):
            _retire_threads(db, [agent["thread"]])
        Preferences.forget_agents(db, [aid])
        db.execute("DELETE FROM agents WHERE id = ?", (aid,))
    for ask in asks:
        world.journal.close_ask(ask, f"{agent['name']} was removed.", actor="alpha",
                                closed="removed")
    _record_removal(world, "agent", aid, agent["name"], plan["what"],
                    threads=[agent["thread"]] if agent.get("thread") else [], agents=[aid],
                    readers=[])
    return plan
