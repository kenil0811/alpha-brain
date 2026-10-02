"""The runner the core uses: each turn goes to its conversation's chosen model, else the starred
default (Settings -> Models), through the way that model is reached.

Claude (sign-in) runs on Claude Code with the sign-in Alpha holds, ChatGPT on Codex, every key
row and Ollama on Alpha's own tool loop. A call that fails turns its row red with the reason; one
that works clears it. A failure comes back in plain words (`plain_failure`), and one that is
really a connection problem says which row to connect, so the window shows the connect card.

Settings it applies: how long Claude thinks (`models.effort`), and for a thread that makes a
project (kind `build`) its own Claude model and time limit (Settings -> Builds).
"""

from __future__ import annotations

from dataclasses import replace
from typing import Any

from alpha.models import claude_oauth, keychain, settings
from alpha.models.accounts import PROVIDERS, Accounts, codex_binary, note_failed, note_working
from alpha.runtime import api_runner, claude_cli, codex_cli
from alpha.runtime.claude_cli import RunResult, TurnRequest


def not_connected(provider: str) -> RunResult:
    label = PROVIDERS[provider]["label"]
    return RunResult(reply="", ok=False, error=f"{label} isn't connected yet.",
                     raw={"needs_connect": provider})


def plain_failure(provider: str, error: str | None, raw: dict[str, Any]) -> tuple[str, str | None,
                                                                                  str | None]:
    """(what the person reads, the row to connect or None, how: "sign_in" | "key" | None) for
    a failed call, after Alpha's own wording (assistant/acting.py `model_error_reply`)."""
    text = (error or "").lower()
    label = PROVIDERS[provider]["label"]
    sign_in = PROVIDERS[provider]["kind"] in ("claude_cli", "codex")
    if raw.get("cancelled"):
        return error or "You stopped it.", None, None
    if "subscription" in text and ("disabled" in text or "not available" in text):
        return ("I can't reach the model: your organization turned off Claude sign-in for "
                "Claude Code. Add an Anthropic API key in Settings → Models."), "claude_api", "key"
    if "not logged in" in text or "not signed in" in text or "/login" in text:
        return (f"I can't reach the model: {label} isn't signed in. Sign in again, or add an "
                "API key in Settings → Models."), provider, "sign_in"
    if raw.get("cli_missing") or "isn't on this mac" in text:
        return (f"I can't reach the model: {label} isn't installed on this Mac yet."), provider, \
            "sign_in"
    if any(w in text for w in ("401", "403", "invalid api key", "invalid x-api-key",
                               "authentication", "unauthorized", "refused that key")):
        how = "sign_in" if sign_in else "key"
        return (f"I can't reach the model: {label} refused the sign-in or key. "
                "Connect it again in Settings → Models."), provider, how
    if raw.get("timeout") or "took longer" in text:
        return "I can't reach the model: it took too long to respond. Try again.", None, None
    return "I can't reach the model right now. Try again in a moment.", None, None


class Router:
    def __init__(self, accounts: Accounts) -> None:
        self.accounts = accounts

    def __call__(self, req: TurnRequest) -> RunResult:
        route = self.accounts.route(req.thread_id)
        provider, model = str(route["provider"]), route["model"]
        if not self.accounts.connected(provider):
            return not_connected(provider)
        spec = PROVIDERS[provider]
        store = self.accounts.prefs.store
        req = replace(req, effort=str(settings.get(store, "models.effort")))
        thread = store.one("SELECT kind FROM threads WHERE id = ?", (req.thread_id,)) \
            if req.thread_id else None
        if thread and thread["kind"] == "build":
            # Making a project: Settings -> Builds says which model makes it (on Claude).
            chosen = settings.get(store, "build.model")
            if provider == "claude" and chosen != "default" and not route["chosen"]:
                model = str(chosen)
        if provider == "claude":
            result = claude_cli.run(replace(req, model=model), extra_env=claude_oauth.cli_env())
        elif provider == "chatgpt":
            result = codex_cli.run(replace(req, model=model), binary=codex_binary() or "codex")
        elif not model:
            result = RunResult(reply="", ok=False, error=f"{spec['label']} has no model to use.")
        else:
            result = api_runner.run(req, kind=spec["kind"], base_url=spec["base_url"],
                                    key=keychain.get_key(provider), model=model)
        if result.ok:
            note_working(provider)
            result.raw = {**result.raw, "provider": provider, "model": model}
            return result
        if not result.raw.get("cancelled"):
            note_failed(provider, result.error or "No answer came back.")
        said, connect, how = plain_failure(provider, result.error, result.raw)
        result.raw = {**result.raw, "provider": provider, "model": model, "plain": True,
                      "detail": result.error}
        if connect:
            result.raw.update(needs_connect=connect, connect_kind=how)
        result.error = said
        return result
