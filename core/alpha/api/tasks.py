"""Routes for tasks (P1, 18 Oct 2026, Q85, Q87, Q91): what lives at a place, what is around a
task, one added by hand, a suggestion kept or dropped, a task moved to another place. The table
itself is read and edited through the tables' own routes, as any table."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI

from alpha.api.bodies import PlaceBody, TaskBody
from alpha.api.served import Served
from alpha.world.tasks import DROPPED, FINISHED, TABLE


def routes(app: FastAPI, s: Served) -> None:
    world = s.world
    api = s.api

    def view(t: dict[str, Any]) -> dict[str, Any]:
        return {**t, "_words": world.tasks.words(t)}

    def said(text: str, tid: str) -> None:
        world.journal.append("changed", text, actor="person",
                             data={"collection": TABLE, "record": tid, "task": tid})

    @app.get("/api/tasks", dependencies=[api])
    def tasks_at(at: str, within: bool = True, done: bool = False) -> dict[str, Any]:
        """The tasks living at a place (a record, a field, a module, a page), and at every place
        inside it; the open ones unless `done`."""
        rows = world.tasks.at(at, within=within)
        if not done:
            rows = [t for t in rows if t.get("state") not in FINISHED]
        return {"at": at, "place": world.tasks.place_words(at), "table": TABLE,
                "tasks": [view(t) for t in rows]}

    @app.get("/api/tasks/{tid}/around", dependencies=[api])
    def around(tid: str) -> dict[str, Any]:
        """What the task's page shows as "Where it lives" and "Around it", nearest first: the
        same as a turn about the task is given."""
        return world.tasks.around(tid)

    @app.post("/api/tasks", dependencies=[api])
    def add_task(body: TaskBody) -> dict[str, Any]:
        row = world.tasks.make(body.title, by="person", source="stated", anchor=body.anchor,
                               due=body.due, owner=body.owner, parent=body.parent)
        where = world.tasks.place_words(row.get("anchor"))
        world.journal.append("did", f"You added the task {row['title']}"
                             + (f" on {where}" if where else "") + ".", actor="person",
                             data={"collection": TABLE, "record": row["id"], "task": row["id"]})
        return view(row)

    @app.post("/api/tasks/{tid}/keep", dependencies=[api])
    def keep(tid: str) -> dict[str, Any]:
        """A suggested task kept (✓): it is the person's now."""
        row = world.tasks._set(tid, {"suggested": False}, by="person")
        said(f"You kept the suggested task {row['title']}.", tid)
        return view(row)

    @app.post("/api/tasks/{tid}/drop", dependencies=[api])
    def drop(tid: str) -> dict[str, Any]:
        """A suggested task dropped (✕): it stays in History, Dropped."""
        row = world.tasks._set(tid, {"suggested": False, "state": DROPPED}, by="person")
        said(f"You dropped the suggested task {row['title']}.", tid)
        return view(row)

    @app.post("/api/tasks/{tid}/place", dependencies=[api])
    def move(tid: str, body: PlaceBody) -> dict[str, Any]:
        """The task's place changed by the person (its page's Change)."""
        if body.anchor:
            anchor: str | None = world.tasks.check_anchor(body.anchor)
        elif body.table or body.module:
            anchor = world.tasks.address(module=body.module, table=body.table,
                                         record=body.record, field=body.field)
        else:
            anchor = None
        row = world.tasks._set(tid, {"anchor": anchor}, by="person")
        where = world.tasks.place_words(anchor)
        said(f"You moved the task {row['title']} " + (f"to {where}." if where else
                                                       "off its place."), tid)
        return view(row)
