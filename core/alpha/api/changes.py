"""Routes for what changed: one cheap question the window asks instead of refetching every page
on a clock (3 Oct: 26 requests a minute idle, 140 during a turn, every page re-downloaded on
any change). Since a stamp: the journal's new entries by kind, the tables and modules they
touched, the entities they named; whether threads, plans or actions moved; and whether anything
is working now, so the window asks often while Alpha works and rarely when it is quiet."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI

from alpha.api.served import Served
from alpha.api.turns import Turns
from alpha.runtime.automation import Scheduler
from alpha.world.store import loads, now
from alpha.world.world import World

MOST = 500


def changes_since(world: World, scheduler: Scheduler, running: Turns,
                  since: str | None) -> dict[str, Any]:
    at = now()
    working = (bool(running.running()) or bool(scheduler.running)
               or world.store.one("SELECT 1 FROM threads WHERE state = 'working'") is not None)
    out: dict[str, Any] = {"at": at, "journal": 0, "kinds": [], "tables": [], "modules": [],
                           "entities": [], "threads": False, "plans": False, "actions": False,
                           "working": working}
    if not since:
        return out
    rows = world.store.all(
        "SELECT kind, module, data, entity_ids FROM journal WHERE at > ? AND at <= ?"
        " AND deleted_at IS NULL ORDER BY at LIMIT ?", (since, at, MOST))
    kinds: set[str] = set()
    tables: set[str] = set()
    modules: set[str] = set()
    entities: set[str] = set()
    for r in rows:
        kinds.add(r["kind"])
        if r["module"]:
            modules.add(r["module"])
        data = loads(r["data"], {})
        for key in ("collection", "table"):
            if data.get(key):
                tables.add(str(data[key]))
        entities.update(loads(r["entity_ids"], []))

    def moved(table: str) -> bool:
        row = world.store.one(f"SELECT 1 FROM {table} WHERE updated_at > ? AND updated_at <= ?"
                              " LIMIT 1", (since, at))
        return row is not None

    out.update({"journal": len(rows), "kinds": sorted(kinds), "tables": sorted(tables),
                "modules": sorted(modules), "entities": sorted(entities),
                "threads": moved("threads"), "plans": moved("plans"),
                "actions": moved("actions")})
    return out


def routes(app: FastAPI, s: Served) -> None:
    world = s.world
    scheduler = s.scheduler
    running = s.running
    api = s.api

    @app.get("/api/changes", dependencies=[api])
    def changes(since: str | None = None) -> dict[str, Any]:
        """What changed since `since` (the `at` of the last answer); without one, only the
        stamp to start from and whether Alpha is working."""
        return changes_since(world, scheduler, running, since)
