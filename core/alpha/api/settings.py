"""Routes for settings: the person's Claude, their data, their preferences."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI

from alpha.api.bodies import (
    PreferenceBody,
)
from alpha.api.served import Served
from alpha.runtime import claude_account
from alpha.world import backup


def routes(app: FastAPI, s: Served) -> None:
    world = s.world
    api = s.api

    @app.get("/api/claude", dependencies=[api])
    def claude_status() -> dict[str, Any]:
        return claude_account.status()

    @app.post("/api/claude/install", dependencies=[api])
    def claude_install() -> dict[str, Any]:
        return claude_account.install()

    @app.post("/api/claude/signin", dependencies=[api])
    def claude_sign_in() -> dict[str, Any]:
        return claude_account.sign_in()

    @app.post("/api/claude/signout", dependencies=[api])
    def claude_sign_out() -> dict[str, Any]:
        return claude_account.sign_out()

    @app.get("/api/data", dependencies=[api])
    def data_info() -> dict[str, Any]:
        return backup.describe(world)

    @app.post("/api/data/backup", dependencies=[api])
    def data_backup() -> dict[str, Any]:
        return backup.back_up(world)

    @app.get("/api/preferences/{key}", dependencies=[api])
    def preference(key: str) -> dict[str, Any]:
        """A choice of look the person made (the companion's look), or null: the window
        fills in its own defaults."""
        return {"key": key, "value": world.preferences.get(key)}

    @app.put("/api/preferences/{key}", dependencies=[api])
    def set_preference(key: str, body: PreferenceBody) -> dict[str, Any]:
        return world.preferences.set(key, body.value)
