"""Modules inside modules (3 Oct 2026 night, Q31): one concept, any depth; a parent's page,
summary, activity and conversation reach everything inside it; removal takes the subtree."""
from __future__ import annotations

import pytest
from conftest import building
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.context import prepack
from alpha.context.graph import work_graph
from alpha.mcp.tools import Tools
from alpha.world.purge import remove_module
from alpha.world.store import Problem
from alpha.world.world import World


def _job(world: World) -> tuple[str, str, str]:
    t = building(world)
    job = t.module_create("Job", "a founding engineer role")["id"]
    search = t.module_create("Search", "openings worth applying to", parent="Job")["id"]
    resume = t.module_create("Resume", None, parent=job)["id"]
    t.collection_create("openings", "Openings", [{"name": "title", "kind": "text"}],
                        module=search)
    t.collection_create("resumes", "Resumes", [{"name": "version", "kind": "text"}],
                        module=resume)
    return job, search, resume


def test_a_module_can_sit_inside_another_to_any_depth(world: World) -> None:
    job, search, resume = _job(world)
    assert world.modules.get(search)["parent"] == job
    assert [m["name"] for m in world.modules.children(job)] == ["Resume", "Search"]
    assert world.modules.subtree(job) == [job, resume, search]
    assert world.modules.path_words(search) == "Job › Search"
    deep = world.modules.create("Drafts", parent=resume)["id"]
    assert world.modules.path_words(deep) == "Job › Resume › Drafts"
    assert "Made the project Resume inside Job." in \
        [e["text"] for e in world.journal.recent(20, kinds=["made"])]
    with pytest.raises(Problem, match="inside itself"):
        world.modules.move(job, deep)
    moved = Tools(world).module_move("Drafts", None)
    assert moved["parent"] is None and moved["path"] == "Drafts"
    assert world.journal.recent(1, kinds=["changed"])[-1]["text"] == \
        "Moved the project Drafts under the top."
    Tools(world).module_move("Drafts", "Search")
    assert world.modules.path_words(deep) == "Job › Search › Drafts"


def test_a_parents_page_summary_and_activity_reach_what_it_holds(world: World) -> None:
    job, search, resume = _job(world)
    world.collections.add("openings", {"title": "Backend at Lumen"}, {"by": "person"})
    world.journal.append("did", "Read the board.", module=search)
    c = TestClient(create_app(world, live=False))
    page = c.get(f"/api/modules/{job}").json()
    assert page["path"] == ["Job"] and sorted(page["children"]) == sorted([search, resume])
    assert [m["name"] for m in page["inside"]] == ["Resume", "Search"]
    assert page["inside"][1]["path"] == ["Job", "Search"]
    assert page["tables"] == []  # a parent's own tables only; the children keep theirs
    assert any(e["text"] == "Read the board." for e in page["activity"])
    summary = c.get(f"/api/modules/{job}/summary").json()
    assert sorted(t["name"] for t in summary["tables"]) == ["openings", "resumes"]
    child = c.get(f"/api/modules/{search}").json()
    assert child["path"] == ["Job", "Search"] and child["inside"] == []
    cards = c.get("/api/modules").json()
    assert {m["name"]: m["path"] for m in cards} == {
        "Job": ["Job"], "Search": ["Job", "Search"], "Resume": ["Job", "Resume"]}
    moved = c.post(f"/api/modules/{resume}/move", json={"parent": None}).json()
    assert moved["path"] == ["Resume"]
    assert world.journal.recent(1, kinds=["changed"])[-1]["text"] == \
        "You moved Resume under the top."
    chat = world.modules.open_thread("A chat", "chat", search)
    convo = c.get("/api/conversation", params={"conversation": chat["id"]}).json()
    assert convo["conversation"]["scope"] == "Job › Search"


def test_the_pack_and_the_map_show_the_tree(world: World) -> None:
    job, search, resume = _job(world)
    text = prepack.build(world, "anything", module=search)
    held = text[text.index("WHAT ALPHA HOLDS"):text.index("WHAT ALPHA CAN REACH")]
    lines = held.splitlines()
    assert lines[1].startswith(f"- Module Job ({job}) — a founding engineer role, holds Resume,"
                               " Search: no tables of its own")
    assert lines[2].startswith(f"  - Module Search ({search})")  # the sentence's own module first
    assert lines[3].startswith("    openings (0 rows): title")
    assert lines[4].startswith(f"  - Module Resume ({resume})")
    g = work_graph(world, [])
    assert {"from": f"module:{search}", "to": f"module:{job}", "kind": "in"} in \
        [{k: e[k] for k in ("from", "to", "kind")} for e in g["edges"]]


def test_removing_a_module_takes_what_it_holds(world: World) -> None:
    job, search, resume = _job(world)
    out = remove_module(world, "Job")
    assert [i["module"] for i in out["inside"]] == ["Resume", "Search"]
    assert world.modules.all() == []
    assert world.collections.overview() == []


def test_the_person_makes_a_parent_in_the_window_and_moves_modules_into_it(world: World) -> None:
    """Kenil, 3 Oct: "i want to create avilo and have deals and advisory in it"."""
    t = building(world)
    advisory = t.module_create("Advisory", "clients")["id"]
    deals = t.module_create("Deal Tracker", "deals")["id"]
    c = TestClient(create_app(world, live=False))
    made = c.post("/api/modules", json={"name": "Avilo", "goal": None, "parent": None}).json()
    assert made["name"] == "Avilo" and made["path"] == ["Avilo"] and made["tables"] == []
    assert world.journal.recent(1, kinds=["changed"])[-1]["text"] == "You made the project Avilo."
    c.post(f"/api/modules/{advisory}/move", json={"parent": made["id"]})
    c.post(f"/api/modules/{deals}/move", json={"parent": "Avilo"})
    assert [m["name"] for m in world.modules.children(made["id"])] == ["Advisory", "Deal Tracker"]
    again = c.post("/api/modules", json={"name": "Avilo"})
    assert again.status_code == 400 and "already" in again.json()["error"]
    inside = c.post("/api/modules", json={"name": "Clients", "parent": "Avilo"}).json()
    assert inside["path"] == ["Avilo", "Clients"]
