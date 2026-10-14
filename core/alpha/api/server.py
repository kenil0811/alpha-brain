"""The core's HTTP API, for the workspace and the companion: `alpha serve`.

Loopback only. When the app hosts the core it passes ALPHA_TOKEN and every request must carry it
as a bearer token; without one (a developer running `alpha serve`) requests are accepted from
this Mac only. One World is shared by every request; the store serialises writes.

What it serves follows the workspace: Home (what needs the person, modules), a module (its
tables, what Alpha did there, its threads), a table's records (read and edited in place by the
person), People & Companies with a cross-source timeline, Intelligence (skills, automations,
connections, knowledge), Activity, the conversation, and turns.

The routes live one module per area (home, tables, people, intelligence, actions, connections,
settings, conversation, activity, changes); `Turns` runs turns in the background; `views`
shapes what the window shows; `served` is what every route closes over.
"""

from __future__ import annotations

import json
import logging
import os
import socket
import sys
import threading
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Any

import uvicorn
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from alpha.api import (
    actions,
    activity,
    changes,
    connections,
    conversation,
    home,
    intelligence,
    people,
    settings,
    tables,
)
from alpha.api.bodies import AskBody
from alpha.api.served import Served
from alpha.api.turns import Turns
from alpha.connectors.base import Connections
from alpha.connectors.calendar import Calendar
from alpha.connectors.files import Files
from alpha.runtime import conversations, route
from alpha.runtime import turn as turns
from alpha.runtime.automation import Scheduler
from alpha.world.store import Problem
from alpha.world.world import World

log = logging.getLogger("alpha.api")
CALENDAR_EVERY_S = 300
# Every answer that isn't a success carries `error`, a sentence for a person (slice 2 G7): a
# refusal's own words, or one of these; what went wrong inside goes to the log, never the window.
NOT_THERE = "Alpha doesn't have that; it may have been removed."
NOT_TAKEN = "Alpha couldn't take that. Try again."
WENT_WRONG = "Something went wrong in Alpha; the details are in its log. Try again."
FRAMEWORK_WORDS = {"Not Found", "Method Not Allowed", "Unauthorized", "Forbidden"}

__all__ = ["AskBody", "READY_PREFIX", "Turns", "create_app", "serve"]


def create_app(world: World | None = None, *, runner: turns.Runner | None = None,
               token: str | None = None, live: bool = True) -> FastAPI:
    world = world or World()
    token = token if token is not None else os.environ.get("ALPHA_TOKEN")
    scheduler = Scheduler(world, runner)
    runner_fn = runner or route.run
    running = Turns(world, runner, after=scheduler.kick if live else None, checks=live)
    stops: list[Callable[[], None]] = []

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if live:
            # No turn can be running yet: a conversation a dead core left mid-turn is open.
            conversations.reset_working(world)
            stops.append(Files(world).observe())
            stop_calendar = threading.Event()

            def poll() -> None:
                while not stop_calendar.wait(CALENDAR_EVERY_S):
                    conn = Connections(world.store).find("calendar", "macos")
                    if conn and conn["status"] == "connected":
                        try:
                            Calendar(world).sync()
                        except Exception:
                            log.exception("calendar sync failed")

            threading.Thread(target=poll, daemon=True, name="calendar-poll").start()
            stops.append(stop_calendar.set)
            scheduler.start()
            stops.append(scheduler.stop)
        yield
        for stop in stops:
            stop()

    app = FastAPI(title="Alpha", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:1430", "http://127.0.0.1:1430", "tauri://localhost",
                       "http://tauri.localhost"],
        allow_methods=["*"], allow_headers=["*"],
    )

    def guard(request: Request) -> None:
        host = request.client.host if request.client else ""
        if host not in {"127.0.0.1", "::1", "localhost", "testclient"}:
            raise HTTPException(403, "Alpha only answers this Mac.")
        if token and request.headers.get("authorization") != f"Bearer {token}":
            raise HTTPException(401, "This window isn't signed in to Alpha. Restart Alpha.")

    @app.exception_handler(Problem)
    async def problem(_: Request, exc: Problem) -> JSONResponse:
        return JSONResponse({"error": str(exc)}, status_code=400)

    @app.exception_handler(StarletteHTTPException)
    async def http_problem(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        ours = isinstance(exc.detail, str) and exc.detail not in FRAMEWORK_WORDS
        if not ours:
            log.info("%s %s answered %s: %s", request.method, request.url.path,
                     exc.status_code, exc.detail)
        words = str(exc.detail) if ours else NOT_THERE if exc.status_code == 404 else NOT_TAKEN
        return JSONResponse({"error": words}, status_code=exc.status_code,
                            headers=getattr(exc, "headers", None))

    @app.exception_handler(RequestValidationError)
    async def malformed(request: Request, exc: RequestValidationError) -> JSONResponse:
        log.warning("%s %s was malformed: %s", request.method, request.url.path, exc.errors())
        return JSONResponse({"error": NOT_TAKEN}, status_code=422)

    @app.exception_handler(Exception)
    async def crashed(request: Request, exc: Exception) -> JSONResponse:
        log.error("%s %s failed", request.method, request.url.path, exc_info=exc)
        return JSONResponse({"error": WENT_WRONG}, status_code=500)

    api = Depends(guard)

    @app.get("/api/health", dependencies=[api])
    def health() -> dict[str, Any]:
        return {"ok": True, "world": str(world.path), "running_turns": len(running.running())}

    served = Served(world=world, scheduler=scheduler, running=running, runner=runner_fn,
                    live=live, api=api)
    changes.routes(app, served)
    home.routes(app, served)
    tables.routes(app, served)
    people.routes(app, served)
    intelligence.routes(app, served)
    actions.routes(app, served)
    connections.routes(app, served)
    settings.routes(app, served)
    conversation.routes(app, served)
    activity.routes(app, served)
    return app


READY_PREFIX = "ALPHA_CORE_READY "


def serve(port: int = 53900, *, background: bool = True) -> None:
    """Listen on 127.0.0.1 (port 0 picks a free one) and say so on one stdout line,
    `ALPHA_CORE_READY {"port": …}`, which the app's host waits for. `background=False` keeps
    the scheduler, the second opinion and noticing off: for a core started to check something
    on a copy of a world, so nothing runs on its own there (build-plan §4.23)."""
    logging.basicConfig(level=logging.INFO, stream=sys.stderr)
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("127.0.0.1", port))
    sock.listen(128)
    world = World()
    ready = {"port": sock.getsockname()[1], "world": str(world.path), "pid": os.getpid()}
    print(READY_PREFIX + json.dumps(ready), flush=True)
    config = uvicorn.Config(create_app(world, live=background), log_level="warning")
    uvicorn.Server(config).run(sockets=[sock])
