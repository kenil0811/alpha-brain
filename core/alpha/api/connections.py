"""Routes for connections: folders, sites and the calendar; syncing and removing one."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI

from alpha.api.bodies import (
    FolderBody,
    SiteBody,
)
from alpha.api.served import Served
from alpha.connectors.base import Connections
from alpha.connectors.browser import Browser
from alpha.connectors.calendar import Calendar
from alpha.connectors.files import Files
from alpha.world.purge import remove_connection
from alpha.world.store import Problem


def routes(app: FastAPI, s: Served) -> None:
    world = s.world
    api = s.api

    @app.post("/api/connections/folder", dependencies=[api])
    def connect_folder(body: FolderBody) -> dict[str, Any]:
        files = Files(world)
        conn = files.watch(body.path)
        return {**conn, "sync": files.sync(conn["target"])}

    @app.post("/api/connections/site", dependencies=[api])
    def connect_site(body: SiteBody) -> dict[str, Any]:
        return Browser(world).start_signin(body.site)

    @app.post("/api/connections/calendar", dependencies=[api])
    def connect_calendar() -> dict[str, Any]:
        return Calendar(world).connect()

    @app.post("/api/connections/{cid}/sync", dependencies=[api])
    def sync_connection(cid: str) -> dict[str, Any]:
        conn = Connections(world.store).get(cid)
        if conn["connector"] == "files":
            return Files(world).sync(conn["target"])
        if conn["connector"] == "calendar":
            return Calendar(world).sync()
        if conn["connector"] == "browser":
            return Browser(world).refresh(conn["target"])
        raise Problem(f"Nothing to sync for {conn['connector']}.")

    @app.get("/api/connections/{cid}/removal", dependencies=[api])
    def connection_removal(cid: str) -> dict[str, Any]:
        """What removing a connection takes with it, shown before the person confirms."""
        return remove_connection(world, cid, dry_run=True)

    @app.delete("/api/connections/{cid}", dependencies=[api])
    def delete_connection(cid: str) -> dict[str, Any]:
        return remove_connection(world, cid)
