"""Governance: what Alpha may cause, enforced by mechanism (docs/design/governance.md)."""

from __future__ import annotations

import sqlite3
from pathlib import Path
from typing import Any

import pytest

from alpha.mcp.tools import Tools
from alpha.world.world import World

URL = "https://www.linkedin.com/mynetwork/invite-connect/connections/"


def driver(rows: Any, **extra: Any) -> Any:
    seen: list[dict[str, Any]] = []

    def job(j: dict[str, Any], timeout: int) -> dict[str, Any]:
        seen.append(j)
        return {"status": 200, "final_url": j["url"], "title": "Connections", "result": rows,
                "text": "page text", "links": [], "scrolls": 1, "writes_blocked": 0,
                "egress_blocked": 0, "posts_allowed": [], **extra}

    job.seen = seen  # type: ignore[attr-defined]
    return job


ROWS = [{"name": f"P{i}", "url": f"https://www.linkedin.com/in/p{i}/"} for i in range(5)]


# ---- 1. browser read sessions: POSTs only through the reader's own allowlist ----

def test_reader_allow_posts_is_checked_kept_passed_and_journaled(
        world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    t = Tools(world, turn="j_1")
    job = driver(ROWS, posts_allowed=[{"method": "POST",
                                       "url": "https://www.linkedin.com/voyager/api/graphql"}])
    monkeypatch.setattr("alpha.connectors.browser.run_job", job)
    other = t.reader_save("people", URL, "return rows", "People",
                          allow_posts=[{"origin": "https://evil.example", "path": "/x"}])
    assert "may only name linkedin.com" in other["error"]
    assert "must be like" in t.reader_save("people", URL, "return rows", "People", allow_posts=[
        {"origin": "http://www.linkedin.com", "path": "/x"}])["error"]
    rule = {"origin": "https://www.linkedin.com", "path": "/voyager/api/graphql*"}
    saved = t.reader_save("people", URL, "return rows", "People", allow_posts=[rule])
    assert saved["rows"] == 5
    assert job.seen[-1]["allow_posts"] == [rule]
    assert world.readers.get("people")["allow_posts"] == [rule]
    made = world.journal.recent(1, kinds=["made"])[0]
    assert "read-only POSTs to https://www.linkedin.com/voyager/api/graphql*" in made["text"]
    world.collections.create("people", "People", [{"name": "name", "kind": "text"},
                                                  {"name": "url", "kind": "url"}])
    assert t.reader_run("people", "people", "url")["health"] == "ok"
    assert job.seen[-1]["allow_posts"] == [rule]
    saw = world.journal.recent(1, kinds=["saw"])[0]["data"]
    assert saw["posts_allowed"][0]["url"].endswith("/graphql")


def test_page_scripts_never_carry_an_allowlist_and_report_what_was_blocked(
        world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    job = driver([1], writes_blocked=2, egress_blocked=3)
    monkeypatch.setattr("alpha.connectors.browser.run_job", job)
    out = Tools(world, turn="j_1").page_script(URL, "return [1]")
    assert job.seen[0]["allow_posts"] == []
    assert out["writes_blocked"] == 2 and out["egress_blocked"] == 3
    saw = world.journal.recent(1, kinds=["saw"])[0]["data"]
    assert saw["writes_blocked"] == 2 and saw["egress_blocked"] == 3


def old_store(path: Path) -> None:
    """A world file as the previous version left it: no allow_posts, no journal guards."""
    world = World(path)
    world.journal.append("said", "hello", actor="person")
    world.readers.save("old", site="example.com", url="https://example.com/", script="return []",
                       description="x", to_end=False, count=1)
    world.close()
    db = sqlite3.connect(path)
    db.executescript("DROP TRIGGER journal_no_delete; DROP TRIGGER journal_only_forget;"
                     " ALTER TABLE readers DROP COLUMN allow_posts;")
    db.close()


def test_an_existing_store_is_migrated(tmp_path: Path) -> None:
    old_store(tmp_path / "world.sqlite")
    world = World(tmp_path / "world.sqlite")
    try:
        assert world.readers.get("old")["allow_posts"] == []
        with pytest.raises(sqlite3.IntegrityError, match="append-only"):
            world.store.db.execute("DELETE FROM journal")
        world.journal.forget(world.journal.recent(1)[0]["id"])
    finally:
        world.close()



# ---- 4. the journal is append-only in the database itself ----

def test_journal_rows_cannot_be_deleted_or_rewritten_only_forgotten(world: World) -> None:
    jid = world.journal.append("said", "my card ends 4242", actor="person")
    db = world.store.db
    for sql in ("DELETE FROM journal",
                "UPDATE journal SET text = 'something else'",
                "UPDATE journal SET kind = 'did'",
                "UPDATE journal SET at = '2020-01-01T00:00:00+00:00'",
                "UPDATE journal SET text = '', data = '{}', deleted_at = 'x', actor = 'alpha'"):
        with pytest.raises(sqlite3.IntegrityError, match="append-only"):
            db.execute(sql)
    world.journal.forget(jid)
    row = world.store.one("SELECT * FROM journal WHERE id = ?", (jid,))
    assert row is not None and row["text"] == "" and row["deleted_at"]
    assert world.journal.search("card") == []
    with pytest.raises(sqlite3.IntegrityError, match="append-only"):  # forgotten once, for good
        db.execute("UPDATE journal SET deleted_at = NULL WHERE id = ?", (jid,))
