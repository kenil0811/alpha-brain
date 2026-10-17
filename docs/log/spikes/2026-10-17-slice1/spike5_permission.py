"""Spike 5: can_use_tool reached for a tool kept out of allowed_tools; allow once, deny once."""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import options, describe, stamp
from claude_agent_sdk import (ClaudeSDKClient, ResultMessage, PermissionResultAllow, PermissionResultDeny, tool, create_sdk_mcp_server)

asked = []
decision = {"allow": True}
async def can_use(tool_name, input_data, context):
    asked.append((tool_name, dict(input_data), decision["allow"]))
    if decision["allow"]:
        return PermissionResultAllow()
    return PermissionResultDeny(message="The person said no: nothing leaves without their yes.")

@tool("secret_send", "Sends a message outward.", {"to": str, "text": str})
async def secret_send(args):
    return {"content": [{"type": "text", "text": f"sent to {args['to']}"}]}
server = create_sdk_mcp_server("alpha", "1.0", tools=[secret_send])

async def main():
    opts = options(mcp_servers={"alpha": server}, allowed_tools=[], permission_mode="default",
                   can_use_tool=can_use, include_partial_messages=False)
    async with ClaudeSDKClient(options=opts) as c:
        await c.query("Call the secret_send tool with to='vikas' and text='hi'. Then reply with one short sentence saying whether it was sent.")
        async for m in c.receive_response():
            print(stamp(), describe(m))
        decision["allow"] = False
        await c.query("Call the secret_send tool again with to='sania' and text='hello'. Then reply with one short sentence saying whether it was sent and, if not, why.")
        async for m in c.receive_response():
            print(stamp(), describe(m))
    print("callback asked:", asked)

asyncio.run(main())
