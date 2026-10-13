"""A module's files listed with their dates and the records that use them, a file deleted (its
rows kept), and files kept about a person or company (13 Oct, slice 2 B8, B11, G4, G6)."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import pytest
from conftest import building
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.connectors.files import Files
from alpha.world.world import World


@pytest.fixture(autouse=True)
def home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ALPHA_HOME", str(tmp_path / "home"))


def seed(world: World) -> dict[str, Any]:
    t = building(world)
    t.module_create("Advisory")
    t.collection_create("statements", "Statements", [
        {"name": "subject", "kind": "text"}, {"name": "file", "kind": "file"}],
        module="Advisory", title_field="subject")
    rec = t.records_add("statements", {"subject": "March"}, source="stated")
    read = t.records_add("statements", {"subject": "Read from it"}, source="march.txt")
    return {"rec": rec, "read": read}


def test_a_modules_files_say_when_they_came_and_who_uses_them(world: World) -> None:
    ids = seed(world)
    c = TestClient(create_app(world, live=False))
    c.post("/api/files", data={"module": "Advisory"},
           files=[("files", ("notes.txt", b"hello there", "text/plain"))])
    on_row = c.post("/api/files", data={"table": "statements", "record": ids["rec"]["id"],
                                        "field": "file"},
                    files=[("files", ("march.txt", b"march numbers", "text/plain"))]).json()
    listed = c.get("/api/modules/Advisory/files").json()
    assert sorted(d["title"] for d in listed) == ["march.txt", "notes.txt"]
    assert all(d["added_at"] and not d["from_folder"] for d in listed)
    march = next(d for d in listed if d["title"] == "march.txt")
    assert march["used_by"] == [{"collection": "statements", "table": "Statements",
                                 "record": ids["rec"]["id"], "title": "March", "field": "file"}]
    assert march["id"] == on_row["documents"][0]["id"]


def test_deleting_a_file_empties_its_fields_and_keeps_the_rows_read_from_it(world: World
                                                                             ) -> None:
    ids = seed(world)
    c = TestClient(create_app(world, live=False))
    doc = c.post("/api/files", data={"table": "statements", "record": ids["rec"]["id"],
                                     "field": "file"},
                 files=[("files", ("march.txt", b"march numbers", "text/plain"))]
                 ).json()["documents"][0]
    plan = c.get(f"/api/documents/{doc['id']}/removal").json()
    assert plan["what"] == "its text Alpha read, and the file is taken out of 1 record"
    c.delete(f"/api/documents/{doc['id']}")
    assert world.collections.get("statements", ids["rec"]["id"])["file"] is None
    assert world.collections.get("statements", ids["read"]["id"])["subject"] == "Read from it"
    assert Files(world).search("march") == [] and not Path(doc["path"]).exists()
    assert world.journal.recent(1)[0]["text"] == (
        "Removed march.txt: its text Alpha read, and the file is taken out of 1 record.")


def test_a_connected_folders_own_file_is_never_deleted_here(world: World, tmp_path: Path
                                                            ) -> None:
    folder = tmp_path / "Docs"
    folder.mkdir()
    (folder / "cv.txt").write_text("my cv")
    files = Files(world)
    files.watch(str(folder))
    files.sync()
    did = files.documents()[0]["id"]
    c = TestClient(create_app(world, live=False))
    refused = c.delete(f"/api/documents/{did}").json()
    assert "in a folder you connected" in refused["error"]
    assert (folder / "cv.txt").exists()


def test_files_kept_about_a_person_are_on_their_page_and_follow_a_merge(world: World) -> None:
    priya = world.entities.resolve("person", "Priya Raman", {"email": "p@x.com"})["entity"]
    twin = world.entities.resolve("person", "P. Raman", {"phone": "+1 555"})["entity"]
    c = TestClient(create_app(world, live=False))
    c.post("/api/files", data={"about": twin["id"]},
           files=[("files", ("intro.txt", b"met at the talk", "text/plain"))])
    assert [d["title"] for d in c.get(f"/api/entities/{twin['id']}/files").json()] == [
        "intro.txt"]
    assert world.journal.recent(1)[0]["text"].startswith("Added intro.txt about P. Raman")
    world.entities.merge(priya["id"], twin["id"])
    assert [d["title"] for d in c.get(f"/api/entities/{priya['id']}/files").json()] == [
        "intro.txt"]
