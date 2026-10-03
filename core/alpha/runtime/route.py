"""One route in front of two ways to think (Q32): Claude through Claude Code, or ChatGPT
through the Codex CLI, each on the person's own subscription. Everything that runs a model
calls `run` here; the person's choice (`thinks_with`, a preference in the world) picks the
runner, Claude when unset. The request is the same either way."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

from alpha.runtime import claude_account, claude_cli, codex_account, codex_cli
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world.store import loads

ROUTES = ("claude", "codex")
PREFERENCE = "thinks_with"
WORDS = {"claude": "Claude", "codex": "ChatGPT"}


def chosen(world_path: Path | str | None) -> str:
    """The person's choice for the world at `world_path`; Claude when none or unreadable (a
    read of its own, not the serving World's connection: runs happen on many threads)."""
    if not world_path or not Path(world_path).exists():
        return "claude"
    try:
        db = sqlite3.connect(f"file:{Path(world_path)}?mode=ro", uri=True)
        try:
            row = db.execute("SELECT value FROM preferences WHERE key = ?",
                             (PREFERENCE,)).fetchone()
        finally:
            db.close()
    except sqlite3.Error:
        return "claude"
    value = loads(row[0], None) if row else None
    return str(value) if value in ROUTES else "claude"


def run(req: TurnRequest) -> RunResult:
    if chosen(req.world_path) == "codex":
        return codex_cli.run(req)
    return claude_cli.run(req)


def status(world_path: Path | str | None) -> dict[str, Any]:
    """The choice and both ways' states, for Settings."""
    return {"route": chosen(world_path), "claude": claude_account.status(),
            "codex": codex_account.status()}
