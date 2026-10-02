"""Settings -> Models: every way Alpha can reach a model, each its own row, and which one a turn
uses.

A row is a sign-in (Claude through Claude Code, ChatGPT through Codex), a key (kept only in the
macOS Keychain; the API returns its last 4 characters, never the key), or Ollama on this Mac.
The starred row is the default; a conversation can pick another in the composer (+ ->
Advanced -> Model). A call that is refused turns its row red with the reason until a call
works, the key changes or the person reconnects.

Choices live in the world's `meta` table: `models.default`, `models.model.<provider>` and
`route.<thread id | stream>`.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from alpha.models import claude_oauth, keychain
from alpha.models.providers import ProviderHTTPError, auth_headers, list_models
from alpha.runtime import claude_account
from alpha.world.store import Problem, Store

OLLAMA_URL = "http://127.0.0.1:11434"

# id -> label, how it is reached, the OpenAI-compatible (or Anthropic) base URL, its default model
PROVIDERS: dict[str, dict[str, Any]] = {
    "claude": {"label": "Claude", "kind": "claude_cli", "default_model": "sonnet"},
    "claude_api": {"label": "Claude API", "kind": "anthropic",
                   "base_url": "https://api.anthropic.com/v1", "default_model": "claude-opus-5-5"},
    "chatgpt": {"label": "ChatGPT", "kind": "codex", "default_model": None},
    "chatgpt_api": {"label": "ChatGPT API", "kind": "openai",
                    "base_url": "https://api.openai.com/v1", "default_model": "gpt-5.5"},
    "openrouter": {"label": "OpenRouter", "kind": "openai",
                   "base_url": "https://openrouter.ai/api/v1", "default_model": "openrouter/auto"},
    "grok": {"label": "Grok", "kind": "openai", "base_url": "https://api.x.ai/v1",
             "default_model": "grok-4"},
    "deepseek": {"label": "DeepSeek", "kind": "openai", "base_url": "https://api.deepseek.com/v1",
                 "default_model": "deepseek-chat"},
    "ollama": {"label": "Ollama", "kind": "openai", "base_url": f"{OLLAMA_URL}/v1", "local": True,
               "default_model": None},
}
# Shown before a provider's own list can be fetched (and for the CLI sign-ins, which have none).
PINNED: dict[str, list[dict[str, str]]] = {
    "claude": [{"id": "opus", "label": "Claude Opus"}, {"id": "sonnet", "label": "Claude Sonnet"},
               {"id": "haiku", "label": "Claude Haiku"}],
    "claude_api": [{"id": "claude-opus-5-5", "label": "Claude Opus 5.5"},
                   {"id": "claude-sonnet-5-5", "label": "Claude Sonnet 5.5"},
                   {"id": "claude-haiku-4-5", "label": "Claude Haiku 4.5"}],
    # ponytail: used only when Codex's own cache (~/.codex/models_cache.json) can't be read.
    "chatgpt": [{"id": "gpt-5.5", "label": "GPT-5.5"}],
    "chatgpt_api": [{"id": "gpt-5.5", "label": "GPT-5.5"}],
    "openrouter": [{"id": "openrouter/auto", "label": "Auto (OpenRouter picks)"}],
    "grok": [{"id": "grok-4", "label": "Grok 4"}],
    "deepseek": [{"id": "deepseek-chat", "label": "DeepSeek Chat"},
                 {"id": "deepseek-reasoner", "label": "DeepSeek Reasoner"}],
}
# OpenAI's /models lists every model (embeddings, speech, images); keep the chat ones.
_OPENAI_CHAT = ("gpt-", "o1", "o3", "o4", "chatgpt-")
_OPENAI_NOT_CHAT = ("audio", "realtime", "tts", "transcribe", "image", "embedding", "search")

CODEX_BUNDLES = (
    "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex",
    "~/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex",
)
CODEX_PACKAGE = "@openai/codex"
STATUS_TTL_S = 20.0
MODELS_TTL_S = 600.0
SIGN_IN_S = 300.0

# provider -> the one line a refused call or failed check said. Shared by every Accounts (the
# router notes here; Settings reads). Cleared by a call that works, a new key or a reconnect.
_ERRORS: dict[str, str] = {}
_ERRORS_LOCK = threading.Lock()


def one_line(text: str, limit: int = 160) -> str:
    line = " ".join(str(text).split())
    return line if len(line) <= limit else line[: limit - 1] + "…"


def note_failed(provider: str, said: str) -> None:
    with _ERRORS_LOCK:
        _ERRORS[provider] = one_line(said or "The last call failed.")


def note_working(provider: str) -> None:
    with _ERRORS_LOCK:
        _ERRORS.pop(provider, None)


def failed(provider: str) -> str | None:
    with _ERRORS_LOCK:
        return _ERRORS.get(provider)


def codex_binary() -> str | None:
    found = shutil.which("codex")
    if found:
        return found
    local = Path.home() / ".local" / "bin" / "codex"
    return str(local) if local.exists() else None


def ollama_models(timeout: float = 1.0) -> list[dict[str, str]] | None:
    """The models pulled into a local Ollama; None when Ollama isn't running."""
    try:
        listed = list_models(PROVIDERS["ollama"]["base_url"], {}, timeout=timeout)
    except ProviderHTTPError:
        return None
    return [{"id": str(m["id"]), "label": str(m["id"])} for m in listed]


class Prefs:
    """Small JSON values in the world's `meta` table."""

    def __init__(self, store: Store) -> None:
        self.store = store

    def get(self, key: str, default: Any = None) -> Any:
        row = self.store.one("SELECT value FROM meta WHERE key = ?", (key,))
        return json.loads(row["value"]) if row else default

    def set(self, key: str, value: Any) -> None:
        with self.store.tx() as db:
            if value is None:
                db.execute("DELETE FROM meta WHERE key = ?", (key,))
            else:
                db.execute("INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key)"
                           " DO UPDATE SET value = excluded.value", (key, json.dumps(value)))


class Accounts:
    def __init__(self, store: Store) -> None:
        self.prefs = Prefs(store)
        self._lock = threading.Lock()
        self._status: dict[str, tuple[float, dict[str, Any]]] = {}
        self._models: dict[str, tuple[float, list[dict[str, str]]]] = {}
        self._procs: dict[str, subprocess.Popen[bytes]] = {}

    # ---- rows ----

    @staticmethod
    def spec(provider: str) -> dict[str, Any]:
        if provider not in PROVIDERS:
            raise Problem(f"There is no model provider {provider!r}.")
        return PROVIDERS[provider]

    def default(self) -> str:
        chosen = self.prefs.get("models.default")
        return chosen if chosen in PROVIDERS else "claude"

    def rows(self) -> list[dict[str, Any]]:
        with ThreadPoolExecutor(max_workers=len(PROVIDERS)) as pool:
            rows = list(pool.map(self.describe, PROVIDERS))
        star = self.default()
        return [{**r, "default": r["id"] == star} for r in rows]

    def _cached(self, provider: str, probe: Any) -> dict[str, Any]:
        hit = self._status.get(provider)
        if hit and time.monotonic() - hit[0] < STATUS_TTL_S:
            return hit[1]
        value: dict[str, Any] = probe()
        self._status[provider] = (time.monotonic(), value)
        return value

    def _forget(self, provider: str) -> None:
        self._status.pop(provider, None)
        self._models.pop(provider, None)

    def _sign_in_state(self, provider: str) -> dict[str, Any]:
        if provider == "claude":
            def claude() -> dict[str, Any]:
                st = claude_account.status()
                held = claude_oauth.signed_in()
                if not st["installed"]:
                    return {"state": "cli_missing", "why": "Claude Code isn't on this Mac yet."}
                if held or st["signed_in"]:
                    return {"state": "connected", "who": None if held else st.get("email")}
                return {"state": "needs_sign_in", "why": "Not signed in."}
            return self._cached(provider, claude)

        def codex() -> dict[str, Any]:
            binary = codex_binary()
            if binary is None:
                return {"state": "cli_missing", "why": "Codex isn't on this Mac yet."}
            try:
                done = subprocess.run([binary, "login", "status"], capture_output=True, text=True,
                                      timeout=10, stdin=subprocess.DEVNULL)
            except (OSError, subprocess.TimeoutExpired):
                return {"state": "needs_sign_in", "why": "Codex didn't answer."}
            text = (done.stdout + done.stderr).lower()
            if done.returncode == 0 and "logged in" in text:
                return {"state": "connected"}
            return {"state": "needs_sign_in", "why": "Not signed in."}
        return self._cached(provider, codex)

    def describe(self, provider: str) -> dict[str, Any]:
        spec = self.spec(provider)
        row: dict[str, Any] = {"id": provider, "label": spec["label"], "key_last4": None,
                               "installing": False, "who": None}
        if spec["kind"] in ("claude_cli", "codex"):
            row["kind"] = "sign_in"
            st = self._sign_in_state(provider)
            row.update(state=st["state"], who=st.get("who"), why=st.get("why"))
            proc = self._procs.get(f"install:{provider}")
            row["installing"] = proc is not None and proc.poll() is None
        elif spec.get("local"):
            row["kind"] = "local"
            found = self._cached(provider, lambda: {"models": ollama_models()})["models"]
            if found is None:
                row.update(state="not_running", why="Ollama isn't running on this Mac.")
            elif not found:
                row.update(state="not_running", why="Ollama has no models yet.")
            else:
                row.update(state="connected")
        else:
            row["kind"] = "key"
            row["key_last4"] = keychain.last4(provider)
            row.update(state="connected" if row["key_last4"] else "needs_key",
                       why=None if row["key_last4"] else "No key saved.")
        error = failed(provider) if row["state"] == "connected" else None
        row["error"] = error
        color = "red" if error else "green" if row["state"] == "connected" else "grey"
        row["dot"] = {"color": color, "tooltip": error or row.get("why") or "Connected."}
        return row

    def connected(self, provider: str) -> bool:
        return bool(self.describe(provider)["state"] == "connected")

    # ---- models ----

    def models(self, provider: str) -> dict[str, Any]:
        listed = self._listed(provider)
        return {"models": listed, "selected": self.model_for(provider, listed)}

    def model_for(self, provider: str, listed: list[dict[str, str]] | None = None) -> str | None:
        chosen = self.prefs.get(f"models.model.{provider}")
        if chosen:
            return str(chosen)
        default = self.spec(provider)["default_model"]
        if provider == "chatgpt":
            return None  # Codex's own default for the account
        if default:
            return str(default)
        found = listed if listed is not None else (ollama_models() or [])
        return found[0]["id"] if found else None

    def select_model(self, provider: str, model: str) -> dict[str, Any]:
        self.spec(provider)
        self.prefs.set(f"models.model.{provider}", model.strip() or None)
        return self.models(provider)

    def _listed(self, provider: str) -> list[dict[str, str]]:
        spec = self.spec(provider)
        if provider == "claude":
            return PINNED["claude"]
        if provider == "chatgpt":
            return codex_models() or PINNED["chatgpt"]
        if provider == "ollama":
            return ollama_models() or []
        hit = self._models.get(provider)
        if hit and time.monotonic() - hit[0] < MODELS_TTL_S:
            return hit[1]
        key = keychain.get_key(provider)
        if not key:
            return PINNED.get(provider, [])
        try:
            raw = list_models(spec["base_url"], auth_headers(spec["kind"], key))
        except ProviderHTTPError:
            return PINNED.get(provider, [])
        if provider == "chatgpt_api":
            raw = [m for m in raw if str(m["id"]).startswith(_OPENAI_CHAT)
                   and not any(w in str(m["id"]) for w in _OPENAI_NOT_CHAT)]
        listed = sorted(({"id": str(m["id"]),
                          "label": str(m.get("display_name") or m.get("name") or m["id"])}
                         for m in raw), key=lambda m: m["label"].lower())
        self._models[provider] = (time.monotonic(), listed)
        return listed or PINNED.get(provider, [])

    # ---- the default, and a conversation's own choice ----

    def star(self, provider: str) -> list[dict[str, Any]]:
        self.spec(provider)
        self.prefs.set("models.default", provider)
        return self.rows()

    def choice(self, thread: str | None) -> dict[str, Any] | None:
        chosen = self.prefs.get(f"route.{thread or 'stream'}")
        return chosen if isinstance(chosen, dict) and chosen.get("provider") in PROVIDERS else None

    def choose(self, thread: str | None, provider: str | None, model: str | None) -> dict[str, Any]:
        if provider is not None:
            self.spec(provider)
        self.prefs.set(f"route.{thread or 'stream'}",
                       {"provider": provider, "model": model} if provider else None)
        return self.route(thread)

    def route(self, thread: str | None) -> dict[str, Any]:
        """{provider, model, chosen}: the conversation's choice, else the starred default."""
        chosen = self.choice(thread)
        provider = chosen["provider"] if chosen else self.default()
        model = (chosen or {}).get("model") or self.model_for(provider)
        return {"provider": provider, "model": model, "chosen": chosen is not None}

    # ---- keys ----

    def save_key(self, provider: str, key: str) -> dict[str, Any]:
        spec = self.spec(provider)
        key = key.strip()
        if spec["kind"] not in ("anthropic", "openai") or spec.get("local"):
            raise Problem(f"{spec['label']} doesn't take a key.")
        if not key:
            raise Problem("Paste a key first.")
        try:
            list_models(spec["base_url"], auth_headers(spec["kind"], key), timeout=10)
        except ProviderHTTPError as e:
            if e.status in (400, 401, 403):  # a list call only fails like this over the key
                raise Problem(f"{spec['label']} refused that key.") from e
            # Not a verdict on the key (offline, a hiccup): keep it, say why the row is red.
            keychain.set_key(provider, key)
            note_failed(provider, str(e))
            self._forget(provider)
            return self.describe(provider)
        keychain.set_key(provider, key)
        note_working(provider)
        self._forget(provider)
        return self.describe(provider)

    def remove_key(self, provider: str) -> dict[str, Any]:
        self.spec(provider)
        keychain.delete_key(provider)
        note_working(provider)
        self._forget(provider)
        return self.describe(provider)

    def test(self, provider: str) -> dict[str, Any]:
        """A live check: a key row lists its models, Ollama answers, a sign-in row asks its
        CLI. Red with the reason when it fails."""
        spec = self.spec(provider)
        self._forget(provider)
        if spec["kind"] in ("anthropic", "openai"):
            key = keychain.get_key(provider)
            if key or spec.get("local"):
                try:
                    list_models(spec["base_url"], auth_headers(spec["kind"], key), timeout=10)
                    note_working(provider)
                except ProviderHTTPError as e:
                    note_failed(provider, f"{spec['label']}: {e}")
        else:
            note_working(provider)
        return self.describe(provider)

    # ---- sign-ins and installs ----

    def reconnect(self, provider: str) -> dict[str, Any]:
        """Disconnect so the person can connect again at once: a key row loses its key, Claude
        the sign-in Alpha holds, ChatGPT Codex's login."""
        spec = self.spec(provider)
        note_working(provider)
        if spec["kind"] in ("anthropic", "openai") and not spec.get("local"):
            keychain.delete_key(provider)
        if provider == "claude":
            claude_oauth.sign_out()
        binary = codex_binary() if provider == "chatgpt" else None
        if binary:
            subprocess.run([binary, "logout"], capture_output=True, timeout=10, check=False,
                           stdin=subprocess.DEVNULL)
        self._forget(provider)
        return self.describe(provider)

    def sign_in(self, provider: str) -> dict[str, Any]:
        """Claude: Alpha's own browser sign-in (the page shows a code to paste back). ChatGPT:
        Codex's browser sign-in, which finishes by itself; the app checks until it lands."""
        spec = self.spec(provider)
        note_working(provider)
        self._forget(provider)
        if provider == "claude":
            if claude_account.binary() is None:
                claude_account.install()
            claude_oauth.open_in_browser(claude_oauth.authorize_url())
            return {**self.describe(provider), "needs_code": True}
        if provider != "chatgpt":
            raise Problem(f"{spec['label']} connects with a key, not a sign-in.")
        binary = codex_binary()
        if binary is None:
            raise Problem("Codex isn't on this Mac yet.")
        self._start(f"sign_in:{provider}", [binary, "login"], SIGN_IN_S)
        return self.describe(provider)

    def finish_sign_in(self, provider: str, code: str) -> dict[str, Any]:
        if provider != "claude":
            raise Problem("Only Claude signs in with a pasted code.")
        try:
            claude_oauth.finish(code)
        except claude_oauth.OAuthError as e:
            raise Problem(str(e)) from e
        note_working(provider)
        self._forget(provider)
        return self.describe(provider)

    def install(self, provider: str) -> dict[str, Any]:
        """Put the sign-in row's CLI on this Mac without a terminal: Claude Code through
        Anthropic's installer; Codex by linking the copy the ChatGPT app ships, else npm."""
        self.spec(provider)
        self._forget(provider)
        if provider == "claude":
            claude_account.install()
            return self.describe(provider)
        if provider != "chatgpt":
            raise Problem("There is nothing to install for this one.")
        if codex_binary():
            return self.describe(provider)
        local = Path.home() / ".local"
        bundle = next((p for p in map(os.path.expanduser, CODEX_BUNDLES) if os.access(p, os.X_OK)),
                      None)
        if bundle:
            link = local / "bin" / "codex"
            link.parent.mkdir(parents=True, exist_ok=True)
            if link.is_symlink():
                link.unlink()
            link.symlink_to(bundle)
            return self.describe(provider)
        npm = shutil.which("npm")
        if npm is None:
            raise Problem("Codex can't be installed here. Use ChatGPT API with a key instead.")
        self._start(f"install:{provider}", [npm, "install", "-g", "--prefix", str(local),
                                            CODEX_PACKAGE], SIGN_IN_S)
        return self.describe(provider)

    def _start(self, name: str, argv: list[str], limit: float) -> None:
        with self._lock:
            running = self._procs.get(name)
            if running is not None and running.poll() is None:
                return
            proc = subprocess.Popen(argv, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                    stderr=subprocess.DEVNULL, start_new_session=True)
            self._procs[name] = proc
        timer = threading.Timer(limit, proc.terminate)  # a no-op once it has finished
        timer.daemon = True
        timer.start()


def codex_models() -> list[dict[str, str]]:
    """The models Codex itself lists for this account (its own cache)."""
    try:
        cache = json.loads((Path.home() / ".codex" / "models_cache.json").read_text())
        listed = sorted((m for m in cache.get("models", []) if m.get("visibility") == "list"),
                        key=lambda m: m.get("priority", 0))
    except (OSError, ValueError, AttributeError):
        return []
    return [{"id": str(m["slug"]), "label": str(m.get("display_name") or m["slug"])}
            for m in listed if m.get("slug")]
