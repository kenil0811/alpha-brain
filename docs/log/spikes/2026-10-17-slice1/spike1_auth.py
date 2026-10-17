"""Spike 1: the SDK on the subscription with no API key, in an environment like alpha serve's."""
import asyncio, os, sys
sys.path.insert(0, os.path.dirname(__file__))
from common import options, describe, stamp
from claude_agent_sdk import query, ResultMessage, SystemMessage

async def main():
    print("env ANTHROPIC_API_KEY set:", "ANTHROPIC_API_KEY" in os.environ, "| CLAUDE_CONFIG_DIR:", os.environ.get("CLAUDE_CONFIG_DIR"), "| HOME:", os.environ.get("HOME"), "| PATH:", os.environ.get("PATH"))
    opts = options(allowed_tools=[], include_partial_messages=False)
    async for m in query(prompt="Reply with the single word OK and nothing else.", options=opts):
        print(stamp(), describe(m))
        if isinstance(m, SystemMessage) and m.subtype == "init":
            d = m.data if isinstance(m.data, dict) else {}
            print("   init keys:", sorted(d.keys()))
            print("   apiKeySource:", d.get("apiKeySource"), "| claude_code_version:", d.get("claude_code_version"))

asyncio.run(main())
