"""Provider API keys, kept in the macOS login Keychain — never in a plaintext file, localStorage
or a log. Each provider gets one generic-password item (`alpha-brain.<provider>`, account
`alpha-brain`): AB's own, never the items the older Alpha app keeps under `alpha.<provider>`.

The value is never passed as a subprocess argv: `security -i` reads a single command line from
stdin, so the key never shows up in `ps` output the way `security ... -w <key>` would.
"""

from __future__ import annotations

import os
import subprocess

_ACCOUNT = "alpha-brain"


class KeychainError(Exception):
    pass


def _service(provider: str) -> str:
    # ALPHA_KEYCHAIN_PREFIX keeps a test run away from the real items.
    return f"{os.environ.get('ALPHA_KEYCHAIN_PREFIX', 'alpha-brain.')}{provider}"


def _quote(value: str) -> str:
    """Double-quote `value` for `security`'s command-line-style stdin parser."""
    return '"' + value.replace("\\", "\\\\").replace('"', '\\"') + '"'


def set_key(provider: str, key: str) -> None:
    """Save (or replace, `-U`) the key for `provider`."""
    key = key.strip()
    if not key:
        raise KeychainError("the key is empty")
    if "\n" in key or "\r" in key:
        raise KeychainError("the key cannot contain a newline")
    command = (
        f"add-generic-password -U -s {_quote(_service(provider))} "
        f"-a {_quote(_ACCOUNT)} -w {_quote(key)}\n"
    )
    try:
        proc = subprocess.run(
            ["security", "-i"], input=command, text=True, capture_output=True, timeout=10
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise KeychainError(f"could not reach the Keychain: {exc}") from exc
    if proc.returncode != 0:
        raise KeychainError((proc.stderr or proc.stdout).strip() or "could not save the key")


def get_key(provider: str) -> str | None:
    """The saved key for `provider`, or None when nothing is saved."""
    try:
        proc = subprocess.run(
            ["security", "find-generic-password", "-s", _service(provider), "-a", _ACCOUNT, "-w"],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired):
        return None
    if proc.returncode != 0:
        return None
    value = proc.stdout.strip("\n")
    return value or None


def has_key(provider: str) -> bool:
    return get_key(provider) is not None


def delete_key(provider: str) -> None:
    """Remove the saved key for `provider`. Never an error when there was none."""
    try:
        subprocess.run(
            ["security", "delete-generic-password", "-s", _service(provider), "-a", _ACCOUNT],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        raise KeychainError(f"could not reach the Keychain: {exc}") from exc


def last4(provider: str) -> str | None:
    """The last 4 characters of the saved key, for display (`•••• ab12`) — the key itself is
    never returned to a caller outside this module's own get_key()."""
    key = get_key(provider)
    return key[-4:] if key else None
