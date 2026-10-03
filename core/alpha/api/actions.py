"""Routes for actions: the cards the person decides on, their screenshots, edits before deciding."""

from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

from fastapi import FastAPI
from fastapi.responses import FileResponse

from alpha.api.bodies import (
    ActionApproveBody,
    ActionEditBody,
)
from alpha.api.served import Served
from alpha.api.views import (
    action_view,
)
from alpha.runtime import acting
from alpha.world.store import Problem


def routes(app: FastAPI, s: Served) -> None:
    world = s.world
    live = s.live
    api = s.api
    runner_fn = s.runner

    @app.get("/api/actions", dependencies=[api])
    def actions(state: str | None = None) -> list[dict[str, Any]]:
        return [action_view(world, a) for a in world.actions.all((state,) if state else None)]

    @app.get("/api/actions/{aid}", dependencies=[api])
    def action(aid: str) -> dict[str, Any]:
        return action_view(world, world.actions.get(aid))

    @app.get("/api/actions/{aid}/shots/{name}", dependencies=[api])
    def action_shot(aid: str, name: str) -> FileResponse:
        a = world.actions.get(aid)
        for p in a.get("shots") or []:
            if Path(p).name == name and Path(p).exists():
                return FileResponse(p, media_type="image/png")
        raise Problem("There is no such screenshot.")

    @app.patch("/api/actions/{aid}", dependencies=[api])
    def edit_action(aid: str, body: ActionEditBody) -> dict[str, Any]:
        a = world.actions.get(aid)
        proc = world.procedures.get(a["procedure"])
        world.actions.edit(aid, body.payload, proc["fields"])
        world.journal.append("changed", f"Changed the text of \"{a['title']}\" before deciding.",
                             actor="person", data={"action": aid})
        # The preview showed the old text: it is made again before the card can be approved.
        world.actions.previewed(aid, preview=None, note=acting.PREVIEW_PENDING, shots=[])
        if live:
            threading.Thread(target=lambda: acting.dry_run(world, aid), daemon=True,
                             name=f"preview-{aid}").start()
        else:
            acting.dry_run(world, aid)
        return action_view(world, world.actions.get(aid))

    @app.post("/api/actions/{aid}/approve", dependencies=[api])
    def approve_action(aid: str, body: ActionApproveBody) -> dict[str, Any]:
        """The person's yes in the app: the action runs now, in the background, and the card
        shows what happened."""
        approval = "Approved in the app" + (", always" if body.always else "")
        if live:
            # The yes is recorded now (and refused if the preview isn't ready); the run follows.
            acting.approve(world, aid, approval, always=body.always, perform_now=False)
            threading.Thread(target=lambda: acting.perform(world, aid, runner=runner_fn),
                             daemon=True, name=f"act-{aid}").start()
        else:
            acting.approve(world, aid, approval, always=body.always, runner=runner_fn,
                           repair=False)
        return action_view(world, world.actions.get(aid))

    @app.post("/api/actions/{aid}/decline", dependencies=[api])
    def decline_action(aid: str) -> dict[str, Any]:
        return action_view(world, acting.decline(world, aid))
