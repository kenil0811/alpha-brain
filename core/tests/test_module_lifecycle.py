"""A module renamed, removed with its data kept, restored, or deleted for good (13 Oct, slice 2
A1–A4), and the names Alpha may give the things it makes (A2)."""

from __future__ import annotations

from typing import Any

import pytest
from conftest import building
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.world.store import Problem
from alpha.world.world import World


def client(world: World, **kw: Any) -> TestClient:
    return TestClient(create_app(world, live=False, **kw))


def seed(world: World) -> dict[str, Any]:
    t = building(world, turn="j_seed")
    avilo = t.module_create("Avilo")
    deals = t.module_create("Deal Tracker", parent="Avilo")
    t.collection_create("deal_listings", "Listings", [{"name": "title", "kind": "text"}],
                        module="Deal Tracker")
    t.records_add("deal_listings", {"title": "Bakery in Austin"}, source="stated")
    t.note_write("module:Deal Tracker", "Deal Tracker", "What it is for.")
    auto = t.agent_create("Daily brokers", "daily 07:00", "reader_run brokers",
                               module="Deal Tracker")
    return {"avilo": avilo, "deals": deals, "auto": auto}


def test_a_rename_reaches_everywhere_and_keeps_the_page(world: World) -> None:
    ids = seed(world)
    c = client(world)
    out = c.post(f"/api/modules/{ids['deals']['id']}/rename", json={"name": "Deals"}).json()
    assert out["name"] == "Deals"
    page = world.knowledge.find_note("module:Deals", "Deals")
    assert page is not None and page["body"] == "What it is for."
    assert world.knowledge.find_note("module:Deal Tracker", "Deal Tracker") is None
    assert world.journal.recent(1)[0]["text"] == "You renamed Deal Tracker to Deals."
    # an empty name or one another module has is refused, in words
    assert c.post(f"/api/modules/{ids['deals']['id']}/rename", json={"name": " "}
                  ).json()["error"] == "A module needs a name."
    assert "already" in c.post(f"/api/modules/{ids['deals']['id']}/rename",
                               json={"name": "avilo"}).json()["error"]


def test_removed_with_data_kept_is_out_of_sight_and_comes_back(world: World) -> None:
    ids = seed(world)
    c = client(world)
    c.post(f"/api/modules/{ids['avilo']['id']}/remove")
    # it and what it holds leave every list; its agent is stopped; nothing is deleted
    assert [m["name"] for m in c.get("/api/modules").json()] == []
    # only Alpha's own agents (Watson, no module) are left in sight
    assert [a for a in world.agents.all() if a["module"]] == [] and world.agents.due() == []
    assert world.collections.describe("deal_listings")["records"] == 1
    assert world.collections.search("Bakery") == []
    removed = c.get("/api/modules/removed").json()
    assert [r["name"] for r in removed] == ["Avilo"]  # Deal Tracker went with it, not listed alone
    assert removed[0]["holds"] == "1 table (1 row) and 1 agent, with Deal Tracker inside it"
    # a module inside can't come back before the one that holds it
    assert "Restore Avilo first" in c.post(
        f"/api/modules/{ids['deals']['id']}/restore").json()["error"]
    back = c.post(f"/api/modules/{ids['avilo']['id']}/restore").json()
    assert back["name"] == "Avilo"
    assert sorted(m["name"] for m in c.get("/api/modules").json()) == ["Avilo", "Deal Tracker"]
    assert world.modules.get("Deal Tracker")["parent"] == ids["avilo"]["id"]  # where it was
    assert len([a for a in world.agents.all() if a["module"]]) == 1
    assert c.get("/api/modules/removed").json() == []


def test_a_module_removed_on_its_own_stays_removed_when_its_parent_comes_back(world: World
                                                                              ) -> None:
    ids = seed(world)
    world.modules.remove(ids["deals"]["id"])
    world.modules.remove(ids["avilo"]["id"])
    assert [m["name"] for m in world.modules.removed()] == ["Avilo", "Deal Tracker"]
    world.modules.restore(ids["avilo"]["id"])
    assert world.modules.get("Deal Tracker")["removed_at"] is not None


def test_delete_for_good_says_first_what_goes_then_takes_it(world: World) -> None:
    ids = seed(world)
    c = client(world)
    plan = c.get(f"/api/modules/{ids['avilo']['id']}/removal").json()
    assert plan["what"] == "1 table (1 row) and 1 agent, with Deal Tracker inside it"
    c.delete(f"/api/modules/{ids['avilo']['id']}")
    assert world.modules.all() == [] and world.collections.names() == []
    assert world.journal.recent(1)[0]["text"].startswith("Removed Avilo")  # the journal keeps it


def test_names_never_repeat_their_parent_or_a_sibling(world: World) -> None:
    t = building(world)
    t.module_create("Deals")
    refused = t.collection_create("deals", "Deals", [{"name": "title", "kind": "text"}],
                                  module="Deals")
    assert "the module's own name" in refused["error"]
    t.collection_create("deal_rows", "Listings", [{"name": "title", "kind": "text"}],
                        module="Deals")
    again = t.collection_create("more_rows", "listings", [{"name": "title", "kind": "text"}],
                                module="Deals")
    assert "There is a table called 'listings' here already" in again["error"]
    # another module may reuse a title
    t.module_create("Network")
    assert "error" not in t.collection_create("net_rows", "Listings",
                                               [{"name": "title", "kind": "text"}],
                                               module="Network")
    with pytest.raises(Problem, match="the table's own name"):
        world.views.save("deal_rows", "Listings", {})
    world.views.save("deal_rows", "Active", {})
    with pytest.raises(Problem, match="There is a list called"):
        world.views.save("deal_rows", "active", {})
