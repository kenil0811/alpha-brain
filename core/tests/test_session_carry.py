"""The session fingerprint (A12 of engine-reach-proposal.md, Q98; 19 Oct 2026): over the hands'
names only, so a docstring edited or an optional parameter added keeps every open session; when
the names do change, the fresh session starts with what was going on (the conversation's
checkpoint) in front of the sentence."""

from __future__ import annotations

from typing import Any

from alpha.mcp import inprocess
from alpha.mcp.tools import Tools
from alpha.mcp.tools.base import hand
from alpha.runtime import engine, turn
from alpha.runtime.agents import watson
from alpha.runtime.running import RunResult, TurnRequest
from alpha.world.world import World


class Edited(Tools):
    @hand
    def world_query(self, sql: str, limit: int = 1000, offset: int = 0,
                    explain: bool = False) -> dict[str, Any]:
        """Another docstring, and parameters added."""
        return {}


class Grown(Tools):
    @hand
    def world_ponder(self, what: str) -> dict[str, Any]:
        """A hand that did not exist."""
        return {}


def test_the_fingerprint_is_the_hands_names_only() -> None:
    same = inprocess.fingerprint_of(Tools)
    assert inprocess.fingerprint_of(Edited) == same  # docstrings and parameters don't count
    assert inprocess.fingerprint_of(Grown) != same  # a hand added does


def test_a_fresh_session_starts_with_what_was_going_on(world: World, monkeypatch: Any) -> None:
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        if req.kind == "judge":  # Watson's checkpoint
            return RunResult(ok=True, reply='{"decisions": [{"what": "Track deals in a table'
                                            ' named deals", "why": null, "quote": "yes"}],'
                                            ' "open": "Which broker sites to read first"}')
        return RunResult(ok=True, reply="ok", session_id=f"s{len(seen)}")

    monkeypatch.setattr(engine, "tools_fingerprint", "names-v1")
    tid = world.modules.open_thread("Deals", "work", None)["id"]
    turn.ask(world, "keep my deals in a table", thread=tid, runner=runner, conversation=True)
    turn.ask(world, "and the brokers?", thread=tid, runner=runner, conversation=True)
    assert seen[-1].resume == "s1"  # the same names: the session resumed
    monkeypatch.setattr(engine, "tools_fingerprint", "names-v2")
    turn.ask(world, "what next?", thread=tid, runner=runner, conversation=True)
    fresh = [r for r in seen if r.kind == "turn"][-1]
    assert fresh.resume is None
    assert fresh.sentence.startswith("What was going on here before this fresh session:\nAs of ")
    assert "Decided: Track deals in a table named deals" in fresh.sentence
    assert "Open: Which broker sites to read first" in fresh.sentence
    assert fresh.sentence.endswith("\n\nwhat next?")
    said = [e for e in world.journal.recent(10, thread=tid) if e["kind"] == "said"]
    assert said[-1]["text"] == "what next?"  # the person's words stay theirs in the journal
    # the checkpoint is kept and reused: a second change of names makes no second call
    judged = sum(1 for r in seen if r.kind == "judge")
    monkeypatch.setattr(engine, "tools_fingerprint", "names-v3")
    turn.ask(world, "and then?", thread=tid, runner=runner, conversation=True)
    assert sum(1 for r in seen if r.kind == "judge") == judged
    assert watson.CHECKPOINT == "Checkpoint"


def test_a_reply_says_what_the_turn_read_in_tokens(world: World) -> None:
    """What A8 and B8 are measured by: a turn's input, read fresh, from the cache and written to
    it, kept apart, and its output; `alpha turns` reads them back with the first words."""
    def runner(req: TurnRequest) -> RunResult:
        return RunResult(ok=True, reply="ok", duration_ms=900, first_text_ms=400, raw={"usage": {
            "input_tokens": 12, "cache_read_input_tokens": 30000,
            "cache_creation_input_tokens": 1500, "output_tokens": 240}})

    out = turn.ask(world, "hello", runner=runner)
    replied = world.journal.read(out.replied)
    assert {k: replied["data"][k] for k in turn.TOKENS} == {
        "tokens_input": 12, "tokens_cache_read": 30000, "tokens_cache_made": 1500,
        "tokens_out": 240}
    row = turn.timings(world)[-1]
    assert (row["first_s"], row["tokens_cache_read"], row["tokens_cache_made"]) == (
        0.4, 30000, 1500)
