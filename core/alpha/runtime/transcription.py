"""Speech to text through Whisper (Groq, else OpenAI), for the mic when a key is saved.

The audio lives in memory for the one outbound call: never written to disk, never logged. The key
goes only in the Authorization header. Keys are read from the macOS login Keychain under the
names Alpha uses for every provider key (service `alpha.<provider>`, account `alpha`); without a
key the app listens on this Mac instead.
"""

from __future__ import annotations

import json
import mimetypes
import secrets
import subprocess
import urllib.error
import urllib.request

from alpha.world.store import Problem

MAX_AUDIO_BYTES = 25 * 1024 * 1024  # the providers' own upload limit
# Keychain provider id, endpoint, model; tried in this order unless one is preferred.
PROVIDERS: tuple[tuple[str, str, str], ...] = (
    ("groq", "https://api.groq.com/openai/v1/audio/transcriptions", "whisper-large-v3-turbo"),
    ("chatgpt_api", "https://api.openai.com/v1/audio/transcriptions", "whisper-1"),
)


def saved_key(provider: str) -> str | None:
    # ponytail: reads the Keychain item directly; use the shared key store once Core has one.
    try:
        out = subprocess.run(
            ["security", "find-generic-password", "-s", f"alpha.{provider}", "-a", "alpha", "-w"],
            capture_output=True, text=True, timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if out.returncode != 0:
        return None
    return out.stdout.strip() or None


def available() -> bool:
    return any(saved_key(p) for p, _, _ in PROVIDERS)


def _multipart(model: str, filename: str, content: bytes, mime: str) -> tuple[bytes, str]:
    boundary = f"----alpha{secrets.token_hex(16)}"
    head = (f'--{boundary}\r\nContent-Disposition: form-data; name="model"\r\n\r\n{model}\r\n'
            f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="{filename}"'
            f"\r\nContent-Type: {mime}\r\n\r\n").encode()
    return head + content + f"\r\n--{boundary}--\r\n".encode(), boundary


def _call(url: str, model: str, key: str, audio: bytes, mime: str) -> str:
    body, boundary = _multipart(model, f"speech{mimetypes.guess_extension(mime) or '.webm'}",
                                audio, mime)
    req = urllib.request.Request(url, data=body, method="POST", headers={
        "Authorization": f"Bearer {key}", "User-Agent": "Alpha",
        "Content-Type": f"multipart/form-data; boundary={boundary}"})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:  # noqa: S310 - fixed https hosts
            text = json.loads(resp.read().decode()).get("text")
    except urllib.error.HTTPError as e:
        raise Problem("The saved transcription key was refused." if e.code in (401, 403)
                      else f"Transcription failed ({e.code}).") from e
    except (urllib.error.URLError, TimeoutError) as e:
        raise Problem("The transcription service didn't answer.") from e
    if not isinstance(text, str):
        raise Problem("The transcription service returned no text.")
    return text


def transcribe(audio: bytes, mime: str, preferred: str | None = None) -> str:
    if len(audio) > MAX_AUDIO_BYTES:
        raise Problem("That recording is too long to transcribe.")
    for provider, url, model in sorted(PROVIDERS, key=lambda p: p[0] != preferred):
        key = saved_key(provider)
        if key:
            return _call(url, model, key, audio, mime)
    raise Problem("No transcription key is saved.")
