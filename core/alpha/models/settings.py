# ruff: noqa: E501
"""The settings Core reads at the moment they matter (no restart), after Alpha's own
preferences: each field has a group (the Settings section that shows it), a plain title and an
(i) description, so the page needs no knowledge of its own. Values live in the world's `meta`
table under the field's id; an unset field is its default.

Groups: "Models" (how long the model thinks, on Settings -> Models), "Look" (rules Chief of
Staff follows when it makes tables and views, Settings -> Project look) and "Making projects"
and "Access" (Settings -> Builds).
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from typing import Any

from alpha.models.accounts import Prefs
from alpha.world.store import Problem, Store

ACCESS_MODES = ("ask", "approve_for_me", "full")

DEFAULT_LOOK_RULES = """\
Every table a project keeps is drawn by Alpha the same way everywhere: a table first, with board, list, calendar and chart a click away, a record page for each row, and edits in place. Declare the tables well: a title field, a status field with its finished values, and the columns the person scans first.
A summary with the numbers that matter (at most four cards, a progress bar against a goal, a trend when numbers change over time) comes first when the project has numbers worth a glance; otherwise the main table comes first.
One subject per table, named by what it holds (Openings, Sources, Goals), never by a verb. Five tables at most.
Freshness is visible: when something was added or last changed, when a source was last read and when the next check runs.
Plain words, sentence case, no jargon and no emoji in labels. Numbers carry their unit. Dates read as 27 Sep, times in the person's local time.
Compact. No decorative headings or explanatory text above the data; one short empty-state line that says what to do next.
Anything that runs on its own is visible under Automations with an on/off switch, and every action answers in one sentence saying what happened.
Estimates are labelled as estimates and can be corrected in place.
Nothing is invented: when a source cannot be read or a value is unknown, say so and store nothing made up.
"""


@dataclass(frozen=True)
class Field:
    id: str
    group: str
    title: str
    description: str
    kind: str  # "choice" | "integer" | "text"
    default: Any
    options: tuple[tuple[str, str], ...] = ()
    minimum: int | None = None
    maximum: int | None = None
    unit: str | None = None


FIELDS: tuple[Field, ...] = (
    Field("models.effort", "Models", "How long it thinks",
          "How long the model thinks before it answers, on Claude. Low answers fastest; high "
          "takes longest. Applies from the next message.", "choice", "default",
          (("low", "Low (fastest)"), ("medium", "Medium"), ("high", "High (slowest)"),
           ("default", "Claude Code's default"))),
    Field("look.rules", "Look", "Rules for how projects should look and behave",
          "Alpha's defaults, in plain sentences, followed whenever Chief of Staff makes or "
          "changes a project's tables and views. Edit them to your taste or reset to Alpha's.",
          "text", DEFAULT_LOOK_RULES, maximum=3000),
    Field("build.model", "Making projects", "Model for making a project",
          "The Claude model that makes a new project and changes it. The most capable model "
          "makes the best projects.", "choice", "default",
          (("default", "Same as the chat"), ("opus", "Claude Opus (most capable)"),
           ("sonnet", "Claude Sonnet (faster)"), ("haiku", "Claude Haiku (fastest)"))),
    Field("access.mode", "Access", "When Alpha needs your OK",
          "Ask for approval: always ask before Alpha reads the web through its browser or "
          "removes a record. Approve for me: only ask for removing. Full access: no approval "
          "prompts. Sending, posting or anything outside Alpha always waits for your yes, and "
          "moving money or entering passwords is never possible.", "choice", "ask",
          (("ask", "Ask for approval"), ("approve_for_me", "Approve for me"),
           ("full", "Full access"))),
)
BY_ID = {f.id: f for f in FIELDS}


def get(store: Store, field_id: str) -> Any:
    f = BY_ID[field_id]
    value = Prefs(store).get(field_id)
    return f.default if value is None else value


def all_fields(store: Store) -> list[dict[str, Any]]:
    out = []
    for f in FIELDS:
        row = asdict(f)
        row["options"] = [{"value": v, "label": label} for v, label in f.options]
        row["value"] = get(store, f.id)
        out.append(row)
    return out


def update(store: Store, changes: dict[str, Any]) -> list[dict[str, Any]]:
    prefs = Prefs(store)
    for key, value in changes.items():
        f = BY_ID.get(key)
        if f is None:
            raise Problem(f"There is no setting {key!r}.")
        if f.kind == "choice" and value not in {v for v, _ in f.options}:
            raise Problem(f"{f.title} can't be {value!r}.")
        if f.kind == "integer":
            if isinstance(value, bool) or not isinstance(value, int):
                raise Problem(f"{f.title} must be a whole number.")
            if (f.minimum is not None and value < f.minimum) or (
                    f.maximum is not None and value > f.maximum):
                raise Problem(f"{f.title} must be between {f.minimum} and {f.maximum}.")
        if f.kind == "text":
            value = str(value)
            if f.maximum is not None and len(value) > f.maximum:
                raise Problem(f"{f.title} can be at most {f.maximum} characters.")
        # The default is stored as nothing, so a later change of Alpha's default applies.
        prefs.set(key, None if value == f.default else value)
    return all_fields(store)


def access_mode(store: Store, thread: str | None) -> str:
    """This conversation's own access mode, else the default in Settings -> Builds."""
    own = Prefs(store).get(f"access.{thread or 'stream'}")
    return own if own in ACCESS_MODES else str(get(store, "access.mode"))


def set_access_mode(store: Store, thread: str | None, mode: str | None) -> str:
    if mode is not None and mode not in ACCESS_MODES:
        raise Problem(f"There is no access mode {mode!r}.")
    Prefs(store).set(f"access.{thread or 'stream'}", mode)
    return access_mode(store, thread)
