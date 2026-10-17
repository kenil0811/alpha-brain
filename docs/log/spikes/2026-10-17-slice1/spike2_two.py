"""Spike 2: two ClaudeSDKClient sessions at once in one process, each with an in-process MCP tool."""
import asyncio, os, sys, time
sys.path.insert(0, os.path.dirname(__file__))
from common import options, describe, stamp
from claude_agent_sdk import ClaudeSDKClient, ResultMessage, tool, create_sdk_mcp_server

calls = []
@tool("now", "The current time, for the session named in `who`.", {"who": str})
async def now(args):
    calls.append((args["who"], time.monotonic()))
    return {"content": [{"type": "text", "text": f"{args['who']}: {time.strftime('%H:%M:%S')}"}]}

server = create_sdk_mcp_server("alpha", "1.0", tools=[now])

async def one(name: str):
    opts = options(mcp_servers={"alpha": server}, allowed_tools=["mcp__alpha__now"], include_partial_messages=False)
    t = time.monotonic()
    async with ClaudeSDKClient(options=opts) as c:
        await c.query(f"Call the now tool with who='{name}', then reply with exactly the word {name} and nothing else.")
        async for m in c.receive_response():
            if isinstance(m, ResultMessage):
                print(stamp(), name, describe(m), f"| wall={time.monotonic()-t:.1f}s")
                return m

async def main():
    t = time.monotonic()
    a, b = await asyncio.gather(one("ALPHA"), one("BRAVO"))
    print(f"both done in {time.monotonic()-t:.1f}s; sequential would be ~{(a.duration_ms+b.duration_ms)/1000:.1f}s; sessions differ: {a.session_id != b.session_id}; tool calls seen: {calls}")

asyncio.run(main())
