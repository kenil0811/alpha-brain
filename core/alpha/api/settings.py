"""Routes for settings: the person's Claude, their data, their preferences."""

from __future__ import annotations

from typing import Any

from fastapi import FastAPI

from alpha.api.bodies import PreferenceBody, ThinkingBody
from alpha.api.served import Served
from alpha.runtime import claude_account, codex_account, route
from alpha.world import backup
from alpha.world.store import Problem


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

    # ---- which way Alpha thinks (Q32): Claude through Claude Code, or ChatGPT through Codex ----

    @app.get("/api/thinking", dependencies=[api])
    def thinking() -> dict[str, Any]:
        return route.status(world.path)

    @app.put("/api/thinking", dependencies=[api])
    def set_thinking(body: ThinkingBody) -> dict[str, Any]:
        if body.route not in route.ROUTES:
            raise Problem("Alpha thinks with Claude or with ChatGPT.")
        if body.route != route.chosen(world.path):
            # One real tool call first: a way of thinking that cannot reach Alpha's tools is
            # never switched to (8 Oct).
            ok, words = route.trial(world.path, body.route)
            if not ok:
                raise Problem(f"{route.WORDS[body.route]} can't reach Alpha's tools yet: {words}")
        world.preferences.set(route.PREFERENCE, body.route)
        world.journal.append("changed", f"You chose to think with {route.WORDS[body.route]}.",
                             actor="person", data={"thinks_with": body.route})
        return route.status(world.path)

    @app.post("/api/codex/install", dependencies=[api])
    def codex_install() -> dict[str, Any]:
        return codex_account.install()

    @app.post("/api/codex/signin", dependencies=[api])
    def codex_sign_in() -> dict[str, Any]:
        return codex_account.sign_in()

    @app.post("/api/codex/signout", dependencies=[api])
    def codex_sign_out() -> dict[str, Any]:
        return codex_account.sign_out()

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
