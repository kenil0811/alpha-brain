"""The person's Claude: whether Alpha can think, and getting it there from the app.

Alpha's model runs through the Claude Code CLI on the person's own Claude subscription (see
`claude_cli`). This module answers the questions the app's Settings and first run need: is
Claude Code on this Mac, is it signed in and as whom, and it starts the three things a person
can do about it: install Claude Code (Anthropic's own installer), sign in (Claude Code's login
opens the browser; the person signs in there, Alpha never sees it), and sign out.
"""

from __future__ import annotations

import getpass
import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Any

from alpha.world.store import Problem
from alpha.world.world import alpha_home

STATUS_TIMEOUT_S = 20
INSTALLER = "curl -fsSL https://claude.ai/install.sh | bash"
PLANS = {"max": "Max", "pro": "Pro", "team": "Team", "enterprise": "Enterprise"}


def binary() -> str | None:
    configured = os.environ.get("ALPHA_CLAUDE")
    if configured:
        return shutil.which(configured) or (configured if Path(configured).exists() else None)
    found = shutil.which("claude")
    if found:
        return found
    local = Path.home() / ".local" / "bin" / "claude"
    return str(local) if local.exists() else None


def _env() -> dict[str, str]:
    env = dict(os.environ)
    env.setdefault("USER", getpass.getuser())
    env.pop("CLAUDE_CONFIG_DIR", None)
    return env


def _log(name: str) -> Any:
    logs = alpha_home() / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    return (logs / name).open("a")


def status() -> dict[str, Any]:
    """{installed, signed_in, email, plan, via}: `via` is "subscription" or "console"."""
    claude = binary()
    if claude is None:
        return {"installed": False, "signed_in": False}
    try:
        done = subprocess.run([claude, "auth", "status"], capture_output=True, text=True,
                              timeout=STATUS_TIMEOUT_S, env=_env(), stdin=subprocess.DEVNULL)
    except (OSError, subprocess.TimeoutExpired):
        return {"installed": True, "signed_in": False}
    try:
        data = json.loads(done.stdout)
    except ValueError:
        data = {}
    signed_in = done.returncode == 0 and bool(data.get("loggedIn"))
    out: dict[str, Any] = {"installed": True, "signed_in": signed_in}
    if signed_in:
        out["email"] = data.get("email")
        plan = str(data.get("subscriptionType") or "")
        out["plan"] = PLANS.get(plan, plan.capitalize() or None)
        out["via"] = "subscription" if data.get("authMethod") == "claude.ai" else "console"
    return out


def _start(argv: list[str], log: str) -> None:
    subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=_log(log), stderr=subprocess.STDOUT,
                     env=_env(), start_new_session=True)


def sign_in() -> dict[str, Any]:
    """Start Claude Code's sign-in: it opens the browser and finishes there. Returns at once;
    the app checks `status` until it is signed in."""
    claude = binary()
    if claude is None:
        raise Problem("Claude Code isn't on this Mac yet; install it first.")
    _start([claude, "auth", "login", "--claudeai"], "claude-login.log")
    return {"started": True}


def sign_out() -> dict[str, Any]:
    claude = binary()
    if claude is None:
        raise Problem("Claude Code isn't on this Mac.")
    subprocess.run([claude, "auth", "logout"], capture_output=True, text=True,
                   timeout=STATUS_TIMEOUT_S, env=_env(), stdin=subprocess.DEVNULL)
    return status()


def install() -> dict[str, Any]:
    """Run Anthropic's installer for Claude Code (per user, no admin password). Returns at
    once; the app checks `status` until it is installed."""
    if binary() is not None:
        return {"started": False}
    _start(["/bin/bash", "-c", INSTALLER], "claude-install.log")
    return {"started": True}
