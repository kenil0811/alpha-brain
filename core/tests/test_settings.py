from __future__ import annotations

import stat
from pathlib import Path

import pytest

from alpha.runtime import claude_account
from alpha.world import backup
from alpha.world.store import Problem
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


def test_going_back_to_a_backup_keeps_today_as_another(world: World) -> None:
    world.journal.append("did", "Before the backup.")
    name = backup.back_up(world)["backups"][0]["name"]
    world.journal.append("did", "After the backup.")
    info = backup.restore(world, name)
    texts = [e["text"] for e in world.journal.recent(5)]
    assert "After the backup." not in texts and "Before the backup." in texts
    assert any(t.startswith(f"Went back to the backup {name}.") for t in texts)
    kept = next(b["name"] for b in info["backups"] if b["name"].endswith("-before-restore.sqlite"))
    today = World(Path(info["folder"]) / "backups" / kept)
    assert today.journal.recent(1)[0]["text"] == "After the backup."
    today.close()
    with pytest.raises(Problem, match="no backup called"):
        backup.restore(world, "../world.sqlite")
