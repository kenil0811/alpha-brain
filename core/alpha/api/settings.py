"""Routes for settings: models (every way Alpha reaches one, Settings -> Models), settings
fields and access modes, speech, the person's data, their preferences."""

from __future__ import annotations

import base64
from typing import Any

from fastapi import FastAPI

from alpha.api.bodies import (
    AccessBody,
    CodeBody,
    KeyBody,
    ModelBody,
    PreferenceBody,
    RouteBody,
    SettingsBody,
    SpeechBody,
)
from alpha.api.served import Served
from alpha.models import settings as model_settings
from alpha.runtime import transcription
from alpha.world import backup
from alpha.world.store import Problem


def routes(app: FastAPI, s: Served) -> None:
    world = s.world
    api = s.api

    accounts = s.accounts

    # ---- models (Settings -> Models, and the composer's + -> Advanced -> Model) ----

    @app.get("/api/models", dependencies=[api])
    def model_rows() -> dict[str, Any]:
        return {"providers": accounts.rows()}

    @app.get("/api/models/{provider}/models", dependencies=[api])
    def provider_models(provider: str) -> dict[str, Any]:
        """{"models": [{"id", "label"}], "selected": id | null}."""
        return accounts.models(provider)

    @app.put("/api/models/{provider}/model", dependencies=[api])
    def select_model(provider: str, body: ModelBody) -> dict[str, Any]:
        return accounts.select_model(provider, body.model)

    @app.post("/api/models/{provider}/star", dependencies=[api])
    def star(provider: str) -> dict[str, Any]:
        return {"providers": accounts.star(provider)}

    @app.put("/api/models/{provider}/key", dependencies=[api])
    def save_key(provider: str, body: KeyBody) -> dict[str, Any]:
        return {"provider": accounts.save_key(provider, body.key)}

    @app.delete("/api/models/{provider}/key", dependencies=[api])
    def remove_key(provider: str) -> dict[str, Any]:
        return {"provider": accounts.remove_key(provider)}

    @app.post("/api/models/{provider}/test", dependencies=[api])
    def test_provider(provider: str) -> dict[str, Any]:
        return {"provider": accounts.test(provider)}

    @app.post("/api/models/{provider}/reconnect", dependencies=[api])
    def reconnect(provider: str) -> dict[str, Any]:
        return {"provider": accounts.reconnect(provider)}

    @app.post("/api/models/{provider}/sign-in", dependencies=[api])
    def sign_in(provider: str) -> dict[str, Any]:
        return {"provider": accounts.sign_in(provider)}

    @app.post("/api/models/{provider}/sign-in/finish", dependencies=[api])
    def finish_sign_in(provider: str, body: CodeBody) -> dict[str, Any]:
        return {"provider": accounts.finish_sign_in(provider, body.code)}

    @app.post("/api/models/{provider}/install", dependencies=[api])
    def install(provider: str) -> dict[str, Any]:
        return {"provider": accounts.install(provider)}

    @app.get("/api/route", dependencies=[api])
    def get_route(thread: str | None = None) -> dict[str, Any]:
        """The model this conversation's next message goes to."""
        return accounts.route(thread)

    @app.put("/api/route", dependencies=[api])
    def set_route(body: RouteBody) -> dict[str, Any]:
        """This conversation's own model; no provider goes back to the default."""
        return accounts.choose(body.thread, body.provider, body.model)

    # ---- settings fields, access modes, speech ----

    @app.get("/api/settings", dependencies=[api])
    def get_settings() -> list[dict[str, Any]]:
        return model_settings.all_fields(world.store)

    @app.patch("/api/settings", dependencies=[api])
    def update_settings(body: SettingsBody) -> list[dict[str, Any]]:
        return model_settings.update(world.store, body.values)

    @app.get("/api/access", dependencies=[api])
    def get_access(thread: str | None = None) -> dict[str, Any]:
        """How much Alpha may do in this conversation before it asks."""
        return {"thread": thread, "mode": model_settings.access_mode(world.store, thread),
                "default": model_settings.get(world.store, "access.mode")}

    @app.put("/api/access", dependencies=[api])
    def set_access(body: AccessBody) -> dict[str, Any]:
        """This conversation's own mode; no mode goes back to the default."""
        mode = model_settings.set_access_mode(world.store, body.thread, body.mode)
        return {"thread": body.thread, "mode": mode,
                "default": model_settings.get(world.store, "access.mode")}

    @app.get("/api/transcribe", dependencies=[api])
    def can_transcribe() -> dict[str, bool]:
        return {"available": transcription.available()}

    @app.post("/api/transcribe", dependencies=[api])
    def transcribe(body: SpeechBody) -> dict[str, str]:
        try:
            audio = base64.b64decode(body.audio_b64, validate=True)
        except ValueError as e:
            raise Problem("That recording didn't arrive whole.") from e
        return {"text": transcription.transcribe(audio, body.mime, body.provider)}

    @app.post("/api/data/backups/{name}/restore", dependencies=[api])
    def data_restore(name: str) -> dict[str, Any]:
        return backup.restore(world, name)

    @app.get("/api/data", dependencies=[api])
    def data_info() -> dict[str, Any]:
        return backup.describe(world)

    @app.post("/api/data/backup", dependencies=[api])
    def data_backup() -> dict[str, Any]:
        return backup.back_up(world)

    @app.get("/api/preferences/{key}", dependencies=[api])
    def preference(key: str) -> dict[str, Any]:
        """A choice of look the person made (the companion's look), or null: the window
        fills in its own defaults."""
        return {"key": key, "value": world.preferences.get(key)}

    @app.put("/api/preferences/{key}", dependencies=[api])
    def set_preference(key: str, body: PreferenceBody) -> dict[str, Any]:
        return world.preferences.set(key, body.value)
