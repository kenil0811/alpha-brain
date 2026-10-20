"""The world's tools served inside the core's own process, for the SDK engine (harness slice 1).

The stdio server (`alpha.mcp.server`) is started by the CLI route as a child process and told
its turn through the environment. The SDK engine runs in this process, so the tools are built
here, bound to the turn, and handed to the SDK as an in-process MCP server: the same names,
the same words, fastmcp validating the arguments and serialising the result as before, each
call on a worker thread so a slow hand (a page read) never blocks the stream.

`runtime/` may not import `mcp/` (the layering), so this module registers itself with the
engine when the tools are imported (`alpha.mcp.tools`), which every process that runs a turn
does.
"""

from __future__ import annotations

import asyncio
import hashlib
from collections.abc import Awaitable, Callable
from concurrent.futures import ThreadPoolExecutor
from contextvars import ContextVar
from functools import partial
from typing import Any

from claude_agent_sdk import McpSdkServerConfig, SdkMcpTool
from fastmcp import FastMCP
from mcp.server.lowlevel import Server
from mcp.types import CallToolResult, ListToolsResult, Tool

from alpha.runtime import engine
from alpha.runtime.engine import Served
from alpha.runtime.running import TurnRequest
from alpha.world.world import World

# The call a hand is serving, by Claude Code's own id for it (its `_meta` carries
# "claudecode/toolUseId", seen in section C's spike of 20 Oct 2026): the desk says from it
# which thread and turn the call belongs to, its own or a piece of work beside it.
CALL: ContextVar[str | None] = ContextVar("alpha_call", default=None)
USE_ID = "claudecode/toolUseId"


def _handler(fast_tool: Any, executor: ThreadPoolExecutor,
             bind: Callable[[str | None], None] | None = None,
             ) -> Callable[[Any], Awaitable[dict[str, Any]]]:
    async def call(args: Any) -> dict[str, Any]:
        loop = asyncio.get_running_loop()
        use_id = CALL.get()

        def work() -> Any:
            if bind is not None:
                # one worker runs the calls one at a time, so the tools are bound to this
                # call's thread and turn right before it runs
                bind(use_id)
            return asyncio.run(fast_tool.run(dict(args or {})))

        try:
            result = await loop.run_in_executor(executor, work)
        except Exception as e:  # the model reads the problem and corrects itself
            return {"content": [{"type": "text", "text": f"{type(e).__name__}: {e}"}],
                    "is_error": True}
        content = [{"type": "text", "text": c.text} for c in result.content
                   if getattr(c, "type", "") == "text"]
        return {"content": content or [{"type": "text", "text": "ok"}]}

    return call


async def alpha_server(tools_cls: type[Any], req: TurnRequest,
                       executor: ThreadPoolExecutor) -> Served:
    """Alpha's tools for this turn as an in-process MCP server, bound to the turn, thread,
    module and actor as the stdio server was through its environment. The World opened here
    is the caller's to close when the run ends."""
    world = World(req.world_path)
    tools = tools_cls(world, turn=req.turn_id, thread=req.thread_id, module=req.module_id,
                      actor=req.actor, run=req.run)
    binding: dict[str, Any] = {}

    def bind(use_id: str | None) -> None:
        # the desk (section C) sets `of`: a call's id → the turn, thread and module it serves;
        # a run of its own never sets it, and its tools stay bound to its request
        of = binding.get("of")
        found = of(use_id) if of is not None else None
        if found:
            for key in ("turn", "thread", "module"):
                setattr(tools, key, found.get(key))

    fast = FastMCP("alpha")
    served: list[SdkMcpTool[Any]] = []
    cards: set[str] = set()
    for fn in tools.all():
        fast.tool(fn)
        fast_tool = await fast.get_tool(fn.__name__)
        assert fast_tool is not None
        served.append(SdkMcpTool(name=fn.__name__, description=fast_tool.description or "",
                                 input_schema=dict(fast_tool.parameters),
                                 handler=_handler(fast_tool, executor, bind)))
        if getattr(fn, "card", False):
            cards.add(fn.__name__)
    return Served(server_of("alpha", served, cards), world, served, binding)


# Claude Code's key in a tool's `_meta`: the tool is always in front of the model, never
# deferred behind tool search (read in the bundled CLI, 19 Oct 2026). The SDK's own server
# helper carries no such key, so Alpha builds the server itself, with mcp's own `Server`, as
# the SDK documents ("bringing your own server").
ALWAYS_LOADED = "anthropic/alwaysLoad"


def server_of(name: str, tools: list[SdkMcpTool[Any]], cards: set[str]) -> McpSdkServerConfig:
    """An in-process MCP server listing `tools`, the hands that put a card to the person
    (`cards`) marked always loaded; each call goes to the tool's own handler (fastmcp checks
    the arguments there, and a problem comes back as an error result the model reads)."""
    listed = [Tool.model_validate({"name": t.name, "description": t.description,
                                   "inputSchema": t.input_schema,
                                   "_meta": {ALWAYS_LOADED: True} if t.name in cards else None})
              for t in tools]
    by_name = {t.name: t for t in tools}

    async def on_list_tools(ctx: Any, params: Any) -> ListToolsResult:
        return ListToolsResult(tools=listed)

    async def on_call_tool(ctx: Any, params: Any) -> CallToolResult:
        found = by_name.get(params.name)
        if found is None:
            return CallToolResult.model_validate({"content": [
                {"type": "text", "text": f"There is no hand called {params.name}."}],
                "isError": True})
        meta: Any = getattr(params, "meta", None)
        extra = meta.model_dump() if meta is not None and hasattr(meta, "model_dump") else {}
        token = CALL.set(extra.get(USE_ID))
        try:
            result = await found.handler(params.arguments or {})
        finally:
            CALL.reset(token)
        return CallToolResult.model_validate({"content": result.get("content", []),
                                              "isError": bool(result.get("is_error", False))})

    server: Any = Server(name, version="1.0.0", on_list_tools=on_list_tools,
                         on_call_tool=on_call_tool)
    return McpSdkServerConfig(type="sdk", name=name, instance=server)


def install(tools_cls: type[Any]) -> None:
    """Make the engine serve `tools_cls` (the world's `Tools`) to every turn it runs, and
    tell it the fingerprint of those hands: their names only (A12, Q98), so a docstring edited
    or an optional parameter added keeps every open session; only a hand added, renamed or
    gone starts a fresh one (P5, P7 and P8 each reset every conversation by a parameter)."""
    engine.server_builder = partial(alpha_server, tools_cls)
    engine.tools_fingerprint = fingerprint_of(tools_cls)


def fingerprint_of(tools_cls: type[Any]) -> str:
    """The served hands' names, sorted, hashed (A12)."""
    served = sorted(name for name in dir(tools_cls)
                    if getattr(getattr(tools_cls, name, None), "served", False))
    return hashlib.sha256("\n".join(served).encode()).hexdigest()[:12]
