"""What Alpha knows, changed by the person (13 Oct, slice 2 D1, D11, D1b): a fact corrected or
forgotten, a goal typed, rewritten, finished or dropped, and everything exported."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.world.world import World


@pytest.fixture(autouse=True)
def home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ALPHA_HOME", str(tmp_path / "home"))


def test_a_fact_corrected_keeps_the_old_one_as_replaced(world: World) -> None:
    f = world.knowledge.record_fact("person", "city", "Londn", source="turn:j_1",
                                    state="accepted")
    c = TestClient(create_app(world, live=False))
    new = c.post(f"/api/facts/{f['id']}/correct", json={"value": "London"}).json()
    assert new["value"] == "London" and new["source"] == "stated"
    assert [x["value"] for x in world.knowledge.facts("person")] == ["London"]
    assert world.knowledge.fact(f["id"])["superseded_by"] == new["id"]
    assert world.journal.recent(1)[0]["text"] == "You corrected city: Londn → London."
    assert "forget it" in c.post(f"/api/facts/{new['id']}/correct", json={"value": " "}
                                 ).json()["error"]


def test_a_fact_forgotten_goes_with_the_values_it_replaced(world: World) -> None:
    old = world.knowledge.record_fact("person", "city", "Paris", source="stated",
                                      state="accepted")
    now = world.knowledge.record_fact("person", "city", "London", source="stated",
                                      state="accepted")
    c = TestClient(create_app(world, live=False))
    c.delete(f"/api/facts/{now['id']}")
    assert world.knowledge.facts("person", current=False) == []
    assert world.store.one("SELECT 1 AS x FROM facts WHERE id = ?", (old["id"],)) is None
    assert world.journal.recent(1)[0]["text"] == "You asked Alpha to forget: City."


def test_goals_typed_rewritten_done_and_dropped(world: World) -> None:
    c = TestClient(create_app(world, live=False))
    g = c.post("/api/goals", json={"text": "An offer by December"}).json()
    assert g["state"] == "active" and world.journal.recent(1)[0]["text"] == (
        "You set a goal: An offer by December")
    g = c.patch(f"/api/goals/{g['id']}", json={"text": "An offer by November"}).json()
    assert g["text"] == "An offer by November"
    g = c.patch(f"/api/goals/{g['id']}", json={"state": "done"}).json()
    assert g["state"] == "done" and g["until"]
    assert world.journal.recent(1)[0]["text"] == "You marked done the goal: An offer by November"
    assert c.post("/api/goals", json={"text": " "}).json()["error"] == "A goal needs words."


def test_everything_alpha_remembers_is_exported_with_its_sources(world: World) -> None:
    world.knowledge.record_fact("person", "job_search", "founding engineer roles",
                                source="stated", state="accepted")
    world.knowledge.set_goal("An offer by December")
    world.knowledge.write_note("person", "Standing instructions", "Ask before sending.")
    priya = world.entities.resolve("person", "Priya Raman", {"email": "p@x.com"})["entity"]
    world.knowledge.write_note(f"entity:{priya['id']}", "Priya Raman", "Met at a talk.")
    out = TestClient(create_app(world, live=False)).post("/api/memory/export").json()
    md = Path(out["markdown"]).read_text()
    assert "- **Job search**: founding engineer roles (you said so, " in md
    assert "- An offer by December (active, since" in md
    assert "### Priya Raman (person)" in md and "Met at a talk." in md
    data = json.loads(Path(out["json"]).read_text())
    assert data["about_you"][0]["value"] == "founding engineer roles"
    assert world.journal.recent(1)[0]["text"].startswith("Exported what Alpha remembers (")
