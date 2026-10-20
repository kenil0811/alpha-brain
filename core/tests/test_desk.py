"""The desk (section C, Q107): Home's session kept open, work beside it as background
subagents, their outcomes in the stream. No model, no network: a scripted client plays the CLI
as the spike of 20 Oct 2026 saw it (a query begins a turn with its UserPromptSubmit; finished
work begins a turn of the desk's own, its prompt the task's notification)."""

from __future__ import annotations

import asyncio
import re
import time
from collections.abc import AsyncIterator, Callable
from typing import Any

from claude_agent_sdk import AssistantMessage, ResultMessage, TextBlock, ToolUseBlock
from claude_agent_sdk.types import (
    TaskNotificationMessage,
    TaskProgressMessage,
    TaskStartedMessage,
)

from alpha.context import layers
from alpha.runtime import conversations, desk, turn
from alpha.runtime.running import RunResult, TurnRequest
from alpha.world.world import World

SCRIPTS: dict[str, list[Any]] = {}


def said_text(text: str) -> AssistantMessage:
    return AssistantMessage(content=[TextBlock(text=text)], model="m")


def result(text: str) -> ResultMessage:
    return ResultMessage(subtype="success", duration_ms=900, duration_api_ms=800,
                         is_error=False, num_turns=1, session_id="s-desk", result=text)


class FakeCLI:
    """The CLI behind the desk's client: each query is a turn of its own script."""

    made: list[FakeCLI] = []

    def __init__(self, options: Any) -> None:
        self.options = options
        self.out: asyncio.Queue[Any] = asyncio.Queue()
        self.queried: list[str] = []
        self.stopped: list[str] = []
        self.answers: dict[str, Any] = {}
        FakeCLI.made.append(self)

    async def connect(self) -> None:
        return None

    async def disconnect(self) -> None:
        return None

    async def interrupt(self) -> None:
        return None

    async def stop_task(self, task_id: str) -> None:
        self.stopped.append(task_id)

    async def hook(self, event: str, data: dict[str, Any], use_id: str | None = None) -> Any:
        found: Any = {}
        for matcher in self.options.hooks.get(event, []):
            if matcher.matcher and not re.fullmatch(matcher.matcher,
                                                    str(data.get("tool_name") or "")):
                continue
            for hook in matcher.hooks:
                found = await hook(data, use_id, {"signal": None}) or found
        return found

    async def query(self, prompt: str) -> None:
        self.queried.append(prompt)
        asyncio.get_running_loop().create_task(self.turn(prompt, SCRIPTS.get(prompt, [])))

    async def turn(self, prompt: str, script: list[Any]) -> None:
        await self.hook("UserPromptSubmit", {"prompt": prompt})
        for step in script:
            if callable(step):
                await step(self)
            else:
                await self.out.put(step)

    async def receive_messages(self) -> AsyncIterator[Any]:
        while True:
            yield await self.out.get()


def call(name: str, tool_input: dict[str, Any], use_id: str,
         agent: str | None = None) -> Callable[[FakeCLI], Any]:
    async def run(cli: FakeCLI) -> None:
        cli.answers[use_id] = await cli.hook(
            "PreToolUse", {"tool_name": name, "tool_input": tool_input, "agent_id": agent},
            use_id)
    return run


def until(check: Callable[[], Any], seconds: float = 5) -> Any:
    end = time.monotonic() + seconds
    while time.monotonic() < end:
        found = check()
        if found:
            return found
        time.sleep(0.02)
    raise AssertionError("never came")


START = [
    call("Agent", {"description": "Deal research", "prompt": "Find which deals are new.",
                   "run_in_background": True}, "call_1"),
    AssistantMessage(content=[ToolUseBlock(id="call_1", name="Agent", input={})], model="m"),
    TaskStartedMessage(subtype="task_started", data={}, task_id="task_1",
                       description="Deal research", uuid="u1", session_id="s-desk",
                       tool_use_id="call_1", task_type="local_agent"),
    said_text("I've started looking into the deals; ask me anything meanwhile."),
    result("I've started looking into the deals; ask me anything meanwhile."),
]


def finish(cli: FakeCLI) -> None:
    """The work's own steps, its end, then the desk's turn on it, as the spike saw them."""
    async def go() -> None:
        await cli.out.put(TaskProgressMessage(
            subtype="task_progress", data={}, task_id="task_1", description="Reading the deals",
            usage={"total_tokens": 1, "tool_uses": 1, "duration_ms": 1}, uuid="u2",
            session_id="s-desk"))
        await call("Bash", {"command": "sleep 5", "run_in_background": True}, "call_2",
                   agent="task_1")(cli)
        await cli.out.put(TaskNotificationMessage(
            subtype="task_notification", data={}, task_id="task_1", status="completed",
            output_file="", summary="Two deals are new: Harbour Car Wash and Corner Print.",
            uuid="u3", session_id="s-desk"))
        await cli.turn("<task-notification>\n<task-id>task_1</task-id>\n</task-notification>",
                       [said_text("The deal research finished: two are new."),
                        result("The deal research finished: two are new.")])
    asyncio.run_coroutine_threadsafe(go(), DESK.loop).result()


DESK: desk.Desk


def test_work_runs_beside_the_desk_and_its_outcome_is_the_desks_reply(world: World) -> None:
    global DESK
    SCRIPTS.clear()
    SCRIPTS["look into which deals are new"] = START
    SCRIPTS["what is two and two"] = [said_text("Four."), result("Four.")]
    DESK = desk.Desk(world.path, client_factory=FakeCLI)
    home = world.modules.home_thread()["id"]
    try:
        first = turn.ask(world, "look into which deals are new", thread=home,
                         runner=DESK.run, conversation=True)
        assert first.ok and first.reply.startswith("I've started looking into the deals")
        cli = FakeCLI.made[-1]
        # the desk's own background work is not forced into the foreground (S2's hook is not
        # the desk's): its call went through untouched
        assert cli.answers["call_1"] == {}
        work = until(lambda: [t for t in world.modules.items()
                              if t.get("session_tools") == desk.WORK])
        tid = work[0]["id"]
        assert work[0]["title"] == "Deal research" and work[0]["state"] == "working"
        assert work[0]["session_ref"] == "task_1"
        started = [e for e in world.journal.recent(20, thread=home)
                   if e["data"].get("work") == tid and e["kind"] == "did"]
        assert started and started[0]["text"] == \
            "Started work beside the conversation: Deal research"
        brief = [e for e in world.journal.recent(20, thread=tid) if e["data"].get("brief")]
        assert brief[0]["text"] == "Asked to: Find which deals are new."
        # a second, unrelated sentence is answered while the work runs (C2's proof)
        second = turn.ask(world, "what is two and two", thread=home, runner=DESK.run,
                          conversation=True)
        assert second.ok and second.reply == "Four."
        assert world.modules.thread(tid)["state"] == "working"
        # the desk sees the work beside it in its turn layer (C6)
        layer = layers.turn_layer(world, "and?", thread=home)
        assert "WORK BESIDE YOU" in layer and "task task_1" in layer
        finish(cli)
        # its shell ran in the foreground: one completion, never an early one (the spike)
        assert cli.answers["call_2"]["hookSpecificOutput"]["updatedInput"][
            "run_in_background"] is False
        done = until(lambda: world.modules.thread(tid)["state"] == "done")
        assert done
        outcome = [e for e in world.journal.recent(20, thread=tid) if e["data"].get("outcome")]
        assert outcome[0]["text"].startswith("Two deals are new")
        steps = [e for e in world.journal.recent(20, thread=tid) if e["data"].get("step")]
        assert [e["text"] for e in steps] == ["Reading the deals"]
        # the desk's own words on it, in the stream, carrying the work's id
        reply = until(lambda: [e for e in world.journal.recent(10, thread=home)
                               if e["kind"] == "replied" and tid in (e["data"].get("work") or [])])
        assert reply[0]["text"] == "The deal research finished: two are new."
        finished = [e for e in world.journal.recent(10, thread=home)
                    if e["kind"] == "did" and e["text"].startswith("Work finished")]
        assert finished[0]["text"] == "Work finished: Deal research"
    finally:
        DESK.close()


def test_a_call_made_inside_work_is_bound_to_the_works_thread(world: World) -> None:
    global DESK
    SCRIPTS.clear()
    SCRIPTS["look into which deals are new"] = START
    DESK = desk.Desk(world.path, client_factory=FakeCLI)
    home = world.modules.home_thread()["id"]
    try:
        first = turn.ask(world, "look into which deals are new", thread=home,
                         runner=DESK.run, conversation=True)
        tid = until(lambda: DESK.work.get("task_1"))
        cli = FakeCLI.made[-1]
        asyncio.run_coroutine_threadsafe(
            call("mcp__alpha__world_query", {"sql": "select 1"}, "call_9", agent="task_1")(cli),
            DESK.loop).result()
        bound = DESK._binding_of("call_9")
        assert bound == {"turn": first.said, "thread": tid, "module": None}
        # a call of the desk's own, between turns, is Home's
        assert (DESK._binding_of("call_unknown") or {}).get("thread") == home
        # the person's Stop on the work stops its task
        assert DESK.stop_work(tid) and cli.stopped == ["task_1"]
    finally:
        DESK.close()


def test_work_left_running_when_alpha_closed_is_stopped_with_a_line(world: World) -> None:
    t = world.modules.open_thread("Deal research", "work")
    world.modules.set_session(t["id"], "task_1", tools=desk.WORK)
    world.modules.update_thread(t["id"], state="working")
    conversations.reset_working(world)
    row = world.modules.thread(t["id"])
    assert row["state"] == "stopped" and row["last_line"] == conversations.RESTARTED


def test_a_slash_command_with_no_prompt_hook_still_gets_its_result(world: World) -> None:
    """`/compact` begins its turn with no UserPromptSubmit: its result is still its own."""
    global DESK
    SCRIPTS.clear()
    DESK = desk.Desk(world.path, client_factory=SilentHookCLI)
    home = world.modules.home_thread()["id"]
    try:
        out = turn.ask(world, "/compact", thread=home, runner=DESK.run, conversation=True)
        assert out.ok and out.reply == "Compacted."
    finally:
        DESK.close()


class SilentHookCLI(FakeCLI):
    async def turn(self, prompt: str, script: list[Any]) -> None:
        await self.out.put(result("Compacted."))


def test_a_compaction_with_no_prompt_hook_is_told_what_to_keep_and_given_the_start_again(
        world: World) -> None:
    """`/compact`'s own hooks (PreCompact, then SessionStart with source "compact") run before
    any message of its turn: they still serve that sentence's turn (B6 at the desk)."""
    global DESK
    SCRIPTS.clear()
    apart: list[str] = []

    def stateless(req: TurnRequest) -> RunResult:
        apart.append(req.kind)  # Watson's checkpoint after the compaction, never the desk's
        return RunResult(ok=True, reply="## Going on\n- nothing open")

    DESK = desk.Desk(world.path, client_factory=CompactingCLI, apart=stateless)
    home = world.modules.home_thread()["id"]
    try:
        out = turn.ask(world, "/compact", thread=home, runner=DESK.run, conversation=True)
        assert out.ok
        cli = FakeCLI.made[-1]
        assert isinstance(cli, CompactingCLI) and cli.guidance and cli.again
        kept = world.journal.context(out.said)
        assert kept and "GIVEN AGAIN AFTER A COMPACTION" in str(kept["context"])
        # the desk's session took the one query, `/compact`; anything else ran apart
        assert cli.queried == ["/compact"]
    finally:
        DESK.close()


class CompactingCLI(FakeCLI):
    guidance: Any = None
    again: Any = None

    async def turn(self, prompt: str, script: list[Any]) -> None:
        self.guidance = (await self.hook("PreCompact", {"trigger": "manual"})).get(
            "systemMessage")
        self.again = (await self.hook("SessionStart", {"source": "compact"})).get(
            "hookSpecificOutput", {}).get("additionalContext")
        await self.out.put(result("Compacted."))
