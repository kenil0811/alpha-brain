"""Places (Q44, design G13): the place field kind, locating its words before a write, a text field
turned into a place field on the person's yes, and what counts as Apple having found it. Apple is
never called: a fake geocoder stands in."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.connectors.places import _point
from alpha.mcp.tools import Tools
from alpha.world.store import Problem
from alpha.world.world import World

AUSTIN = {"label": "Austin, TX", "lat": 30.26, "lon": -97.74, "precision": "city",
          "source": "Apple Maps", "estimated": True}


class Fake:
    """Knows Austin; every lookup is counted."""

    def __init__(self) -> None:
        self.asked: list[list[str]] = []

    def locate(self, labels: list[str]) -> dict[str, dict[str, Any] | None]:
        self.asked.append(labels)
        return {x: ({**AUSTIN, "label": x} if "austin" in x.lower() else None) for x in labels}


def table(world: World, kind: str = "place") -> None:
    world.collections.create("deals", "Deals", [{"name": "title", "kind": "text"},
                                                {"name": "city", "kind": kind}])


def test_a_place_is_its_words_and_a_point_when_located(world: World) -> None:
    table(world)
    world.collections.geocoder = Fake()
    r = world.collections.add("deals", {"title": "Bakery", "city": "Austin, TX"}, {})
    assert r["city"] == AUSTIN
    r = world.collections.add("deals", {"title": "Cafe", "city": "Atlantis"}, {})
    assert r["city"] == {"label": "Atlantis"}  # not found: its words, no point
    # given with a point, it is kept as given and not looked up
    asked = len(world.collections.geocoder.asked)
    r = world.collections.add("deals", {"title": "Deli", "city": {"label": "Home", "lat": 1,
                                                                   "lon": 2}}, {})
    assert r["city"] == {"label": "Home", "lat": 1.0, "lon": 2.0}
    assert len(world.collections.geocoder.asked) == asked
    with pytest.raises(Problem, match="latitude"):
        world.collections.add("deals", {"title": "X", "city": {"label": "X", "lat": 91,
                                                                "lon": 0}}, {})
    # a place's words are searchable
    assert [h["id"] for h in world.collections.search("Atlantis")]


def test_many_rows_are_located_in_one_lookup_before_the_write(world: World) -> None:
    table(world)
    fake = world.collections.geocoder = Fake()
    world.collections.upsert("deals", "title", [{"title": "A", "city": "Austin, TX"},
                                                {"title": "B", "city": "Atlantis"}], {})
    assert fake.asked == [["Austin, TX", "Atlantis"]]


def test_a_text_field_becomes_a_place_field_keeping_each_records_words(world: World) -> None:
    table(world, "text")
    a = world.collections.add("deals", {"title": "Bakery", "city": "Austin, TX"},
                              {"source": "stated"})
    world.collections.add("deals", {"title": "Cafe", "city": "Atlantis"}, {})
    world.collections.add("deals", {"title": "Deli"}, {})
    world.collections.geocoder = Fake()
    done = world.collections.to_place("deals", "city")
    assert (done["located"], done["unplaced"]) == (1, 1)
    assert next(f for f in done["fields"] if f["name"] == "city")["kind"] == "place"
    after = world.collections.get("deals", a["id"])
    assert after["city"] == AUSTIN
    assert after["_provenance"] == {"source": "stated"}  # what the values rest on is unchanged
    assert world.collections.history("deals", a["id"])[0]["values"]["city"] == "Austin, TX"
    with pytest.raises(Problem, match="already"):
        world.collections.to_place("deals", "city")
    world.collections.add_fields("deals", [{"name": "price", "kind": "number"}])
    with pytest.raises(Problem, match="Only a text field"):
        world.collections.to_place("deals", "price")


def test_alpha_proposes_and_only_the_persons_yes_changes_the_table(world: World) -> None:
    table(world, "text")
    world.collections.add("deals", {"title": "Bakery", "city": "Austin, TX"}, {})
    t = Tools(world)
    assert "error" in t.collection_propose_place("deals", "title_x", "why")
    proposed = t.collection_propose_place("deals", "city", "Your deals by city.")
    assert world.collections.describe("deals")["fields"][1]["kind"] == "text"  # not yet
    c = TestClient(create_app(world, live=False))
    world.collections.geocoder = Fake()
    needs = c.get("/api/home").json()["needs_you"]
    assert any(n["id"] == proposed["proposed"] and "map" in n["text"] for n in needs)
    assert c.post(f"/api/proposals/{proposed['proposed']}/decide",
                  json={"accept": True}).status_code == 200
    assert world.collections.describe("deals")["fields"][1]["kind"] == "place"
    assert world.collections.query("deals")[0]["city"]["lat"] == AUSTIN["lat"]


def test_apples_answer_counts_only_when_it_is_about_what_was_asked() -> None:
    mark = {"lat": 30.26, "lon": -97.74, "name": "Austin", "locality": "Austin", "region": "TX",
            "country": "United States", "country_code": "US"}
    assert _point("Austin, TX", mark)["precision"] == "city"  # type: ignore[index]
    street = {**mark, "name": "1 Infinite Loop", "thoroughfare": "Infinite Loop"}
    assert _point("1 Infinite Loop, Cupertino", street)["precision"] == "address"  # type: ignore[index]
    farm = {**mark, "name": "Fort Cobb", "locality": "Fort Cobb", "region": "OK"}
    assert _point("zzqqxx qqzz", farm) is None  # Apple's guess for nonsense is left out
