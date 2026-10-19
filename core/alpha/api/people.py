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
from alpha.world import people as persons


def routes(app: FastAPI, s: Served) -> None:
    world = s.world
    api = s.api

    @app.get("/api/people", dependencies=[api])
    def people(kind: str | None = None, q: str | None = None) -> list[dict[str, Any]]:
        """Everyone, in one read (P8): no cap, with their organisations, sources, last contact
        and the last 90 days."""
        return persons.listed(world, kind, q)

    @app.get("/api/entities/{eid}", dependencies=[api])
    def entity(eid: str) -> dict[str, Any]:
        e = world.entities.get(eid)
        same_name = [x for x in world.entities.find(name=e["name"], kind=e["kind"])
                     if x["id"] != e["id"] and x["name"].lower() == e["name"].lower()]
        return {**e, "keys": {k: v for k, v in e["keys"].items() if k != "orgname"},
                "facts": world.knowledge.facts(f"entity:{e['id']}"),
                "tasks": world.tasks.of(f"entity:{e['id']}"),
                "timeline": timeline(world, e["id"]), "maybe_same": same_name,
                "page": world.knowledge.find_note(f"entity:{e['id']}", e["name"]),
                # P8: where they belong, who belongs to them, what they came from, and what
                # was merged into them (each with Unmerge)
                "organisations": world.entities.links(e["id"], ended=True),
                "members": world.entities.members(e["id"]) if e["kind"] == "organisation"
                else [],
                "sources": persons.sources_of(world, e["id"]),
                "merged": world.entities.merged_into_it(e["id"]),
                "rows": world.collections.linked_to(e["id"])[:50],
                "contact": persons.contact(world, e["id"]),
                "interactions": persons.interactions(world, e["id"])}

    @app.post("/api/entities/{keep}/merge/{other}", dependencies=[api])
    def merge(keep: str, other: str) -> dict[str, Any]:
        merged = world.entities.merge(keep, other)
        world.journal.append("changed", f"You said these are the same: {merged['name']}.",
                             actor="person", entity_ids=[keep, other])
        return merged

    @app.post("/api/entities/{eid}/unmerge", dependencies=[api])
    def unmerge(eid: str) -> dict[str, Any]:
        """Undo a merge (P8): `eid` stands alone again, kept apart from then on."""
        return persons.unmerge(world, eid)

    @app.post("/api/notes", dependencies=[api])
    def write_note(body: NoteBody) -> dict[str, Any]:
        note = world.knowledge.write_note(body.scope, body.title, body.body, summary=body.summary)
        kind, _, ref = body.scope.partition(":")
        if kind == "record":  # a record's note: journaled with the record, in its module
            table, _, rid = ref.partition("/")
            desc = world.collections.describe(table)
            world.journal.append("changed", f"You wrote the note on a row of {desc['title']}.",
                                 actor="person", module=desc["module"],
                                 data={"collection": table, "record": rid})
        else:
            world.journal.append("changed", f"You edited the page {body.title}.", actor="person")
        return note
