"""Governance: what Alpha may cause, enforced by mechanism (docs/design/governance.md)."""

from __future__ import annotations

import json
import shlex
import sqlite3
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest

from alpha.connectors.base import Connections
from alpha.mcp.tools import Tools
from alpha.runtime import claude_account, claude_cli
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.runtime.turn import ask
from alpha.world import taint
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


# ---- 3. the taint rule: after private reads, nothing new leaves ----

def said(world: World, text: str = "hello", thread: str | None = None) -> str:
    return world.journal.append("said", text, actor="person", thread=thread)


def test_private_reads_switch_web_search_and_fetch_off_for_the_run(world: World) -> None:
    turn = said(world)
    t = Tools(world, turn=turn)
    search = {"tool_name": "WebSearch", "tool_input": {"query": "best calorie trackers"}}
    assert taint.gate(world.store, turn, None, search) is None
    t.collections_list()  # shapes and counts don't taint
    assert taint.gate(world.store, turn, None, search) is None
    t.facts_get()
    refused = taint.gate(world.store, turn, None, search)
    assert refused and "read what Alpha knows about people" in refused
    fetch = {"tool_name": "WebFetch", "tool_input": {"url": "https://example.com/?q=secret"}}
    assert taint.gate(world.store, turn, None, fetch)
    assert taint.gate(world.store, "j_other", None, search) is None  # another run is clean


def test_every_listed_read_taints(world: World) -> None:
    for name in taint.READS:
        assert hasattr(Tools, name), name
    turn = said(world)
    Tools(world, turn=turn).documents_list()
    assert taint.reason(world.store, turn, None) == "read the person's documents"


def test_a_thread_stays_tainted_because_its_session_resumes(world: World) -> None:
    taint.mark(world.store, "j_a", "t_1", "read the calendar")
    assert taint.reason(world.store, "j_b", "t_1") == "read the calendar"
    assert taint.reason(world.store, "j_b", None) is None


def test_the_gate_refuses_local_addresses_even_when_clean(world: World) -> None:
    fetch = {"tool_name": "WebFetch", "tool_input": {"url": "http://127.0.0.1:53900/api/home"}}
    assert "local network" in str(taint.gate(world.store, "j_1", None, fetch))


def test_the_gate_hook_exits_2_to_refuse_and_fails_closed(world: World, tmp_path: Path) -> None:
    turn = said(world)
    req = TurnRequest(sentence="hi", system="", world_path=world.path, turn_id=turn)
    command = claude_cli.gate_settings(req)["hooks"]["PreToolUse"][0]["hooks"][0]["command"]
    call = json.dumps({"tool_name": "WebSearch", "tool_input": {"query": "x"}})

    def run(cmd: str) -> subprocess.CompletedProcess[str]:
        return subprocess.run(cmd, shell=True, input=call, capture_output=True, text=True,
                              timeout=60)

    assert run(command).returncode == 0
    taint.mark(world.store, turn, None, "read the calendar")
    refused = run(command)
    assert refused.returncode == 2 and "already read the calendar" in refused.stderr
    broken = command.replace(shlex.quote(sys.executable), "/no/such/python", 1)
    assert run(broken).returncode == 2


def test_a_tainted_run_opens_only_sites_it_knows(world: World,
                                                 monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("alpha.connectors.browser.run_job", driver([]))
    Connections(world.store).upsert("browser", "linkedin.com", status="connected")
    t = Tools(world, turn=said(world, "compare my notes with jobs.example.org"))
    assert "error" not in t.page_read("https://news.example.net/a")  # clean: anything opens
    t.notes_list()
    refused = t.page_read("https://evil.example.com/?d=secret")
    assert "won't open example.com" in refused["error"]
    assert "error" not in t.page_read("https://news.example.net/b")  # read before
    assert "error" not in t.page_read("https://jobs.example.org/")  # named in the request
    assert "error" not in t.page_read(URL)  # signed in
    assert "error" in t.browser_signin("evil.example.com")


def test_a_signed_in_page_taints_a_public_one_does_not(world: World,
                                                       monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("alpha.connectors.browser.run_job", driver([]))
    turn = said(world)
    t = Tools(world, turn=turn)
    t.page_read("https://example.com/")
    assert taint.reason(world.store, turn, None) is None
    Connections(world.store).upsert("browser", "linkedin.com", status="connected")
    t.page_read(URL)
    assert taint.reason(world.store, turn, None) == taint.SIGNED_IN_PAGE


def test_a_pre_pack_with_records_taints_the_turn_and_its_reply_the_next(world: World) -> None:
    world.collections.create("food", "Food", [{"name": "item", "kind": "text"}])
    world.collections.add("food", {"item": "boiled eggs"}, {"by": "person"})
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        return RunResult(reply="Done.", ok=True)

    clean = ask(world, "what is a good protein target", runner=runner)
    assert taint.reason(world.store, clean.said, None) is None
    eggs = ask(world, "how many eggs did I log", runner=runner)
    assert taint.reason(world.store, eggs.said, None) == "read the person's records"
    assert world.journal.read(eggs.replied)["data"]["tainted"] == "read the person's records"
    after = ask(world, "what is a good protein target", runner=runner)
    assert "drew on private material" in str(taint.reason(world.store, after.said, None))


# ---- 3b. the claude process: built-in tools, settings and environment ----

def test_claude_gets_the_gate_and_only_the_environment_it_needs(
        world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ALPHA_TOKEN", "secret-token")
    monkeypatch.setenv("SOME_API_KEY", "secret-key")
    monkeypatch.setenv("ALPHA_HOME", "/tmp/alpha-home")
    monkeypatch.setenv("CLAUDE_CONFIG_DIR", "/tmp/private-config")
    env = claude_account.child_env()
    assert {"PATH", "HOME", "USER"} <= env.keys()
    assert not {"ALPHA_TOKEN", "SOME_API_KEY", "ALPHA_HOME", "CLAUDE_CONFIG_DIR"} & env.keys()
    req = TurnRequest(sentence="hi", system="", world_path=world.path, turn_id="j_1")
    assert claude_cli.mcp_config(req)["mcpServers"]["alpha"]["env"]["ALPHA_HOME"] == (
        "/tmp/alpha-home")
    args = claude_cli.argv(req, Path("/tmp/mcp.json"))
    settings = json.loads(args[args.index("--settings") + 1])
    assert settings["hooks"]["PreToolUse"][0]["matcher"] == "WebSearch|WebFetch"
    assert args[args.index("--setting-sources") + 1] == ""
