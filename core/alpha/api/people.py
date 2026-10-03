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
        kinds = [kind] if kind else ["person", "organisation"]
        out = []
        for k in kinds:
            for e in world.entities.find(name=q, kind=k, limit=500):
                last = world.store.one(
                    "SELECT j.at, j.text FROM journal j, json_each(j.entity_ids) x WHERE x.value ="
                    " ? AND j.deleted_at IS NULL ORDER BY j.at DESC LIMIT 1", (e["id"],),
                )
                page = world.knowledge.find_note(f"entity:{e['id']}", e["name"])
                out.append({**e, "last_at": last["at"] if last else None,
                            "last_text": last["text"] if last else None,
                            "summary": page.get("summary") if page else None})
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
