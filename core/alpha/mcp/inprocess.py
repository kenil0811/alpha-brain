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
from collections.abc import Awaitable, Callable
from concurrent.futures import ThreadPoolExecutor
from functools import partial
from typing import Any

from claude_agent_sdk import SdkMcpTool, create_sdk_mcp_server
from fastmcp import FastMCP

from alpha.runtime import engine
from alpha.runtime.claude_cli import TurnRequest
from alpha.runtime.engine import Served
from alpha.world.world import World


def _handler(fast_tool: Any,
             executor: ThreadPoolExecutor) -> Callable[[Any], Awaitable[dict[str, Any]]]:
    async def call(args: Any) -> dict[str, Any]:
        loop = asyncio.get_running_loop()

        def work() -> Any:
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
                      actor=req.actor)
    fast = FastMCP("alpha")
    served: list[SdkMcpTool[Any]] = []
    for fn in tools.all():
        fast.tool(fn)
        fast_tool = await fast.get_tool(fn.__name__)
        assert fast_tool is not None
        served.append(SdkMcpTool(name=fn.__name__, description=fast_tool.description or "",
                                 input_schema=dict(fast_tool.parameters),
                                 handler=_handler(fast_tool, executor)))
    return Served(create_sdk_mcp_server("alpha", "1.0.0", tools=served), world, served)


def install(tools_cls: type[Any]) -> None:
    """Make the engine serve `tools_cls` (the world's `Tools`) to every turn it runs."""
    engine.server_builder = partial(alpha_server, tools_cls)
