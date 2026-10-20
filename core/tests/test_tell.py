"""Section C, C5: agents stay out of the stream. A run's outcome comes to the conversation only
while a standing instruction asks to be told of that agent's runs (`tell`), kept by the desk
with `about` the agent; the instruction removed, by the hand or from ALPHA.md, the telling stops.
Cards a run raises are in the stream as every card is."""

from __future__ import annotations

from typing import Any

from conftest import building

from alpha.mcp.tools import Tools
from alpha.runtime.agents import runner as agent_runner
from alpha.runtime.running import RunResult, TurnRequest
from alpha.world.world import World

TELL = "Tell me whenever Listing Watch finds something new"


def told_lines(world: World) -> list[dict[str, Any]]:
    home = world.modules.home_thread()["id"]
    return [e for e in world.journal.recent(50, thread=home, kinds=["replied"])
            if e["data"].get("told")]


def test_a_run_comes_to_the_conversation_only_while_asked(world: World) -> None:
    agent = building(world, turn="j_1").agent_create(
        "Say which listings are new", "weekly mon 09:00",
        "## What it is for\nSay which listings are new since the last run.",
        name="Listing Watch")
    replies = iter(["Two listings so far.", "One new: Lakeside Bakery.", "",
                    "One new: Corner Print.", "One new: Harbour Wash."])

    def runner(req: TurnRequest) -> RunResult:
        return RunResult(reply=next(replies), ok=True, duration_ms=10)

    # quiet by default: the run stays on its page and in Activity
    agent_runner.run(world, agent["id"], runner=runner)
    assert told_lines(world) == []
    # the person asks to be told: the desk keeps the instruction about the agent
    home = world.modules.home_thread()["id"]
    said = world.journal.append("said", "tell me whenever listing watch finds something new",
                                actor="person", thread=home)
    out = Tools(world, turn=said, thread=home).world_remember(
        kind="instruction", about="Listing Watch", text=TELL,
        quote="tell me whenever listing watch finds something new")
    assert out.get("told") == "Listing Watch"
    assert world.agents.get(agent["id"])["tell"] == TELL
    agent_runner.run(world, agent["id"], runner=runner)
    lines = told_lines(world)
    assert [(e["text"], e["actor"], e["data"]["agent_name"]) for e in lines] == [
        ("One new: Lakeside Bakery.", agent["id"], "Listing Watch")]
    # a run with nothing to say tells nothing
    agent_runner.run(world, agent["id"], runner=runner)
    assert len(told_lines(world)) == 1
    # the instruction dropped from ALPHA.md: the telling stops with it
    world.knowledge.remove_instruction(TELL, "test")
    agent_runner.run(world, agent["id"], runner=runner)
    assert len(told_lines(world)) == 1
    # kept again, then removed by the hand: the agent's telling is cleared
    world.knowledge.add_instruction(TELL, "test")
    agent_runner.run(world, agent["id"], runner=runner)
    assert len(told_lines(world)) == 2
    said = world.journal.append("said", "stop telling me about listing watch", actor="person",
                                thread=home)
    Tools(world, turn=said, thread=home).world_remember(
        kind="instruction", text=TELL, state="removed",
        quote="stop telling me about listing watch")
    assert not world.agents.get(agent["id"])["tell"]


def test_an_instruction_about_an_agent_that_is_not_there_is_refused(world: World) -> None:
    home = world.modules.home_thread()["id"]
    said = world.journal.append("said", "tell me whenever the tracker finds something",
                                actor="person", thread=home)
    out = Tools(world, turn=said, thread=home).world_remember(
        kind="instruction", about="Tracker", text="Tell me whenever the tracker finds something",
        quote="tell me whenever the tracker finds something")
    assert "There is no agent Tracker" in str(out.get("error"))


def test_the_agents_own_tell_keeps_the_instruction_too(world: World) -> None:
    """Q111: the ask said to the agent's own setting (agent_keep tell) is the same instruction:
    kept in ALPHA.md where the person sees it, and removing it there stops the telling."""
    agent = building(world, turn="j_1").agent_create(
        "Say which listings are new", "weekly mon 09:00",
        "## What it is for\nSay which listings are new since the last run.",
        name="Listing Watch")
    replies = iter(["One new: Lakeside Bakery.", "One new: Corner Print."])

    def runner(req: TurnRequest) -> RunResult:
        return RunResult(reply=next(replies), ok=True, duration_ms=10)

    home = world.modules.home_thread()["id"]
    words = "tell me whenever listing watch finds something new"
    said = world.journal.append("said", words, actor="person", thread=home)
    tools = Tools(world, turn=said, thread=home)
    assert "quote" in str(tools.agent_keep(id=agent["id"], tell=TELL).get("error"))
    out = tools.agent_keep(id=agent["id"], tell=TELL, quote=words)
    assert out["told"] == "Listing Watch" and TELL in world.knowledge.instructions()
    agent_runner.run(world, agent["id"], runner=runner)
    assert [e["text"] for e in told_lines(world)] == ["One new: Lakeside Bakery."]
    # stopped on the agent: the instruction goes from ALPHA.md with it
    stop = "stop telling me about listing watch"
    said = world.journal.append("said", stop, actor="person", thread=home)
    Tools(world, turn=said, thread=home).agent_keep(id=agent["id"], tell_off=True, quote=stop)
    assert not world.agents.get(agent["id"])["tell"]
    assert TELL not in world.knowledge.instructions()
    agent_runner.run(world, agent["id"], runner=runner)
    assert len(told_lines(world)) == 1


def test_a_tell_needs_the_persons_own_words(world: World) -> None:
    agent = world.agents.create("Look at my deals", name="Deal Watch")
    home = world.modules.home_thread()["id"]
    said = world.journal.append("said", "what is new", actor="person", thread=home)
    out = Tools(world, turn=said, thread=home).agent_keep(
        id=agent["id"], tell="Tell me whenever Deal Watch finds something",
        quote="tell me whenever deal watch finds something")
    assert out.get("error") and not world.agents.get(agent["id"])["tell"]


def test_a_tell_with_no_words_is_refused_and_sets_nothing(world: World) -> None:
    """His "Stop telling me about Job Watcher" (20 Oct 2026): the hand's words said `tell ""`
    stops it, the model passed the two quote marks, and they were kept as an instruction and
    as the agent's tell. Stopping is now tell_off; a tell with no words is refused where
    instructions are kept, before anything is set."""
    agent = world.agents.create("Look at my deals", name="Deal Watch")
    home = world.modules.home_thread()["id"]
    words = "stop telling me about deal watch"
    said = world.journal.append("said", words, actor="person", thread=home)
    tools = Tools(world, turn=said, thread=home)
    for bad in ('""', "  ", "- ."):
        out = tools.agent_keep(id=agent["id"], tell=bad, quote=words)
        assert out.get("error") == "An instruction needs words.", bad
    assert not world.agents.get(agent["id"])["tell"] and world.knowledge.instructions() == []
    both = tools.agent_keep(id=agent["id"], tell="Tell me about Deal Watch", tell_off=True,
                            quote=words)
    assert "one of them" in str(both.get("error"))
    assert tools.agent_keep(id=agent["id"], tell_off=True, quote=words)["note"] == \
        "Its runs were not being told."
