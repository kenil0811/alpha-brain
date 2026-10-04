"""Preferences: a choice of look kept in the world, handed back as given (3 Oct 2026, Q27)."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.world.store import Problem
from alpha.world.world import World


def test_a_preference_is_kept_as_given_and_overwritten(world: World) -> None:
    assert world.preferences.get("companion_look") is None
    look = {"animal": "fox", "fur": None, "suit": "#2b3a55", "glasses": True}
    assert world.preferences.set("companion_look", look) == {"key": "companion_look",
                                                             "value": look}
    assert world.preferences.get("companion_look") == look
    world.preferences.set("companion_look", {"animal": "cat"})
    assert world.preferences.get("companion_look") == {"animal": "cat"}
    assert world.preferences.all() == {"companion_look": {"animal": "cat"}}


def test_a_preference_key_and_value_are_checked(world: World) -> None:
    with pytest.raises(Problem, match="short word"):
        world.preferences.set("not a key!", 1)
    with pytest.raises(Problem, match="plain data"):
        world.preferences.set("thing", object())
    with pytest.raises(Problem, match="too large"):
        world.preferences.set("thing", "x" * 20_001)


def test_the_window_reads_and_writes_a_preference_and_the_companion_carries_the_look(
        world: World) -> None:
    c = TestClient(create_app(world, live=False))
    assert c.get("/api/preferences/companion_look").json() == {"key": "companion_look",
                                                               "value": None}
    assert c.get("/api/companion").json()["look"] is None
    r = c.put("/api/preferences/companion_look", json={"value": {"animal": "otter"}})
    assert r.status_code == 200 and r.json()["value"] == {"animal": "otter"}
    assert c.get("/api/preferences/companion_look").json()["value"] == {"animal": "otter"}
    assert c.get("/api/companion").json()["look"] == {"animal": "otter"}
    bad = c.put("/api/preferences/no spaces", json={"value": 1})
    assert bad.status_code == 400
