"""Run one model turn through the Claude Agent SDK on the person's subscription (the harness
design §3; slice 1, 17 October 2026).

The request and the result are the CLI route's (`claude_cli.TurnRequest`, `RunResult`), so
everything above (`turn.ask`, the agents, the journeys) is unchanged. What differs underneath:
the SDK's own bundled Claude Code runs the turn; the world's tools are served in this process
(no second process, the same names); a live conversation resumes its own session; the stream
is mapped onto what the window shows (`claude_cli.LIVE`); the person's stop interrupts the
session; a run that says nothing for `SILENCE_S` is ended as before.

Found by the spikes (`docs/log/2026-10-17-harness-slice1-spikes.md`): `strict_mcp_config`
must be on, else the person's own claude.ai connectors join the session; the subscription
sign-in lives in the default config home, so `CLAUDE_CONFIG_DIR` is never set; `USER` must be.
"""

from __future__ import annotations

import asyncio
import getpass
import logging
import threading
import time
import uuid
from collections.abc import Awaitable, Callable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from claude_agent_sdk import (
    AssistantMessage,
    ClaudeAgentOptions,
    ClaudeSDKClient,
    HookContext,
    HookMatcher,
    PermissionResultAllow,
    PermissionResultDeny,
    ResultMessage,
    StreamEvent,
    TextBlock,
    ToolResultBlock,
    ToolUseBlock,
    UserMessage,
)
from claude_agent_sdk.types import McpSdkServerConfig, SyncHookJSONOutput

from alpha import config
from alpha.runtime.claude_cli import (
    DENIED,
    LIVE,
    NO_ANSWER,
    SIGNED_OUT,
    SILENCE_S,
    STALLED,
    STOPPED,
    RunResult,
    TurnRequest,
    parse_result,
    plain_tool,
    tools_allowed,
    tools_verdict,
)
from alpha.world.world import World

log = logging.getLogger(__name__)

COMPACTED = "Summarising the earlier steps to make room"
# A client the tests swap for a scripted one: anything with the SDK client's `query`,
# `receive_response` and `interrupt`, usable as an async context manager.
ClientFactory = Callable[[ClaudeAgentOptions], Any]


def environment(req: TurnRequest) -> dict[str, str]:
    """What the session's process gets on top of the core's own environment (the SDK merges it
    over `os.environ`)."""
    return {"USER": getpass.getuser(), "ENABLE_TOOL_SEARCH": "false"}


def sessions_dir(world_path: Path) -> Path:
    """Where a turn runs when it has no workspace: one directory beside the world, so every
    session's transcript sits under one project key of the default config home, apart from
    the person's own sessions."""
    path = Path(world_path).parent / "sessions"
    path.mkdir(parents=True, exist_ok=True)
    return path


def options_for(req: TurnRequest, server: McpSdkServerConfig | None = None,
                hooks: dict[str, list[HookMatcher]] | None = None,
                hands: list[str] | None = None,
                can_use: Callable[..., Awaitable[Any]] | None = None) -> ClaudeAgentOptions:
    """The SDK's options for a request: the same tools, walls and session rules the CLI route
    passed as flags. With `hands` (the served tools' names) and `can_use`, a turn runs in the
    default mode: every hand but the gated ones is allowed outright, the gated ones reach the
    callback (harness design §8)."""
    allowed = tools_allowed(req)
    if hands is not None and req.kind == "turn":
        allowed = [f"mcp__alpha__{h}" for h in hands if h not in GATED] + ["WebSearch", "WebFetch"]
    denied = list(DENIED)
    if not allowed:
        denied += ["WebSearch", "WebFetch"]
    # With no callback nothing may prompt; with one, the prompts are the callback's (the flag
    # would block a gated call instead: found 17 Oct, "this session has no way to ask").
    extra: dict[str, str | None] = {} if can_use is not None else {"permission-prompts": "none"}
    if not req.persist:
        # Stateless unless a live conversation (Q21): a remembered session would bring back
        # whatever the model once believed.
        extra["no-session-persistence"] = None
    kw: dict[str, Any] = {
        "model": req.model or config.model_for("turn"),
        # Claude Code's own system prompt with Alpha's rules and the pre-pack after it, as
        # `--append-system-prompt` did.
        "system_prompt": {"type": "preset", "preset": "claude_code", "append": req.system},
        "allowed_tools": allowed,
        "disallowed_tools": denied,
        # dontAsk: anything not allowed is refused rather than prompted for; with the callback,
        # the default mode, so a gated hand asks (the person's card) instead.
        "permission_mode": "default" if can_use is not None else "dontAsk",
        "setting_sources": [],
        "strict_mcp_config": True,
        "include_partial_messages": True,
        "mcp_servers": {"alpha": server} if server is not None else {},
        "env": environment(req),
        "extra_args": extra,
        "cwd": str(sessions_dir(req.world_path)),
        "resume": req.resume,
    }
    if hooks:
        kw["hooks"] = hooks
    if can_use is not None:
        kw["can_use_tool"] = can_use
    return ClaudeAgentOptions(**kw)


# ---- the world's tools ----

# Who serves the world's tools to a turn: `alpha.mcp.inprocess.install` sets this when the
# tools are imported (`runtime/` may not import `mcp/`). A turn with nothing installed fails
# in words rather than running without its hands.
@dataclass
class Served:
    """What the tools' server gives a run: the SDK's server config, the World the tools are
    bound to (closed when the run ends), and the tools themselves (for tests and listings)."""

    config: McpSdkServerConfig
    world: World
    tools: list[Any] = field(default_factory=list)


ServerBuilder = Callable[[TurnRequest, ThreadPoolExecutor], Awaitable[Served]]
server_builder: ServerBuilder | None = None
NO_TOOLS = "Alpha's tools are not wired into this process, so the turn did not run."


# ---- the person's yes (harness design §8; slice 2b, step 3) ----

# The hands that reach the permission callback instead of running at once: everything else is
# allowed outright. `world_change` asks when it removes a row; `act_outward` passes through
# (its card is the gate today) and is the hook for the deferred yes later.
GATED = ("world_change", "act_outward")
WAITING = "Waiting for your yes"
NO = "You said no: nothing changed."


class Pending:
    """Permissions waiting on the person: a card asked in the journal, a future the answer
    route resolves from any thread. A pending one counts as the run being alive, not silent."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.futures: dict[str, tuple[asyncio.AbstractEventLoop, asyncio.Future[str]]] = {}

    def add(self, ask_id: str, loop: asyncio.AbstractEventLoop, fut: asyncio.Future[str]) -> None:
        with self.lock:
            self.futures[ask_id] = (loop, fut)

    def answer(self, ask_id: str, text: str) -> bool:
        """The person's answer to a permission card; True when one was waiting for it."""
        with self.lock:
            found = self.futures.pop(ask_id, None)
        if found is None:
            return False
        loop, fut = found

        def settle() -> None:
            if not fut.done():
                fut.set_result(text)

        loop.call_soon_threadsafe(settle)
        return True

    def waiting(self, loop: asyncio.AbstractEventLoop) -> bool:
        with self.lock:
            return any(lp is loop for lp, _ in self.futures.values())

    def drop(self, loop: asyncio.AbstractEventLoop) -> None:
        with self.lock:
            mine = [k for k, (lp, _) in self.futures.items() if lp is loop]
            for ask_id in mine:
                _, fut = self.futures.pop(ask_id)

                def cancel(f: asyncio.Future[str] = fut) -> None:
                    if not f.done():
                        f.cancel()

                loop.call_soon_threadsafe(cancel)


PENDING = Pending()


def answer_permission(ask_id: str, text: str) -> bool:
    return PENDING.answer(ask_id, text)


def yes(text: str) -> bool:
    words = text.strip().lower()
    return words.startswith(("yes", "y ", "ok", "sure", "go ahead", "remove", "do it")) or \
        words in ("y", "yep", "yeah")


def permission_for(req: TurnRequest, world: World) -> Callable[..., Awaitable[Any]]:
    """The callback the SDK asks before a gated hand runs. A row removed from the person's
    tables is asked for on a card (the window answers it, or the person's Stop ends the wait);
    everything else is allowed."""

    async def can_use(tool_name: str, input_data: dict[str, Any], context: Any) -> Any:
        name = tool_name.removeprefix("mcp__alpha__")
        if name == "world_change" and input_data.get("remove"):
            table = str(input_data.get("table") or "the table")
            rid = str(input_data.get("id") or "")
            title = rid
            try:
                row = world.collections.get(table, rid)
                desc = world.collections.describe(table)
                title = str(row.get(desc.get("title_field") or "") or rid)
                table = str(desc.get("title") or table)
            except Exception:  # the operation itself says what is wrong with the row
                pass
            ask = world.journal.append(
                "asked", f"Remove \"{title}\" from {table}? It leaves the table; Activity keeps"
                         " that it was here.",
                data={"options": ["Yes, remove it", "No, keep it"], "kind": "one",
                      "turn": req.turn_id, "permission": name, "table": table, "record": rid},
                module=req.module_id, thread=req.thread_id)
            loop = asyncio.get_running_loop()
            fut: asyncio.Future[str] = loop.create_future()
            PENDING.add(ask, loop, fut)
            LIVE.note(_keys(req), doing=WAITING)
            try:
                answer = await fut
            except asyncio.CancelledError:
                return PermissionResultDeny(message="The wait for your yes was stopped.")
            if yes(answer):
                return PermissionResultAllow()
            return PermissionResultDeny(message=NO)
        return PermissionResultAllow()

    return can_use


# ---- the run ----


def _keys(req: TurnRequest) -> list[str]:
    if req.kind == "turn":
        return [k for k in (req.turn_id, req.thread_id) if k]
    return [f"{req.kind}:{req.turn_id}:{uuid.uuid4().hex[:8]}"]


def absorb(message: Any, keys: list[str], tools: dict[str, Any],
           on_step: Callable[[str], Any] | None) -> ResultMessage | None:
    """One message of the stream into what the window shows and the run's counts; the result
    message back when this was it."""
    if isinstance(message, StreamEvent):
        event = message.event
        start = event.get("content_block")
        if event.get("type") == "content_block_start" and isinstance(start, dict) \
                and start.get("type") == "text":
            LIVE.note(keys, partial="")
        elif event.get("type") == "content_block_delta":
            delta = event.get("delta")
            if isinstance(delta, dict) and delta.get("type") == "text_delta" and delta.get("text"):
                LIVE.add_text(keys, str(delta["text"]))
        return None
    if isinstance(message, AssistantMessage):
        for block in message.content:
            if isinstance(block, TextBlock) and block.text.strip():
                LIVE.note(keys, thought=block.text.strip()[:400])
            elif isinstance(block, ToolUseBlock):
                tools["called"] += 1
                words = plain_tool(block.name, block.input if isinstance(block.input, dict) else {})
                # The text so far was a thought before a step, not the reply.
                LIVE.note(keys, partial="", doing=words,
                          tools=(LIVE.progress_for(keys[0]) or {}).get("tools", 0) + 1)
                if on_step is not None:
                    try:
                        on_step(words)
                    except Exception:
                        log.exception("on_step")
        return None
    if isinstance(message, UserMessage) and isinstance(message.content, list):
        for block in message.content:
            if isinstance(block, ToolResultBlock) and block.is_error:
                tools["failed"] += 1
                if not tools["first"]:
                    body = block.content
                    if isinstance(body, list):
                        body = " ".join(str(b.get("text", "")) for b in body if isinstance(b, dict))
                    tools["first"] = " ".join(str(body or "").split())[:160]
        return None
    if isinstance(message, ResultMessage):
        return message
    return None


def result_data(final: ResultMessage) -> dict[str, Any]:
    """The result message in the shape `parse_result` reads (the CLI's result event)."""
    return {"subtype": final.subtype, "is_error": final.is_error, "result": final.result or "",
            "session_id": final.session_id, "num_turns": final.num_turns,
            "duration_ms": final.duration_ms, "total_cost_usd": final.total_cost_usd}


def _hooks(req: TurnRequest) -> dict[str, list[HookMatcher]]:
    async def compacted(input_data: Any, tool_use_id: str | None,
                        context: HookContext) -> SyncHookJSONOutput:
        if req.on_step is not None:
            try:
                req.on_step(COMPACTED)
            except Exception:
                log.exception("on_step")
        else:
            LIVE.note(_keys(req), doing=COMPACTED)
        return {}

    return {"PreCompact": [HookMatcher(matcher=None, hooks=[compacted])]}


async def run_async(req: TurnRequest, *,
                    client_factory: ClientFactory = ClaudeSDKClient) -> RunResult:
    keys = _keys(req)
    executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="alpha-tools")
    world: World | None = None
    server: McpSdkServerConfig | None = None
    tools: dict[str, Any] = {"called": 0, "failed": 0, "first": ""}
    final: ResultMessage | None = None
    stalled = False
    failure: str | None = None
    started_at = time.time()
    loop = asyncio.get_running_loop()
    client: Any = None
    wanted_stop = False

    def stop_now() -> None:
        # On the loop's thread: interrupt the session, or remember to as soon as there is one
        # (the person can press Stop while the tools are still being set up).
        nonlocal wanted_stop
        wanted_stop = True
        if client is not None:
            loop.create_task(client.interrupt())

    def stop_from_any_thread() -> None:
        loop.call_soon_threadsafe(stop_now)

    LIVE.add_handle(keys, stop_from_any_thread)
    try:
        hands: list[str] | None = None
        can_use: Callable[..., Awaitable[Any]] | None = None
        if req.kind == "turn":
            if server_builder is None:
                return RunResult(reply="", ok=False, error=NO_TOOLS)
            served = await server_builder(req, executor)
            server, world = served.config, served.world
            hands = [t.name for t in served.tools]
            can_use = permission_for(req, world)
        options = options_for(req, server, _hooks(req), hands=hands, can_use=can_use)
        async with client_factory(options) as c:
            client = c
            await c.query(req.sentence)
            if wanted_stop:
                await c.interrupt()
            messages = c.receive_response().__aiter__()
            while True:
                try:
                    message = await asyncio.wait_for(messages.__anext__(), timeout=SILENCE_S)
                except StopAsyncIteration:
                    break
                except TimeoutError:
                    if PENDING.waiting(loop):
                        continue  # a yes is being waited for: alive, not silent
                    stalled = True
                    break
                try:
                    found = absorb(message, keys, tools, req.on_step)
                except Exception:  # a message Alpha can't read is skipped, never the run's end
                    log.exception("unreadable message: %r", message)
                    continue
                if found is not None:
                    final = found
    except Exception as e:  # the SDK's own errors: the process, the connection, the parse
        log.warning("the model run %s failed: %s", req.turn_id, e)
        failure = str(e)
    finally:
        PENDING.drop(loop)
        first_text_at = (LIVE.progress_for(keys[0]) or {}).get("first_text_at")
        stopped = LIVE.remove_handle(keys)
        executor.shutdown(wait=False)
        if world is not None:
            world.close()
    if stopped:
        return RunResult(reply="", ok=False, error=STOPPED, stopped=True)
    if stalled and final is None:
        log.warning("run %s went silent for %ss and was ended", req.turn_id, SILENCE_S)
        return RunResult(reply="", ok=False, error=STALLED)
    if final is None:
        words = (failure or "").lower()
        signed_out = "not logged in" in words or "login" in words
        return RunResult(reply="", ok=False, error=SIGNED_OUT if signed_out else NO_ANSWER,
                         raw={"failure": failure} if failure else {})
    out = tools_verdict(parse_result(result_data(final), failure or "", 0),
                        tools["called"], tools["failed"], tools["first"])
    if first_text_at:
        out.first_text_ms = int((first_text_at - started_at) * 1000)
    return out


def run(req: TurnRequest, *, client_factory: ClientFactory = ClaudeSDKClient) -> RunResult:
    """Run one turn to its end, however long it takes; the person can stop it (`LIVE.stop`
    with the turn or its thread). Turns run on worker threads, each with a loop of its own;
    called from inside a running loop, the run goes to a thread of its own."""
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(run_async(req, client_factory=client_factory))
    with ThreadPoolExecutor(max_workers=1, thread_name_prefix="alpha-run") as pool:
        job = pool.submit(lambda: asyncio.run(run_async(req, client_factory=client_factory)))
        return job.result()
