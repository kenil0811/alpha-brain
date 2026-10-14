"""The request bodies the window sends."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class AskBody(BaseModel):
    text: str
    module: str | None = None
    thread: str | None = None
    # The conversation this belongs to; without one the sentence is routed (the companion).
    conversation: str | None = None


class ConversationBody(BaseModel):
    module: str | None = None
    title: str | None = None


class MoveBody(BaseModel):
    conversation: str


class MoveModuleBody(BaseModel):
    parent: str | None = None


class RenameModuleBody(BaseModel):
    name: str


class CreateModuleBody(BaseModel):
    name: str
    goal: str | None = None
    parent: str | None = None


class RecordBody(BaseModel):
    values: dict[str, Any]
    revision: int | None = None


class ExportBody(BaseModel):
    format: str = "csv"
    # What the table shows (slice 2 G5): its rows in order and its columns; none = all.
    records: list[str] | None = None
    columns: list[str] | None = None


class ListBody(BaseModel):
    title: str | None = None
    config: dict[str, Any] | None = None
    default: bool | None = None


class ActionEditBody(BaseModel):
    payload: dict[str, Any]


class ActionApproveBody(BaseModel):
    always: bool = False


class DecideBody(BaseModel):
    accept: bool


class AnswerBody(BaseModel):
    text: str


class AnswersBody(BaseModel):
    """Several questions asked in one turn, answered at once: ask id → the person's words."""
    answers: dict[str, str]


class FolderBody(BaseModel):
    path: str


class SiteBody(BaseModel):
    site: str


class SwitchBody(BaseModel):
    enabled: bool


class PreferenceBody(BaseModel):
    value: Any


class ThinkingBody(BaseModel):
    route: str


class NoteBody(BaseModel):
    scope: str
    title: str
    body: str
    summary: str | None = None


class AgreeWorkflowBody(BaseModel):
    """The person's yes on their workflow page (§12): what they said about Alpha's
    suggestions ({id: "accept" | "skip"}) and their answers to the questions, by number."""
    suggestions: dict[str, str] | None = None
    answers: dict[str, str] | None = None


class RunPartBody(BaseModel):
    """The row a part runs on (§12)."""
    row: str


class AddFieldBody(BaseModel):
    """A field the person adds (slice 2 B1): its name in their words and its kind."""

    label: str
    kind: str = "text"
    choices: list[str] | None = None
    done_choices: list[str] | None = None
    relation: str | None = None
    unit: str | None = None


class RelabelFieldBody(BaseModel):
    label: str


class RenameConversationBody(BaseModel):
    title: str


class CorrectFactBody(BaseModel):
    value: str


class GoalBody(BaseModel):
    """A goal the person types (slice 2 D11), or a change to one (D1): its words, its state."""

    text: str | None = None
    state: str | None = None
    module: str | None = None
