"""Run one model turn through OpenAI's Codex CLI on the person's ChatGPT subscription (Q32).

`codex exec` gets the sentence as its prompt; Alpha's rules and pre-pack go in as `AGENTS.md`
in the run's own temporary folder, which is how Codex takes standing instructions; the world
goes in as an MCP server through config overrides (no file), with the turn, thread and module in
its environment. The person's own Codex configuration never loads (`--ignore-user-config`: none
of their plugins or servers), the sandbox is read-only and approvals are never asked, so a run
can write nothing but through Alpha's tools. No session is kept except a live conversation's,
which resumes by its thread id (Q21). Events stream as JSON lines and feed the same `LIVE`
registry the window polls; the person stops a run the same way; a silent run is ended the same
way.
"""

from __future__ import annotations

import json
import logging
import os
import signal
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from alpha.runtime import codex_account
from alpha.runtime.claude_cli import (
    LIVE,
    NO_ANSWER,
    SILENCE_S,
    STALLED,
    STOPPED,
    RunResult,
    TurnRequest,
    plain_tool,
)

log = logging.getLogger(__name__)

SIGNED_OUT = "ChatGPT isn't signed in on this Mac (or its sign-in lapsed): sign in from Settings."
# The Claude aliases the rest of Alpha speaks in, as Codex's reasoning effort.
EFFORT = {"haiku": "low", "sonnet": "medium", "opus": "high"}
CLAUDE_ALIASES = set(EFFORT)
GUARD = """You are Alpha. Work only through the `alpha` tools: never run shell commands, never \
read or write files on this Mac, never use anything but Alpha's tools, web search and web fetch. \
Everything below is Alpha's standing instruction and the person's world as it stands."""
INDEPENDENT_GUARD = """Answer from the web and your own knowledge only: never run commands, never \
read files on this Mac."""


def instructions(req: TurnRequest) -> str:
    """What goes into AGENTS.md: the guard for the kind of run, then the request's system."""
    if req.kind == "judge":
        return req.system
    guard = INDEPENDENT_GUARD if req.kind == "independent" else GUARD
    return f"{guard}\n\n{req.system}"


def _toml_string(value: str) -> str:
    return json.dumps(value)  # a JSON string is a valid TOML basic string


def model_for(req: TurnRequest) -> tuple[str | None, str]:
    """The Codex model and reasoning effort for a request: a Claude alias becomes an effort
    (haiku low, sonnet medium) on the person's own Codex model; anything else is passed on."""
    alias = req.model or os.environ.get("ALPHA_MODEL") or "sonnet"
    if alias in CLAUDE_ALIASES:
        effort = EFFORT[alias]
        if req.kind in ("judge", "independent"):
            effort = "low"
        return codex_account.default_model(), effort
    return alias, "medium"


def argv(req: TurnRequest, cwd: Path, last: Path, binary: str = "codex") -> list[str]:
    model, effort = model_for(req)
    args = [binary, "exec", "--json", "--skip-git-repo-check", "--ignore-user-config",
            "--ignore-rules", "-s", "read-only", "-c", 'approval_policy="never"',
            "-c", f'model_reasoning_effort="{effort}"', "-C", str(cwd), "-o", str(last)]
    if model:
        args += ["-m", model]
    if req.kind == "turn":
        env = {"ALPHA_WORLD": str(req.world_path), "ALPHA_TURN": req.turn_id,
               "ALPHA_THREAD": req.thread_id or "", "ALPHA_MODULE": req.module_id or ""}
        table = ",".join(f"{k}={_toml_string(v)}" for k, v in env.items())
        args += ["-c", f"mcp_servers.alpha.command={_toml_string(sys.executable)}",
                 "-c", 'mcp_servers.alpha.args=["-m","alpha.mcp.server"]',
                 "-c", f"mcp_servers.alpha.env={{{table}}}"]
    if not req.persist:
        args.append("--ephemeral")
    if req.resume:
        args += ["resume", req.resume]
    args.append(req.sentence)
    return args


def run(req: TurnRequest, *, binary: str | None = None) -> RunResult:
    """Run one turn to its end, however long it takes; the person can stop it (LIVE.stop with
    the turn or its thread)."""
    env = dict(os.environ)
    if req.kind == "turn":
        keys = [k for k in (req.turn_id, req.thread_id) if k]
    else:
        keys = [f"{req.kind}:{req.turn_id}:{uuid.uuid4().hex[:8]}"]
    began = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="alpha-codex-") as tmp:
        cwd = Path(tmp)
        (cwd / "AGENTS.md").write_text(instructions(req))
        last = cwd / "last.txt"
        try:
            proc = subprocess.Popen(
                argv(req, cwd, last, binary or codex_account.binary() or "codex"),
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.DEVNULL,
                text=True, env=env, cwd=tmp, start_new_session=True,
            )
        except FileNotFoundError:
            return RunResult(reply="", ok=False, error="The Codex CLI isn't on this Mac yet:"
                             " connect ChatGPT in Settings.")
        LIVE.add(keys, proc)
        errors: list[str] = []

        def drain() -> None:
            assert proc.stderr is not None
            errors.append(proc.stderr.read())

        threading.Thread(target=drain, daemon=True).start()
        seen: list[dict[str, Any]] = []
        last_seen = [time.monotonic()]
        done = threading.Event()
        stalled = threading.Event()

        def watch_silence() -> None:
            while not done.wait(min(15.0, SILENCE_S / 4)):
                if time.monotonic() - last_seen[0] > SILENCE_S:
                    stalled.set()
                    try:
                        os.killpg(proc.pid, signal.SIGKILL)
                    except (ProcessLookupError, PermissionError):
                        pass
                    return

        threading.Thread(target=watch_silence, daemon=True, name="codex-silence").start()
        try:
            assert proc.stdout is not None
            for line in proc.stdout:
                last_seen[0] = time.monotonic()
                event = _event(line)
                if event is None:
                    continue
                seen.append(event)
                _watch(keys, event)
            proc.wait()
        finally:
            done.set()
            stopped = LIVE.remove(keys, proc)
        reply_file = last.read_text() if last.exists() else ""
    if stopped:
        return RunResult(reply="", ok=False, error=STOPPED, stopped=True)
    if stalled.is_set():
        log.warning("codex run %s went silent for %ss and was ended", req.turn_id, SILENCE_S)
        return RunResult(reply="", ok=False, error=STALLED)
    return parse_events(seen, reply_file, "".join(errors), proc.returncode,
                        int((time.monotonic() - began) * 1000))


def _event(line: str) -> dict[str, Any] | None:
    line = line.strip()
    if not line.startswith("{"):
        return None
    try:
        data = json.loads(line)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def _watch(keys: list[str], event: dict[str, Any]) -> None:
    """Turn a Codex event into what the run is doing, in plain words."""
    if event.get("type") not in ("item.started", "item.completed"):
        return
    item = event.get("item") or {}
    kind = str(item.get("type") or item.get("item_type") or "")
    text = str(item.get("text") or "").strip()
    if kind in ("reasoning", "agent_message") and text:
        LIVE.note(keys, thought=text[:400])
    elif kind == "mcp_tool_call" and event.get("type") == "item.started":
        name = str(item.get("tool") or item.get("name") or "")
        if "__" not in name:
            name = f"mcp__alpha__{name}"
        LIVE.note(keys, doing=plain_tool(name, item.get("arguments") or {}),
                  tools=(LIVE.progress_for(keys[0]) or {}).get("tools", 0) + 1)
    elif kind == "web_search" and event.get("type") == "item.started":
        LIVE.note(keys, doing=f"Searching the web for {str(item.get('query', ''))[:60]}".rstrip())
    elif kind == "command_execution" and event.get("type") == "item.started":
        LIVE.note(keys, doing=f"Running a command: {str(item.get('command', ''))[:60]}")


def parse_events(events: list[dict[str, Any]], reply_file: str, stderr: str, code: int,
                 duration_ms: int) -> RunResult:
    """The result of a finished run from its events: the last message (the `-o` file, else the
    last agent message), the thread id, and the usage; a failed turn's words as the error."""
    thread = next((str(e["thread_id"]) for e in events if e.get("type") == "thread.started"
                   and e.get("thread_id")), None)
    messages = [str((e.get("item") or {}).get("text") or "") for e in events
                if e.get("type") == "item.completed"
                and (e.get("item") or {}).get("type") == "agent_message"]
    calls = sum(1 for e in events if e.get("type") == "item.completed"
                and (e.get("item") or {}).get("type") in ("mcp_tool_call", "command_execution",
                                                          "web_search"))
    completed = next((e for e in events if e.get("type") == "turn.completed"), None)
    failed = next((e for e in events if e.get("type") in ("turn.failed", "error")), None)
    reply = reply_file.strip() or (messages[-1].strip() if messages else "")
    if failed and not completed:
        words = str((failed.get("error") or {}).get("message") or failed.get("message") or "")
        lowered = words.lower()
        if "sign in again" in lowered or "not logged in" in lowered or "401" in lowered:
            words = SIGNED_OUT
        log.warning("codex run failed: %s", words[:300])
        return RunResult(reply="", ok=False, error=words or NO_ANSWER, session_id=thread,
                         duration_ms=duration_ms, raw=failed)
    if not reply:
        tail = (stderr or "").strip()[-400:] or f"exit code {code}"
        log.warning("no reply from the codex run (exit %s): %s", code, tail)
        return RunResult(reply="", ok=False, error=NO_ANSWER, session_id=thread,
                         duration_ms=duration_ms)
    usage = (completed or {}).get("usage") or {}
    return RunResult(reply=reply, ok=True, session_id=thread, num_turns=calls + 1,
                     duration_ms=duration_ms, cost_estimate=None, raw={"usage": usage})
