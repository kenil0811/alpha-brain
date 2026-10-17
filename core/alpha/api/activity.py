"""Routes for Activity (13 Oct, slice 2 D5, D9, D12): what happened, a page at a time or a day
at a time; one entry's own page; and Try again for a failure, which redoes exactly what the
failure names (`context/again.py`) and journals that the person tried."""

from __future__ import annotations

import threading
from collections.abc import Callable
from typing import Any

from fastapi import FastAPI

from alpha.api.bodies import AskBody
from alpha.api.served import Served
from alpha.context.again import again, failures_view
from alpha.context.entry_page import entry_page
from alpha.runtime import acting
from alpha.world.store import Problem


def routes(app: FastAPI, s: Served) -> None:
    world = s.world
    api = s.api

    @app.get("/api/activity", dependencies=[api])
    def activity(limit: int = 100, module: str | None = None, q: str | None = None,
                 kind: str | None = None, since: str | None = None,
                 before: str | None = None) -> list[dict[str, Any]]:
        """Newest first. `since` bounds the time (Home asks for a whole day's failures);
        `before` is an entry's id, for the page before the oldest Activity shows."""
        if q:
            return failures_view(world, world.journal.search(q, limit))
        module_id = world.modules.get(module)["id"] if module else None
        kinds = [kind] if kind else None
        return failures_view(world, list(reversed(world.journal.recent(
            limit, module=module_id, kinds=kinds, since=since, before=before))))

    @app.get("/api/activity/{jid}", dependencies=[api])
    def activity_entry(jid: str) -> dict[str, Any]:
        """One entry's own page, however old: what it touched and its turn's other steps."""
        return entry_page(world, jid)

    def background(name: str, work: Callable[[], Any], failed: Callable[[str], Any]) -> None:
        """Run `work` (in the background when the core runs things on its own); a refusal is
        journaled as the try failing, so the try never shows as running for ever."""
        def run() -> None:
            try:
                work()
            except Exception as e:  # the try failed: said in Activity
                failed(str(e))
        if s.live:
            threading.Thread(target=run, daemon=True, name=name).start()
        else:
            run()

    @app.post("/api/activity/{jid}/again", dependencies=[api])
    def try_again(jid: str) -> dict[str, Any]:
        """Try again: redo what this failure names, once. An action on a site was asked about
        in the window first; it is approved again for this one time."""
        e = world.journal.read(jid)
        plan = again(world, e)
        if plan is None:
            raise Problem("There's nothing to try again here: open it to see what happened.")
        if plan.get("blocked"):
            raise Problem(plan["blocked"])
        how = plan["how"]
        world.journal.append(
            "did", f"You tried again: {e['text']}", actor="person", module=e["module"],
            thread=e["thread"], data={"again_of": jid, **{k: v for k, v in plan.items()
                                                          if k not in ("words", "asks")}})
        if how in ("agent", "automation"):
            s.scheduler.run_now(plan.get("agent") or plan["automation"], trigger="again")
        elif how == "turn":
            s.running.start(AskBody(text=plan["text"], thread=plan["thread"], module=e["module"]))
        elif how == "action":
            aid = plan["action"]
            world.actions.again(aid, "Tried again in the app")
            background(f"again-{jid}", lambda: acting.perform(world, aid, runner=s.runner,
                                                                repair=s.live),
                       lambda why: world.actions.fail(aid, why))
        elif how == "preview":
            aid = plan["action"]
            world.actions.reopen(aid, acting.PREVIEW_PENDING)
            background(f"again-{jid}", lambda: acting.dry_run(world, aid),
                       lambda why: world.actions.fail(aid, why))
        return failures_view(world, [world.journal.read(jid)])[0]
