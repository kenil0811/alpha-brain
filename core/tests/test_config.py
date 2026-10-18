"""The core's static configuration (alpha/config/): prompts, briefs, models and the named
judgements live in files, typed and checked, and reach the code without a restart where it
matters (16 Oct 2026)."""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from alpha import config
from alpha.config import ConfigProblem

PACKAGE = Path(config.__file__).parent


def test_the_limits_load_typed_and_every_table_is_used() -> None:
    s = config.load_settings()
    assert s.scheduler.check_every_s == 30 and s.scheduler.slept_gap_s == 3 * 30
    assert s.readers.drop == 0.5 and isinstance(s.readers.drop, float)
    assert s.prepack.budget["WHAT ALPHA HOLDS"] == 3600 and s.prepack.max_chars > 0
    assert s.scheduler.least_minutes_between_runs == 30
    # every group is read somewhere in the code, by name
    code = "\n".join(p.read_text() for p in PACKAGE.rglob("*.py") if p.name != "config.py")
    for group in ("scheduler", "runs", "readers", "prepack", "conversations",
                  "workflows", "browser", "files", "calendar", "views", "accounts",
                  "watson", "checks"):
        assert re.search(rf"(?:settings|limits)\.{group}\.", code), group


def test_a_wrong_or_missing_key_stops_the_start_with_a_plain_message(tmp_path: Path) -> None:
    good = (PACKAGE / "config" / "limits.toml").read_text()
    broken = tmp_path / "limits.toml"
    broken.write_text(good.replace("check_every_s = 30", "check_every_s = -1"))
    with pytest.raises(ConfigProblem,
                       match=r"\[scheduler\]\.check_every_s should be a whole number"):
        config.load_settings(broken)
    broken.write_text(good.replace("check_every_s = 30", "check_every_sec = 30"))
    with pytest.raises(ConfigProblem, match="missing check_every_s; unknown check_every_sec"):
        config.load_settings(broken)
    broken.write_text(good.replace("[browser]", "[browsers]"))
    with pytest.raises(ConfigProblem, match=r"\[browser\] is missing"):
        config.load_settings(broken)
    with pytest.raises(ConfigProblem, match="missing"):
        config.load_settings(tmp_path / "nowhere.toml")


def test_every_prompt_file_is_used_and_every_prompt_used_exists() -> None:
    code = "\n".join(p.read_text() for p in PACKAGE.rglob("*.py"))
    used = set(re.findall(r"""config\.prompt\(\s*["']([a-z_]+)["']""", code))
    used |= set(re.findall(r"""config\.prompt\("[a-z_]+" if [^)]* else "([a-z_]+)"\)""", code))
    files = set(config.prompt_names())
    assert used <= files, f"no file for {sorted(used - files)}"
    assert files <= used, f"nothing reads {sorted(files - used)}"
    assert config.brief_names() == ["columbo", "doc", "reminders", "scout", "sherlock", "watson"]
    assert "## What Watson files" in config.brief("watson")
    assert "## What Doc does" in config.brief("doc")


def test_placeholders_are_filled_and_an_unfilled_one_is_a_mistake() -> None:
    text = config.prompt("agent_run", name="Deal Scout")
    assert text.startswith("You are Deal Scout, one of the person's agents")
    assert "{{" not in text and '{"read": "<reader>"' in text  # the JSON braces are plain
    with pytest.raises(ConfigProblem, match="placeholder nothing fills: {{name}}"):
        config.prompt("agent_run")
    with pytest.raises(ConfigProblem, match="no prompt 'nothing_here'"):
        config.prompt("nothing_here")


def test_a_prompt_edit_reaches_the_next_call_without_a_restart(
        tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    import os
    import time

    monkeypatch.setattr(config, "PROMPTS_DIR", tmp_path)
    f = tmp_path / "hello.md"
    f.write_text("Say hello to {{name}}.\n")
    assert config.prompt("hello", name="Kenil") == "Say hello to Kenil."
    f.write_text("Say good morning to {{name}}.\n")
    os.utime(f, (time.time() + 2, time.time() + 2))  # a later edit, however fast the test is
    assert config.prompt("hello", name="Kenil") == "Say good morning to Kenil."


def test_the_models_table_and_the_environments_say(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ALPHA_MODEL", raising=False)
    monkeypatch.delenv("ALPHA_SYSTEM_ONE_MODEL", raising=False)
    assert config.model_for("turn") == "sonnet" and config.model_for("judge") == "haiku"
    assert config.model_for("refile") == "sonnet" and config.model_for("trial") == "haiku"
    monkeypatch.setenv("ALPHA_MODEL", "opus")
    monkeypatch.setenv("ALPHA_SYSTEM_ONE_MODEL", "sonnet")
    assert config.model_for("turn") == "opus" and config.model_for("independent") == "opus"
    assert config.model_for("judge") == "sonnet" and config.model_for("trial") == "sonnet"
    with pytest.raises(ConfigProblem, match="No model is configured for the work 'poet'"):
        config.model_for("poet")
    # the ChatGPT route: a Claude alias is an effort on the person's Codex model
    monkeypatch.delenv("ALPHA_MODEL")
    assert config.chatgpt_effort(None) == (None, "medium")
    assert config.chatgpt_effort("haiku") == (None, "low")
    assert config.chatgpt_effort("gpt-5-codex") == ("gpt-5-codex", "medium")
