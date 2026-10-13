"""Routes for People & Companies: the list, a page each with its timeline, same-name merges; the
wiki's pages edited by the person."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI

from alpha.api.bodies import (
    NoteBody,
)
from alpha.api.served import Served
from alpha.api.views import (
    timeline,
)


def routes(app: FastAPI, s: Served) -> None:
    world = s.world
    api = s.api

    @app.get("/api/people", dependencies=[api])
    def people(kind: str | None = None, q: str | None = None) -> list[dict[str, Any]]:
        """Every person and organisation (no cap: 12 Oct, a network of thousands showed as 500),
        each with the last line that named them, their page's summary, and who is at what: a
        person's `at` (the organisations they are related to) and an organisation's `members`."""
        kinds = [kind] if kind else ["person", "organisation"]
        found = [e for k in kinds for e in world.entities.find(name=q, kind=k, limit=-1)]
        last = {r["eid"]: r for r in world.store.all(
            # SQLite: with MAX, the bare column (text) comes from the row holding the max
            "SELECT x.value AS eid, MAX(j.at) AS at, j.text FROM journal j,"
            " json_each(j.entity_ids) x WHERE j.deleted_at IS NULL AND j.entity_ids != '[]'"
            " GROUP BY x.value")}
        notes = {r["scope"] for r in world.store.all(
            "SELECT scope FROM notes WHERE scope LIKE 'entity:%'")}
        at: dict[str, list[str]] = {}
        members: dict[str, int] = {}
        for r in world.store.all(
                "SELECT f.subject, f.value FROM facts f"
                " JOIN entities e ON e.id = substr(f.value, 8)"
                " WHERE f.predicate = 'related_to' AND f.state = 'accepted'"
                " AND f.valid_to IS NULL AND e.kind = 'organisation'"):
            at.setdefault(r["subject"][7:], []).append(r["value"][7:])
            members[r["value"][7:]] = members.get(r["value"][7:], 0) + 1
        out = []
        for e in found:
            hit = last.get(e["id"])
            page = world.knowledge.find_note(f"entity:{e['id']}", e["name"]) \
                if f"entity:{e['id']}" in notes else None
            out.append({**e, "last_at": hit["at"] if hit else None,
                        "last_text": hit["text"] if hit else None,
                        "summary": page.get("summary") if page else None,
                        "at": at.get(e["id"], []), "members": members.get(e["id"], 0)})
        return sorted(out, key=lambda e: e["last_at"] or "", reverse=True)

    @app.get("/api/entities/{eid}", dependencies=[api])
    def entity(eid: str) -> dict[str, Any]:
        e = world.entities.get(eid)
        same_name = [x for x in world.entities.find(name=e["name"], kind=e["kind"])
                     if x["id"] != e["id"] and x["name"].lower() == e["name"].lower()]
        return {**e, "facts": world.knowledge.facts(f"entity:{e['id']}"),
                "timeline": timeline(world, e["id"]), "maybe_same": same_name,
                "page": world.knowledge.find_note(f"entity:{e['id']}", e["name"])}

    @app.post("/api/entities/{keep}/merge/{other}", dependencies=[api])
    def merge(keep: str, other: str) -> dict[str, Any]:
        merged = world.entities.merge(keep, other)
        world.journal.append("changed", f"You said these are the same: {merged['name']}.",
                             actor="person", entity_ids=[keep, other])
        return merged

    @app.post("/api/notes", dependencies=[api])
    def write_note(body: NoteBody) -> dict[str, Any]:
        note = world.knowledge.write_note(body.scope, body.title, body.body, summary=body.summary)
        world.journal.append("changed", f"You edited the page {body.title}.", actor="person")
        return note
