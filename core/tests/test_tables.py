"""Saved views, a field changing kind, bulk edits, undo and a record's history."""

from __future__ import annotations

from typing import Any

import pytest
from conftest import building
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.mcp.tools import Tools
from alpha.world.store import Problem
from alpha.world.world import World


def table(world: World) -> Tools:
    t = building(world, turn=world.journal.append("said", "Track my reading", actor="person"))
    t.collection_create("books", "Books", [
        {"name": "title", "kind": "text"}, {"name": "pages", "kind": "text"},
        {"name": "shelf", "kind": "text"}, {"name": "read_on", "kind": "datetime"},
        {"name": "genre", "kind": "choice", "choices": ["novel", "essay"]},
        {"name": "notes", "kind": "long_text"}, {"name": "done", "kind": "bool"}])
    t.records_add("books", {"title": "Dune", "pages": "412", "shelf": "a",
                            "read_on": "2026-01-02T00:00:00", "genre": "novel", "done": True})
    t.records_add("books", {"title": "Essays", "pages": "12.5", "shelf": "b",
                            "read_on": "2026-02-03T09:30:00", "genre": "essay",
                            "notes": "two\nlines"})
    return t


def client(world: World) -> TestClient:
    return TestClient(create_app(world, live=False))


def rows(world: World) -> dict[str, dict[str, Any]]:
    return {r["title"]: r for r in world.collections.query("books", limit=None)}


# ---- saved views ----

def test_views_are_saved_checked_and_journaled_through_the_api(world: World) -> None:
    table(world)
    c = client(world)
    config = {"kind": "board", "groupBy": "genre", "sorts": [{"id": "title", "dir": "asc"}],
              "rowFilters": [{"field": "done", "op": "is_checked", "value": ""}]}
    view = c.post("/api/tables/books/views", json={"title": "Read", "config": config}).json()
    assert view["config"]["groupBy"] == "genre" and view["created_by"] == "person"
    assert c.get("/api/tables/books").json()["views"][0]["title"] == "Read"
    bad = c.post("/api/tables/books/views",
                 json={"title": "X", "config": {"rowFilters": [{"field": "nope", "op": "is"}]}})
    assert bad.status_code == 400 and "no field ['nope']" in bad.json()["error"]
    dup = c.post("/api/tables/books/views", json={"title": "Read", "config": {}})
    assert "already" in dup.json()["error"]
    renamed = c.patch(f"/api/views/{view['id']}", json={"title": "Finished", "is_default": True})
    assert renamed.json()["title"] == "Finished" and renamed.json()["is_default"]
    assert c.delete(f"/api/views/{view['id']}").json() == {"deleted": view["id"]}
    assert c.get("/api/tables/books/views").json() == []
    texts = [e["text"] for e in world.journal.recent(10) if e["actor"] == "person"]
    assert "You saved the view Read on Books." in texts
    assert "You deleted the view Finished." in texts


def test_alpha_saves_a_view_when_asked_and_a_second_save_replaces_it(world: World) -> None:
    t = table(world)
    v = t.view_save("books", "Novels", kind="table",
                    filters=[{"field": "genre", "op": "is", "value": "novel"}],
                    sorts=[{"field": "title", "dir": "desc"}])
    assert v["created_by"] == "alpha" and v["config"]["sorts"] == [{"id": "title", "dir": "desc"}]
    again = t.view_save("books", "Novels", kind="calendar", date_field="read_on", default=True)
    assert again["id"] == v["id"] and again["config"]["dateBy"] == "read_on"
    assert [x["title"] for x in t.views_list("books")] == ["Novels"]
    assert "error" in t.view_save("books", "Bad", kind="pie")


def test_a_view_keeps_a_relative_day_and_hide_done(world: World) -> None:
    t = table(world)
    v = t.view_save("books", "This week", filters=[
        {"field": "read_on", "op": "on_or_after", "value": {"$today": -6}}], hide_done=True)
    assert v["config"]["rowFilters"][0]["value"] == {"$today": -6}
    assert v["config"]["hideDone"] is True
    bad = t.view_save("books", "Odd", filters=[
        {"field": "read_on", "op": "after", "value": {"$yesterday": 1}}])
    assert "relative to today" in bad["error"]


# ---- a field changes kind ----

def test_text_becomes_a_number_when_every_value_reads_as_one(world: World) -> None:
    table(world)
    c = client(world)
    out = c.patch("/api/tables/books/fields/pages", json={"kind": "number"}).json()
    assert out["after"]["kind"] == "number" and out["rewritten"] == 2
    assert rows(world)["Dune"]["pages"] == 412 and rows(world)["Essays"]["pages"] == 12.5
    assert c.patch("/api/tables/books/fields/pages", json={"kind": "text"}).json()["rewritten"] == 2
    assert rows(world)["Dune"]["pages"] == "412"


def test_changes_that_would_lose_data_are_refused_with_one_reason(world: World) -> None:
    t = table(world)
    w = world.collections
    with pytest.raises(Problem, match="Read on can't become a date: a row holds"
                       " '2026-02-03T09:30:00', which would read '2026-02-03'"):
        w.change_field("books", "read_on", kind="date")
    with pytest.raises(Problem, match="which has several lines"):
        w.change_field("books", "notes", kind="text")
    with pytest.raises(Problem, match="Genre can't become a choice: a row holds 'essay'"):
        w.change_field("books", "genre", choices=["novel"])
    t.records_add("books", {"title": "Atlas", "pages": "many"})
    with pytest.raises(Problem, match="Pages can't become a number: a row holds 'many', which"
                       " isn't a number"):
        w.change_field("books", "pages", kind="number")
    assert rows(world)["Dune"]["pages"] == "412"  # nothing was touched
    assert w.describe("books")["fields"][1]["kind"] == "text"
    err = client(world).patch("/api/tables/books/fields/pages", json={"kind": "number"})
    assert err.status_code == 400 and "\n" not in err.json()["error"]


def test_widening_kinds_and_values_becoming_choices(world: World) -> None:
    table(world)
    w = world.collections
    assert w.change_field("books", "shelf", kind="choice")["after"]["choices"] == ["a", "b"]
    w.change_field("books", "genre", kind="multichoice")
    assert rows(world)["Dune"]["genre"] == ["novel"]
    w.change_field("books", "genre", kind="status", label="Kind")
    assert rows(world)["Dune"]["genre"] == "novel"
    assert w.describe("books")["fields"][4]["label"] == "Kind"
    w.change_field("books", "done", kind="text")
    assert rows(world)["Dune"]["done"] == "Yes"
    w.change_field("books", "done", kind="bool")
    assert rows(world)["Dune"]["done"] is True


# ---- many rows at once, undo, history ----

def test_bulk_set_and_remove_are_one_entry_each_and_undo_puts_them_back(world: World) -> None:
    table(world)
    c = client(world)
    items = [{"id": r["id"], "revision": r["revision"]} for r in rows(world).values()]
    out = c.post("/api/tables/books/records/bulk",
                 json={"action": "set", "items": items, "values": {"shelf": "z"}}).json()
    assert out == {"done": 2, "skipped": []}
    assert {r["shelf"] for r in rows(world).values()} == {"z"}
    assert c.get("/api/tables/books").json()["last_edit"]["text"] == \
        "You set shelf on 2 rows in Books."
    assert "You set shelf" in c.post("/api/tables/books/undo").json()["text"]
    assert {r["shelf"] for r in rows(world).values()} == {"a", "b"}
    items = [{"id": r["id"], "revision": r["revision"]} for r in rows(world).values()]
    c.post("/api/tables/books/records/bulk", json={"action": "delete", "items": items})
    assert rows(world) == {}
    c.post("/api/tables/books/undo")
    assert sorted(rows(world)) == ["Dune", "Essays"]
    # Undo walks back: the next one is Alpha adding Essays, which goes again.
    c.post("/api/tables/books/undo")
    assert sorted(rows(world)) == ["Dune"]


def test_undo_refuses_when_the_row_changed_since(world: World) -> None:
    table(world)
    c = client(world)
    dune = rows(world)["Dune"]
    c.patch(f"/api/tables/books/records/{dune['id']}",
            json={"values": {"shelf": "q"}, "revision": dune["revision"]})
    world.collections.update("books", dune["id"], {"shelf": "r"}, dune["revision"] + 1,
                             {"by": "alpha"})
    err = c.post("/api/tables/books/undo")
    assert err.status_code == 400 and "changed since" in err.json()["error"]
    assert rows(world)["Dune"]["shelf"] == "r"


def test_a_field_change_and_a_removed_row_can_be_undone(world: World) -> None:
    t = table(world)
    c = client(world)
    c.patch("/api/tables/books/fields/pages", json={"kind": "number"})
    t.records_undo("books")
    assert rows(world)["Dune"]["pages"] == "412"
    essays = rows(world)["Essays"]
    c.delete(f"/api/tables/books/records/{essays['id']}?revision={essays['revision']}")
    c.post("/api/tables/books/undo")
    assert rows(world)["Essays"]["notes"] == "two\nlines"
    # The journal can still be read with a removed row in it (it once crashed on rows).
    assert t.journal_recent(50) and "error" not in t.search("Essays")


def test_a_records_history_says_who_and_in_which_turn(world: World) -> None:
    table(world)
    c = client(world)
    dune = rows(world)["Dune"]
    c.patch(f"/api/tables/books/records/{dune['id']}",
            json={"values": {"shelf": "q"}, "revision": dune["revision"]})
    history = c.get(f"/api/tables/books/records/{dune['id']}/history").json()
    assert [(h["actor"], h["said"]) for h in history] == [("alpha", "Track my reading"),
                                                          ("person", None)]
    assert history[0]["text"] == "Added Dune to Books (estimated)."
