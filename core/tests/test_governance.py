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
    """A world file as an earlier version left it: no allow_posts, no journal guards."""
    db = sqlite3.connect(path)
    db.executescript("""
        CREATE TABLE journal (id TEXT PRIMARY KEY, at TEXT NOT NULL, kind TEXT NOT NULL,
            actor TEXT NOT NULL, text TEXT NOT NULL, data TEXT NOT NULL DEFAULT '{}',
            module TEXT, thread TEXT, entity_ids TEXT NOT NULL DEFAULT '[]', source TEXT,
            deleted_at TEXT);
        INSERT INTO journal (id, at, kind, actor, text) VALUES
            ('j_old', '2026-09-01T00:00:00+00:00', 'said', 'person', 'hello');
        CREATE TABLE readers (name TEXT PRIMARY KEY, site TEXT NOT NULL, url TEXT NOT NULL,
            script TEXT NOT NULL, to_end INTEGER NOT NULL DEFAULT 0, description TEXT NOT NULL,
            version INTEGER NOT NULL DEFAULT 1, health TEXT NOT NULL DEFAULT 'ok',
            last_problem TEXT, last_run_at TEXT, last_count INTEGER, last_ok_count INTEGER,
            created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
        INSERT INTO readers (name, site, url, script, description, created_at, updated_at)
            VALUES ('old', 'example.com', 'https://example.com/', 'return []', 'x', 'a', 'a');
    """)
    db.commit()
    db.close()


def test_an_existing_store_is_migrated(tmp_path: Path) -> None:
    old_store(tmp_path / "world.sqlite")
    world = World(tmp_path / "world.sqlite")
    try:
        assert world.readers.get("old")["allow_posts"] == []
    finally:
        world.close()

