"""Run one turn through the Codex CLI on the person's ChatGPT sign-in (`codex login`).

Like the Claude Code route: `codex exec` gets Alpha's rules, the pre-pack and the sentence, and
the world as its only MCP server. The person's Codex config and rules are ignored, the shell,
browser, computer-use, apps and image tools are switched off, and the sandbox is read-only, so
Alpha's tools are all it can use. A thread resumes its own Codex session (`codex:<id>`).
Best-effort: built against `codex exec --json` 0.159; not exercised against a live account here.
"""

from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from typing import Any

from alpha.runtime.claude_cli import RunResult, TurnRequest

TIMEOUT_S = 900
PREFIX = "codex:"
OFF = ["shell_tool", "unified_exec", "browser_use", "computer_use", "apps", "image_generation"]


def _toml(value: str) -> str:
    return json.dumps(value)  # a JSON string is a valid TOML basic string


def argv(req: TurnRequest, binary: str, cwd: str) -> list[str]:
    env = {"ALPHA_WORLD": str(req.world_path), "ALPHA_TURN": req.turn_id,
           "ALPHA_THREAD": req.thread_id or "", "ALPHA_MODULE": req.module_id or ""}
    env_toml = "{" + ", ".join(f"{k} = {_toml(v)}" for k, v in env.items()) + "}"
    resume = req.resume[len(PREFIX):] if req.resume and req.resume.startswith(PREFIX) else None
    # The sandbox and folder are `exec`'s own options, so they come before `resume`.
    args = [binary, "exec", "-s", "read-only", "-C", cwd]
    if resume:
        args += ["resume", resume]
    args += ["--json", "--skip-git-repo-check", "--ignore-user-config", "--ignore-rules",
             "-c", 'approval_policy="never"',
             "-c", f"mcp_servers.alpha.command={_toml(sys.executable)}",
             "-c", 'mcp_servers.alpha.args=["-m", "alpha.mcp.server"]',
             "-c", f"mcp_servers.alpha.env={env_toml}"]
    for feature in OFF:
        args += ["--disable", feature]
    if req.thread_id is None:
        args.append("--ephemeral")
    if req.model:
        args += ["-m", req.model]
    prompt = req.sentence if resume else f"{req.system}\n\nTHE PERSON SAYS\n\n{req.sentence}"
    return [*args, prompt]


def parse(stdout: str, stderr: str) -> RunResult:
    text: str | None = None
    failure: str | None = None
    session: str | None = None
    usage: dict[str, Any] = {}
    for line in stdout.splitlines():
        try:
            event = json.loads(line)
        except ValueError:
            continue
        if not isinstance(event, dict):
            continue
        kind = event.get("type")
        item = event.get("item")
        if kind == "thread.started" and event.get("thread_id"):
            session = str(event["thread_id"])
        elif isinstance(item, dict) and item.get("type") == "agent_message" and item.get("text"):
            text = str(item["text"])
        elif kind == "turn.completed" and isinstance(event.get("usage"), dict):
            usage = event["usage"]
        elif kind in ("turn.failed", "error"):
            err = event.get("error")
            raw = err.get("message") if isinstance(err, dict) else event.get("message")
            try:
                raw = json.loads(str(raw))["error"]["message"]
            except (ValueError, TypeError, KeyError):
                pass
            failure = str(raw or "Codex stopped with an error.")
    if "not logged in" in (stdout + stderr).lower():
        failure = "ChatGPT isn't signed in."
    ok = bool(text) and failure is None
    return RunResult(reply=text or "", ok=ok, session_id=f"{PREFIX}{session}" if session else None,
                     error=None if ok else (failure or (stderr.strip()[-300:] or "No answer.")),
                     raw={"usage": usage})


def run(req: TurnRequest, *, binary: str) -> RunResult:
    timeout = req.timeout or TIMEOUT_S
    with tempfile.TemporaryDirectory(prefix="alpha-codex-") as tmp:
        try:
            done = subprocess.run(argv(req, binary, tmp), capture_output=True, text=True,
                                  timeout=timeout, cwd=tmp, stdin=subprocess.DEVNULL)
        except subprocess.TimeoutExpired:
            return RunResult(reply="", ok=False, error=f"The model took longer than {timeout} s.")
        except FileNotFoundError:
            return RunResult(reply="", ok=False, error="Codex isn't on this Mac yet.")
    return parse(done.stdout, done.stderr)
