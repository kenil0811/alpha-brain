"""Files in and out: fetched from a connection, dropped by the person, sent by a procedure,
exported from a table."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

import alpha.connectors.browser as browser_module
from alpha.api.server import create_app
from alpha.connectors.base import Connections
from alpha.connectors.files import Files, files_dir
from alpha.mcp.tools import Tools
from alpha.runtime import acting
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world.actions import check_steps, file_fields
from alpha.world.purge import remove_module
from alpha.world.store import Problem
from alpha.world.world import World


@pytest.fixture(autouse=True)
def home(tmp_path: Path) -> Any:
    """Alpha's own files folder lives under a scratch ALPHA_HOME for every test here."""
    before = os.environ.get("ALPHA_HOME")
    os.environ["ALPHA_HOME"] = str(tmp_path / "home")
    yield tmp_path / "home"
    if before is None:
        del os.environ["ALPHA_HOME"]
    else:
        os.environ["ALPHA_HOME"] = before


def said(world: World, text: str) -> str:
    return world.journal.append("said", text, actor="person")


def advisory(world: World, turn: str | None = None) -> Tools:
    from conftest import building

    t = building(world, turn=turn)
    t.module_create("Advisory")
    t.collection_create("attachments", "Attachments", [
        {"name": "subject", "kind": "text"}, {"name": "file", "kind": "file"}],
        module="Advisory", title_field="subject")
    return t


class Driver:
    def __init__(self) -> None:
        self.jobs: list[dict[str, Any]] = []
        self.html = False

    def __call__(self, job: dict[str, Any], timeout: int) -> dict[str, Any]:
        self.jobs.append(job)
        if job["op"] == "status":
            return {"signed_in": True, "cookies": 2}
        if job["op"] == "download":
            if self.html:
                return {"html": True, "blocked": True, "bot_check": False, "status": 200}
            dest = Path(job["dest_dir"])
            dest.mkdir(parents=True, exist_ok=True)
            name = job.get("name") or "ETA Tracker.csv"
            (dest / name).write_text("firm,price\nA,1\n")
            return {"path": str(dest / name), "name": name, "size": 17,
                    "content_type": "text/csv", "blocked": False, "bot_check": False}
        if job["op"] == "act":
            shots = Path(job["shots_dir"])
            shots.mkdir(parents=True, exist_ok=True)
            (shots / "preview.png").write_bytes(b"png")
            (shots / "after.png").write_bytes(b"png")
            n = len(job["steps"]) - (1 if job["stop_before_last"] else 0)
            return {"done": n, "stopped_before_last": job["stop_before_last"],
                    "verified": None if job["stop_before_last"] else True,
                    "log": [], "shots": {"preview": str(shots / "preview.png")}
                    if job["stop_before_last"] else {"after": str(shots / "after.png")}}
        raise AssertionError(job["op"])


def with_fake(driver: Driver) -> None:
    browser_module.run_job = driver  # type: ignore[assignment]


def restore() -> None:
    from importlib import reload

    reload(browser_module)


# ---- downloads ----


def test_a_fetched_file_lands_in_alphas_folder_as_a_document(world: World) -> None:
    Connections(world.store).upsert("browser", "google.com", status="connected")
    driver = Driver()
    with_fake(driver)
    try:
        t = advisory(world, turn=said(world, "keep the attachment"))
        out = t.page_download("https://mail.google.com/mail/u/0/?attid=1", module="Advisory",
                              name="ETA Tracker.csv")
        assert out.get("document") and out["name"] == "ETA Tracker.csv", out
        doc = Files(world).document(out["document"])
        assert Path(doc["path"]).is_relative_to(files_dir("Advisory"))
        assert Path(doc["path"]).read_text().startswith("firm,price")
        assert doc["module"] == world.modules.get("Advisory")["id"]
        assert doc["origin"].startswith("https://mail.google.com")
        assert driver.jobs[-1]["profile"].endswith("google.com")  # the person's session
        # The text was read, so it can be searched and read in pages.
        assert "firm" in Files(world).read(out["document"])["text"]
        kinds = [e["kind"] for e in world.journal.recent(3)]
        assert "saw" in kinds and "did" in kinds
        # Kept on a row's file field, the page gets its name and path.
        rec = t.records_add("attachments", {"subject": "Data", "file": out["document"]},
                            source="stated")
        c = TestClient(create_app(world, live=False))
        data = c.get("/api/tables/attachments").json()
        assert data["files"][out["document"]]["name"] == "ETA Tracker.csv"
        assert data["records"][0]["file"] == out["document"] and rec["file"] == out["document"]
    finally:
        restore()


def test_a_page_instead_of_a_file_is_not_a_download(world: World) -> None:
    Connections(world.store).upsert("browser", "google.com", status="connected")
    driver = Driver()
    driver.html = True
    with_fake(driver)
    try:
        t = advisory(world, turn=said(world, "keep it"))
        out = t.page_download("https://mail.google.com/x", module="Advisory")
        assert "error" in out and "sign-in" in out["error"]
        count = world.store.one("SELECT COUNT(*) AS n FROM documents")
        assert count is not None and count["n"] == 0
    finally:
        restore()


# ---- the person's files ----


def test_dropped_files_are_kept_and_alpha_reads_them(world: World, tmp_path: Path) -> None:
    advisory(world, turn=said(world, "x"))
    turns: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        turns.append(req)
        return RunResult(ok=True, reply="Read it.")

    c = TestClient(create_app(world, live=False, runner=runner))
    out = c.post("/api/files", data={"module": "Advisory"},
                 files=[("files", ("statement.csv", b"date,amount\n2026-01-01,5\n", "text/csv"))])
    assert out.status_code == 200, out.text
    docs = out.json()["documents"]
    assert docs[0]["title"] == "statement.csv" and docs[0]["origin"] == "the person"
    assert Path(docs[0]["path"]).is_relative_to(files_dir("Advisory"))
    entry = world.journal.recent(1)[0]
    assert entry["kind"] == "changed" and entry["actor"] == "person"
    assert entry["text"].startswith("Added statement.csv into Advisory")
    # Alpha's reading turn is Alpha's own (not words put in the person's mouth) when live.
    assert out.json()["turn"] is None  # live=False: nothing starts in tests

    # On a row's file field instead: the file goes on that row, no reading turn.
    rec = Tools(world, turn=said(world, "y")).records_add("attachments", {"subject": "S"},
                                                           source="stated")
    out = c.post("/api/files", data={"table": "attachments", "record": rec["id"],
                                     "field": "file"},
                 files=[("files", ("note.txt", b"hello", "text/plain"))])
    assert out.status_code == 200, out.text
    row = world.collections.get("attachments", rec["id"])
    assert row["file"] == out.json()["documents"][0]["id"]
    assert row["_provenance"]["by"] == "person"


def test_removing_the_module_removes_its_files(world: World) -> None:
    advisory(world, turn=said(world, "x"))
    src = files_dir("scratch") / "in.txt"
    src.parent.mkdir(parents=True, exist_ok=True)
    src.write_text("x")
    doc = Files(world).take(src, module=world.modules.get("Advisory")["id"], origin="the person",
                            by="person")
    assert Path(doc["path"]).is_file()
    gone = remove_module(world, "Advisory")
    assert gone["files"] == 1
    assert not Path(doc["path"]).exists()
    count = world.store.one("SELECT COUNT(*) AS n FROM documents")
    assert count is not None and count["n"] == 0


# ---- uploads by a procedure ----


def test_an_upload_step_sends_only_a_file_alpha_keeps(world: World) -> None:
    steps = [{"click_text": "Compose"}, {"upload": "input[type=file]", "value": "{attachment}"},
             {"click_text": "Send"}]
    with pytest.raises(Problem, match="never typed"):
        check_steps([{"upload": "input[type=file]", "value": "/etc/passwd"}, {"click": "b"}],
                    ["attachment"], effect="send")
    clean, _ = check_steps(steps, ["attachment"], effect="send")
    assert file_fields(clean) == {"attachment"}

    Connections(world.store).upsert("browser", "google.com", status="connected")
    driver = Driver()
    with_fake(driver)
    try:
        advisory(world, turn=said(world, "x"))
        src = files_dir("scratch") / "deck.pdf"
        src.parent.mkdir(parents=True, exist_ok=True)
        src.write_bytes(b"%PDF-1.4")
        doc = Files(world).take(src, module=world.modules.get("Advisory")["id"],
                                origin="the person", by="person")
        t = Tools(world, turn=said(world, "send the deck to sania"))
        t.procedure_save("gmail_send_file", "https://mail.google.com/mail/u/0/#inbox",
                         "Send a file by email in Gmail", "send", steps, ["attachment"])
        aid = t.action_propose("gmail_send_file", "Send the deck to Sania",
                               {"attachment": doc["id"]}, "a sent email cannot be unsent")["action"]
        job = driver.jobs[-1]
        assert job["op"] == "act" and job["files_root"].endswith("/files")
        assert job["values"]["__files"]["attachment"] == doc["path"]
        # A document outside Alpha's folder is refused before anything runs.
        entity = world.entities.resolve("document", "hosts", {"path": "/etc/hosts"})["entity"]
        with world.store.tx() as db:
            db.execute("INSERT INTO documents (id, entity_id, path, title, kind, text, size,"
                       " modified_at, indexed_at) VALUES ('d_out', ?, '/etc/hosts', 'hosts',"
                       " 'txt', '', 1, 'x', 'x')", (entity["id"],))
        bad = t.action_propose("gmail_send_file", "Send hosts", {"attachment": "d_out"},
                               "no")
        assert bad["dry_run"] == "failed" and "isn't a file Alpha keeps" in bad["why"]
        # The real yes performs it.
        out = acting.approve(world, aid, "yes", runner=lambda r: RunResult(ok=True, reply=""),
                             repair=False)
        assert out["ok"] and world.actions.get(aid)["state"] == "done"
    finally:
        restore()


# ---- export ----


def test_a_table_exports_as_csv_and_excel(world: World) -> None:
    t = advisory(world, turn=said(world, "x"))
    t.records_add("attachments", {"subject": "Data, with a comma"}, source="stated")
    c = TestClient(create_app(world, live=False))
    csv_out = c.post("/api/tables/attachments/export", json={"format": "csv"}).json()
    text = Path(csv_out["path"]).read_text()
    assert csv_out["rows"] == 1 and text.splitlines()[0] == "subject,file"
    assert '"Data, with a comma"' in text
    xlsx_out = c.post("/api/tables/attachments/export", json={"format": "xlsx"}).json()
    from openpyxl import load_workbook

    wb = load_workbook(xlsx_out["path"])
    assert wb.worksheets[0].title == "Attachments"
    assert [c.value for c in wb.worksheets[0][2]][0] == "Data, with a comma"
    assert world.journal.recent(1)[0]["text"].startswith("Exported Attachments (1 rows)")
