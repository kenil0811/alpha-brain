"""The core's static configuration, read from `alpha/config/` (16 Oct 2026, with Kenil: every
static thing out of the code files, so it is changed without touching them).

Three kinds of thing live there, and nothing else:

- **`prompts/<name>.md`**: every text the model reads as its instruction, one file each, with
  `{{name}}`-style placeholders filled by the caller. Read on every use and cached by the
  file's modification time, so an edit reaches the next turn without a restart. The text a
  turn saw is still hashed into `turn_contexts`, so provenance holds whatever the file says.
- **`briefs/<kind>.md`**: the default brief of each built-in agent, copied into a world the
  first time the agent is made there; the person's copy is theirs from then on.
- **`models.toml`** and **`limits.toml`**: which model does which kind of work on which route,
  and the named judgements and timings the code decides with (a threshold is a judgement of
  a failure, named and explained, never a cap on work). Read once at start into typed, frozen
  settings; a wrong or missing key fails the start with a plain message naming it.

What stays in code: the walls and checks themselves (the gates, the write list, the parsers
that read a model's answer), the schema, the words the person reads, and the enumerations
the code switches on. This is operator configuration: none of it is a setting the person
meets, and nothing here is read from the person's data directory, so an install cannot
drift from its code. Environment variables override two things for checks and journeys:
`ALPHA_MODEL` (the turn's class of work) and `ALPHA_SYSTEM_ONE_MODEL` (the small judgements).
"""

from __future__ import annotations

import os
import tomllib
from dataclasses import dataclass, fields, is_dataclass
from pathlib import Path
from typing import Any, get_type_hints

CONFIG_DIR = Path(__file__).parent / "config"
PROMPTS_DIR = CONFIG_DIR / "prompts"
BRIEFS_DIR = CONFIG_DIR / "briefs"


class ConfigProblem(Exception):
    """A configuration file that cannot be used; the message names the file and the key."""


# ---- limits: the named judgements and timings ----


@dataclass(frozen=True)
class Scheduler:
    check_every_s: int
    slept_gap_s: int
    settled_s: int
    least_minutes_between_runs: int


@dataclass(frozen=True)
class Runs:
    repairs_per_run: int
    retry_after_s: int
    part_timeout_s: int
    part_attempts: int
    silence_s: int
    partial_chars: int


@dataclass(frozen=True)
class Readers:
    drop: float
    held: float
    missing: float


@dataclass(frozen=True)
class Prepack:
    max_chars: int
    recent_turns: int
    thread_history: int
    matches: int
    default_budget: int
    fields_line: int
    budget: dict[str, int]


@dataclass(frozen=True)
class Conversations:
    confident: float


@dataclass(frozen=True)
class Workflows:
    most_chars: int
    most_questions: int
    most_options: int
    most_option_chars: int
    most_suggestions: int


@dataclass(frozen=True)
class Browser:
    read_timeout_s: int
    act_timeout_s: int
    signin_timeout_s: int


@dataclass(frozen=True)
class Files:
    max_file_bytes: int
    max_text_chars: int


@dataclass(frozen=True)
class Calendar:
    back_days: int
    ahead_days: int
    sync_every_s: int


@dataclass(frozen=True)
class Contacts:
    sync_every_s: int


@dataclass(frozen=True)
class Views:
    runs_window_days: int
    activity_window_days: int
    trouble_window_h: int
    changes_most: int
    most_rows: int
    query_rows: int
    query_steps: int


@dataclass(frozen=True)
class Accounts:
    status_timeout_s: int


@dataclass(frozen=True)
class Doc:
    wait_s: int


@dataclass(frozen=True)
class Columbo:
    sibling_rows: int
    rows_shown: int
    gather_minutes: int


@dataclass(frozen=True)
class Sherlock:
    most_suggestions: int


@dataclass(frozen=True)
class Scout:
    picks_a_day: int
    sinks_after: int
    quiet_days: int


@dataclass(frozen=True)
class Watson:
    offer_after: int
    offer_window_days: int


@dataclass(frozen=True)
class Staging:
    always_after: int


@dataclass(frozen=True)
class Pages:
    ticket_seconds: int


@dataclass(frozen=True)
class Checks:
    core_start_s: int
    window_port: int


@dataclass(frozen=True)
class Settings:
    scheduler: Scheduler
    runs: Runs
    readers: Readers
    prepack: Prepack
    conversations: Conversations
    workflows: Workflows
    browser: Browser
    files: Files
    calendar: Calendar
    contacts: Contacts
    views: Views
    accounts: Accounts
    doc: Doc
    columbo: Columbo
    sherlock: Sherlock
    scout: Scout
    watson: Watson
    staging: Staging
    checks: Checks
    pages: Pages


def _read_toml(path: Path) -> dict[str, Any]:
    try:
        with path.open("rb") as f:
            data: dict[str, Any] = tomllib.load(f)
    except FileNotFoundError as e:
        raise ConfigProblem(f"{path.name} is missing from {path.parent}.") from e
    except tomllib.TOMLDecodeError as e:
        raise ConfigProblem(f"{path.name} can't be read: {e}.") from e
    return data


def _build(cls: type, table: Any, where: str) -> Any:
    """A frozen dataclass from a TOML table: every field present, no key unknown, each value
    of the field's kind (an int where an int is declared; a float takes an int too)."""
    if not isinstance(table, dict):
        raise ConfigProblem(f"{where} should be a table.")
    wanted = {f.name: f for f in fields(cls)}
    unknown = sorted(set(table) - set(wanted))
    missing = sorted(set(wanted) - set(table))
    if unknown or missing:
        words = []
        if missing:
            words.append(f"missing {', '.join(missing)}")
        if unknown:
            words.append(f"unknown {', '.join(unknown)}")
        raise ConfigProblem(f"{where}: {'; '.join(words)}.")
    values: dict[str, Any] = {}
    for name, f in wanted.items():
        value = table[name]
        kind = f.type if isinstance(f.type, type) else str(f.type)
        if kind in (int, "int"):
            if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
                raise ConfigProblem(f"{where}.{name} should be a whole number above zero.")
        elif kind in (float, "float"):
            if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
                raise ConfigProblem(f"{where}.{name} should be a number above zero.")
            value = float(value)
        elif kind in (dict, "dict[str, int]"):
            if not isinstance(value, dict) or not all(
                    isinstance(k, str) and isinstance(v, int) and not isinstance(v, bool)
                    and v > 0 for k, v in value.items()):
                raise ConfigProblem(f"{where}.{name} should map names to whole numbers.")
            value = dict(value)
        values[name] = value
    return cls(**values)


def load_settings(path: Path | None = None) -> Settings:
    data = _read_toml(path or CONFIG_DIR / "limits.toml")
    groups: dict[str, Any] = {}
    kinds = get_type_hints(Settings)  # the annotations are strings under __future__
    for f in fields(Settings):
        cls: type = kinds[f.name]
        assert is_dataclass(cls)
        if f.name not in data:
            raise ConfigProblem(f"limits.toml: the table [{f.name}] is missing.")
        groups[f.name] = _build(cls, data[f.name], f"limits.toml [{f.name}]")
    extra = sorted(set(data) - set(groups))
    if extra:
        raise ConfigProblem(f"limits.toml: unknown table(s) {', '.join(extra)}.")
    return Settings(**groups)


settings: Settings = load_settings()


# ---- models: which model does which kind of work ----

ROLES = ("turn", "judge", "independent", "refile", "trial", "look")
# the class of work an environment variable overrides, for checks and journeys
TURN_CLASS = {"turn", "independent", "refile"}
SMALL_CLASS = {"judge", "trial", "look"}


@dataclass(frozen=True)
class Models:
    claude: dict[str, str]
    chatgpt_default: str
    chatgpt_effort: dict[str, str]


def load_models(path: Path | None = None) -> Models:
    data = _read_toml(path or CONFIG_DIR / "models.toml")
    claude = data.get("claude")
    chatgpt = data.get("chatgpt")
    if not isinstance(claude, dict) or not isinstance(chatgpt, dict):
        raise ConfigProblem("models.toml needs the tables [claude] and [chatgpt].")
    missing = [r for r in ROLES if not isinstance(claude.get(r), str) or not claude[r]]
    if missing:
        raise ConfigProblem(f"models.toml [claude] names no model for {', '.join(missing)}.")
    effort = chatgpt.get("effort")
    if not isinstance(chatgpt.get("default"), str) or not isinstance(effort, dict) or not all(
            isinstance(k, str) and isinstance(v, str) for k, v in effort.items()):
        raise ConfigProblem("models.toml [chatgpt] needs `default` and the table"
                            " [chatgpt.effort].")
    return Models(claude={r: str(claude[r]) for r in ROLES},
                  chatgpt_default=str(chatgpt["default"]),
                  chatgpt_effort={str(k): str(v) for k, v in effort.items()})


models: Models = load_models()


def model_for(role: str) -> str:
    """The Claude model alias for a kind of work, after the environment's say: `ALPHA_MODEL`
    for the turn's class (turns, the independent answer, the refiling), `ALPHA_SYSTEM_ONE_MODEL`
    for the small judgements (the judge, the route's trial)."""
    if role not in ROLES:
        raise ConfigProblem(f"No model is configured for the work '{role}'.")
    if role in TURN_CLASS and os.environ.get("ALPHA_MODEL"):
        return os.environ["ALPHA_MODEL"]
    if role in SMALL_CLASS and os.environ.get("ALPHA_SYSTEM_ONE_MODEL"):
        return os.environ["ALPHA_SYSTEM_ONE_MODEL"]
    return models.claude[role]


def chatgpt_effort(alias: str | None) -> tuple[str | None, str]:
    """The ChatGPT route speaks in Claude aliases: an alias becomes a reasoning effort on the
    person's own Codex model (and anything else is passed on as a model name)."""
    name = alias or os.environ.get("ALPHA_MODEL") or models.chatgpt_default
    if name in models.chatgpt_effort:
        return None, models.chatgpt_effort[name]
    return name, models.chatgpt_effort.get(models.chatgpt_default, "medium")


# ---- prompts and briefs: read on use, cached by modification time ----

_texts: dict[Path, tuple[float, str]] = {}


def _text(path: Path, what: str) -> str:
    try:
        stamp = path.stat().st_mtime
    except FileNotFoundError as e:
        raise ConfigProblem(f"There is no {what} '{path.stem}' in {path.parent}.") from e
    cached = _texts.get(path)
    if cached is None or cached[0] != stamp:
        text = path.read_text().rstrip("\n")
        _texts[path] = (stamp, text)
        return text
    return cached[1]


def prompt(which: str, /, **fill: str) -> str:
    """One of the model's instructions, with its `{{placeholders}}` filled; an unfilled one is
    a mistake of ours and says so."""
    text = _text(PROMPTS_DIR / f"{which}.md", "prompt")
    for key, value in fill.items():
        text = text.replace("{{" + key + "}}", value)
    if "{{" in text:
        left = text[text.index("{{"):][:40]
        raise ConfigProblem(f"The prompt '{which}' has a placeholder nothing fills: {left}")
    return text


def brief(kind: str) -> str:
    """The default brief of a built-in agent."""
    return _text(BRIEFS_DIR / f"{kind}.md", "brief")


def prompt_names() -> list[str]:
    return sorted(p.stem for p in PROMPTS_DIR.glob("*.md"))


def brief_names() -> list[str]:
    return sorted(p.stem for p in BRIEFS_DIR.glob("*.md"))
