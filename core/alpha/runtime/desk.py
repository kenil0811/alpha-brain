"""The desk (section C, Q107): Home's session kept open in the core, the one voice.

Every sentence the person types goes to one long-lived client of the Claude Agent SDK, resumed
on Home's session, instead of a client made and closed per turn. Work longer than a few steps
runs beside it as the SDK's own background subagents (the `Agent` tool with
`run_in_background`), so the desk answers the next sentence while it runs. The spike of 20 Oct
2026 (`docs/log/2026-10-20-section-c-spike.md`) settled how this behaves:

- a background subagent's calls reach the hooks and the permission callback with its id
  (`agent_id`, the same as its task's id), and a hand call carries Claude Code's own id for
  it (`claudecode/toolUseId`), so each call is bound to the thread it serves;
- its completion arrives on the client's stream while no query is in flight, and Claude Code
  then takes a turn of the desk by itself, whose prompt is the `<task-notification>`; that
  turn writes the outcome in the desk's own words;
- a subagent that backgrounds its own shell finishes early and again later, so a shell call
  always runs in the foreground.

One reader follows the client's whole stream. Each turn of the session, the person's or one
it takes on finished work, begins with UserPromptSubmit and ends with a result message, in the
order they began; the reader settles them in that order. Each piece of work is a thread of
kind `work` (`session_ref` the task's id), opened when its task starts, its steps journaled
under it, settled when it ends with its last message as its outcome. The window shows these
threads; no sentence is routed to one.

What the desk does not keep across a restart: running work lives in the CLI's process, so it
ends with the core (`conversations.reset_working` says so on the thread).
"""

from __future__ import annotations

import asyncio
import logging
import re
import threading
import time
import uuid
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field, replace
from pathlib import Path
from typing import Any

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeSDKClient,
    HookContext,
    HookMatcher,
    ResultMessage,
    SystemMessage,
    UserMessage,
)
from claude_agent_sdk.types import (
    StreamEvent,
    SyncHookJSONOutput,
    TaskNotificationMessage,
    TaskProgressMessage,
    TaskStartedMessage,
    TaskUpdatedMessage,
)

from alpha.runtime import engine, route
from alpha.runtime.running import LIVE, SILENCE_S, RunResult, TurnRequest
from alpha.world import grants
from alpha.world.modfiles import skills_at
from alpha.world.world import World

log = logging.getLogger(__name__)

# Claude Code's own prompt for a turn it takes on finished work (the spike: the
# UserPromptSubmit of that turn carries it); its task ids say which work finished
NOTIFIED = "<task-notification>"
TASK_ID = re.compile(r"<task-id>\s*([^<\s]+)\s*</task-id>")
# the session's id for work the desk started (a thread's `session_tools`): never resumed as a
# conversation, stopped with a line when the core starts again
WORK = "desk-work"
# the SDK's own hand for messaging running work (C0's question c)
MESSAGE = "SendMessage"


@dataclass
class Turn:
    """One turn of the desk's session: the person's sentence (`req`, `done`), or one Claude
    Code took on finished work (`tasks`)."""

    keys: list[str]
    req: TurnRequest | None = None
    done: asyncio.Future[RunResult] | None = None
    tasks: list[str] = field(default_factory=list)
    tools: dict[str, Any] = field(default_factory=lambda: {"called": 0, "failed": 0,
                                                            "first": ""})
    started_at: float = field(default_factory=time.time)
    said: str | None = None  # the journal line that began it (a work turn's `did`)


class Desk:
    """Home's session, kept open: one per world, on a thread and event loop of its own."""

    def __init__(self, world_path: Path, *, client_factory: Any = ClaudeSDKClient,
                 apart: Any = None) -> None:
        self.world_path = Path(world_path)
        self.client_factory = client_factory
        # what runs apart from the desk's session: a judge, a checkpoint, a second opinion
        self.apart = apart
        self.loop = asyncio.new_event_loop()
        self.thread = threading.Thread(target=self.loop.run_forever, daemon=True,
                                       name="alpha-desk")
        self.thread.start()
        self.world: World | None = None  # the desk's own writes, opened on its thread
        self.client: Any = None
        self.served: engine.Served | None = None
        self.executor: ThreadPoolExecutor | None = None
        self.reader: asyncio.Task[None] | None = None
        self.session: str | None = None  # the session the client was connected on
        self.connected_as: tuple[str, tuple[str, ...]] | None = None  # fingerprint, skills
        self.fresh = False  # connected on no session: its first sentence gets the start layer
        self.sent: deque[Turn] = deque()  # the person's, sent, their prompt not yet given
        self.turns: deque[Turn] = deque()  # begun, in order, waiting for their results
        self.calls: dict[str, str | None] = {}  # a call's id → the agent (work) making it
        self.agent_calls: dict[str, dict[str, Any]] = {}  # the Agent call's id → its origin
        self.work: dict[str, str] = {}  # a task's id → its thread
        self.origin: dict[str, dict[str, Any]] = {}  # a task's id → the turn and module asking
        self.last_message = time.time()
        self.home: str | None = None  # Home's thread, read once on the desk's thread

    # ---- from the core's threads ----

    def run(self, req: TurnRequest) -> RunResult:
        """A person's sentence as a turn of the desk (a `turn.Runner`): blocks the caller's
        thread until the desk's turn ends. Any other run a turn makes with the same runner (a
        judge, Watson's checkpoint after a compaction, the checkpoint a fresh session carries)
        runs apart, never in the desk's session (found 20 Oct 2026: a checkpoint's prompt
        went into the conversation as a sentence)."""
        if req.kind != "turn" or not req.persist:
            return (self.apart or route.run)(req)
        return asyncio.run_coroutine_threadsafe(self._run(req), self.loop).result()

    def running_work(self) -> list[str]:
        """The threads of the work running now."""
        world = self._world()
        return [tid for tid in self.work.values()
                if world.modules.thread(tid)["state"] in ("working", "needs_you")]

    def stop_work(self, thread: str) -> bool:
        """The person's Stop on a piece of work: the SDK stops its task."""
        task = next((t for t, tid in self.work.items() if tid == thread), None)
        if task is None or self.client is None:
            return False
        asyncio.run_coroutine_threadsafe(self.client.stop_task(task), self.loop).result()
        return True

    def close(self) -> None:
        async def down() -> None:
            if self.reader is not None:
                self.reader.cancel()
            if self.client is not None:
                try:
                    await self.client.disconnect()
                except Exception:
                    log.exception("closing the desk's client")
            self.client = None
        try:
            asyncio.run_coroutine_threadsafe(down(), self.loop).result(timeout=10)
        except Exception:
            log.exception("closing the desk")
        self.loop.call_soon_threadsafe(self.loop.stop)

    # ---- on the desk's loop ----

    def _world(self) -> World:
        if self.world is None:
            self.world = World(self.world_path)
        return self.world

    async def _run(self, req: TurnRequest) -> RunResult:
        try:
            await self._ensure(req)
        except Exception as e:  # the SDK's own errors: the process, the connection
            log.warning("the desk could not connect: %s", e)
            self.client = None
            return engine.outcome_of(None, failure=str(e), tools={}, stopped=False,
                                     stalled=False, first_text_at=None, started_at=time.time())
        # the start layer only for a session's first sentence: a resumed one holds it
        req = replace(req, resume=None if self.fresh else (self.session or req.resume),
                      injected=req.injected)
        done: asyncio.Future[RunResult] = self.loop.create_future()
        turn = Turn(keys=engine._keys(req), req=req, done=done)
        LIVE.add_handle(turn.keys, self._stop_handle)
        self.sent.append(turn)
        self.last_message = time.time()
        try:
            await self.client.query(req.sentence)
            while not done.done():
                await asyncio.wait({done}, timeout=5)
                quiet = time.time() - self.last_message
                if not done.done() and quiet > SILENCE_S \
                        and not engine.PENDING.waiting(self.loop):
                    log.warning("the desk went silent for %ss", SILENCE_S)
                    self._forget(turn)
                    await self._drop_client()
                    done.set_result(engine.outcome_of(
                        None, failure=None, tools=turn.tools, stopped=False, stalled=True,
                        first_text_at=None, started_at=turn.started_at))
        except Exception as e:
            log.warning("the desk's turn %s failed: %s", req.turn_id, e)
            self._forget(turn)
            await self._drop_client()
            if not done.done():
                done.set_result(engine.outcome_of(
                    None, failure=str(e), tools=turn.tools, stopped=False, stalled=False,
                    first_text_at=None, started_at=turn.started_at))
        result = done.result()
        if self.fresh and result.ok:
            self.fresh = False
        if result.session_id:
            self.session = result.session_id
        return result

    def _forget(self, turn: Turn) -> None:
        for queue in (self.sent, self.turns):
            if turn in queue:
                queue.remove(turn)

    def _interrupt(self) -> None:
        if self.client is not None:
            self.loop.create_task(self.client.interrupt())

    def _stop_handle(self) -> None:
        """The person's Stop on the desk's turn, from any thread."""
        self.loop.call_soon_threadsafe(self._interrupt)

    async def _drop_client(self) -> None:
        if self.reader is not None:
            self.reader.cancel()
            self.reader = None
        if self.client is not None:
            try:
                await self.client.disconnect()
            except Exception:
                log.exception("dropping the desk's client")
        self.client = None
        if self.executor is not None:
            self.executor.shutdown(wait=False)
            self.executor = None
        if self.served is not None:
            self.served.world.close()
            self.served = None

    async def _ensure(self, req: TurnRequest) -> None:
        """The client, connected on the session the sentence's turn found for Home. A change of
        hands, skills or how the world is given (A12's fingerprint) connects again, on the
        same session where it can be resumed, but only when no work runs: the work lives in
        the client's process."""
        world = self._world()
        self.home = str(world.modules.home_thread()["id"])
        workdir = grants.module_dir(world, None)
        world.files.sync()  # the desk's directory links every module's skills (Q107)
        wanted = (engine.fingerprint(), tuple(skills_at(workdir)))
        if self.client is not None:
            changed = wanted != self.connected_as or (req.resume is None and not self.fresh
                                                     and self.session is not None)
            if not changed or self.running_work():
                return
            await self._drop_client()
        if engine.server_builder is None:
            raise RuntimeError(engine.NO_TOOLS)
        self.executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="alpha-desk-tools")
        base = replace(req, persist=True)
        self.served = await engine.server_builder(base, self.executor)
        self.served.binding["of"] = self._binding_of
        hands = [t.name for t in self.served.tools]
        options = engine.options_for(
            base, self.served.config, self._hooks(), hands=hands, can_use=self._can_use,
            cwd=workdir,
            add_dirs=[*grants.folders(world), *self._module_dirs(world)],
            hosts=self._hosts(world), skills=list(wanted[1]))
        options.allowed_tools = [*options.allowed_tools, MESSAGE]
        options.disallowed_tools = [t for t in options.disallowed_tools if t != MESSAGE]
        self.client = self.client_factory(options)
        await self.client.connect()
        self.session = req.resume
        self.fresh = req.resume is None
        self.connected_as = wanted
        self.reader = self.loop.create_task(self._read())

    @staticmethod
    def _module_dirs(world: World) -> list[Path]:
        return [world.files.dir_of(m["id"]) for m in world.modules.all()]

    @staticmethod
    def _hosts(world: World) -> list[str]:
        """Every host a module's scripts or the world's may reach: one desk serves them all."""
        found = set(grants.hosts(world, None))
        for m in world.modules.all():
            found.update(grants.hosts(world, m["id"]))
        return sorted(found)

    # ---- who a call serves ----

    def _binding_of(self, use_id: str | None) -> dict[str, Any] | None:
        """The turn, thread and module a hand call serves: work's own thread for a call its
        subagent makes, else the desk's turn now."""
        # called on the tools' own thread: it only reads what the desk's thread wrote
        agent = self.calls.get(use_id or "")
        if agent:
            return self._work_binding(agent)
        turn = self._now()
        if turn is None or turn.req is None:
            return {"turn": turn.said if turn else None, "thread": self.home, "module": None}
        return {"turn": turn.req.turn_id, "thread": turn.req.thread_id,
                "module": turn.req.module_id}

    def _work_binding(self, task: str) -> dict[str, Any]:
        origin = self.origin.get(task, {})
        return {"turn": origin.get("turn"), "thread": self.work.get(task) or self.home,
                "module": origin.get("module")}

    def _now(self) -> Turn | None:
        """The desk's turn now: the one begun first, else the sentence sent whose turn began
        with no prompt hook (a slash command such as `/compact`, whose own hooks run first)."""
        return self.turns[0] if self.turns else (self.sent[0] if self.sent else None)

    def _req_for(self, agent: str | None) -> TurnRequest:
        """A request standing for the call being asked about: the desk's turn, or the work's."""
        world = self._world()
        turn = self._now()
        base = turn.req if turn and turn.req else TurnRequest(
            sentence="", system="", world_path=self.world_path,
            turn_id=turn.said if turn and turn.said else "desk",
            thread_id=world.modules.home_thread()["id"], persist=True)
        if not agent:
            return base
        found = self._work_binding(agent)
        return replace(base, turn_id=found["turn"] or base.turn_id, thread_id=found["thread"],
                       module_id=found["module"])

    async def _can_use(self, tool_name: str, input_data: dict[str, Any], context: Any) -> Any:
        agent = getattr(context, "agent_id", None)
        req = self._req_for(agent)
        return await engine.permission_for(req, self._world())(tool_name, input_data, context)

    # ---- the hooks ----

    def _hooks(self) -> dict[str, list[HookMatcher]]:
        desk = self

        async def sentence_given(input_data: Any, tool_use_id: str | None,
                                 context: HookContext) -> SyncHookJSONOutput:
            prompt = str((input_data or {}).get("prompt") or "")
            if prompt.lstrip().startswith(NOTIFIED):
                desk._work_turn(TASK_ID.findall(prompt))
                return {}
            if not desk.sent:
                log.warning("the desk began a turn nobody sent")
                desk._work_turn([])
                return {}
            turn = desk.sent.popleft()
            desk.turns.append(turn)
            req = turn.req
            assert req is not None
            given = [req.turn_layer] if req.resume else [req.start_layer, req.turn_layer]
            given = [g for g in given if g]
            if not given:
                return {}
            req.injected.append("turn" if req.resume else "start")
            return {"hookSpecificOutput": {"hookEventName": "UserPromptSubmit",
                                           "additionalContext": "\n\n".join(given)}}

        async def before_call(input_data: Any, tool_use_id: str | None,
                              context: HookContext) -> SyncHookJSONOutput:
            data = input_data or {}
            agent = data.get("agent_id")
            name = str(data.get("tool_name") or "")
            call = dict(data.get("tool_input") or {})
            if tool_use_id:
                desk.calls[tool_use_id] = agent
            if agent:
                desk._thread_of(agent)  # work's thread, opened by its first call if need be
            if name in ("Agent", "Task") and not agent and tool_use_id:
                # work the desk starts: where it came from, for its thread
                turn = desk.turns[0] if desk.turns else None
                desk.agent_calls[tool_use_id] = {
                    "title": str(call.get("description") or "Work"),
                    "brief": str(call.get("prompt") or ""),
                    "turn": turn.req.turn_id if turn and turn.req else None,
                    "module": turn.req.module_id if turn and turn.req else None}
            if name == "Bash" and call.get("run_in_background"):
                # a shell in the background finishes work early, then again later (the
                # spike): it runs in the foreground, and the work waits for it
                call["run_in_background"] = False
                return {"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                               "permissionDecision": "allow",
                                               "updatedInput": call}}
            return {}

        hooks = engine._hooks(_Current(self))  # type: ignore[arg-type]
        hooks["UserPromptSubmit"] = [HookMatcher(matcher=None, hooks=[sentence_given])]
        # the desk's own work runs in the background: S2's foreground hook is the runs' alone
        hooks["PreToolUse"] = [HookMatcher(matcher=None, hooks=[before_call])]
        # A removal waits on its card while the desk's turn stays open, as a host's card and a
        # helper's removal do: a deferred call resumes only when a new process takes the
        # session up (P3 item 7), never in a kept one (removal_waits_on_its_card, 20 Oct 2026:
        # the yes began a new turn, and the model asked again on a second card).
        return hooks

    # ---- the stream ----

    async def _read(self) -> None:
        assert self.client is not None
        try:
            async for message in self.client.receive_messages():
                self.last_message = time.time()
                try:
                    self._absorb(message)
                except Exception:  # a message the desk can't read is skipped, never its end
                    log.exception("the desk could not read %r", message)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            log.warning("the desk's stream ended: %s", e)
        # the stream ended: every turn waiting on it ends too, and the next sentence connects
        for turn in [*self.turns, *self.sent]:
            if turn.done is not None and not turn.done.done():
                turn.done.set_result(engine.outcome_of(
                    None, failure="The conversation's process ended.", tools=turn.tools,
                    stopped=False, stalled=False, first_text_at=None,
                    started_at=turn.started_at))
        self.turns.clear()
        self.sent.clear()
        self.client = None

    def _absorb(self, message: Any) -> None:
        if isinstance(message, TaskStartedMessage):
            self._task_started(message)
            return
        if isinstance(message, TaskProgressMessage):
            self._task_progress(message)
            return
        if isinstance(message, TaskNotificationMessage):
            self._task_ended(message.task_id, message.status, message.summary)
            return
        if isinstance(message, TaskUpdatedMessage):
            if message.status in ("killed", "failed") and message.task_id in self.work:
                self._task_ended(message.task_id, "stopped" if message.status == "killed"
                                 else "failed", "")
            return
        if isinstance(message, SystemMessage):
            return
        if isinstance(message, (AssistantMessage, UserMessage, StreamEvent)) \
                and getattr(message, "parent_tool_use_id", None):
            return  # a subagent's own message: its steps are its thread's
        if not self.turns and self.sent:
            # a sentence whose turn began with no UserPromptSubmit: a slash command such as
            # `/compact` (found by compaction_keeps_what_was_made, 20 Oct 2026: the desk waited
            # out its silence limit for a result it had read as nobody's)
            self.turns.append(self.sent.popleft())
        turn = self.turns[0] if self.turns else None
        if turn is None:
            return
        on_step = turn.req.on_step if turn.req else None
        final = engine.absorb(message, turn.keys, turn.tools, on_step)
        if isinstance(final, ResultMessage):
            self.turns.popleft()
            self._turn_ended(turn, final)

    def _turn_ended(self, turn: Turn, final: ResultMessage) -> None:
        first_text_at = (LIVE.progress_for(turn.keys[0]) or {}).get("first_text_at")
        stopped = LIVE.remove_handle(turn.keys)
        result = engine.outcome_of(final, failure=None, tools=turn.tools, stopped=stopped,
                                   stalled=False, first_text_at=first_text_at,
                                   started_at=turn.started_at)
        if turn.done is not None:
            if not turn.done.done():
                turn.done.set_result(result)
            return
        self._work_reported(turn, result)

    # ---- work beside the desk ----

    def _thread_of(self, task: str) -> str:
        found = self.work.get(task)
        if found:
            return found
        world = self._world()
        origin = self.origin.setdefault(task, {})
        thread = world.modules.open_thread(origin.get("title") or "Work", "work",
                                           origin.get("module"))
        world.modules.set_session(thread["id"], task, tools=WORK)
        world.modules.update_thread(thread["id"], state="working", last_line="Started")
        self.work[task] = thread["id"]
        return str(thread["id"])

    def _task_started(self, m: TaskStartedMessage) -> None:
        world = self._world()
        origin = self.agent_calls.pop(m.tool_use_id or "", None)
        if m.task_id in self.work:
            if origin is None:  # running again: a message reached it, or its own wait ended
                world.modules.update_thread(self.work[m.task_id], state="working")
                return
        if origin is None and m.task_id not in self.work \
                and any(w in (m.task_type or "").lower() for w in ("bash", "shell")):
            return  # a shell in the background is not work beside the desk
        origin = origin or {"title": m.description or "Work"}
        self.origin[m.task_id] = {**self.origin.get(m.task_id, {}), **origin,
                                  "title": origin.get("title") or m.description or "Work"}
        thread = self._thread_of(m.task_id)
        title = self.origin[m.task_id]["title"]
        world.modules.retitle(thread, title, by_person=False)
        home = world.modules.home_thread()["id"]
        world.journal.append("did", f"Started work beside the conversation: {title}",
                             actor="alpha", thread=home, module=origin.get("module"),
                             data={"work": thread, "task": m.task_id,
                                   "turn": origin.get("turn")})
        if origin.get("brief"):
            world.journal.append("did", f"Asked to: {origin['brief']}", actor="alpha",
                                 thread=thread, module=origin.get("module"),
                                 data={"work": thread, "task": m.task_id, "brief": True,
                                       "turn": origin.get("turn")})

    def _task_progress(self, m: TaskProgressMessage) -> None:
        thread = self.work.get(m.task_id)
        if thread is None or not m.description:
            return
        world = self._world()
        if world.modules.thread(thread).get("last_line") == m.description:
            return
        world.modules.update_thread(thread, state="working", last_line=m.description)
        world.journal.append("did", m.description, actor="alpha", thread=thread,
                             module=self.origin.get(m.task_id, {}).get("module"),
                             data={"work": thread, "task": m.task_id, "step": True,
                                   "turn": self.origin.get(m.task_id, {}).get("turn")})

    def _task_ended(self, task: str, status: str, summary: str) -> None:
        thread = self.work.get(task)
        if thread is None:
            return
        world = self._world()
        row = world.modules.thread(thread)
        if row["state"] in ("done", "stopped") and not summary:
            return
        state = "done" if status == "completed" else "stopped"
        first = next((ln.strip(" *#") for ln in (summary or "").splitlines() if ln.strip()), "")
        world.modules.update_thread(thread, state=state,
                                    last_line=first[:200] or ("Finished." if state == "done"
                                                              else "Stopped."))
        if summary:
            # the work's outcome: its last message, a paragraph, never its transcript (C2)
            world.journal.append("replied", summary, actor="alpha", thread=thread,
                                 module=self.origin.get(task, {}).get("module"),
                                 data={"work": thread, "task": task, "outcome": True,
                                       "status": status,
                                       "turn": self.origin.get(task, {}).get("turn")})

    def _work_turn(self, tasks: list[str]) -> None:
        """Claude Code took a turn of the desk on finished work: the stream says which."""
        world = self._world()
        home = world.modules.home_thread()["id"]
        threads = [self.work[t] for t in tasks if t in self.work]
        titles = [world.modules.thread(t)["title"] for t in threads]
        said = world.journal.append(
            "did", "Work finished: " + ("; ".join(titles) if titles else "a piece of work"),
            actor="alpha", thread=home, data={"work": threads, "tasks": tasks})
        turn = Turn(keys=[said, f"desk:{uuid.uuid4().hex[:8]}"], tasks=tasks, said=said)
        LIVE.add_handle(turn.keys, self._stop_handle)
        self.turns.append(turn)

    def _work_reported(self, turn: Turn, result: RunResult) -> None:
        """The desk's own words on finished work, in the stream as its reply (C2)."""
        world = self._world()
        home = world.modules.home_thread()["id"]
        threads = [self.work[t] for t in turn.tasks if t in self.work]
        data = {"turn": turn.said, "work": threads, "session_id": result.session_id,
                "duration_ms": result.duration_ms}
        if result.ok and result.reply.strip():
            world.journal.append("replied", result.reply, actor="alpha", thread=home,
                                 data=data)
            world.modules.update_thread(home, last_line=result.reply.strip().splitlines()[0]
                                        [:200])
        elif not result.ok and not result.stopped:
            world.journal.append("failed", f"That didn't work: {result.error}", actor="alpha",
                                 thread=home, data={**data, "error": result.error})


class _Current:
    """The desk's turn now, standing in for one request where the engine's own hooks read one
    (the compaction's guidance, the deferred removal's card): attributes are read at the
    moment of the call."""

    def __init__(self, desk: Desk) -> None:
        self._desk = desk

    def __getattr__(self, name: str) -> Any:
        return getattr(self._desk._req_for(None), name)


DESKS: dict[str, Desk] = {}
_lock = threading.Lock()


def of(world: World) -> Desk:
    """The desk of a world, made on its first sentence and kept for the core's life."""
    key = str(Path(world.path).resolve())
    with _lock:
        found = DESKS.get(key)
        if found is None:
            found = DESKS[key] = Desk(Path(world.path))
        return found


def close_all() -> None:
    with _lock:
        desks = list(DESKS.values())
        DESKS.clear()
    for desk in desks:
        desk.close()
