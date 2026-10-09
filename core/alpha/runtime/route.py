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
TRIAL_SYSTEM = """You are Alpha, checking that your tools answer. Call the tool collections_list \
once, then reply with the single word ok. Nothing else."""
TRIAL_SENTENCE = "Call collections_list once and reply ok."


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


def trial(world_path: Path | str, which: str) -> tuple[bool, str]:
    """One real tool call through a way of thinking, before the person is allowed to switch
    to it (8 Oct: a route that could not reach the tools was in use for five days). True with a
    line saying so, or False with the reason."""
    runner = codex_cli.run if which == "codex" else claude_cli.run
    result = runner(TurnRequest(sentence=TRIAL_SENTENCE, system=TRIAL_SYSTEM,
                                world_path=Path(world_path), turn_id="trial", model="haiku"))
    if not result.ok:
        return False, result.error or "no answer came back"
    if result.tools_called == 0:
        return False, "the model answered without calling a tool"
    return True, (f"{result.tools_called} tool call{'s' if result.tools_called != 1 else ''}"
                  " answered")


def status(world_path: Path | str | None) -> dict[str, Any]:
    """The choice and both ways' states, for Settings."""
    return {"route": chosen(world_path), "claude": claude_account.status(),
            "codex": codex_account.status()}
