"""One run of an agent, the same loop for every kind (design Q50).

A run is a row in `runs` from its start to its verdict, judged by code, under the agent's own
name in the journal. The custom frame: a pipeline (saved steps, no model unless a step breaks)
and, or, the model following the agent's brief in the agent's own thread, with nobody watching;
a brief that reads by hand converts itself to steps and the steps run at once. An @ in the
conversation is a run too: the agent answers there, marked as its own, with its brief in front
of it and its hands cut to its write list."""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, cast

from alpha import config
from alpha.runtime import pipeline, route, turn
from alpha.runtime.agents import MENTIONS, RUNS, Work
from alpha.world.journal import RUN
from alpha.world.store import Problem
from alpha.world.tasks import DONE, OPEN, WORKING
from alpha.world.world import World

log = logging.getLogger("alpha.agents")


def brief_of(world: World, agent: dict[str, Any]) -> str:
    page = world.knowledge.find_note(f"agent:{agent['id']}", "Brief")
    return (page["body"].strip() if page else "") or ""


def notes_of(world: World, agent: dict[str, Any]) -> str:
    page = world.knowledge.find_note(f"agent:{agent['id']}", "Notes")
    return (page["body"].strip() if page else "") or ""


def binding_words(world: World, agent: dict[str, Any]) -> str:
    """The person's decisions that bind this agent, one line each, for the run's prompt."""
    lines = [f"- {d['what']}" + (f" ({d['why']})" if d.get("why") else "")
             for d in world.decisions.binding("agent", agent["id"])]
    return "\n".join(lines)


def front(world: World, agent: dict[str, Any]) -> str:
    """What goes in front of every run of this agent: its brief, its notes, the decisions
    that bind it."""
    parts = []
    brief = brief_of(world, agent)
    if brief:
        parts.append(f"Your brief (what you are for, what to do, what to tell):\n{brief[:3000]}")
    notes = notes_of(world, agent)
    if notes:
        parts.append(f"Your notes (what you learned in earlier runs):\n{notes[:2000]}")
    binding = binding_words(world, agent)
    if binding:
        parts.append(f"The person's decisions that bind you:\n{binding}")
    return "\n\n".join(parts)


def takes_tasks(world: World, agent: dict[str, Any]) -> bool:
    """Whether an agent can be given a task: one that follows a brief (judgement each run); an
    agent that only runs its steps does the same thing every time."""
    return agent["kind"] == "custom" and bool(brief_of(world, agent))


def run(world: World, agent_id: str, *, trigger: str = "schedule",
        called_by: str | None = None, runner: turn.Runner = route.run,
        work: Work | None = None, task: str | None = None,
        answered: str | None = None) -> dict[str, Any]:
    """One run of an agent: a row in `runs` from start to its verdict, judged by code. A kind
    with a frame of its own runs that (over `work`, what its look found). The custom frame:
    steps run with no model; a brief is a model turn with the agent's pages in front of it; a
    brief that converts itself to steps runs them at once. A run started for a task serves it
    (P2): the task is Working while the run goes and settles with its verdict; a run on its
    schedule serves none (Q92). `answered`: what an earlier run asked and the person's answer,
    in front of this one (Q92). Every line the run writes carries its id."""
    agent = world.agents.get(agent_id)
    if task is not None and not takes_tasks(world, agent):
        raise Problem(f"{agent['name']} only runs its steps; it can't take a task. Give the task"
                      " to an agent with a brief, or do it here.")
    thread = agent["thread"]
    if not thread:
        thread = world.modules.open_thread(agent["name"], "work", agent["module"])["id"]
        world.agents.set_thread(agent_id, thread)
        agent = world.agents.get(agent_id)
    world.modules.update_thread(thread, state="working")
    run_id = world.runs.start(agent_id, trigger=trigger, called_by=called_by, task=task)
    bound = RUN.set(run_id)
    try:
        if task is not None:
            world.tasks.run_started(task, agent_id)
        out = _run(world, agent, run_id, thread, runner=runner, work=work, task=task,
                   answered=answered)
        if task is not None:
            _settle(world, agent, run_id, task, thread)
        return out
    finally:
        RUN.reset(bound)


def _settle(world: World, agent: dict[str, Any], run_id: str, task: str, thread: str) -> None:
    """The task after its run (Q93): Done only when the agent said so in the run; what it said
    stands; one it left Working is Blocked (Open when the person stopped the run), since a run
    that answered is not a task done (found 19 Oct: four runs that said "I couldn't" left the
    task Done). Its line says which, from the states, never from the run's words."""
    said = world.tasks.get(task)["state"] != WORKING
    done = world.runs.get(run_id)
    verdict = done.get("verdict") or "failed"
    world.tasks.run_ended(task, agent["id"], verdict)
    after = world.tasks.get(task)
    title = after["title"]
    if after["state"] == DONE:
        what = f"did the task {title}"
    elif after["state"] == OPEN:
        what = f"stopped on the task {title}"
    elif said or verdict != "succeeded":
        what = f"could not finish the task {title}"
    elif any(a["data"].get("run") == run_id for a in world.journal.open_asks()):
        what = f"is waiting for your answer on the task {title}, so it is Blocked"
    else:
        what = f"ended without saying the task {title} was done, so it is Blocked"
    world.journal.append(
        "did" if verdict == "succeeded" else "failed",
        f"{agent['name']} {what}: {done.get('line') or done.get('why') or verdict}"[:600],
        actor=agent["id"], module=agent["module"], thread=thread,
        data={"task": task, "run": run_id, "agent": agent["id"]})


def _run(world: World, agent: dict[str, Any], run_id: str, thread: str, *,
         runner: turn.Runner, work: Work | None, task: str | None,
         answered: str | None) -> dict[str, Any]:
    agent_id = agent["id"]
    frame = RUNS.get(agent["kind"])
    if frame is not None:
        try:
            out = frame(world, agent, work, runner=runner)
        except Exception as e:
            log.exception("%s failed", agent["name"])
            return _ended(world, agent, run_id, "failed", str(e), None, 0)
        if out.upto is not None:
            # the frame looked for itself (Run now, a schedule, an @): what it covered is covered
            world.agents.advance_cursor(agent_id, out.upto)
        return _ended(world, agent, run_id, out.verdict, out.why, out.line, out.model_ms)
    if agent["steps"]:
        return _steps(world, agent, run_id, runner)
    brief = brief_of(world, agent)
    if not brief:
        return _ended(world, agent, run_id, "failed",
                      "it has no steps and no brief, so there is nothing for it to do", None, 0)
    # the task it was given, with what is around it (P2), and what an earlier run asked with
    # the person's answer (Q92): the run's whole work
    parts = ["Run now, for a task you were given." if task is not None else
             f"Run now ({agent['when']})."]
    if answered:
        parts.append(answered)
    if task is not None:
        parts.append(world.tasks.around_text(task))
    parts.append(front(world, agent))
    # what the person declined of its drafts since a run was last told, with why (P3 item 3):
    # it tunes what the agent does, never its code
    declined = world.cards.declined_for(agent_id)
    if declined:
        parts.append("What the person said no to, and why:\n" + "\n".join(
            f"- {c['text'][:200]}: {c['reason']}" for c in declined))
        world.cards.told([c["id"] for c in declined])
    if task is not None or answered:
        parts.append(("Do this task, then settle it: Done, or Blocked with what stops it."
                      if task is not None else "Carry on from their answer.")
                     + " End with what you did in a line.")
    prompt = "\n\n".join(p for p in parts if p)
    journal_as = (f"Run of {agent['name']} for the task {world.tasks.get(task)['title']}."
                  if task is not None else f"Run of {agent['name']} ({agent['when']}).")
    try:
        outcome = turn.ask(world, prompt, thread=thread, runner=runner,
                           rules=config.prompt("agent_run", name=agent["name"]), actor=agent_id,
                           agent=agent_id, journal_as=journal_as)
    except Exception as e:
        log.exception("agent %s failed", agent_id)
        return _ended(world, agent, run_id, "failed", str(e), None, 0)
    after = world.agents.get(agent_id)
    if outcome.ok and after["steps"]:
        # The run converted the agent to steps: they run now, not tomorrow.
        world.journal.append("did", f"{agent['name']} now runs as steps, with no model;"
                             " running them now.", actor=agent_id, thread=thread,
                             module=agent["module"], data={"agent": agent_id})
        return _steps(world, after, run_id, runner, model_ms=outcome.result.duration_ms or 0)
    model_ms = int(outcome.result.duration_ms or 0)
    if outcome.ok:
        return _ended(world, agent, run_id, "succeeded", None, outcome.reply[:2000], model_ms)
    return _ended(world, agent, run_id, "failed", outcome.result.error or outcome.reply, None,
                  model_ms)


def mention(world: World, agent: dict[str, Any], sentence: str, *, thread: str | None,
            module: str | None = None, runner: turn.Runner = route.run,
            on_said: Any = None, rest: str | None = None) -> turn.TurnOutcome:
    """The person addressed the agent by name in a conversation: it answers there, as itself,
    with its brief in front of it and its hands cut to its write list. A run row is kept
    (trigger `mention`) and judged: succeeded when it answered, failed when it could not. A
    kind with a mention of its own in code (Columbo's "check that") answers that way first."""
    hook = MENTIONS.get(agent["kind"])
    if hook is not None:
        # the sentence without the @Name token is what the kind's own code works on
        out = hook(world, agent, sentence, thread=thread, module=module, runner=runner,
                   on_said=on_said, rest=rest)
        if out is not None:
            return cast(turn.TurnOutcome, out)
    run_id = world.runs.start(agent["id"], trigger="mention")
    prompt = sentence
    extra = front(world, agent)
    rules = config.prompt("agent_mention", name=agent["name"]) + (f"\n\n{extra}" if extra else "")
    outcome = turn.ask(world, prompt, module=module, thread=thread, runner=runner, rules=rules,
                       actor="person", agent=agent["id"], on_said=on_said)
    model_ms = int(outcome.result.duration_ms or 0)
    if outcome.ok:
        world.runs.finish(run_id, verdict="succeeded", line=outcome.reply[:2000],
                          model_ms=model_ms)
    else:
        world.runs.finish(run_id, verdict="failed", why=outcome.result.error or outcome.reply,
                          model_ms=model_ms)
    return outcome


def _steps(world: World, agent: dict[str, Any], run_id: str, runner: turn.Runner, *,
           model_ms: int = 0) -> dict[str, Any]:
    """The steps, with no model unless one breaks; the verdict from what was read."""
    try:
        result = pipeline.run_pipeline(world, agent, runner=runner, run_id=run_id)
    except Exception as e:
        log.exception("pipeline %s failed", agent["id"])
        return _ended(world, agent, run_id, "failed", str(e), None, model_ms)
    verdict, why = result.verdict()
    return _ended(world, agent, run_id, verdict, why, result.line or None,
                  model_ms + result.model_ms, repairs=result.repairs, read=result.read,
                  sources=result.sources)


def _ended(world: World, agent: dict[str, Any], run_id: str, verdict: str, why: str | None,
           line: str | None, model_ms: int, *, repairs: int = 0, read: int | None = None,
           sources: int | None = None) -> dict[str, Any]:
    """The run's row, its line in the journal when it went wrong, the thread back to done."""
    if verdict == "failed":
        world.journal.append("failed", f"Run of {agent['name']} failed: {why}", actor=agent["id"],
                             data={"agent": agent["id"], "run": run_id},
                             thread=agent["thread"], module=agent["module"])
    world.runs.finish(run_id, verdict=verdict, why=why, line=line, model_ms=model_ms,
                      repairs=repairs, read=read, sources=sources)
    if agent["thread"]:
        # The agent's item after a run (§7): its card changes only when the run had something
        # to say; a quiet run leaves it open with "nothing new", a failed one stops it.
        stamp = datetime.now().astimezone().strftime("%a %H:%M")
        state = "stopped" if verdict == "failed" else "done" if line else "open"
        words = (f"Run failed: {why}" if verdict == "failed" else
                 line if line else f"Last checked {stamp}, nothing new")
        world.modules.update_thread(agent["thread"], state=state, last_line=words)
    return world.agents.finished(agent["id"], result=line, error=why)
