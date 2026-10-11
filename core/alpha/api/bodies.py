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


class ApprovePlanBody(BaseModel):
    """The person's answers to a plan's questions, by number from 0; a question left out
    keeps Alpha's default. `pieces`: keep / skip / defer by piece id (Q37); a piece left out
    stands on Alpha's recommendation."""
    answers: dict[str, str] | None = None
    pieces: dict[str, str] | None = None


class ConversationBody(BaseModel):
    module: str | None = None
    title: str | None = None


class MoveBody(BaseModel):
    conversation: str


class MoveModuleBody(BaseModel):
    parent: str | None = None


class CreateModuleBody(BaseModel):
    name: str
    goal: str | None = None
    parent: str | None = None


class RecordBody(BaseModel):
    values: dict[str, Any]
    revision: int | None = None


class ExportBody(BaseModel):
    format: str = "csv"


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

