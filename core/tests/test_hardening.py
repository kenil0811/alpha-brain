"""The 3 Oct hardening: what the checkpoint's reviews found at the model boundary and in
the store, each made a mechanism."""

from __future__ import annotations

import json
import threading
import time
from pathlib import Path
from typing import Any

from conftest import building

from alpha.runtime import automation, claude_cli
from alpha.runtime.claude_cli import TurnRequest
from alpha.world.world import World


def test_a_run_that_says_nothing_for_too_long_is_ended(world: World, tmp_path: Path,
                                                        monkeypatch: Any) -> None:
    """Silence, not duration, ends a run: a CLI that hangs can hold a thread or the scheduler
    for ever; a run that keeps working is never cut."""
    monkeypatch.setattr(claude_cli, "SILENCE_S", 0.5)  # beats come every 0.1 s
    hung = tmp_path / "claude"
    hung.write_text("#!/bin/sh\nsleep 30\n")
    hung.chmod(0o755)
    req = TurnRequest(sentence="s", system="x", world_path=world.path, turn_id="j_hung",
                      kind="judge")
    began = time.time()
    out = claude_cli.run(req, binary=str(hung))
    assert not out.ok and out.error == claude_cli.STALLED and time.time() - began < 20
    assert not claude_cli.LIVE.running("j_hung")
    # A run that keeps talking is not silent: it finishes on its own terms.
    talking = tmp_path / "claude2"
    result = json.dumps({"type": "result", "subtype": "success", "is_error": False,
                         "result": "Done.", "session_id": "s"})
    beat = "echo '{\"type\":\"system\"}'; sleep 0.1"
    talking.write_text(f"#!/bin/sh\n{beat}; {beat}; {beat}\necho '{result}'\n")
    talking.chmod(0o755)
    out = claude_cli.run(req, binary=str(talking))
    assert out.ok and out.reply == "Done."


def test_a_check_or_a_noticing_run_never_touches_the_turns_own_run(world: World,
                                                                    tmp_path: Path) -> None:
    """Each kind of run is known by a key of its own: a judge run for a turn must not show up
    as, or stop, the turn's progress (keys collided before the 3 Oct review)."""
    slow = tmp_path / "claude"
    slow.write_text("#!/bin/sh\nsleep 3\n")
    slow.chmod(0o755)
    turn = TurnRequest(sentence="s", system="x", world_path=world.path, turn_id="j_t",
                       thread_id="t_t")
    judge = TurnRequest(sentence="s", system="x", world_path=world.path, turn_id="j_t",
                        kind="judge")
    threads = [threading.Thread(target=claude_cli.run, args=(turn,), kwargs={"binary": str(slow)}),
               threading.Thread(target=claude_cli.run, args=(judge,), kwargs={"binary": str(slow)})]
    for th in threads:
        th.start()
    time.sleep(0.5)
    assert claude_cli.LIVE.running("j_t") and claude_cli.LIVE.running("t_t")
    with claude_cli.LIVE.lock:
        keys = sorted(claude_cli.LIVE.runs)
    # (other tests' runs may still be registered; only these keys are ours)
    assert any(k.startswith("judge:j_t:") for k in keys) and {"j_t", "t_t"} <= set(keys)
    assert claude_cli.LIVE.stop("j_t")  # stops the turn, not the judge run
    time.sleep(0.5)
    assert not claude_cli.LIVE.running("j_t")
    assert any(k.startswith("judge:j_t:") for k in claude_cli.LIVE.runs)
    for th in threads:
        th.join(timeout=10)


def test_the_companions_sentence_is_routed_in_the_worker_not_the_request(world: World) -> None:
    from alpha.api.server import AskBody, Turns
    from alpha.runtime import conversations

    # Two live conversations and a judge that is unsure: the request returns at once as
    # "routing", and the question with choices appears on the turn afterwards.
    a = conversations.open_conversation(world, "deals this week", None)
    b = conversations.open_conversation(world, "protein today", None)
    world.journal.append("said", "deals this week", actor="person", thread=a["id"])
    world.journal.append("said", "protein today", actor="person", thread=b["id"])
    runner = conversations.fake_runner("something new", confidence=0.2)
    began = time.monotonic()
    turns_ = Turns(world, runner, checks=False)
    started = turns_.start(AskBody(text="and the second one?"))
    assert started["state"] == "routing" and time.monotonic() - began < 0.5
    for _ in range(100):
        current = turns_.get(started["id"])
        if current["state"] != "routing":
            break
        time.sleep(0.02)
    assert current["state"] == "asked" and len(current["options"]) == 3
    assert turns_.running() == []


def test_two_runs_saving_one_list_at_once_never_double_a_row(world: World) -> None:
    building(world).collection_create("listings", "Listings",
                                      [{"name": "url", "kind": "url"},
                                       {"name": "title", "kind": "text"}])
    rows = [{"url": f"https://x.com/{i}", "title": f"Listing {i}"} for i in range(40)]
    go = threading.Barrier(3)
    outcomes: list[dict[str, Any]] = []

    def save() -> None:
        go.wait()
        outcomes.append(world.collections.upsert("listings", "url", rows, {"by": "alpha"}))

    threads = [threading.Thread(target=save) for _ in range(3)]
    for th in threads:
        th.start()
    for th in threads:
        th.join()
    kept = world.collections.query("listings", limit=None)
    assert len(kept) == 40 and len({r["url"] for r in kept}) == 40
    assert sum(o["added"] for o in outcomes) == 40


def test_the_journal_has_its_hot_indexes(world: World) -> None:
    names = {r["name"] for r in world.store.all("SELECT name FROM sqlite_master WHERE type ="
                                                " 'index' AND tbl_name = 'journal'")}
    assert {"journal_kind", "journal_turn", "journal_ask"} <= names
    plan = world.store.all("EXPLAIN QUERY PLAN SELECT * FROM journal WHERE kind = 'replied'"
                           " AND json_extract(data, '$.turn') = 'j_1'")
    assert any("journal_turn" in str(dict(r)) for r in plan)


def test_a_crashed_build_waits_longer_each_time() -> None:
    assert [automation.backoff_s(n) for n in (1, 2, 3, 4, 5, 6)] == [30, 60, 120, 240, 480, 600]


def test_a_stopped_plan_is_recent_for_two_days(world: World) -> None:
    plan = world.plans.propose("Old", "x")
    world.plans.approve(plan["id"], "yes")
    thread = world.modules.open_thread("Old", "build", None)
    world.plans.start(plan["id"], thread["id"])
    world.plans.stop(plan["id"], "stopped")
    assert [p["id"] for p in world.plans.recent()] == [plan["id"]]
    with world.store.tx() as db:  # three days old: no longer recent
        db.execute("UPDATE plans SET updated_at = '2026-09-30T08:00:00+00:00' WHERE id = ?",
                   (plan["id"],))
    assert world.plans.recent() == []
