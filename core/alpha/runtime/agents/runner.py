"""One run of an agent, the same loop for every kind (design Q50).

A run is a row in `runs` from its start to its verdict, judged by code, under the agent's own
name in the journal. The custom frame: a pipeline (saved steps, no model unless a step breaks)
and, or, the model following the agent's brief in the agent's own thread, with nobody watching;
a brief that reads by hand converts itself to steps and the steps run at once. An @ in the
conversation is a run too: the agent answers there, marked as its own, with its brief in front
of it and its hands cut to its write list."""

from __future__ import annotations

import logging
import re
from typing import Any

from alpha import config
from alpha.runtime import pipeline, route, turn
from alpha.runtime.agents import RUNS, Work
from alpha.world.world import World

log = logging.getLogger("alpha.agents")

def worth_telling(reply: str) -> str | None:
    """The part of a run's answer marked for the person, wherever it appears."""
    match = re.search(r"worth telling\s*:\s*(.+)", reply, re.I | re.S)
    return match.group(1).strip() if match else None


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


def run(world: World, agent_id: str, *, trigger: str = "schedule",
        called_by: str | None = None, runner: turn.Runner = route.run,
        work: Work | None = None) -> dict[str, Any]:
    """One run of an agent: a row in `runs` from start to its verdict, judged by code. A kind
    with a frame of its own runs that (over `work`, what its look found). The custom frame:
    steps run with no model; a brief is a model turn with the agent's pages in front of it; a
    brief that converts itself to steps runs them at once."""
    agent = world.agents.get(agent_id)
    thread = agent["thread"]
    if not thread:
        thread = world.modules.open_thread(agent["name"], "job", agent["module"])["id"]
        world.agents.set_thread(agent_id, thread)
        agent = world.agents.get(agent_id)
    world.modules.update_thread(thread, state="working")
    run_id = world.runs.start(agent_id, trigger=trigger, called_by=called_by)
    frame = RUNS.get(agent["kind"])
    if frame is not None:
        try:
            out = frame(world, agent, work, runner=runner)
        except Exception as e:
            log.exception("%s failed", agent["name"])
            return _ended(world, agent, run_id, "failed", str(e), None, 0)
        return _ended(world, agent, run_id, out.verdict, out.why, out.line, out.model_ms)
    if agent["steps"]:
        return _steps(world, agent, run_id, runner)
    brief = brief_of(world, agent)
    if not brief:
        return _ended(world, agent, run_id, "failed",
                      "it has no steps and no brief, so there is nothing for it to do", None, 0)
    prompt = (f"Run now ({agent['when']}).\n\n{front(world, agent)}")
    try:
        outcome = turn.ask(world, prompt, thread=thread, runner=runner,
                           rules=config.prompt("agent_run", name=agent["name"]), actor=agent_id,
                           agent=agent_id,
                           journal_as=f"Run of {agent['name']} ({agent['when']}).")
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
        worth = worth_telling(outcome.reply)
        if worth:
            world.journal.append("noticed", worth, actor=agent_id, data={"agent": agent_id},
                                 module=agent["module"])
        return _ended(world, agent, run_id, "succeeded", None, outcome.reply[:2000], model_ms)
    return _ended(world, agent, run_id, "failed", outcome.result.error or outcome.reply, None,
                  model_ms)


def mention(world: World, agent: dict[str, Any], sentence: str, *, thread: str | None,
            module: str | None = None, runner: turn.Runner = route.run,
            on_said: Any = None) -> turn.TurnOutcome:
    """The person addressed the agent by name in a conversation: it answers there, as itself,
    with its brief in front of it and its hands cut to its write list. A run row is kept
    (trigger `mention`) and judged: succeeded when it answered, failed when it could not."""
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
        world.modules.update_thread(agent["thread"], state="done")
    return world.agents.finished(agent["id"], result=line, error=why)
