"""Network as a project (12 Oct, the owner: "I asked my LinkedIn to be merged with Network, I
don't see it"): Network is a real module, a module merges into another, and a table of people
names the organisations they are at."""

from __future__ import annotations

from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.mcp.tools import Tools
from alpha.world.world import World

FIELDS = [{"name": "name", "kind": "text"}, {"name": "url", "kind": "text"},
          {"name": "company", "kind": "text"}]


def linkedin(world: World) -> str:
    module = world.modules.create("LinkedIn connections")
    world.collections.create("connections", "Connections", FIELDS, module=module["id"])
    for i, company in enumerate(["Initech", "initech", "Acme", ""]):
        world.collections.add("connections", {"name": f"P{i}", "url": f"https://x.com/p{i}",
                                              "company": company}, {})
    world.collections.identify("connections", "person", "url")
    return str(module["id"])


def test_network_is_made_once_and_kept_by_id(world: World) -> None:
    mid = world.modules.network()
    assert mid is not None
    assert world.modules.get(mid)["name"] == "Network" and world.modules.network() == mid
    with world.store.tx() as db:
        db.execute("UPDATE modules SET name = 'People I know' WHERE id = ?", (mid,))
    assert world.modules.network() == mid  # renamed, still Network


def test_a_module_merges_into_network_with_its_rows(world: World) -> None:
    source = linkedin(world)
    network = world.modules.network()
    assert network is not None
    t = Tools(world)
    assert "itself" in t.module_merge(network, network)["error"]
    out = t.module_merge("LinkedIn connections", "Network")
    assert out["moved"] == {"collections": 1}
    assert world.collections.describe("connections")["module"] == network
    assert "no module" in t.module_merge(source, network)["error"]  # gone
    assert len(world.collections.query("connections")) == 4
    cards = TestClient(create_app(world, live=False)).get("/api/modules").json()
    assert [c["name"] for c in cards if c["network"]] == ["Network"]


def test_a_company_field_names_organisations_and_network_shows_who_is_at_each(
        world: World) -> None:
    linkedin(world)
    out = Tools(world).collection_link("connections", "company", "organisation")
    # Initech once, whatever its case; Acme; a blank names none
    assert out["named"] == 2 and out["rows_linked"] == 3
    people = TestClient(create_app(world, live=False)).get("/api/people").json()
    orgs = {p["name"]: p["members"] for p in people if p["kind"] == "organisation"}
    assert orgs == {"Initech": 2, "Acme": 1}
    assert sum(1 for p in people if p["kind"] == "person" and p["at"]) == 3
    # a later row is linked on its write
    world.collections.add("connections", {"name": "P9", "url": "https://x.com/p9",
                                          "company": "Acme"}, {})
    people = TestClient(create_app(world, live=False)).get("/api/people?kind=organisation")
    assert {p["name"]: p["members"] for p in people.json()}["Acme"] == 2


def test_a_person_who_changes_company_is_at_the_new_one_only(world: World) -> None:
    linkedin(world)
    Tools(world).collection_link("connections", "company", "organisation")
    row = next(r for r in world.collections.query("connections") if r["name"] == "P0")
    world.collections.update("connections", row["id"], {"company": "Beta"}, row["revision"], {})
    people = TestClient(create_app(world, live=False)).get("/api/people").json()
    names = {p["id"]: p["name"] for p in people}
    p0 = next(p for p in people if p["name"] == "P0")
    assert [names[o] for o in p0["at"]] == ["Beta"]
    row = next(r for r in world.collections.query("connections") if r["name"] == "P0")
    world.collections.delete("connections", row["id"], row["revision"])
    people = TestClient(create_app(world, live=False)).get("/api/people").json()
    assert next(p for p in people if p["name"] == "P0")["at"] == []


def test_merging_two_modules_that_read_one_page_keeps_it_once_and_joins_their_pages(
        world: World) -> None:
    a, b = world.modules.create("A"), world.modules.create("B")
    for m in (a, b):
        world.sources.add("LinkedIn", "https://www.linkedin.com/mynetwork/", module=m["id"])
    world.knowledge.write_note("module:A", "A", "What A is for.")
    world.knowledge.write_note("module:B", "B", "What B is for.")
    out = Tools(world).module_merge("A", "B")
    assert "error" not in out and len(world.sources.all(b["id"])) == 1
    pages = world.knowledge.notes("module:B")
    assert len(pages) == 1 and "## A" in pages[0]["body"] and "What A is for." in pages[0]["body"]


def test_network_holds_no_projects_and_once_removed_is_not_made_again(world: World) -> None:
    from alpha.world import purge
    network = world.modules.network()
    assert network
    world.modules.create("Inner", parent=None)
    assert "Network holds" in Tools(world).module_move("Inner", "Network")["error"]
    purge.remove_module(world, network)
    assert world.modules.network() is None and world.modules.network_id() is None
