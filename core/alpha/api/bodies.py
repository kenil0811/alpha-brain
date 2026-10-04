"""The request bodies the window sends."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from alpha.runtime.attachments import MAX_ATTACHMENTS, AttachmentIn


class AskBody(BaseModel):
    text: str
    module: str | None = None
    thread: str | None = None
    attachments: list[AttachmentIn] = Field(default_factory=list, max_length=MAX_ATTACHMENTS)
    # The conversation this belongs to; without one the sentence is routed (the companion).
    conversation: str | None = None


class ConversationBody(BaseModel):
    module: str | None = None
    title: str | None = None


class MoveBody(BaseModel):
    conversation: str


class MoveModuleBody(BaseModel):
    parent: str | None = None


class CreateModuleBody(BaseModel):
    # No name: a blank "Untitled project" the person describes on its page (the creation).
    name: str | None = Field(default=None, max_length=80)
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


class SettingsBody(BaseModel):
    values: dict[str, Any]


class AccessBody(BaseModel):
    thread: str | None = None
    mode: str | None = None


class KeyBody(BaseModel):
    key: str = Field(min_length=1, max_length=400)


class CodeBody(BaseModel):
    code: str = Field(min_length=1, max_length=2000)


class ModelBody(BaseModel):
    model: str = Field(min_length=1, max_length=200)


class RouteBody(BaseModel):
    thread: str | None = None
    provider: str | None = None
    model: str | None = Field(default=None, max_length=200)


class FieldChangeBody(BaseModel):
    kind: str | None = None
    label: str | None = None
    choices: list[str] | None = None
    relation: str | None = None


class FieldsBody(BaseModel):
    fields: list[dict[str, Any]]


class BulkBody(BaseModel):
    action: str
    items: list[dict[str, Any]]
    values: dict[str, Any] | None = None


class SpeechBody(BaseModel):
    audio_b64: str
    mime: str = "audio/webm"
    provider: str | None = None


class ModuleBody(BaseModel):
    name: str | None = None
    icon: str | None = None
    goal: str | None = None


class CreationAnswerBody(BaseModel):
    """What the person did on the project's page while it is being made: answered the
    questions, took the defaults, chose an option, asked to build, or tried again."""
    text: str | None = None
    answers: dict[str, str] | None = None
    choice: str | None = None
    use_defaults: bool = False
    build: bool = False
    carry_on: bool = False
    retry: bool = False
    start_over: bool = False


class ThreadBody(BaseModel):
    title: str | None = Field(default=None, max_length=400)
    module: str | None = None


class ThreadPatch(BaseModel):
    state: str | None = None
    title: str | None = Field(default=None, max_length=400)


class NoteBody(BaseModel):
    scope: str
    title: str
    body: str
    summary: str | None = None

