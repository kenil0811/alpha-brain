"""Run one model turn through the Claude Agent SDK on the person's subscription (the harness
design §3; slice 1, 17 October 2026).

The request and the result are the CLI route's (`running.TurnRequest`, `RunResult`), so
everything above (`turn.ask`, the agents, the journeys) is unchanged. What differs underneath:
the SDK's own bundled Claude Code runs the turn; the world's tools are served in this process
(no second process, the same names); a live conversation resumes its own session; the stream
is mapped onto what the window shows (`running.LIVE`); the person's stop interrupts the
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
import warnings
from collections.abc import Awaitable, Callable, Coroutine
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
from claude_agent_sdk.types import (
    CanUseToolShadowedWarning,
    McpSdkServerConfig,
    SyncHookJSONOutput,
)

from alpha import config
from alpha.runtime.running import (
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
from alpha.world import grants
from alpha.world.world import World

log = logging.getLogger(__name__)
# The hands in `allowed_tools` are meant to skip the callback: only the gated ones reach it
# (§8). The SDK warns about exactly that on every session; the design says so instead.
warnings.filterwarnings("ignore", category=CanUseToolShadowedWarning)

COMPACTED = "Summarising the earlier steps to make room"
# A client the tests swap for a scripted one: anything with the SDK client's `query`,
# `receive_response` and `interrupt`, usable as an async context manager.
ClientFactory = Callable[[ClaudeAgentOptions], Any]


def environment(req: TurnRequest) -> dict[str, str]:
    """What the session's process gets on top of the core's own environment (the SDK merges it
    over `os.environ`)."""
    # tool search on (A8, Q98): the hands' schemas load when the model looks for them, not on
    # every turn (the spike of 19 Oct: the hands still found and called; input 6% and 32% lower
    # on track_then_log's two turns, one step more each)
    return {"USER": getpass.getuser(), "ENABLE_TOOL_SEARCH": "true"}


def sessions_dir(world_path: Path) -> Path:
    """Where a turn runs when it has no workspace: one directory beside the world, so every
    session's transcript sits under one project key of the default config home, apart from
    the person's own sessions."""
    path = Path(world_path).parent / "sessions"
    path.mkdir(parents=True, exist_ok=True)
    return path


# Claude Code's own sandbox for the shell (macOS seatbelt): writes confined to the turn's
# directory and the granted folders, reads the same, the network a question to the callback
# (spike of 18 Oct 2026, slice 6). Nothing may run outside it.
SANDBOX: dict[str, Any] = {"enabled": True, "autoAllowBashIfSandboxed": True,
                           "allowUnsandboxedCommands": False, "network": {}}
# The SDK's own hands a turn gets outright; Read, Write and Edit go through the callback,
# which checks their paths (an allow in `allowed_tools` would shadow it). `Agent` (once `Task`)
# is the SDK's subagents (A2, Q98): a subagent has the turn's hands, its hooks and this
# callback, and its shell the same sandbox (the spike of 20 Oct 2026).
OWN_TOOLS = ["Bash", "Glob", "Grep", "Agent", "Task"]


def options_for(req: TurnRequest, server: McpSdkServerConfig | None = None,
                hooks: dict[str, list[HookMatcher]] | None = None,
                hands: list[str] | None = None,
                can_use: Callable[..., Awaitable[Any]] | None = None,
                cwd: Path | None = None, add_dirs: list[Path] | None = None) -> ClaudeAgentOptions:
    """The SDK's options for a request: the same tools, walls and session rules the CLI route
    passed as flags. With `hands` (the served tools' names) and `can_use`, a turn runs in the
    default mode: every hand but the gated ones is allowed outright, the gated ones reach the
    callback (harness design §8)."""
    allowed = tools_allowed(req)
    if hands is not None and req.kind == "turn":
        allowed = ([f"mcp__alpha__{h}" for h in hands if h not in GATED]
                   + ["WebSearch", "WebFetch"] + OWN_TOOLS)
    denied = [d for d in DENIED if d not in allowed]  # a look reads its one image
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
        # Claude Code's own system prompt with Alpha's fixed rules after it, the same on every
        # turn so the session's cache holds; what changes rides on the sentence (the hooks).
        # `snapshot` off: by default the SDK keeps a resumed session's first prompt, so a
        # change to turn.md never reached an open conversation (19 Oct 2026, Q99 step 2,
        # brought forward with the restored paragraph 3); the prompt being the same on every
        # turn, sending it fresh costs no cache.
        "system_prompt": {"type": "preset", "preset": "claude_code", "append": req.system,
                          "snapshot": False},
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
        "cwd": str(cwd) if cwd is not None else str(sessions_dir(req.world_path)),
        "resume": req.resume,
    }
    if hooks:
        kw["hooks"] = hooks
    if can_use is not None:
        kw["can_use_tool"] = can_use
    if hands is not None and req.kind == "turn":
        kw["sandbox"] = dict(SANDBOX)
        kw["add_dirs"] = [str(d) for d in (add_dirs or [])]
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
# The fingerprint of the hands this process serves (their names, A12), set with the server
# builder: a kept session is resumed only when it was made with the same tool names (18 Oct
# 2026: a conversation's session made on the 72 old names, resumed on the 17 hands, called a
# tool the run did not have).
tools_fingerprint: str = ""
# How the world is given to a session, the other half of what a kept session must match
# (section B, Q99): a session made while the world rode in its system prompt keeps that prompt
# (the SDK records a session's first one), so after the layers came it is not resumed; a fresh
# one starts, given the start layer and carrying the conversation's checkpoint (A12's path).
GIVEN_AS = "layers"


def fingerprint() -> str:
    return f"{tools_fingerprint}+{GIVEN_AS}"


# ---- the person's yes (harness design §8; slice 2b, step 3) ----

# The hands that reach the permission callback instead of running at once: everything else is
# allowed outright. `world_change` asks when it removes a row; `act_outward` passes through
# (its card is the gate today) and is the hook for the deferred yes later.
GATED = ("world_change", "act_outward")
WAITING = "Waiting for your yes"
DEFERRED = "Waiting for your yes on the card."
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


# The hand's own words when a removal names no row it can act on: refused before any card is
# put (20 Oct 2026: a subagent's call without the row's revision put a card, then failed, then
# its second call put another).
UNREADY = ("Give the row's id and its current revision (from world_query), or ids with"
           " remove: true for several.")


def removal_ready(call: dict[str, Any]) -> bool:
    """Whether a removal names what it removes as the hand needs it."""
    return bool(call.get("ids")) or (bool(call.get("id")) and call.get("revision") is not None)


def removal_card(world: World, req: TurnRequest, input_data: dict[str, Any],
                 **more: Any) -> tuple[str, str]:
    """The removal's card in the journal, saying what goes with the rows (their open tasks,
    P1), and the item's line saying it waits; `more` keeps a deferred call's id and session
    on the card (P3 item 7). Returns the card's id and words."""
    table = str(input_data.get("table") or "the table")
    ids = [str(i) for i in (input_data.get("ids") or [])] or (
        [str(input_data["id"])] if input_data.get("id") else [])
    titles = list(ids)
    try:
        desc = world.collections.describe(table)
        field = desc.get("title_field") or ""
        titles = [str(world.collections.get(table, rid).get(field) or rid) for rid in ids]
        table = str(desc.get("title") or table)
    except Exception:  # the operation itself says what is wrong with the rows
        pass
    # what lives on the rows goes with them (P1): the card says so
    living = 0
    for rid in ids:
        try:
            living += world.tasks.counted_at(world.tasks.address(
                table=str(input_data.get("table") or ""), record=rid))
        except Exception:  # a row the operation itself will say is not there
            continue
    with_tasks = (f" {living} open task{'s' if living != 1 else ''} on"
                  f" {'them' if len(ids) > 1 else 'it'}"
                  f" {'go' if living != 1 else 'goes'} too." if living else "")
    if len(ids) > 1:
        # several rows the person asked to remove: one card for all of them
        shown = ", ".join(f"\"{t}\"" for t in titles[:3]) + (
            f" and {len(ids) - 3} more" if len(ids) > 3 else "")
        text = (f"Remove {len(ids)} rows from {table}? {shown}. They leave the table;"
                f" Activity keeps that they were here.{with_tasks}")
    else:
        text = (f"Remove \"{titles[0] if titles else ''}\" from {table}? It leaves the"
                f" table; Activity keeps that it was here.{with_tasks}")
    ask = world.journal.append(
        "asked", text,
        data={"options": ["Yes, remove it", "No, keep it"], "kind": "one",
              "turn": req.turn_id, "permission": "world_change", "table": table,
              "record": ids[0] if ids else "", "records": ids, **more},
        module=req.module_id, thread=req.thread_id)
    LIVE.note(_keys(req), doing=WAITING)
    # the item's card says what it waits for (18 Oct: "Working" read as stuck)
    _line(world, req.thread_id, "needs_you", f"Waiting for your yes: {text[:150]}")
    return ask, text


def removal_hook(req: TurnRequest,
                 world: World) -> Callable[..., Coroutine[Any, Any, SyncHookJSONOutput]]:
    """A conversation's removal waits on its card without holding the turn (P3 item 7, 19 Oct
    2026; the spike proved it end to end): the first time, the card is put and the call
    deferred, so the turn ends and nothing waits in memory; the answer starts the item's next
    turn, which resumes the kept session (after a restart too), and this decides the deferred
    call from the card: yes runs it, anything else refuses it."""

    def decide(decision: str, reason: str | None = None) -> SyncHookJSONOutput:
        out: dict[str, Any] = {"hookEventName": "PreToolUse", "permissionDecision": decision}
        if reason:
            out["permissionDecisionReason"] = reason
        return {"hookSpecificOutput": out}  # type: ignore[typeddict-item]

    async def hook(input_data: Any, tool_use_id: str | None,
                   context: HookContext) -> SyncHookJSONOutput:
        call = (input_data or {}).get("tool_input") or {}
        if not call.get("remove") or not tool_use_id:
            return {}
        if not removal_ready(call):
            return decide("deny", UNREADY)
        if (input_data or {}).get("agent_id"):
            # A subagent's removal is not deferred: the yes resumes the conversation, never
            # the subagent, which is gone by then (the spike of 20 Oct 2026: Fuji stayed and
            # the next helper met the card again). It reaches the callback, which puts the
            # same card and waits for the answer while the turn goes on.
            return {}
        card = world.store.one(
            "SELECT c.state, c.answer FROM journal j JOIN cards c ON c.id = j.id WHERE"
            " j.kind = 'asked' AND json_extract(j.data, '$.tool_use') = ?", (tool_use_id,))
        if card is None:
            removal_card(world, req, call, tool_use=tool_use_id,
                         session=(input_data or {}).get("session_id"))
            return decide("defer")
        if card["state"] == "waiting":
            return decide("defer")
        if card["state"] == "yes" or (card["state"] == "answered" and yes(card["answer"] or "")):
            _line(world, req.thread_id, "working", "Carrying on after your yes.")
            return decide("allow")
        _line(world, req.thread_id, "working", "Carrying on after your no.")
        return decide("deny", NO)

    return hook


def permission_for(req: TurnRequest, world: World) -> Callable[..., Awaitable[Any]]:
    """The callback the SDK asks before a gated hand runs. A row removed from the person's
    tables is asked for on a card (the window answers it, or the person's Stop ends the wait);
    everything else is allowed."""

    def inside(path: str, roots: list[Path]) -> bool:
        try:
            p = Path(path).expanduser().resolve()
        except OSError:
            return False
        return any(p == r or r in p.parents for r in roots)

    async def can_use(tool_name: str, input_data: dict[str, Any], context: Any) -> Any:
        name = tool_name.removeprefix("mcp__alpha__")
        if name == "SandboxNetworkAccess":
            # the shell has no network: what leaves the world goes through act_outward
            return PermissionResultDeny(message="No network from the shell: anything that"
                                                " leaves the person's world goes through"
                                                " act_outward and their yes.")
        if name in ("Read", "Glob", "Grep", "Write", "Edit", "NotebookEdit"):
            own = grants.module_dir(world, req.module_id)
            path = str(input_data.get("file_path") or input_data.get("path")
                       or input_data.get("notebook_path") or own)
            if name in ("Read", "Glob", "Grep"):
                if grants.whole_mac(world) or inside(path, [own, *grants.folders(world)]):
                    return PermissionResultAllow()
                return PermissionResultDeny(message=f"{path} is not in a folder the person"
                                                    " granted; they connect one (connect"
                                                    " what=folder) or switch on the whole Mac.")
            # A4 (Q98): writes follow the person's grants, as reads do; never under a .claude
            # folder (its settings would be accepted without a word, the slice 1 spike)
            if ".claude" in Path(path).expanduser().parts:
                return PermissionResultDeny(message="Alpha never writes under a .claude folder.")
            if grants.whole_mac(world) or inside(path, [own, *grants.folders(world)]):
                return PermissionResultAllow()
            return PermissionResultDeny(message=f"{path} is not in a folder the person granted;"
                                                " they connect one (connect what=folder) or"
                                                " switch on the whole Mac.")
        if name == "world_change" and input_data.get("remove"):
            if not removal_ready(input_data):
                return PermissionResultDeny(message=UNREADY)
            ask, _ = removal_card(world, req, input_data)
            loop = asyncio.get_running_loop()
            fut: asyncio.Future[str] = loop.create_future()
            PENDING.add(ask, loop, fut)
            try:
                answer = await fut
            except asyncio.CancelledError:
                _line(world, req.thread_id, "working", "The wait for your yes was stopped.")
                return PermissionResultDeny(message="The wait for your yes was stopped.")
            _line(world, req.thread_id, "working",
                  "Carrying on after your yes." if yes(answer) else "Carrying on after your no.")
            if yes(answer):
                return PermissionResultAllow()
            return PermissionResultDeny(message=NO)
        return PermissionResultAllow()

    return can_use


def _line(world: World, thread: str | None, state: str, line: str) -> None:
    """The thread's state and line while a turn in it waits on a card, and after."""
    if not thread:
        return
    try:
        world.modules.update_thread(thread, state=state, last_line=line)
    except Exception:  # a thread the tests never made; the card itself is the record
        pass


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
            "duration_ms": final.duration_ms, "total_cost_usd": final.total_cost_usd,
            "usage": dict(final.usage or {})}


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
        req.injected.append("compacted")
        if req.kind != "turn":
            return {}
        # What the summary keeps (B6): a PreCompact hook's message is the summary's custom
        # instructions (read in the bundled CLI, 19 Oct 2026). The turn refreshes the
        # conversation's checkpoint after the run (turn.AFTER_COMPACTION).
        return {"systemMessage": config.prompt("compact")}

    async def sentence_given(input_data: Any, tool_use_id: str | None,
                             context: HookContext) -> SyncHookJSONOutput:
        # The layers ride on the person's message, after the cached system prompt: the start
        # layer only when the session is new (a resumed one holds it), the turn layer always.
        given = [req.turn_layer] if req.resume else [req.start_layer, req.turn_layer]
        given = [g for g in given if g]
        if not given:
            return {}
        req.injected.append("turn" if req.resume else "start")
        return {"hookSpecificOutput": {"hookEventName": "UserPromptSubmit",
                                       "additionalContext": "\n\n".join(given)}}

    async def session_started(input_data: Any, tool_use_id: str | None,
                              context: HookContext) -> SyncHookJSONOutput:
        # Through the SDK this fires after a compaction only (the spike of 19 Oct: never when a
        # session starts or resumes): the summary dropped the start layer, so it is given again.
        if (input_data or {}).get("source") != "compact" or not req.start_layer:
            return {}
        req.injected.append("start after a compaction")
        return {"hookSpecificOutput": {"hookEventName": "SessionStart",
                                       "additionalContext": req.start_layer}}

    return {"PreCompact": [HookMatcher(matcher=None, hooks=[compacted])],
            "UserPromptSubmit": [HookMatcher(matcher=None, hooks=[sentence_given])],
            "SessionStart": [HookMatcher(matcher=None, hooks=[session_started])],
            "PreToolUse": [HookMatcher(matcher="Agent|Task", hooks=[in_the_turn])]}


async def in_the_turn(input_data: Any, tool_use_id: str | None,
                      context: HookContext) -> SyncHookJSONOutput:
    """A subagent works inside the turn (A2): a turn's process ends with the turn, so a helper
    left running in the background never reports back (20 Oct 2026: "I'll put the counts side
    by side once both report back", and the turn ended there). Its call is run in the
    foreground, and the turn waits for it."""
    call = dict((input_data or {}).get("tool_input") or {})
    if call.get("run_in_background") is False:
        return {}
    call["run_in_background"] = False
    return {"hookSpecificOutput": {"hookEventName": "PreToolUse",
                                   "permissionDecision": "allow", "updatedInput": call}}


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
        cwd = grants.module_dir(world, req.module_id) if world is not None else None
        add_dirs = grants.folders(world) if world is not None else []
        hooks = _hooks(req)
        if world is not None and req.persist:
            # a conversation keeps its session, so its removal card can outlive the turn and a
            # restart (P3 item 7); any other turn waits on the card in memory, as before
            hooks["PreToolUse"] = [*hooks.get("PreToolUse", []),
                                   HookMatcher(matcher="mcp__alpha__world_change",
                                               hooks=[removal_hook(req, world)])]
        options = options_for(req, server, hooks, hands=hands, can_use=can_use,
                              cwd=cwd, add_dirs=add_dirs)
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
    if final.deferred_tool_use is not None and not final.is_error:
        # the turn ended on a card (P3 item 7): a turn that ended well, saying so; the card
        # above is the question
        out.ok, out.error = True, None
        out.reply = out.reply.strip() or DEFERRED
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
