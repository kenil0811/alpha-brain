"""Routes for tasks (P1, 18 Oct 2026, Q85, Q87, Q91): what lives at a place, what is around a
task, one added by hand, a suggestion kept or dropped, a task moved to another place. The table
itself is read and edited through the tables' own routes, as any table."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI

from alpha.api.bodies import PlaceBody, TaskBody
from alpha.api.served import Served
from alpha.api.views import card_from
from alpha.runtime.agents import runner as agent_runner
from alpha.world.store import Problem
from alpha.world.tasks import DROPPED, FINISHED, TABLE, WORKING


def routes(app: FastAPI, s: Served) -> None:
    world = s.world
    api = s.api

    def view(t: dict[str, Any]) -> dict[str, Any]:
        return {**t, "_words": world.tasks.words(t)}

    def said(text: str, tid: str) -> None:
        world.journal.append("changed", text, actor="person",
                             data={"collection": TABLE, "record": tid, "task": tid})

    @app.get("/api/tasks", dependencies=[api])
    def tasks_at(at: str | None = None, owner: str | None = None, within: bool = True,
                 done: bool = False) -> dict[str, Any]:
        """The tasks living at a place (a record, a field, a module, a page), and at every place
        inside it; or the tasks someone owns (an agent's page, P2); the open ones unless
        `done`."""
        if at:
            rows = world.tasks.at(at, within=within)
        elif owner:
            rows = [t for t in world.tasks.of(owner, finished=True) if t.get("owner") == owner]
        else:
            raise Problem("Say which place (at) or whose tasks (owner).")
        if not done:
            rows = [t for t in rows if t.get("state") not in FINISHED]
        return {"at": at, "owner": owner, "place": world.tasks.place_words(at) if at else None,
                "table": TABLE, "tasks": [view(t) for t in rows]}

    @app.get("/api/tasks/{tid}/runs", dependencies=[api])
    def task_runs(tid: str) -> dict[str, Any]:
        """The runs that served a task, newest first, each with its steps read by its id (P2),
        and the agent that owns it: whether it can take the task and whether it runs now."""
        task = world.tasks.get(tid)
        owner = str(task.get("owner") or "")
        agent = world.store.one("SELECT * FROM agents WHERE id = ?", (owner,))
        runs = []
        for r in world.runs.of_task(tid):
            name = world.store.one("SELECT name FROM agents WHERE id = ?", (r["agent"],))
            runs.append({**r, "agent_name": name["name"] if name else r["agent"],
                         "steps": world.runs.steps(r["id"])})
        about_agent = None
        if agent is not None:
            row = world.agents.get(owner)
            about_agent = {"id": owner, "name": row["name"], "kind": row["kind"],
                           "takes_tasks": agent_runner.takes_tasks(world, row),
                           "running": world.runs.open(owner) is not None}
        return {"task": tid, "agent": about_agent, "runs": runs}

    @app.post("/api/tasks/{tid}/start", dependencies=[api])
    def start(tid: str) -> dict[str, Any]:
        """Start: the agent the task was given runs for it now, the task in front of it (P2).
        Giving a task to an agent never starts it; this does."""
        task = world.tasks.get(tid)
        owner = str(task.get("owner") or "")
        agent = world.agents.get(owner) if world.store.one(
            "SELECT 1 FROM agents WHERE id = ?", (owner,)) else None
        if agent is None:
            raise Problem("Give the task to an agent first; then Start runs it.")
        if not agent_runner.takes_tasks(world, agent):
            raise Problem(f"{agent['name']} only runs its steps; it can't take a task.")
        row = world.tasks._set(tid, {"state": WORKING}, by="person")
        said(f"You started {agent['name']} on the task {row['title']}.", tid)
        if s.live:
            s.scheduler.run_now(owner, "task", task=tid)
        else:
            agent_runner.run(world, owner, trigger="task", task=tid, runner=s.runner)
        return view(world.tasks.get(tid))

    @app.get("/api/tasks/{tid}/cards", dependencies=[api])
    def task_cards(tid: str) -> dict[str, Any]:
        """A task's cards, newest first (P3): its page's Approvals section."""
        world.tasks.get(tid)
        return {"task": tid, "cards": [{**c, "from": card_from(world, c)}
                                       for c in world.cards.of_task(tid)]}

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
