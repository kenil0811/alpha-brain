"""The person's ChatGPT: whether Alpha can think through it, and getting it there from the app.

Alpha's second way to think (Q32) runs through OpenAI's Codex CLI on the person's own ChatGPT
subscription (see `codex_cli`), the way the first runs through Claude Code. This module answers
what Settings needs: is the Codex CLI on this Mac (on the PATH, or inside the Codex app, which
bundles it), is it signed in and how, and it starts what a person can do about it: install
(the Codex app's page opens; the CLI also comes with `npm i -g @openai/codex`), sign in (Codex's
own login opens the browser; Alpha never sees it), and sign out.
"""

from __future__ import annotations

import json
import os
import re
import shutil
import subprocess
from pathlib import Path
from typing import Any

from alpha.world import preferences
from alpha.world.store import Problem
from alpha.world.world import alpha_home

STATUS_TIMEOUT_S = 20
APP_BINARY = Path("/Applications/Codex.app/Contents/Resources/codex")
INSTALL_PAGE = "https://chatgpt.com/codex"
CONFIG = Path.home() / ".codex" / "config.toml"
# The models the person's account offers, as the Codex CLI last fetched them for its picker.
MODELS = Path.home() / ".codex" / "models_cache.json"


def binary() -> str | None:
    configured = os.environ.get("ALPHA_CODEX")
    if configured:
        return shutil.which(configured) or (configured if Path(configured).exists() else None)
    found = shutil.which("codex")
    if found:
        return found
    return str(APP_BINARY) if APP_BINARY.exists() else None


def models() -> list[dict[str, str]]:
    """The models the person's ChatGPT account offers in Codex's own picker, Codex's order
    first; empty when Codex hasn't fetched them on this Mac yet."""
    try:
        data = json.loads(MODELS.read_text())
    except (OSError, ValueError):
        return []
    listed = [m for m in data.get("models") or [] if isinstance(m, dict)
              and m.get("slug") and m.get("visibility") == "list"]
    listed.sort(key=lambda m: m.get("priority", 1_000))
    return [{"id": str(m["slug"]), "name": str(m.get("display_name") or m["slug"])}
            for m in listed]


MODEL_PREFERENCE = "codex_model"


def model(world_path: Path | str | None) -> str | None:
    """The ChatGPT model a run uses: the person's pick in Settings (`codex_model`) while their
    account still offers it, otherwise `default_model()`."""
    picked = preferences.read(world_path, MODEL_PREFERENCE)
    offered = [m["id"] for m in models()]
    if isinstance(picked, str) and (picked in offered or not offered):
        return picked
    return default_model()


def default_model() -> str | None:
    """`ALPHA_CODEX_MODEL`, else the model set in `~/.codex/config.toml` while the account
    offers it, else the first the account offers, else None (the CLI's own default). A model
    the account doesn't offer fails every run (found 4 Oct: `gpt-6-astra` in the config, not
    on the account), so it is never passed on when the account's list is known."""
    configured = os.environ.get("ALPHA_CODEX_MODEL")
    if configured:
        return configured
    offered = [m["id"] for m in models()]
    try:
        m = re.search(r'^model\s*=\s*"([^"]+)"', CONFIG.read_text(), re.M)
    except OSError:
        m = None
    if m and (m.group(1) in offered or not offered):
        return m.group(1)
    return offered[0] if offered else None


def _log(name: str) -> Any:
    logs = alpha_home() / "logs"
    logs.mkdir(parents=True, exist_ok=True)
    return (logs / name).open("a")


def parse_status(code: int, text: str) -> dict[str, Any]:
    """`codex login status` in words: "Logged in using ChatGPT" / "… using API key" / not."""
    words = " ".join(text.split()).lower()
    signed_in = code == 0 and "logged in" in words and "not logged in" not in words
    out: dict[str, Any] = {"installed": True, "signed_in": signed_in}
    if signed_in:
        out["via"] = "chatgpt" if "chatgpt" in words else "api_key" if "api key" in words \
            else "unknown"
    return out


def status() -> dict[str, Any]:
    """{installed, signed_in, via}: `via` is "chatgpt" (the subscription) or "api_key"."""
    codex = binary()
    if codex is None:
        return {"installed": False, "signed_in": False}
    try:
        done = subprocess.run([codex, "login", "status"], capture_output=True, text=True,
                              timeout=STATUS_TIMEOUT_S, stdin=subprocess.DEVNULL)
    except (OSError, subprocess.TimeoutExpired):
        return {"installed": True, "signed_in": False}
    return parse_status(done.returncode, done.stdout + done.stderr)


def _start(argv: list[str], log: str) -> None:
    subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=_log(log), stderr=subprocess.STDOUT,
                     start_new_session=True)


def sign_in() -> dict[str, Any]:
    """Start Codex's sign-in with ChatGPT: it opens the browser and finishes there. Returns at
    once; the app checks `status` until it is signed in."""
    codex = binary()
    if codex is None:
        raise Problem("The Codex CLI isn't on this Mac yet; install it first.")
    _start([codex, "login"], "codex-login.log")
    return {"started": True}


def sign_out() -> dict[str, Any]:
    codex = binary()
    if codex is None:
        raise Problem("The Codex CLI isn't on this Mac.")
    subprocess.run([codex, "logout"], capture_output=True, text=True,
                   timeout=STATUS_TIMEOUT_S, stdin=subprocess.DEVNULL)
    return status()


def install() -> dict[str, Any]:
    """Open the Codex app's page (the app bundles the CLI). Returns at once; the app checks
    `status` until it is installed."""
    if binary() is not None:
        return {"started": False}
    _start(["/usr/bin/open", INSTALL_PAGE], "codex-install.log")
    return {"started": True}
