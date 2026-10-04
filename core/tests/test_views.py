"""Saved lists live in the world (3 Oct 2026, from pull request #3's idea)."""

from __future__ import annotations

import pytest
from conftest import building
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.mcp.tools import Tools
from alpha.world.purge import remove_module
from alpha.world.store import Problem
from alpha.world.world import World


def deals(world: World, module: str | None = None) -> None:
    building(world).collection_create("deals", "Deals", [
        {"name": "title", "kind": "text"}, {"name": "price", "kind": "number"},
        {"name": "status", "kind": "status", "choices": ["Active", "Sold"],
         "done_choices": ["Sold"]},
    ], module=module)


def test_a_list_is_kept_checked_and_one_is_the_default(world: World) -> None:
    deals(world)
    v = world.views
    one = v.save("deals", "Active ones", {"filters": {"status": "Active"}, "hidden": ["price"],
                                           "sort": {"field": "price", "direction": "desc"}})
    assert one["config"]["filters"] == {"status": "Active"} and not one["is_default"]
    two = v.save("deals", "Everything", {}, default=True)
    assert [x["is_default"] for x in v.for_table("deals")] == [False, True]
    v.update(one["id"], default=True)
    assert [x["is_default"] for x in v.for_table("deals")] == [True, False]
    renamed = v.update(two["id"], title="All deals")
    assert renamed["title"] == "All deals" and renamed["config"] == {"hidden": []}
    with pytest.raises(Problem, match="no field 'nope'"):
        v.save("deals", "Bad", {"filters": {"nope": "x"}})
    with pytest.raises(Problem, match="no table"):
        v.save("nothing", "Bad", {})
    with pytest.raises(Problem, match="holds"):
        v.save("deals", "Bad", {"colour": "red"})
    with pytest.raises(Problem, match="no field 'nope' \\(group_by\\)"):
        v.save("deals", "Bad", {"view": "board", "group_by": "nope"})
    board = v.save("deals", "Board", {"view": "board", "group_by": "status"})
    assert board["config"]["group_by"] == "status"
    v.delete(one["id"])
    assert [x["title"] for x in v.for_table("deals")] == ["All deals", "Board"]


def test_the_routes_keep_lists_and_the_table_carries_them(world: World) -> None:
    deals(world)
    c = TestClient(create_app(world, live=False))
    made = c.post("/api/tables/deals/lists",
                  json={"title": "Sold", "config": {"filters": {"status": "Sold"}},
                        "default": True}).json()
    assert made["is_default"] and made["title"] == "Sold"
    assert [x["id"] for x in c.get("/api/tables/deals").json()["lists"]] == [made["id"]]
    changed = c.patch(f"/api/lists/{made['id']}", json={"title": "Sold deals"}).json()
    assert changed["title"] == "Sold deals"
    assert c.delete(f"/api/lists/{made['id']}").json()["id"] == made["id"]
    assert c.get("/api/tables/deals/lists").json() == []
    kinds = [e["text"] for e in world.journal.recent(5, kinds=["changed"])]
    assert any("saved the list" in k for k in kinds) and any("removed the list" in k for k in kinds)
    assert c.post("/api/tables/deals/lists", json={"title": "", "config": {}}).status_code == 400


def test_alpha_keeps_a_list_when_asked(world: World) -> None:
    deals(world)
    said = world.journal.append("said", "keep a list of the sold ones, by price", actor="person")
    out = Tools(world, turn=said).list_save("deals", "Sold, by price", filters={"status": "Sold"},
                                            columns=["title", "price"], sort_by="price",
                                            descending=True, default=True)
    assert out["config"] == {"search": "", "filters": {"status": "Sold"}, "hide_done": False,
                             "hidden": ["status"], "sort": {"field": "price", "direction": "desc"},
                             "view": "table"}
    assert out["is_default"] and out["source"] == f"turn:{said}"
    assert "no field nope" in Tools(world).list_save("deals", "Bad", columns=["nope"])["error"]


def test_removing_the_module_takes_its_lists(world: World) -> None:
    world.modules.create("Deals")
    deals(world, module="Deals")
    world.views.save("deals", "Active", {"filters": {"status": "Active"}})
    out = remove_module(world, "Deals")
    assert out["lists"] == 1 and world.store.one("SELECT 1 AS x FROM views") is None
