"""Routes for Home: what needs the person, their answers and decisions; pending outward actions;
plans; a turn stopped; what the Activity bell counts; Alpha's own bug log."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import FastAPI

from alpha.api.bodies import (
    AnswerBody,
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
from alpha.bugs import bug_log
from alpha.connectors.calendar import Calendar
from alpha.runtime import build, claude_cli, conversations
from alpha.world.pending import PendingActions
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

    pending_actions = PendingActions(world)

    @app.get("/api/pending", dependencies=[api])
    def pending() -> list[dict[str, Any]]:
        return pending_actions.pending()

    # The one approve path: these two, and an answer to a pending action's question, all end in
    # Actions.approve / reject, which runs the stored payload once.
    @app.post("/api/pending/{aid}/approve", dependencies=[api])
    def approve(aid: str) -> dict[str, Any]:
        return pending_actions.approve(aid, by="person")

    @app.post("/api/pending/{aid}/reject", dependencies=[api])
    def reject(aid: str) -> dict[str, Any]:
        return pending_actions.reject(aid, by="person")

    @app.post("/api/asks/{ask_id}/answer", dependencies=[api])
    def answer(ask_id: str, body: AnswerBody) -> dict[str, Any]:
        action = pending_actions.by_ask(ask_id)
        if action is not None:
            yes = body.text.strip().lower() in {"approve", "yes", "approved"}
            decide = pending_actions.approve if yes else pending_actions.reject
            decided = decide(action["id"], by="person")
            return {"pending_action": decided}
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
        # Closed without an answer: nothing runs (a pending action is rejected).
        action = pending_actions.by_ask(ask_id)
        if action is not None:
            return {"pending_action": pending_actions.reject(action["id"], by="person")}
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
    def approve_plan(plan_id: str) -> dict[str, Any]:
        plan = world.plans.get(plan_id)
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
        return running.cancel(key)

    @app.post("/api/turns/{key}/cancel", dependencies=[api])
    def cancel_turn(key: str) -> dict[str, Any]:
        """Stop a running turn: its model process ends, and the journal says "You stopped it"."""
        return running.cancel(key)

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

    @app.get("/api/attention", dependencies=[api])
    def attention() -> dict[str, Any]:
        """What the Activity bell counts: everything waiting on the person, and automations
        whose last run in the past day failed."""
        since = (datetime.now(UTC) - timedelta(days=1)).isoformat()
        failed = [{"id": a["id"], "title": a["title"], "module": a["module"],
                   "at": a["last_run_at"], "error": a["last_error"]}
                  for a in world.automations.all()
                  if a["last_error"] and (a["last_run_at"] or "") >= since]
        needs = needs_you(world)
        return {"count": len(needs) + len(failed), "needs_you": needs, "failed": failed}

    @app.get("/api/bugs", dependencies=[api])
    def bugs() -> dict[str, Any]:
        """Alpha's own bug log (`<data dir>/bugs.md`)."""
        return {"path": str(bug_log(world).path), "text": bug_log(world).read()}
