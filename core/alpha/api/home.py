"""Routes for Home: what needs the person, their answers and decisions; plans; a turn stopped."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import FastAPI

from alpha.api.bodies import (
    AnswerBody,
    ApprovePlanBody,
    AskBody,
    DecideBody,
)
from alpha.api.served import Served
from alpha.api.views import (
    _local_midnight_utc,
    module_card,
    needs_you,
    thread_views,
)
from alpha.connectors.calendar import Calendar
from alpha.runtime import build, claude_cli, conversations
from alpha.world.store import Problem


def routes(app: FastAPI, s: Served) -> None:
    world = s.world
    scheduler = s.scheduler
    running = s.running
    live = s.live
    api = s.api

    @app.get("/api/home", dependencies=[api])
    def home() -> dict[str, Any]:
        since = _local_midnight_utc()
        ran = world.store.one(
            "SELECT COUNT(*) AS n FROM journal WHERE at >= ? AND actor = 'alpha'"
            " AND kind IN ('did','changed','made','saw') AND deleted_at IS NULL", (since,),
        )
        failed = world.store.one(
            "SELECT COUNT(*) AS n FROM journal WHERE at >= ? AND kind = 'failed'", (since,)
        )
        now = datetime.now(UTC)
        events = Calendar(world).between(now.isoformat(), (now + timedelta(hours=18)).isoformat())
        return {
            "date": datetime.now().astimezone().isoformat(),
            "needs_you": needs_you(world),
            "ran_today": ran["n"] if ran else 0,
            "failed_today": failed["n"] if failed else 0,
            "modules": [module_card(world, m) for m in world.modules.all()],
            "loose_tables": [t for t in world.collections.overview() if t["module"] is None],
            "coming_up": events[:6],
            "threads": thread_views(world),
            "brief": None,
        }

    @app.post("/api/asks/{ask_id}/answer", dependencies=[api])
    def answer(ask_id: str, body: AnswerBody) -> dict[str, Any]:
        asked = world.journal.read(ask_id)
        jid = world.journal.append("answered", body.text, actor="person", data={"ask": ask_id},
                                   module=asked["module"], thread=asked["thread"])
        routed = conversations.routed_answer(world, asked, body.text)
        if routed:
            # "Which is this about?": the pick sends the original sentence there.
            started = running.start(AskBody(text=routed["text"],
                                            conversation=routed["conversation"]))
            return {"answered": jid, "turn": started}
        # The answer is also the person's next message: Alpha carries on with it, in the
        # conversation that asked.
        started = running.start(AskBody(text=body.text, module=asked["module"],
                                        thread=asked["thread"]))
        return {"answered": jid, "turn": started}

    @app.post("/api/asks/{ask_id}/dismiss", dependencies=[api])
    def dismiss(ask_id: str) -> dict[str, Any]:
        # Closed without an answer: nothing runs.
        return {"dismissed": world.journal.close_ask(ask_id, "Dismissed.")}

    @app.post("/api/proposals/{pid}/decide", dependencies=[api])
    def decide_proposal(pid: str, body: DecideBody) -> dict[str, Any]:
        proposal = world.journal.read(pid)
        plan = proposal["data"].get("plan")
        if plan:
            # The state moves first: a refused decision (a plan already building, say) must
            # not leave an answer in the journal. A yes starts the build; a no closes it.
            if body.accept:
                world.plans.approve(plan, "Approved in the app")
            else:
                world.plans.decline(plan)
        answered = world.journal.answer_proposal(pid, body.accept, module=proposal["module"])
        if plan:
            if body.accept and live:
                scheduler.builds()
            return {"decided": pid, "turn": None, "plan": world.plans.get(plan)}
        instruction = proposal["data"].get("instruction")
        if instruction:
            # The person's yes is what makes it an instruction; nothing else needs to run.
            if body.accept:
                world.knowledge.add_instruction(instruction, answered)
                world.journal.append("changed", f"Added a standing instruction: {instruction}",
                                     actor="person", data={"proposal": pid})
            return {"decided": pid, "turn": None}
        started = running.start(AskBody(text=f"Yes, go ahead: {proposal['text']}",
                                        module=proposal["module"])) if body.accept else None
        return {"decided": pid, "turn": started}

    @app.get("/api/plans", dependencies=[api])
    def plans() -> list[dict[str, Any]]:
        return list(reversed(world.plans.all()))[:50]

    @app.post("/api/plans/{plan_id}/approve", dependencies=[api])
    def approve_plan(plan_id: str, body: ApprovePlanBody | None = None) -> dict[str, Any]:
        plan = world.plans.get(plan_id)
        if body and body.answers and plan["state"] == "proposed":
            plan = world.plans.answer(plan_id, body.answers)
        if plan.get("proposal"):
            decide_proposal(plan["proposal"], DecideBody(accept=True))
            return world.plans.get(plan_id)
        world.plans.approve(plan_id, "Approved in the app")
        if live:
            scheduler.builds()
        return world.plans.get(plan_id)

    @app.post("/api/plans/{plan_id}/stop", dependencies=[api])
    def stop_plan(plan_id: str) -> dict[str, Any]:
        """Stop a build that isn't going anywhere: its run ends now and it says what it made."""
        plan = world.plans.get(plan_id)
        if plan["state"] not in ("approved", "building"):
            raise Problem(f"The build of {plan['title']} isn't running.")
        if not (plan["thread"] and claude_cli.LIVE.stop(plan["thread"])):
            build.stop(world, plan_id, None)
        return world.plans.get(plan_id)

    @app.post("/api/turns/{key}/stop", dependencies=[api])
    def stop_turn(key: str) -> dict[str, Any]:
        return running.stop(key)

    @app.post("/api/plans/{plan_id}/resume", dependencies=[api])
    def resume_plan(plan_id: str) -> dict[str, Any]:
        plan = world.plans.resume(plan_id)
        if live:
            scheduler.builds()
        return plan

    @app.post("/api/plans/{plan_id}/decline", dependencies=[api])
    def decline_plan(plan_id: str) -> dict[str, Any]:
        plan = world.plans.get(plan_id)
        if plan.get("proposal"):
            decide_proposal(plan["proposal"], DecideBody(accept=False))
            return world.plans.get(plan_id)
        return world.plans.decline(plan_id)

    @app.post("/api/facts/{fid}/decide", dependencies=[api])
    def decide_fact(fid: str, body: DecideBody) -> dict[str, Any]:
        return world.knowledge.decide_fact(fid, body.accept)
