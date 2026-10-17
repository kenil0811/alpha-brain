"""Shared bits for the slice-1 spikes: the environment Alpha's runs use, compact printing."""
import getpass, json, os, sys, time
from claude_agent_sdk import (AssistantMessage, ClaudeAgentOptions, ResultMessage, StreamEvent,
                              SystemMessage, UserMessage, TextBlock, ThinkingBlock, ToolUseBlock,
                              ToolResultBlock)

def env_like_alpha() -> dict[str, str]:
    env = {"USER": getpass.getuser(), "ENABLE_TOOL_SEARCH": "false"}
    return env

def options(**kw) -> ClaudeAgentOptions:
    os.environ.pop("CLAUDE_CONFIG_DIR", None)
    base = dict(model="haiku", permission_mode="dontAsk", setting_sources=[], strict_mcp_config=True,
                env=env_like_alpha(), include_partial_messages=True)
    base.update(kw)
    return ClaudeAgentOptions(**base)

T0 = time.monotonic()
def stamp() -> str:
    return f"{time.monotonic()-T0:6.2f}s"

def describe(m) -> str:
    if isinstance(m, SystemMessage):
        d = m.data if isinstance(m.data, dict) else {}
        keep = {k: d.get(k) for k in ("apiKeySource", "model", "permissionMode", "session_id", "tools", "slash_commands", "skills", "mcp_servers") if k in d}
        return f"System[{m.subtype}] {json.dumps(keep)[:600]}"
    if isinstance(m, StreamEvent):
        ev = m.event; t = ev.get("type"); extra = ""
        if t == "content_block_start": extra = ev.get("content_block", {}).get("type", "")
        if t == "content_block_delta": extra = ev.get("delta", {}).get("type", "")
        return f"Stream {t} {extra}"
    if isinstance(m, AssistantMessage):
        parts = []
        for b in m.content:
            if isinstance(b, TextBlock): parts.append(f"text({b.text[:80]!r})")
            elif isinstance(b, ThinkingBlock): parts.append("thinking")
            elif isinstance(b, ToolUseBlock): parts.append(f"tool_use({b.name}, {json.dumps(b.input)[:80]})")
            else: parts.append(type(b).__name__)
        return f"Assistant[{m.model}] " + ", ".join(parts)
    if isinstance(m, UserMessage):
        c = m.content
        if isinstance(c, list):
            parts = [f"tool_result({str(b.content)[:80]!r}, err={b.is_error})" if isinstance(b, ToolResultBlock) else type(b).__name__ for b in c]
            return "User " + ", ".join(parts)
        return f"User {str(c)[:80]!r}"
    if isinstance(m, ResultMessage):
        return (f"Result[{m.subtype}] err={m.is_error} turns={m.num_turns} ms={m.duration_ms} api_ms={m.duration_api_ms} "
                f"cost={m.total_cost_usd} session={m.session_id} stop={m.stop_reason} term={m.terminal_reason} result={str(m.result)[:80]!r}")
    return type(m).__name__
