"""Stdlib HTTP to the model providers: the Anthropic Messages API and the OpenAI-compatible
ones (OpenAI, OpenRouter, xAI Grok, DeepSeek, a local Ollama). No HTTP client dependency.

Errors come back as ProviderHTTPError with one plain line, safe to show; never a key.
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

# Python's default User-Agent is refused by Cloudflare-fronted APIs (error 1010).
USER_AGENT = "alpha-brain/0.1"
ANTHROPIC_VERSION = "2023-06-01"


class ProviderHTTPError(Exception):
    """A provider call failed: bad key, network, or an answer of the wrong shape."""

    def __init__(self, message: str, status: int | None = None, *,
                 transient: bool = False) -> None:
        super().__init__(message)
        self.status = status
        # Worth one more try: the provider was busy or the connection never got there.
        self.transient = transient or status in {429, 500, 502, 503, 504, 529}


def auth_headers(kind: str, key: str | None) -> dict[str, str]:
    if kind == "anthropic":
        return {"x-api-key": key or "", "anthropic-version": ANTHROPIC_VERSION}
    return {"Authorization": f"Bearer {key}"} if key else {}


def _detail(raw: str) -> str:
    try:
        err = json.loads(raw).get("error")
        text = err.get("message") if isinstance(err, dict) else err
    except (ValueError, AttributeError):
        text = None
    return " ".join(str(text or raw).split())[:160]


def request(url: str, headers: dict[str, str], body: dict[str, Any] | None = None,
            timeout: float = 30) -> dict[str, Any]:
    req = urllib.request.Request(
        url,
        data=json.dumps(body).encode() if body is not None else None,
        method="POST" if body is not None else "GET",
        headers={**headers, "Content-Type": "application/json", "User-Agent": USER_AGENT},
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 - fixed hosts
            data = json.loads(resp.read().decode())
    except urllib.error.HTTPError as exc:
        detail = _detail(exc.read().decode(errors="replace"))
        if exc.code in (401, 403):
            raise ProviderHTTPError("The key was refused.", exc.code) from exc
        raise ProviderHTTPError(f"The provider said {exc.code}: {detail}", exc.code) from exc
    except urllib.error.URLError as exc:
        raise ProviderHTTPError(f"Couldn't reach it ({exc.reason}).", transient=True) from exc
    except TimeoutError as exc:
        raise ProviderHTTPError("It took too long to answer.") from exc
    except ValueError as exc:
        raise ProviderHTTPError("It answered with something that isn't JSON.") from exc
    if not isinstance(data, dict):
        raise ProviderHTTPError("It answered with something unexpected.")
    return data


def list_models(base_url: str, headers: dict[str, str], timeout: float = 5) -> list[dict[str, Any]]:
    """`GET /models` entries (`data`, each with an `id`). Also the cheap call that proves a key."""
    data = request(f"{base_url}/models", headers, timeout=timeout)
    return [m for m in data.get("data") or [] if isinstance(m, dict) and m.get("id")]
