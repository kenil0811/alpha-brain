"""Run one model turn through the Claude Code CLI on the person's subscription.

`claude -p` gets the sentence, Alpha's rules and the pre-pack as an appended system prompt, and
the world as an MCP server. Nothing else of the person's Claude Code setup applies (no user
settings, CLAUDE.md or hooks; no other MCP servers), and only Alpha's tools plus web search and
fetch are allowed: anything that would ask for permission is refused.

Headless runs need the default config home (a private CLAUDE_CONFIG_DIR is not logged in) and
USER in the environment.
"""

from __future__ import annotations

import getpass
import json
import os
import subprocess
import sys
import tempfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

DEFAULT_MODEL = "sonnet"
TIMEOUT_S = 300
MAX_TURNS = 30
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


def mcp_config(req: TurnRequest) -> dict[str, Any]:
    env = {
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
    env = dict(os.environ)
    env.setdefault("USER", getpass.getuser())
    env.pop("CLAUDE_CONFIG_DIR", None)
    with tempfile.TemporaryDirectory(prefix="alpha-turn-") as tmp:
        config_path = Path(tmp) / "mcp.json"
        config_path.write_text(json.dumps(mcp_config(req)))
        try:
            done = subprocess.run(
                argv(req, config_path, binary or os.environ.get("ALPHA_CLAUDE") or "claude"),
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
            return RunResult(reply="", ok=False, error="The claude command is not installed.")
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
