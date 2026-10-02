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
import signal
import subprocess
import sys
import tempfile
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from alpha.runtime import claude_account

DEFAULT_MODEL = "sonnet"
ALLOWED = ["mcp__alpha", "WebSearch", "WebFetch"]
DENIED = ["Bash", "Edit", "Write", "NotebookEdit", "Read", "Glob", "Grep", "Task"]


SIGNED_OUT = "Claude isn't signed in on this Mac: sign in from Settings."
OUT_OF_STEPS = "It reached the most steps Claude Code takes in one run."
STOPPED = "You stopped it."


@dataclass
class _Run:
    proc: subprocess.Popen[str] | None = None
    stopped: bool = False


class Live:
    """Runs in progress, so the person can stop any of them: there is no limit on how long a run
    or a build may take, and stopping is how work that isn't going anywhere ends. Each run is
    known by its turn (the journal entry that started it) and its thread. A run on a model's
    API has no process: it checks `stopped` before each call."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.runs: dict[str, _Run] = {}
        # Turns stopped before their run began (turn ids are never reused).
        # ponytail: kept for the life of the core, a few bytes each; prune if a core runs for
        # months.
        self.early: set[str] = set()

    def begin(self, keys: list[str]) -> _Run:
        with self.lock:
            run = _Run(stopped=any(k in self.early for k in keys))
            for key in keys:
                self.runs[key] = run
            return run

    def attach(self, run: _Run, proc: subprocess.Popen[str]) -> None:
        with self.lock:
            run.proc = proc
            stop = run.stopped
        if stop:
            _kill(proc)

    def end(self, keys: list[str], run: _Run) -> bool:
        """Forget a finished run; True when the person stopped it."""
        with self.lock:
            for key in keys:
                if self.runs.get(key) is run:
                    del self.runs[key]
            return run.stopped

    def running(self, key: str) -> bool:
        with self.lock:
            return key in self.runs

    def stop(self, key: str, *, before_start: bool = False) -> bool:
        """Stop the run known by `key` (and everything it started); False when none is running.
        `before_start` (a turn's id only): a turn whose run hasn't begun yet never does."""
        with self.lock:
            run = self.runs.get(key)
            if run is None:
                if before_start:
                    self.early.add(key)
                return False
            run.stopped = True
            proc = run.proc
        if proc is not None:
            _kill(proc)
        return True


def _kill(proc: subprocess.Popen[str]) -> None:
    """End a run's whole process group: SIGTERM now, SIGKILL if it hasn't gone in 5 s."""
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except (ProcessLookupError, PermissionError):
        return

    def finish() -> None:
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError):
                pass

    threading.Thread(target=finish, daemon=True).start()


LIVE = Live()


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
    # The run ended before its work did (Claude Code's own step ceiling), not because of a
    # problem: work can carry on from where it got to.
    cut_off: bool = False
    # The person stopped it.
    stopped: bool = False


@dataclass
class TurnRequest:
    sentence: str
    system: str
    world_path: Path
    turn_id: str
    thread_id: str | None = None
    module_id: str | None = None
    model: str | None = None
    # How long Claude thinks (Settings -> Models -> How long it thinks); None or "default"
    # leaves it to Claude Code.
    effort: str | None = None
    # What kind of run this is: "turn" (Alpha with its world and tools), "independent" (the same
    # model with web search only and no Alpha, for a second opinion) or "judge" (no tools at
    # all: compares two answers). Fake runners in tests tell them apart by it.
    kind: str = "turn"
    # Only a check (Settings -> Models) sets a limit; a run has none, the person stops it.
    timeout: int | None = None


# What the MCP server needs from Alpha's own environment (the claude process has none of it).
PASSED_TO_TOOLS = ("ALPHA_HOME", "ALPHA_NODE", "ALPHA_CONNECTORS")


def tools_allowed(req: TurnRequest) -> list[str]:
    if req.kind == "independent":
        return ["WebSearch", "WebFetch"]
    if req.kind == "judge":
        return []
    return ALLOWED


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
    allowed = tools_allowed(req)
    denied = DENIED + ([] if allowed else ["WebSearch", "WebFetch"])
    args = [
        binary,
        "-p",
        req.sentence,
        "--output-format",
        "json",
        "--append-system-prompt",
        req.system,
    ]
    if req.kind == "turn":
        # Alpha's world as an MCP server; an independent or judging run never sees it.
        args += ["--mcp-config", str(config_path), "--strict-mcp-config"]
    if allowed:
        args += ["--allowedTools", *allowed]
    args += [
        "--disallowedTools",
        *denied,
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
    ]
    if req.effort and req.effort != "default":
        args += ["--effort", req.effort]
    # Every run is stateless: the pre-pack carries the context, the journal the history. A
    # remembered model session would bring back whatever it once believed.
    args += ["--no-session-persistence"]
    return args


class Stopped(Exception):
    """The person stopped this run (`LIVE.stop`)."""


def call(args: list[str], *, keys: list[str], env: dict[str, str], cwd: str,
         timeout: int | None = None) -> tuple[str, str, int]:
    """`subprocess.run`, except that `LIVE.stop` with any of `keys` can stop it from another
    thread. The process gets its own session so stopping it also stops the MCP server it
    started. Only a check (Settings) passes `timeout`; a run has no time limit."""
    run = LIVE.begin(keys)
    try:
        if run.stopped:
            raise Stopped
        proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                env=env, cwd=cwd, stdin=subprocess.DEVNULL,
                                start_new_session=True)
        LIVE.attach(run, proc)
        try:
            out, err = proc.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.communicate()
            raise
    finally:
        stopped = LIVE.end(keys, run)
    if stopped:
        raise Stopped
    return out, err, proc.returncode


def keys(req: TurnRequest) -> list[str]:
    """What a run is known by: its turn and its thread."""
    return [k for k in (req.turn_id, req.thread_id) if k]


def stopped_result() -> RunResult:
    return RunResult(reply="", ok=False, error=STOPPED, stopped=True,
                     raw={"cancelled": True, "plain": True})


def run(req: TurnRequest, *, binary: str | None = None,
        extra_env: dict[str, str] | None = None) -> RunResult:
    """Run one turn to its end, however long it takes; the person can stop it (LIVE.stop with
    the turn or its thread). `extra_env` carries the sign-in Alpha holds
    (CLAUDE_CODE_OAUTH_TOKEN), when it holds one."""
    # Only the allowlisted environment, plus the sign-in Alpha holds (if any).
    env = {**claude_account.child_env(), **(extra_env or {})}
    with tempfile.TemporaryDirectory(prefix="alpha-turn-") as tmp:
        config_path = Path(tmp) / "mcp.json"
        config_path.write_text(json.dumps(mcp_config(req)))
        try:
            stdout, stderr, code = call(
                argv(req, config_path, binary or claude_account.binary() or "claude"),
                keys=keys(req), env=env, cwd=tmp, timeout=req.timeout)
        except Stopped:
            return stopped_result()
        except subprocess.TimeoutExpired:
            return RunResult(reply="", ok=False,
                             error=f"The model took longer than {req.timeout} s.",
                             raw={"timeout": True})
        except FileNotFoundError:
            return RunResult(reply="", ok=False, error="Claude Code isn't on this Mac yet:"
                             " connect Claude in Settings.", raw={"cli_missing": True})
    return parse(stdout, stderr, code)


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
    if is_error and "not logged in" in reply.lower():
        reply = SIGNED_OUT
    if data.get("subtype") == "error_max_turns":
        return RunResult(reply="", ok=False, error=OUT_OF_STEPS, cut_off=True,
                         session_id=data.get("session_id"), num_turns=data.get("num_turns"),
                         duration_ms=data.get("duration_ms"),
                         cost_estimate=data.get("total_cost_usd"), raw=data)
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
