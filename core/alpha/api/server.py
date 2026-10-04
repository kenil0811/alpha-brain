"""The core's HTTP API, for the workspace and the companion: `alpha serve`.

Loopback only. When the app hosts the core it passes ALPHA_TOKEN and every request must carry it
as a bearer token; without one (a developer running `alpha serve`) requests are accepted from
this Mac only. One World is shared by every request; the store serialises writes.

What it serves follows the workspace: Home (what needs the person, modules), a module (its
tables, what Alpha did there, its threads), a table's records (read and edited in place by the
person), People & Companies with a cross-source timeline, Intelligence (skills, automations,
connections, knowledge), Activity, the conversation, and turns.

The routes live one module per area (home, tables, people, intelligence, actions, connections,
settings, conversation); `Turns` runs turns in the background; `views` shapes what the window
shows; `served` is what every route closes over.
"""

from __future__ import annotations

import functools
import logging
import os
import platform
import re
import threading
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import alpha
from alpha.api import (
    actions,
    brain,
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
from alpha.connectors import files
from alpha.connectors.base import Connections
from alpha.connectors.calendar import Calendar
from alpha.connectors.files import Files
from alpha.models.accounts import Accounts
from alpha.models.keychain import KeychainError
from alpha.runtime import conversations
from alpha.runtime import turn as turns
from alpha.runtime.automation import Scheduler
from alpha.runtime.route import Router
from alpha.world import access
from alpha.world.store import Problem
from alpha.world.world import World

log = logging.getLogger("alpha.api")
CALENDAR_EVERY_S = 300

__all__ = ["AskBody", "READY_PREFIX", "Turns", "create_app", "serve"]

# The app's own pages, and Vite on any local port in development.
ORIGINS = ["tauri://localhost", "http://tauri.localhost"]
DEV_ORIGIN = r"^http://(localhost|127\.0\.0\.1):\d+$"

# What the companion window may do with its token: talk and listen. Approving, settings, keys
# and edits need the main window's token, so a script planted in the companion reaches none.
COMPANION = [("GET", r"/api/home"), ("GET", r"/api/conversation"), ("POST", r"/api/ask"),
             ("GET", r"/api/turns/[^/]+"), ("GET", r"/api/transcribe"),
             ("POST", r"/api/transcribe")]


def companion_may(method: str, path: str) -> bool:
    return any(method == m and re.fullmatch(p, path) for m, p in COMPANION)


def create_app(world: World | None = None, *, runner: turns.Runner | None = None,
               token: str | None = None, companion_token: str | None = None,
               live: bool = True) -> FastAPI:
    world = world or World()
    token = token if token is not None else os.environ.get("ALPHA_TOKEN")
    if companion_token is None:
        companion_token = os.environ.get("ALPHA_COMPANION_TOKEN")
    accounts = Accounts(world.store)
    # An injected runner (tests) bypasses the model routes and their connection check.
    runner_fn = runner or Router(accounts)
    scheduler = Scheduler(world, runner_fn)
    running = Turns(world, runner_fn, None if runner else accounts,
                    after=scheduler.builds if live else None, checks=live)
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
        allow_origins=ORIGINS,
        # The window in development: Vite on any local port (each worktree runs its own); the
        # token still guards when the app hosts the core.
        allow_origin_regex=DEV_ORIGIN,
        allow_methods=["*"], allow_headers=["*"],
    )

    def guard(request: Request) -> None:
        host = request.client.host if request.client else ""
        if host not in {"127.0.0.1", "::1", "localhost", "testclient"}:
            raise HTTPException(403, "Alpha only answers this Mac.")
        # CORS only hides the answer; a web page's simple POST still runs. Refuse any page
        # that isn't Alpha's own, which matters most for `alpha serve` without a token.
        origin = request.headers.get("origin")
        if origin and origin not in ORIGINS and not re.fullmatch(DEV_ORIGIN, origin):
            raise HTTPException(403, "Alpha only answers its own windows.")
        if not token:
            return
        sent = request.headers.get("authorization")
        if sent == f"Bearer {token}":
            return
        if companion_token and sent == f"Bearer {companion_token}":
            if companion_may(request.method, request.url.path):
                return
            raise HTTPException(403, "The companion can't do that; open the main window.")
        raise HTTPException(401, "This window isn't signed in to Alpha's core.")

    @app.exception_handler(Problem)
    async def problem(_: Request, exc: Problem) -> JSONResponse:
        return JSONResponse({"error": str(exc)}, status_code=400)

    @app.exception_handler(KeychainError)
    async def keychain_problem(_: Request, exc: KeychainError) -> JSONResponse:
        return JSONResponse({"error": f"The Keychain said no: {exc}"}, status_code=502)

    api = Depends(guard)

    @app.get("/api/health", dependencies=[api])
    def health() -> dict[str, Any]:
        return {"ok": True, "world": str(world.path), "running_turns": len(running.running()),
                "core_version": alpha.__version__,
                "core_commit": source_commit(),
                "python_version": platform.python_version()}

    access.enable(world)
    files.enable(world)
    # A turn can't carry on across a restart: a creation that was thinking says so on its page.
    for m in world.modules.all():
        tid = (m["creation"] or {}).get("thread")
        if tid and world.modules.thread(tid)["state"] == "working":
            world.modules.set_creation(m["id"], {"error": turns.RESTARTED})
            world.modules.update_thread(tid, state="open")

    served = Served(world=world, scheduler=scheduler, running=running, runner=runner_fn,
                    live=live, api=api, accounts=accounts)
    changes.routes(app, served)
    home.routes(app, served)
    tables.routes(app, served)
    people.routes(app, served)
    intelligence.routes(app, served)
    actions.routes(app, served)
    connections.routes(app, served)
    settings.routes(app, served)
    conversation.routes(app, served)
    # ---- facts, skills, first steps, project links, row actions (alpha/api/brain.py) ----
    brain.mount(app, world, api, runner_fn)
    return app


READY_PREFIX = "ALPHA_CORE_READY "


@functools.cache
def source_commit() -> str | None:
    """The commit the core's code was loaded from (once: later commits don't change running
    code), so the app can tell when its own build is older or newer (the app runs the core from
    the checkout, which moves on without it)."""
    import subprocess
    from pathlib import Path

    repo = Path(__file__).resolve().parents[3]
    try:
        done = subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"], capture_output=True,
                              text=True, timeout=5, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return (done.stdout.strip() or None) if done.returncode == 0 else None


def serve(port: int = 53900, *, background: bool = True) -> None:
    """Listen on 127.0.0.1 (port 0 picks a free one) and say so on one stdout line,
    `ALPHA_CORE_READY {"port": …}`, which the app's host waits for. `background=False` keeps
    the scheduler, the second opinion and noticing off: for a core started to check something
    on a copy of a world, so nothing runs on its own there (build-plan §4.23)."""
    import json
    import socket
    import sys

    import uvicorn

    logging.basicConfig(level=logging.INFO, stream=sys.stderr)
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("127.0.0.1", port))
    sock.listen(128)
    world = World()
    ready = {"port": sock.getsockname()[1], "world": str(world.path), "pid": os.getpid(),
             "commit": source_commit()}
    print(READY_PREFIX + json.dumps(ready), flush=True)
    config = uvicorn.Config(create_app(world, live=background), log_level="warning")
    uvicorn.Server(config).run(sockets=[sock])
