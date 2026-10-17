"""Spike 4: what the event stream carries (partial text, thinking, tool calls and results, cost), and hooks."""
import asyncio, os, sys, time, json
sys.path.insert(0, os.path.dirname(__file__))
from common import options, describe, stamp
from claude_agent_sdk import ClaudeSDKClient, ResultMessage, StreamEvent, HookMatcher, tool, create_sdk_mcp_server

hooks_seen = []
async def pre(input_data, tool_use_id, context):
    hooks_seen.append(("PreToolUse", input_data.get("tool_name"), sorted(input_data.keys())))
    return {}
async def post(input_data, tool_use_id, context):
    hooks_seen.append(("PostToolUse", input_data.get("tool_name"), sorted(input_data.keys())))
    return {}

@tool("alpha_echo", "Echoes the text back.", {"text": str})
async def echo(args):
    return {"content": [{"type": "text", "text": f"echo: {args['text']}"}]}
server = create_sdk_mcp_server("alpha", "1.0", tools=[echo])

async def main():
    opts = options(mcp_servers={"alpha": server}, allowed_tools=["mcp__alpha__alpha_echo"],
                   hooks={"PreToolUse": [HookMatcher(matcher=None, hooks=[pre])], "PostToolUse": [HookMatcher(matcher=None, hooks=[post])]})
    seq = []; first_text = None; t = time.monotonic()
    async with ClaudeSDKClient(options=opts) as c:
        await c.query("Call the alpha_echo tool with text 'hello', then reply in one short sentence saying what it returned.")
        async for m in c.receive_response():
            d = describe(m); seq.append(d.split(" ")[0] + (" " + d.split(" ")[1] if d.startswith("Stream") else ""))
            if isinstance(m, StreamEvent) and m.event.get("type") == "content_block_delta" and m.event.get("delta", {}).get("type") == "text_delta" and first_text is None:
                first_text = time.monotonic() - t
            if not d.startswith("Stream content_block_delta"): print(stamp(), d)
    from collections import Counter
    print("message sequence (collapsed):", json.dumps(dict(Counter(seq))))
    print("first text delta after:", None if first_text is None else f"{first_text:.1f}s")
    print("hooks seen:", hooks_seen)

asyncio.run(main())
