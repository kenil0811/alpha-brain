"""Fields the person adds and renames (13 Oct, slice 2 B1, B2): their own edits, journaled, the
module's workflow page following as a new version; and a workflow's things never named like the
workflow (A2, which a build would otherwise refuse)."""

from __future__ import annotations

from typing import Any

import pytest
from conftest import building
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.world.store import Problem
from alpha.world.world import World

BODY: dict[str, Any] = {
    "purpose": "Track the sites worth a look.",
    "steps": [{"title": "A site arrives", "what": "You type the address.", "who": "you",
               "gives": "a site", "when": "when a site arrives"}],
    "keeps": [{"thing": "Site", "fields": ["address"]}],
}


def client(world: World) -> TestClient:
    return TestClient(create_app(world, live=False))


def seed(world: World) -> dict[str, Any]:
    t = building(world)
    module = t.module_create("Car Wash")
    t.collection_create("site", "Sites", [{"name": "address", "kind": "text"}], module="Car Wash")
    t.records_add("site", {"address": "1 Main St"}, source="stated")
    wf = world.workflows.draft("Car wash scorecard", BODY, module=module["id"])
    return {"module": module, "wf": wf}


def test_a_field_added_by_hand_is_journaled_and_goes_on_the_page(world: World) -> None:
    ids = seed(world)
    c = client(world)
    desc = c.post("/api/tables/site/fields", json={"label": "Asking price", "kind": "number",
                                                   "unit": "$"}).json()
    added = desc["fields"][-1]
    assert added == {"name": "asking_price", "label": "Asking price", "kind": "number",
                     "unit": "$"}
    assert world.collections.query("site")[0].get("asking_price") is None  # rows read as empty
    assert world.journal.recent(1)[0]["text"] == "You added the field Asking price to Sites."
    wf = world.workflows.get(ids["wf"]["id"])
    assert wf["version"] == 2 and [f["label"] for f in wf["body"]["keeps"][0]["fields"]] == [
        "address", "Asking price"]
    # a choice needs its options; a name the table has is refused
    assert "needs its choices" in c.post("/api/tables/site/fields", json={
        "label": "Stage", "kind": "status"}).json()["error"]
    assert c.post("/api/tables/site/fields", json={"label": "asking price"}).json()["error"] == (
        "This table has a field called 'asking price' already.")


def test_a_field_renamed_keeps_its_id_and_the_page_follows(world: World) -> None:
    ids = seed(world)
    c = client(world)
    desc = c.post("/api/tables/site/fields/address/rename", json={"label": "Street address"}
                  ).json()
    assert [(f["name"], f["label"]) for f in desc["fields"]] == [("address", "Street address")]
    assert world.collections.query("site")[0]["address"] == "1 Main St"
    assert world.journal.recent(1)[0]["text"] == (
        "You renamed the field Address to Street address in Sites.")
    assert world.workflows.get(ids["wf"]["id"])["body"]["keeps"][0]["fields"][0]["label"] == (
        "Street address")
    assert c.post("/api/tables/site/fields/address/rename", json={"label": ""}
                  ).json()["error"] == "A field needs a name."


def test_a_workflows_things_are_never_named_like_the_workflow(world: World) -> None:
    with pytest.raises(Problem, match="the workflow's own name"):
        world.workflows.draft("Site", BODY)
