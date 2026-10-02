"""Run one turn on a model reached by key (Claude API, ChatGPT API, OpenRouter, Grok, DeepSeek)
or a local Ollama: Alpha's own tool loop over the world's tools.

The tools are the same `Tools` the MCP server hands Claude Code, described with FastMCP's own
schema generation. The loop stops after MAX_TURNS model calls. A thread's history comes from the
journal (what the person said and Alpha replied there), so it survives a change of model; the
stream is stateless, as on Claude Code (the pre-pack carries the context).

There is no web search on these routes: Claude Code's WebSearch/WebFetch are its own, and
Alpha reads pages only through its browser tools (page_read), which these routes have.
"""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from typing import Any

from fastmcp.tools import Tool

from alpha.mcp.tools import Tools
from alpha.models.providers import ProviderHTTPError, auth_headers, request
from alpha.runtime import claude_cli
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world.world import World

MAX_TURNS = 40
MAX_TOKENS = 16000
HISTORY = 30
RESULT_CHARS = 30000
NO_WEB_SEARCH = ("\n\nON THIS MODEL: there is no web search. Read pages you know or can name "
                 "with page_read; say so when research would need a search.")

Post = Callable[[str, dict[str, str], dict[str, Any] | None, float], dict[str, Any]]


def tool_specs(fns: list[Callable[..., Any]]) -> list[dict[str, Any]]:
    out = []
    for fn in fns:
        t = Tool.from_function(fn)
        out.append({"name": t.name, "description": t.description or "", "schema": t.parameters})
    return out


def history(world: World, req: TurnRequest) -> list[tuple[str, str]]:
    """(role, text) of the thread so far, oldest first, same-role turns merged."""
    if not req.thread_id:
        return []
    out: list[tuple[str, str]] = []
    for e in world.journal.recent(HISTORY, thread=req.thread_id, kinds=["said", "did", "replied"]):
        # A "did" is an automation's prompt; the ones its tools journal carry the turn.
        if e["id"] == req.turn_id or not e["text"] or (e["kind"] == "did" and "turn" in e["data"]):
            continue
        role = "assistant" if e["kind"] == "replied" else "user"
        if out and out[-1][0] == role:
            out[-1] = (role, f"{out[-1][1]}\n\n{e['text']}")
        else:
            out.append((role, e["text"]))
    while out and out[0][0] != "user":
        out.pop(0)
    return out


def call_tool(by_name: dict[str, Callable[..., Any]], name: str, args: Any) -> str:
    fn = by_name.get(name)
    if fn is None:
        return json.dumps({"error": f"There is no tool {name}."})
    if not isinstance(args, dict):
        return json.dumps({"error": "The tool's arguments must be a JSON object."})
    try:
        result = fn(**args)
    except TypeError as e:  # wrong or missing arguments: tell the model, it corrects itself
        result = {"error": str(e)}
    return json.dumps(result, ensure_ascii=False, default=str)[:RESULT_CHARS]


def _anthropic(base: str, key: str, model: str, system: str, turns: list[tuple[str, str]],
               specs: list[dict[str, Any]], by_name: dict[str, Callable[..., Any]],
               post: Post, timeout: float) -> tuple[str, int, dict[str, int]]:
    messages: list[dict[str, Any]] = [{"role": r, "content": t} for r, t in turns]
    tools = [{"name": s["name"], "description": s["description"], "input_schema": s["schema"]}
             for s in specs]
    usage = {"input_tokens": 0, "output_tokens": 0}
    for n in range(1, MAX_TURNS + 1):
        resp = post(f"{base}/messages", auth_headers("anthropic", key),
                    {"model": model, "max_tokens": MAX_TOKENS, "system": system,
                     "messages": messages, "tools": tools}, timeout)
        for k in usage:
            usage[k] += int((resp.get("usage") or {}).get(k) or 0)
        content = resp.get("content") or []
        if resp.get("stop_reason") == "refusal":
            raise ProviderHTTPError("The model declined this request.")
        calls = [b for b in content if b.get("type") == "tool_use"]
        if resp.get("stop_reason") != "tool_use" or not calls:
            text = "\n\n".join(b.get("text", "") for b in content if b.get("type") == "text")
            return text.strip(), n, usage
        messages.append({"role": "assistant", "content": content})
        messages.append({"role": "user", "content": [
            {"type": "tool_result", "tool_use_id": c["id"],
             "content": call_tool(by_name, c["name"], c.get("input"))} for c in calls]})
    raise ProviderHTTPError(f"It was still working after {MAX_TURNS} steps, so Alpha stopped it.")


def _openai(base: str, key: str | None, model: str, system: str, turns: list[tuple[str, str]],
            specs: list[dict[str, Any]], by_name: dict[str, Callable[..., Any]],
            post: Post, timeout: float) -> tuple[str, int, dict[str, int]]:
    messages: list[dict[str, Any]] = [{"role": "system", "content": system},
                                      *({"role": r, "content": t} for r, t in turns)]
    tools = [{"type": "function", "function": {"name": s["name"], "description": s["description"],
                                               "parameters": s["schema"]}} for s in specs]
    usage = {"input_tokens": 0, "output_tokens": 0}
    for n in range(1, MAX_TURNS + 1):
        resp = post(f"{base}/chat/completions", auth_headers("openai", key),
                    {"model": model, "messages": messages, "tools": tools}, timeout)
        raw = resp.get("usage") or {}
        usage["input_tokens"] += int(raw.get("prompt_tokens") or 0)
        usage["output_tokens"] += int(raw.get("completion_tokens") or 0)
        choices = resp.get("choices") or []
        if not choices:
            raise ProviderHTTPError("It answered with nothing.")
        message = choices[0].get("message") or {}
        calls = message.get("tool_calls") or []
        if not calls:
            return str(message.get("content") or "").strip(), n, usage
        messages.append({"role": "assistant", "content": message.get("content"),
                         "tool_calls": calls})
        for c in calls:
            fn = c.get("function") or {}
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except ValueError:
                args = None
            messages.append({"role": "tool", "tool_call_id": c.get("id"),
                             "content": call_tool(by_name, str(fn.get("name")), args)})
    raise ProviderHTTPError(f"It was still working after {MAX_TURNS} steps, so Alpha stopped it.")


def run(req: TurnRequest, *, kind: str, base_url: str, key: str | None, model: str,
        post: Post = request, timeout: float = 300) -> RunResult:
    """`kind` is "anthropic" (Messages API) or "openai" (chat completions)."""
    started = time.monotonic()
    if claude_cli.stopped(req.turn_id):
        return claude_cli.stopped_result()

    def guarded(url: str, headers: dict[str, str], body: dict[str, Any] | None,
                limit: float) -> dict[str, Any]:
        # Stopping a turn on this route ends it before its next model call.
        if claude_cli.stopped(req.turn_id):
            raise claude_cli.Stopped
        return post(url, headers, body, limit)

    world = World(req.world_path)
    try:
        fns = Tools(world, turn=req.turn_id, thread=req.thread_id, module=req.module_id).all()
        by_name = {fn.__name__: fn for fn in fns}
        turns = [*history(world, req), ("user", req.sentence)]
        if len(turns) > 1 and turns[-2][0] == "user":
            turns[-2:] = [("user", f"{turns[-2][1]}\n\n{req.sentence}")]
        loop = _anthropic if kind == "anthropic" else _openai
        try:
            reply, n, usage = loop(base_url, key or "", model, req.system + NO_WEB_SEARCH, turns,
                                   tool_specs(fns), by_name, guarded, timeout)
        except claude_cli.Stopped:
            return claude_cli.stopped_result()
        except ProviderHTTPError as e:
            return RunResult(reply="", ok=False, error=str(e),
                             duration_ms=int((time.monotonic() - started) * 1000))
    finally:
        world.close()
    return RunResult(reply=reply, ok=bool(reply), num_turns=n,
                     duration_ms=int((time.monotonic() - started) * 1000),
                     error=None if reply else "No answer came back.",
                     raw={"usage": usage, "model": model})
