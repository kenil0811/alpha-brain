"""The hands that put a card to the person are always in front of the model (19 Oct 2026):
with tool search on, a bare name the model never opened let "log my lunch" be asked in prose."""

from __future__ import annotations

import asyncio
from typing import Any

from claude_agent_sdk import SdkMcpTool
from mcp.client import Client

from alpha.mcp import inprocess
from alpha.mcp.tools import Tools


def test_the_hands_that_put_a_card_are_the_four_gates_and_the_question() -> None:
    cards = {name for name in dir(Tools)
             if getattr(getattr(Tools, name), "served", False)
             and getattr(getattr(Tools, name), "card", False)}
    assert cards == {"ask_person", "world_change", "act_outward", "connect"}


def test_the_server_lists_them_always_loaded_and_runs_every_call() -> None:
    async def handler(args: Any) -> dict[str, Any]:
        return {"content": [{"type": "text", "text": f"asked {args.get('question')}"}]}

    config = inprocess.server_of("alpha", [
        SdkMcpTool(name="ask_person", description="Ask.", input_schema={
            "type": "object", "properties": {"question": {"type": "string"}}}, handler=handler),
        SdkMcpTool(name="world_query", description="Read.", input_schema={"type": "object"},
                   handler=handler)], {"ask_person"})

    async def talk() -> tuple[dict[str, Any], str, bool]:
        async with Client(config["instance"]) as client:
            listed = {t.name: t.meta for t in (await client.list_tools()).tools}
            asked = await client.call_tool("ask_person", {"question": "lunch?"})
            missing = await client.call_tool("world_ponder", {})
            text = asked.content[0].text  # type: ignore[union-attr]
            return listed, text, bool(missing.is_error)

    listed, text, missing_is_error = asyncio.run(talk())
    assert listed == {"ask_person": {inprocess.ALWAYS_LOADED: True}, "world_query": None}
    assert text == "asked lunch?" and missing_is_error
