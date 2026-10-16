"""Routes for Home: what needs the person, their answers and decisions; workflows."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import FastAPI

from alpha.api.bodies import (
    AgreeWorkflowBody,
    AnswerBody,
    AnswersBody,
    AskBody,
    DecideBody,
)
from alpha.api.served import Served
from alpha.api.views import (
    module_card,
    needs_you,
    thread_views,
)
from alpha.connectors.calendar import Calendar
from alpha.runtime import conversations
from alpha.runtime.agents import columbo
from alpha.world.store import Problem, local_midnight_utc


def routes(app: FastAPI, s: Served) -> None:
    world = s.world
    scheduler = s.scheduler
    running = s.running
    live = s.live
    api = s.api

    @app.get("/api/home", dependencies=[api])
    def home() -> dict[str, Any]:
        since = local_midnight_utc()
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
        }

    @app.post("/api/asks/{ask_id}/answer", dependencies=[api])
    def answer(ask_id: str, body: AnswerBody) -> dict[str, Any]:
        asked = world.journal.read(ask_id)
        jid = world.journal.append("answered", body.text, actor="person", data={"ask": ask_id},
                                   module=asked["module"], thread=asked["thread"])
        decided = columbo.decide(world, asked, body.text)
        if decided:
            # Columbo's question (two values, two sources): the pick binds, by code; no turn.
            return {"answered": jid, "turn": None, "decision": decided["decision"]["id"]}
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

    @app.post("/api/asks/answer", dependencies=[api])
    def answer_many(body: AnswersBody) -> dict[str, Any]:
        """Questions asked together are answered together: each answer is journaled on its
        own question, and one turn carries them all, in the conversation that asked."""
        answers = {k: v.strip() for k, v in body.answers.items() if v and v.strip()}
        if not answers:
            raise Problem("Nothing answered yet.")
        asked = [world.journal.read(ask_id) for ask_id in answers]
        if len({(a["thread"], a["module"]) for a in asked}) != 1:
            raise Problem("These questions were asked in different conversations;"
                          " answer them where each was asked.")
        answered = [world.journal.append("answered", answers[a["id"]], actor="person",
                                         data={"ask": a["id"]}, module=a["module"],
                                         thread=a["thread"]) for a in asked]
        text = (answers[asked[0]["id"]] if len(asked) == 1 else
                "\n".join(f"{a['text']} — {answers[a['id']]}" for a in asked))
        started = running.start(AskBody(text=text, module=asked[0]["module"],
                                        thread=asked[0]["thread"]))
        return {"answered": answered, "turn": started}

    @app.post("/api/asks/{ask_id}/dismiss", dependencies=[api])
    def dismiss(ask_id: str) -> dict[str, Any]:
        # Closed without an answer: nothing runs.
        return {"dismissed": world.journal.close_ask(ask_id, "Dismissed.")}

    @app.post("/api/proposals/{pid}/decide", dependencies=[api])
    def decide_proposal(pid: str, body: DecideBody) -> dict[str, Any]:
        proposal = world.journal.read(pid)
        answered = world.journal.answer_proposal(pid, body.accept, module=proposal["module"])
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

    @app.post("/api/turns/{key}/stop", dependencies=[api])
    def stop_turn(key: str) -> dict[str, Any]:
        """Stop a turn that is still working (the panel's Stop)."""
        return running.stop(key)

    @app.post("/api/workflows/{wid}/agree", dependencies=[api])
    def agree_workflow(wid: str, body: AgreeWorkflowBody | None = None) -> dict[str, Any]:
        """The yes on the page (§12): suggestions decided, answers kept, then agreed; the
        build follows in the background (`scheduler.builds`)."""
        if body:
            for sid, decision in (body.suggestions or {}).items():
                world.workflows.decide_suggestion(wid, sid, decision)
            if body.answers:
                world.workflows.answer(wid, body.answers)
        agreed = world.workflows.agree(wid, "Agreed in the app")
        world.journal.append("did", f"You agreed your workflow: {agreed['title']}.",
                             actor="person", thread=agreed.get("conversation"),
                             data={"workflow": wid})
        if live:
            scheduler.builds()
        return agreed

    @app.post("/api/workflows/{wid}/resume", dependencies=[api])
    def resume_workflow(wid: str) -> dict[str, Any]:
        out = world.workflows.resume(wid)
        if live:
            scheduler.builds()
        return out

    @app.post("/api/workflows/{wid}/decline", dependencies=[api])
    def decline_workflow(wid: str) -> dict[str, Any]:
        declined = world.workflows.decline(wid)
        world.journal.append("did", f"Set aside the workflow {declined['title']}.",
                             actor="person", thread=declined.get("conversation"),
                             data={"workflow": wid})
        return declined

    @app.post("/api/facts/{fid}/decide", dependencies=[api])
    def decide_fact(fid: str, body: DecideBody) -> dict[str, Any]:
        return world.knowledge.decide_fact(fid, body.accept)
