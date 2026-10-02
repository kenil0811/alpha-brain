"""The runner the core uses: each turn goes to its conversation's chosen model, else the starred
default (Settings -> Models), through the way that model is reached.

Claude (sign-in) runs on Claude Code with the sign-in Alpha holds, ChatGPT on Codex, every key
row and Ollama on Alpha's own tool loop. A call that fails turns its row red with the reason; one
that works clears it.
"""

from __future__ import annotations

from dataclasses import replace

from alpha.models import claude_oauth, keychain
from alpha.models.accounts import PROVIDERS, Accounts, codex_binary, note_failed, note_working
from alpha.runtime import api_runner, claude_cli, codex_cli
from alpha.runtime.claude_cli import RunResult, TurnRequest


def not_connected(provider: str) -> RunResult:
    label = PROVIDERS[provider]["label"]
    return RunResult(reply="", ok=False, error=f"{label} isn't connected yet.",
                     raw={"needs_connect": provider})


class Router:
    def __init__(self, accounts: Accounts) -> None:
        self.accounts = accounts

    def __call__(self, req: TurnRequest) -> RunResult:
        route = self.accounts.route(req.thread_id)
        provider, model = str(route["provider"]), route["model"]
        if not self.accounts.connected(provider):
            return not_connected(provider)
        spec = PROVIDERS[provider]
        # A thread's saved session belongs to the CLI that made it.
        codex_session = bool(req.resume and req.resume.startswith(codex_cli.PREFIX))
        if provider == "claude":
            result = claude_cli.run(replace(req, model=model,
                                            resume=None if codex_session else req.resume),
                                    extra_env=claude_oauth.cli_env())
        elif provider == "chatgpt":
            result = codex_cli.run(replace(req, model=model,
                                           resume=req.resume if codex_session else None),
                                   binary=codex_binary() or "codex")
        elif not model:
            result = RunResult(reply="", ok=False, error=f"{spec['label']} has no model to use.")
        else:
            result = api_runner.run(req, kind=spec["kind"], base_url=spec["base_url"],
                                    key=keychain.get_key(provider), model=model)
        if result.ok:
            note_working(provider)
        else:
            note_failed(provider, result.error or "No answer came back.")
        result.raw = {**result.raw, "provider": provider, "model": model}
        return result
