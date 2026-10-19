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
    DeclineBody,
)
from alpha.api.served import Served
from alpha.api.views import (
    items_today,
    module_card,
    needs_you,
)
from alpha.connectors.calendar import Calendar
from alpha.runtime import conversations, engine
from alpha.runtime.agents import columbo, scout, watson
from alpha.runtime.agents import runner as agent_runner
from alpha.world.cards import reason_of
from alpha.world.store import Problem, local_midnight_utc


def routes(app: FastAPI, s: Served) -> None:
    world = s.world
    running = s.running
    live = s.live
    api = s.api

    @app.get("/api/home", dependencies=[api])
    def home() -> dict[str, Any]:
        # the first poll of a local day is the day's opening: Scout picks for the day (Q48)
        if live:
            scout.note_opened(world)
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
            "loose_tables": [t for t in world.collections.overview()
                             if t["module"] is None and not t.get("world")],
            "coming_up": events[:6],
            "threads": items_today(world),
            "picks": [p for p in scout.picks_of_day(world) if not p["decided"]],
        }

    def its_run(asked: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]] | None:
        """The agent and the run that asked, when an agent's run asked and the agent can take
        it on (Q92): a run is over by the time the person answers (nobody watches it), so the
        answer goes back to its agent, never to Alpha's conversation as a bare sentence."""
        data = asked["data"]
        if not data.get("run") or any(data.get(k) for k in ("permission", "scout", "reminder")):
            return None
        try:
            run = world.runs.get(str(data["run"]))
            agent = world.agents.get(run["agent"])
        except Problem:
            return None
        if not agent_runner.takes_tasks(world, agent):
            return None
        if world.runs.open(agent["id"]) is not None:
            raise Problem(f"{agent['name']} is still working; answer when its run has ended.")
        return agent, run

    def carry_on(agent: dict[str, Any], run: dict[str, Any], asked: list[dict[str, Any]],
                 answers: dict[str, str]) -> dict[str, Any]:
        """The agent runs again, for the task its run served, with what it asked, the
        person's answer and how its last run ended in front of it."""
        ended = run.get("line") or run.get("why")
        answered = "\n".join(([f"Your last run ended: {ended}"] if ended else []) + [
            f"You asked the person: {a['text']}\nTheir answer: {answers[a['id']]}"
            for a in asked])
        task = run.get("task")
        try:
            if task:
                world.tasks.get(str(task))
        except Problem:
            task = None  # the task went since: the answer is the run's whole work
        if live:
            s.scheduler.run_now(agent["id"], "answer", task=task, answered=answered)
        else:
            agent_runner.run(world, agent["id"], trigger="answer", task=task,
                             answered=answered, runner=s.runner)
        return {"turn": None, "agent": agent["id"]}

    @app.post("/api/asks/{ask_id}/answer", dependencies=[api])
    def answer(ask_id: str, body: AnswerBody) -> dict[str, Any]:
        asked = world.journal.read(ask_id)
        back = its_run(asked)
        reason = reason_of(body.reason)
        jid = world.journal.append("answered", body.text, actor="person",
                                   data={"ask": ask_id, **({"to": back[0]["id"]} if back else {}),
                                         **({"reason": reason} if reason else {})},
                                   module=asked["module"], thread=asked["thread"])
        if asked["data"].get("permission") and engine.answer_permission(ask_id, body.text):
            # A hand waiting for the person's yes (harness §8): the turn carries on with it.
            return {"answered": jid, "turn": None, "permission": asked["data"]["permission"]}
        if asked["data"].get("scout") and asked["data"].get("proposal"):
            # Scout's costly pick as a question (slice 6): Take or Not now decides the pick
            take = body.text.strip().lower().startswith("take")
            proposal = world.journal.read(str(asked["data"]["proposal"]))
            world.journal.answer_proposal(proposal["id"], take, module=proposal["module"])
            scout.decide_pick(world, proposal, take)
            pick = proposal["data"]["scout"]
            if not take or pick.get("open"):
                return {"answered": jid, "turn": None, "open": pick.get("open")}
            taken = running.start(AskBody(text=f"Yes, go ahead: {pick['action']}",
                                          module=proposal["module"]))
            return {"answered": jid, "turn": taken}
        reminder = asked["data"].get("reminder")
        if reminder:
            # the reminder's card: Done closes the task; Tomorrow moves its moment a day on, at
            # the same time; neither starts a turn (the Reminders agent)
            row = world.tasks.get(str(reminder))
            if body.text.strip().lower().startswith("tomorrow"):
                moment = datetime.fromisoformat(row["remind_at"]).astimezone() + timedelta(days=1)
                world.tasks.snooze(row["id"], moment)
                world.journal.append("changed", f"Reminder moved to tomorrow, {moment:%H:%M}:"
                                     f" {row['title']}.", actor="person",
                                     data={"task": row["id"], "ask": ask_id},
                                     module=asked["module"], thread=asked["thread"])
            else:
                world.tasks.set_state(row["id"], "Done")
            return {"answered": jid, "turn": None, "reminder": reminder}
        decided = columbo.decide(world, asked, body.text)
        if decided:
            # Columbo's question (two values, two sources): the pick binds, by code; no turn.
            return {"answered": jid, "turn": None, "decision": decided["decision"]["id"]}
        routed = conversations.routed_answer(world, asked, body.text)
        if routed:
            # "Which is this about?": the pick sends the original sentence there.
            started = running.start(AskBody(text=routed["text"], conversation=routed["thread"]))
            return {"answered": jid, "turn": started}
        if back:
            return {"answered": jid, **carry_on(*back, [asked], {ask_id: body.text})}
        # The answer is also the person's next message: Alpha carries on with it, in the
        # conversation that asked; a question another run asked goes with it, since that
        # conversation never saw it (Q92).
        text = f"{asked['text']} — {body.text}" if asked["data"].get("run") else body.text
        started = running.start(AskBody(text=text, module=asked["module"],
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
        backs = [its_run(a) for a in asked]
        back = backs[0] if len({b[1]["id"] if b else None for b in backs}) == 1 else None
        answered = [world.journal.append("answered", answers[a["id"]], actor="person",
                                         data={"ask": a["id"],
                                               **({"to": back[0]["id"]} if back else {})},
                                         module=a["module"], thread=a["thread"]) for a in asked]
        if back:
            # one agent's run asked them all: they go back to it together (Q92)
            return {"answered": answered, **carry_on(*back, asked, answers)}
        text = (answers[asked[0]["id"]] if len(asked) == 1 and not asked[0]["data"].get("run")
                else "\n".join(f"{a['text']} — {answers[a['id']]}" for a in asked))
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
        reason = reason_of(body.reason) if not body.accept else None
        answered = world.journal.answer_proposal(pid, body.accept, module=proposal["module"],
                                                 **({"reason": reason} if reason else {}))
        if proposal["data"].get("scout"):
            # Scout's pick (Q48): the decision is the person's, by the pick's key; a Take is
            # done by Alpha as a turn in the pick's words (the map's links open the map)
            scout.decide_pick(world, proposal, body.accept)
            pick = proposal["data"]["scout"]
            if not body.accept or pick.get("open"):
                return {"decided": pid, "turn": None, "open": pick.get("open")}
            taken = running.start(AskBody(text=f"Yes, go ahead: {pick['action']}",
                                          module=proposal["module"]))
            return {"decided": pid, "turn": taken}
        instruction = proposal["data"].get("instruction")
        if instruction:
            # The person's yes is what makes it an instruction; nothing else needs to run.
            if body.accept:
                world.knowledge.add_instruction(instruction, answered)
                world.journal.append("changed", f"Added a standing instruction: {instruction}",
                                     actor="person", data={"proposal": pid})
            return {"decided": pid, "turn": None}
        if proposal["data"].get("offer") and body.accept:
            # Watson's offer of a table (Q79): the go-ahead carries the sentences to put in it
            return {"decided": pid,
                    "turn": running.start(AskBody(text=watson.go_ahead_words(world, proposal)))}
        started = running.start(AskBody(text=f"Yes, go ahead: {proposal['text']}",
                                        module=proposal["module"])) if body.accept else None
        return {"decided": pid, "turn": started}

    @app.post("/api/turns/{key}/stop", dependencies=[api])
    def stop_turn(key: str) -> dict[str, Any]:
        """Stop a turn that is still working (the panel's Stop)."""
        return running.stop(key)

    @app.post("/api/workflows/{wid}/agree", dependencies=[api])
    def agree_workflow(wid: str, body: AgreeWorkflowBody | None = None) -> dict[str, Any]:
        """The yes on the page (§12): suggestions decided, answers kept, then agreed; Alpha
        does the work in the conversation at once (harness 2a)."""
        if body:
            for sid, decision in (body.suggestions or {}).items():
                world.workflows.decide_suggestion(wid, sid, decision)
            if body.answers:
                world.workflows.answer(wid, body.answers)
        agreed = world.workflows.agree(wid, "Agreed in the app")
        world.journal.append("did", f"You agreed your workflow: {agreed['title']}.",
                             actor="person", thread=agreed.get("conversation"),
                             data={"workflow": wid})
        # Alpha does the work in the conversation, now, as one piece (harness 2a): a turn of
        # its own there, the window following it like any other.
        if agreed.get("conversation"):
            running.start(AskBody(
                text=f"The person agreed the page \"{agreed['title']}\" in the app. Do the"
                     " work now, here, as one piece: make what the page says, run it once,"
                     " and report what it holds.",
                conversation=agreed["conversation"]), actor="alpha",
                journal_as=f"Agreed in the app: {agreed['title']}. Doing it now.")
        return agreed

    @app.post("/api/workflows/{wid}/decline", dependencies=[api])
    def decline_workflow(wid: str, body: DeclineBody | None = None) -> dict[str, Any]:
        reason = reason_of(body.reason if body else None)
        declined = world.workflows.decline(wid)
        if reason:
            world.cards.give_reason(wid, "workflow", reason)
        world.journal.append("did", f"Set aside the workflow {declined['title']}.",
                             actor="person", thread=declined.get("conversation"),
                             data={"workflow": wid})
        return declined

    @app.post("/api/facts/{fid}/decide", dependencies=[api])
    def decide_fact(fid: str, body: DecideBody) -> dict[str, Any]:
        return world.knowledge.decide_fact(fid, body.accept)
