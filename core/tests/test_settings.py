from __future__ import annotations

import stat
import time
from pathlib import Path

import pytest

from alpha.connectors import browser
from alpha.runtime import claude_account
from alpha.world import backup
from alpha.world.world import World


def fake_claude(tmp_path: Path, status: str, code: int) -> Path:
    script = tmp_path / "claude"
    script.write_text(f"#!/bin/sh\ncat <<'JSON'\n{status}\nJSON\nexit {code}\n")
    script.chmod(script.stat().st_mode | stat.S_IEXEC)
    return script


def test_claude_status_says_who_is_signed_in(tmp_path: Path,
                                             monkeypatch: pytest.MonkeyPatch) -> None:
    script = fake_claude(tmp_path, '{"loggedIn": true, "authMethod": "claude.ai",'
                         ' "email": "k@example.com", "subscriptionType": "max"}', 0)
    monkeypatch.setenv("ALPHA_CLAUDE", str(script))
    assert claude_account.status() == {"installed": True, "signed_in": True,
                                       "email": "k@example.com", "plan": "Max",
                                       "via": "subscription"}


def test_claude_status_when_signed_out_or_missing(tmp_path: Path,
                                                  monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ALPHA_CLAUDE", str(fake_claude(tmp_path, '{"loggedIn": false}', 1)))
    assert claude_account.status() == {"installed": True, "signed_in": False}
    monkeypatch.setenv("ALPHA_CLAUDE", str(tmp_path / "nowhere" / "claude"))
    monkeypatch.setenv("PATH", str(tmp_path / "empty"))
    monkeypatch.setenv("HOME", str(tmp_path))
    assert claude_account.status() == {"installed": False, "signed_in": False}


def test_a_backup_is_a_copy_of_the_world(world: World) -> None:
    world.journal.append("did", "Something worth keeping.")
    info = backup.back_up(world)
    assert len(info["backups"]) == 1 and info["size"] > 0
    copy = World(Path(info["folder"]) / "backups" / info["backups"][0]["name"])
    assert copy.journal.recent(1)[0]["text"] == "Something worth keeping."
    copy.close()


def fake_node(tmp_path: Path, body: str) -> Path:
    script = tmp_path / "node"
    script.write_text("#!/bin/sh\n" + body)
    script.chmod(script.stat().st_mode | stat.S_IEXEC)
    return script


def test_the_browser_is_found_installed_or_installed_by_alpha(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Alpha's own browser: absent, then installed by Playwright's installer in the background
    with its progress in words, then found; sign-ins go to Chrome only when it is there."""
    connectors = tmp_path / "connectors"
    (connectors / "browser" / "node_modules" / "playwright").mkdir(parents=True)
    (connectors / "browser" / "node_modules" / "playwright" / "cli.js").write_text("")
    monkeypatch.setenv("ALPHA_CONNECTORS", str(connectors))
    monkeypatch.setenv("ALPHA_HOME", str(tmp_path / "home"))
    monkeypatch.setattr(browser, "CHROME_APPS", [str(tmp_path / "Google Chrome.app")])
    chromium = tmp_path / "chromium" / "chrome"
    # A node that answers executablePath with a path that isn't there yet.
    monkeypatch.setenv("ALPHA_NODE", str(fake_node(tmp_path, f"echo {chromium}\n")))
    monkeypatch.setattr(browser, "_installing", None)
    assert browser.status() == {"installed": False, "installing": False, "words": None,
                                "chrome": False, "problem": None}
    assert browser.chrome_channel() is None
    # The installer: writes what Playwright's writes, then the browser is there.
    monkeypatch.setenv("ALPHA_NODE", str(fake_node(tmp_path, f"""
if [ "$3" = "chromium" ]; then
  echo "Downloading Chromium 151.0.7922.34 (playwright build v1234) from https://x"
  printf '|■■■■      |  40%% of 160.4 MiB\\r'
  sleep 1
  mkdir -p {chromium.parent} && touch {chromium}
  echo "Chromium 151.0.7922.34 (playwright build v1234) downloaded to {chromium.parent}"
else
  echo {chromium}
fi
""")))
    out = browser.install()
    assert out["installing"] is True and out["installed"] is False
    deadline = time.monotonic() + 10
    while browser.status()["installing"] and time.monotonic() < deadline:
        words = browser.status()["words"]
        assert words is None or words.startswith("Downloading")
        time.sleep(0.05)
    assert browser.status() == {"installed": True, "installing": False, "words": None,
                                "chrome": False, "problem": None}
    assert browser.progress_words(
        "Downloading Chromium 151.0.7922.34 (playwright build v1234) from https://x\n"
        "|■■■■      |  40% of 160.4 MiB\r|■■■■■     |  50% of 160.4 MiB") == (
        "Downloading Chromium 151.0.7922.34… 50% of 160.4 MiB")
    (tmp_path / "Google Chrome.app").mkdir()
    assert browser.chrome_channel() == "chrome" and browser.status()["chrome"] is True


def test_a_failed_browser_install_says_so(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    connectors = tmp_path / "connectors"
    (connectors / "browser" / "node_modules" / "playwright").mkdir(parents=True)
    (connectors / "browser" / "node_modules" / "playwright" / "cli.js").write_text("")
    monkeypatch.setenv("ALPHA_CONNECTORS", str(connectors))
    monkeypatch.setenv("ALPHA_HOME", str(tmp_path / "home"))
    monkeypatch.setenv("ALPHA_NODE", str(fake_node(
        tmp_path, 'if [ "$3" = "chromium" ]; then echo "Error: getaddrinfo ENOTFOUND cdn";'
                  ' exit 1; else echo /nowhere; fi\n')))
    monkeypatch.setattr(browser, "_installing", None)
    browser.install()
    deadline = time.monotonic() + 10
    while browser.status()["installing"] and time.monotonic() < deadline:
        time.sleep(0.05)
    out = browser.status()
    assert out["installed"] is False and out["problem"] is not None
    assert out["problem"].startswith("The browser didn't install: Error: getaddrinfo")
