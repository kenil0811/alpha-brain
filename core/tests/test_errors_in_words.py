"""Errors as sentences (14 Oct, slice 2 G7): every answer that isn't a success carries `error`
in words for a person; no status code, field path or internal text reaches the window."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from alpha.api.server import NOT_TAKEN, NOT_THERE, WENT_WRONG, create_app
from alpha.world.world import World

TOKEN = "t" * 64


def _words_only(body: dict[str, Any]) -> str:
    assert set(body) == {"error"}, body
    return str(body["error"])


def test_every_failure_answers_in_a_sentence(world: World,
                                             monkeypatch: pytest.MonkeyPatch) -> None:
    c = TestClient(create_app(world, live=False, token=TOKEN), raise_server_exceptions=False)
    signed = {"Authorization": f"Bearer {TOKEN}"}
    # not signed in
    r = c.get("/api/health")
    assert r.status_code == 401 and _words_only(r.json()) == (
        "This window isn't signed in to Alpha. Restart Alpha.")
    # an address Alpha doesn't have
    r = c.get("/api/nothing-here", headers=signed)
    assert r.status_code == 404 and _words_only(r.json()) == NOT_THERE
    # a malformed request: no field paths
    r = c.post("/api/goals", json={"text": ["not", "words"]}, headers=signed)
    assert r.status_code == 422 and _words_only(r.json()) == NOT_TAKEN
    # a refusal keeps its own words
    r = c.get("/api/goals/g_nope", headers=signed)
    assert r.status_code == 400 and "no goal" in _words_only(r.json())

    # a crash inside: the sentence, never the internals
    def boom(gid: str) -> dict[str, Any]:
        raise RuntimeError("secret /Users/kenil/internal path")

    monkeypatch.setattr(world.knowledge, "goal", boom)
    r = c.get("/api/goals/g_1", headers=signed)
    assert r.status_code == 500 and _words_only(r.json()) == WENT_WRONG
    assert "secret" not in r.text
