"""Run one model turn through the Claude Code CLI on the person's subscription.

`claude -p` gets the sentence, Alpha's rules and the pre-pack as an appended system prompt, and
the world as an MCP server. Nothing else of the person's Claude Code setup applies (no user
settings, CLAUDE.md or hooks; no other MCP servers), and only Alpha's tools plus web search and
fetch are allowed: anything that would ask for permission is refused. Web search and fetch pass
a gate first (a PreToolUse hook, `alpha.world.taint`): once the run has read private or
third-party material they are refused, so nothing of it can leave in a query or an address.

The claude process gets only the environment it needs (`claude_account.child_env`), not
Alpha's: headless runs need the default config home (a private CLAUDE_CONFIG_DIR is not logged
in) and USER.
"""

from __future__ import annotations

import json
import os
import shlex
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from alpha.runtime import claude_account

DEFAULT_MODEL = "sonnet"
TIMEOUT_S = 900
MAX_TURNS = 80
ALLOWED = ["mcp__alpha", "WebSearch", "WebFetch"]
DENIED = ["Bash", "Edit", "Write", "NotebookEdit", "Read", "Glob", "Grep", "Task"]


@dataclass
class RunResult:
    reply: str
    ok: bool
    session_id: str | None = None
    num_turns: int | None = None
    duration_ms: int | None = None
    cost_estimate: float | None = None
    error: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)


@dataclass
class TurnRequest:
    sentence: str
    system: str
    world_path: Path
    turn_id: str
    thread_id: str | None = None
    module_id: str | None = None
    resume: str | None = None
    model: str | None = None
    timeout: int | None = None


# What the MCP server needs from Alpha's own environment (the claude process has none of it).
PASSED_TO_TOOLS = ("ALPHA_HOME", "ALPHA_NODE", "ALPHA_CONNECTORS")


def mcp_config(req: TurnRequest) -> dict[str, Any]:
    env = {
        **{k: os.environ[k] for k in PASSED_TO_TOOLS if k in os.environ},
        "ALPHA_WORLD": str(req.world_path),
        "ALPHA_TURN": req.turn_id,
        "ALPHA_THREAD": req.thread_id or "",
        "ALPHA_MODULE": req.module_id or "",
    }
    return {
        "mcpServers": {
            "alpha": {"command": sys.executable, "args": ["-m", "alpha.mcp.server"], "env": env}
        }
    }


def gate_settings(req: TurnRequest) -> dict[str, Any]:
    """The web gate as Claude Code settings. `|| exit 2`: a gate that fails to run refuses."""
    command = " ".join(shlex.quote(a) for a in [
        sys.executable, "-m", "alpha.world.taint", "--world", str(req.world_path),
        "--turn", req.turn_id, "--thread", req.thread_id or ""]) + " || exit 2"
    return {"hooks": {"PreToolUse": [{"matcher": "WebSearch|WebFetch", "hooks": [
        {"type": "command", "command": command}]}]}}


def argv(req: TurnRequest, config_path: Path, binary: str = "claude") -> list[str]:
    args = [
        binary,
        "-p",
        req.sentence,
        "--output-format",
        "json",
        "--append-system-prompt",
        req.system,
        "--mcp-config",
        str(config_path),
        "--strict-mcp-config",
        "--allowedTools",
        *ALLOWED,
        "--disallowedTools",
        *DENIED,
        # dontAsk: anything not in --allowedTools is refused rather than prompted for.
        "--permission-mode",
        "dontAsk",
        "--permission-prompts",
        "none",
        "--setting-sources",
        "",
        "--settings",
        json.dumps(gate_settings(req)),
        "--model",
        req.model or os.environ.get("ALPHA_MODEL") or DEFAULT_MODEL,
        "--max-turns",
        str(MAX_TURNS),
    ]
    if req.resume:
        args += ["--resume", req.resume]
    elif req.thread_id is None:
        # The stream is stateless: the pre-pack carries the context, the journal the history.
        args += ["--no-session-persistence"]
    return args


def run(req: TurnRequest, *, binary: str | None = None, timeout: int | None = None) -> RunResult:
    timeout = timeout or req.timeout or TIMEOUT_S
    env = claude_account.child_env()
    with tempfile.TemporaryDirectory(prefix="alpha-turn-") as tmp:
        config_path = Path(tmp) / "mcp.json"
        config_path.write_text(json.dumps(mcp_config(req)))
        try:
            done = subprocess.run(
                argv(req, config_path, binary or claude_account.binary() or "claude"),
                capture_output=True,
                text=True,
                timeout=timeout,
                env=env,
                cwd=tmp,
                stdin=subprocess.DEVNULL,
            )
        except subprocess.TimeoutExpired:
            return RunResult(reply="", ok=False, error=f"The model took longer than {timeout} s.")
        except FileNotFoundError:
            return RunResult(reply="", ok=False, error="Claude Code isn't on this Mac yet:"
                             " connect Claude in Settings.")
    return parse(done.stdout, done.stderr, done.returncode)


def parse(stdout: str, stderr: str, code: int) -> RunResult:
    text = stdout.strip()
    try:
        data: dict[str, Any] = json.loads(text.splitlines()[-1]) if text else {}
    except json.JSONDecodeError:
        data = {}
    if not data:
        tail = (stderr or stdout).strip()[-400:] or f"exit code {code}"
        return RunResult(reply="", ok=False, error=f"No answer from the model: {tail}")
    is_error = bool(data.get("is_error")) or data.get("subtype") not in (None, "success")
    reply = str(data.get("result") or "")
    return RunResult(
        reply=reply,
        ok=not is_error and bool(reply),
        session_id=data.get("session_id"),
        num_turns=data.get("num_turns"),
        duration_ms=data.get("duration_ms"),
        cost_estimate=data.get("total_cost_usd"),
        error=None if not is_error else (reply or str(data.get("subtype"))),
        raw=data,
    )
