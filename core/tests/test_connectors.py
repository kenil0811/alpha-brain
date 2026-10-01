from __future__ import annotations

import io
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest

from alpha.connectors.base import Connections, manifests
from alpha.connectors.browser import Browser, site_of
from alpha.connectors.calendar import Attendee, Calendar, CalendarEvent
from alpha.connectors.files import Files
from alpha.context import prepack
from alpha.mcp.tools import Tools
from alpha.world.store import Problem
from alpha.world.world import World

# ---- manifests ----


def test_every_builtin_connector_has_a_manifest_and_a_skill() -> None:
    names = {m["name"] for m in manifests()}
    assert {"files", "browser", "calendar"} <= names
    for m in manifests():
        assert m["tools"] and all(t["effect"] in {"read", "write"} for t in m["tools"])
        assert (Path(__file__).parents[2] / "connectors" / m["name"] / "SKILL.md").exists()


# ---- files ----


def test_watch_sync_change_remove(world: World, tmp_path: Path) -> None:
    folder = tmp_path / "Job search"
    (folder / "drafts").mkdir(parents=True)
    (folder / "notes.md").write_text("Lumen Analytics: backend role, Kafka and Go.")
    (folder / "drafts" / "cover.txt").write_text("Dear hiring manager at Northwind")
    (folder / ".hidden.md").write_text("secret")
    (folder / "image.png").write_bytes(b"\x89PNG")
    files = Files(world)
    files.watch(str(folder))
    first = files.sync()
    assert first["added"] == 2 and first["folders"] == 1
    assert files.search("kafka")[0]["title"] == "notes.md"
    assert files.sync()["added"] == 0  # nothing changed
    import os
    (folder / "notes.md").write_text("Lumen Analytics: interview on Wednesday.")
    later = datetime.now().timestamp() + 5
    os.utime(folder / "notes.md", (later, later))
    assert files.sync()["changed"] == 1
    assert files.search("wednesday") and not files.search("kafka")
    (folder / "drafts" / "cover.txt").unlink()
    assert files.sync()["removed"] == 1
    doc = files.read("notes.md")
    assert "Wednesday" in doc["text"] and doc["more"] is False
    entity = world.entities.find(keys={"path": str(folder / "notes.md")})[0]
    assert entity["kind"] == "document"
    assert any("Read notes.md" in e["text"] for e in world.journal.recent(20))


def test_office_documents_are_read(world: World, tmp_path: Path) -> None:
    import docx
    from openpyxl import Workbook

    folder = tmp_path / "docs"
    folder.mkdir()
    d = docx.Document()
    d.add_paragraph("Resume: senior backend engineer, Postgres")
    d.save(str(folder / "resume.docx"))
    wb = Workbook()
    sheet: Any = wb.active
    sheet.append(["company", "role"])
    sheet.append(["Harbourline", "Backend Engineer (Go)"])
    wb.save(str(folder / "targets.xlsx"))
    files = Files(world)
    files.watch(str(folder))
    assert files.sync()["added"] == 2
    assert files.search("postgres")[0]["title"] == "resume.docx"
    assert "Harbourline" in files.read("targets.xlsx")["text"]


def test_watch_refuses_home_and_missing(world: World) -> None:
    with pytest.raises(Problem, match="home folder"):
        Files(world).watch("~")
    with pytest.raises(Problem, match="isn't a folder"):
        Files(world).watch("/no/such/folder")


# ---- browser ----


def test_site_of() -> None:
    assert site_of("https://www.linkedin.com/in/priya/") == "linkedin.com"
    assert site_of("jobs.example.co.uk") == "example.co.uk"


def test_read_uses_the_signin_and_journals(world: World) -> None:
    jobs: list[dict[str, Any]] = []

    def runner(job: dict[str, Any], timeout: int) -> dict[str, Any]:
        jobs.append(job)
        if job["op"] == "status":
            return {"signed_in": True}
        return {"status": 200, "final_url": job["url"], "title": "My Network",
                "text": "Priya Raman Engineering Manager", "links": [
                    {"text": "Priya Raman", "url": "https://www.linkedin.com/in/priya/",
                     "near": "Priya Raman · Engineering Manager at Lumen"}]}

    Connections(world.store).upsert("browser", "linkedin.com", status="needs_ok")
    page = Browser(world, runner).read("https://www.linkedin.com/mynetwork/")
    assert jobs[0]["op"] == "status" and "profile" in jobs[1]
    assert page["signed_in"] and page["links"][0]["near"].startswith("Priya")
    conn = Connections(world.store).find("browser", "linkedin.com")
    assert conn is not None and conn["status"] == "connected"
    assert "signed in" in world.journal.recent(1)[0]["text"]


def test_a_signin_ask_closes_when_asked_again_and_when_signed_in(
    world: World, monkeypatch: pytest.MonkeyPatch
) -> None:
    class Window:
        def __init__(self, *args: Any, **kwargs: Any) -> None:
            self.stdin = io.StringIO()

    monkeypatch.setenv("ALPHA_NODE", "node")
    monkeypatch.setattr("alpha.connectors.browser.subprocess.Popen", Window)
    browser = Browser(world, lambda job, timeout: {"signed_in": True})
    browser.start_signin("gmail.com")
    browser.start_signin("gmail.com")
    asks = world.journal.open_asks()
    assert len(asks) == 1 and "gmail.com" in asks[0]["text"]
    browser.refresh("gmail.com")
    assert world.journal.open_asks() == []


def test_read_refuses_local_addresses(world: World) -> None:
    with pytest.raises(Problem, match="local network"):
        Browser(world, lambda j, t: {}).read("http://192.168.1.1/admin")


# ---- calendar ----


class FakeCalendar:
    def __init__(self, granted: bool = True) -> None:
        self.granted = granted
        self.asked = False
        start = datetime.now(UTC).replace(minute=0, second=0, microsecond=0) + timedelta(hours=1)
        self.items = [
            CalendarEvent(uid="ev-1", title="Lumen intro call", starts_at=start,
                          ends_at=start + timedelta(minutes=30), calendar="Work",
                          organiser=Attendee("Priya Raman", "priya@lumen.example"),
                          attendees=[Attendee("Priya Raman", "Priya@Lumen.example"),
                                     Attendee(None, None)]),
            CalendarEvent(uid="ev-2", title="Dentist", starts_at=start + timedelta(days=2),
                          ends_at=start + timedelta(days=2, hours=1)),
        ]

    def access(self) -> str:
        return "granted" if self.granted else ("not_asked" if not self.asked else "denied")

    def request_access(self) -> str:
        self.asked = True
        return self.access()

    def events(self, start: datetime, end: datetime) -> list[CalendarEvent]:
        return list(self.items)


def test_calendar_connect_sync_and_people(world: World) -> None:
    source = FakeCalendar()
    cal = Calendar(world, source)
    conn = cal.connect()
    assert conn["status"] == "connected" and conn["last_sync"]
    priya = world.entities.find(keys={"email": "priya@lumen.example"})
    assert len(priya) == 1  # organiser and attendee are one person
    now = datetime.now(UTC)
    week = cal.between(now.isoformat(), (now + timedelta(days=7)).isoformat())
    assert [e["title"] for e in week] == ["Lumen intro call", "Dentist"]
    assert week[0]["attendees"][0]["entity_id"] == priya[0]["id"]
    assert cal.sync()["unchanged"] == 2
    source.items[1].title = "Dentist (moved)"
    source.items = source.items[1:]
    result = cal.sync()
    assert result["changed"] == 1 and result["removed"] == 1


def test_calendar_without_access_needs_ok(world: World) -> None:
    cal = Calendar(world, FakeCalendar(granted=False))
    assert cal.connect()["status"] == "needs_ok"
    with pytest.raises(Problem, match="System Settings"):
        cal.sync()


# ---- the pre-pack and tools see it ----


def test_prepack_shows_reach_calendar_and_documents(world: World, tmp_path: Path) -> None:
    assert "Nothing connected yet" in prepack.build(world, "x")
    Calendar(world, FakeCalendar()).connect()
    folder = tmp_path / "notes"
    folder.mkdir()
    (folder / "lumen.md").write_text("Lumen salary band 90 to 100k")
    Files(world).watch(str(folder))
    Files(world).sync()
    text = prepack.build(world, "what is the lumen salary band")
    assert "calendar: macos — connected" in text and "files:" in text
    assert "document" in text and "lumen.md" in text
    if datetime.now().astimezone().hour < 23:
        assert "TODAY'S CALENDAR" in text and "Lumen intro call with Priya Raman" in text


def test_tools_cover_the_connectors(world: World, tmp_path: Path) -> None:
    t = Tools(world)
    folder = tmp_path / "f"
    folder.mkdir()
    (folder / "a.txt").write_text("quarterly numbers for Harbourline")
    watched = t.folder_watch(str(folder))
    assert watched["added"] == 1
    assert t.search("harbourline")["documents"][0]["title"] == "a.txt"
    assert t.document_read("a.txt")["text"].startswith("quarterly")
    assert t.connections_list()[0]["connector"] == "files"
    assert "error" in t.page_read("file:///etc/passwd")
