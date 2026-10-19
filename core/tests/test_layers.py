"""Section B (Q99): the system prompt is fixed, so a session's cache holds; the world rides on the
sentence in two layers: the start layer when the session is made and again after a compaction,
the turn layer with every sentence (the SDK's hooks put them on the message)."""

from __future__ import annotations

import asyncio
from typing import Any, cast

from alpha.runtime import engine, turn
from alpha.runtime.running import RunResult, TurnRequest
from alpha.world.world import World


def given(req: TurnRequest, event: str, data: dict[str, Any]) -> str:
    """What the engine's hook for `event` puts on the message for this request."""
    hook: Any = engine._hooks(req)[event][0].hooks[0]
    out: dict[str, Any] = asyncio.run(hook(data, None, cast(Any, None)))
    return str((out.get("hookSpecificOutput") or {}).get("additionalContext") or "")


def test_the_system_prompt_is_the_same_on_every_turn_and_the_start_layer_comes_once(
        world: World) -> None:
    mod = world.modules.create("Food")
    world.collections.create("food_log", "Food log", [{"name": "food", "kind": "text"}],
                             module=mod["id"])
    tid = world.modules.home_thread()["id"]
    seen: list[TurnRequest] = []
    gave: list[str] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        gave.append(given(req, "UserPromptSubmit", {"prompt": req.sentence}))
        return RunResult(reply="ok", ok=True, session_id="s1")

    for sentence in ("log two eggs", "and a banana", "how many eggs today?"):
        turn.ask(world, sentence, thread=tid, runner=runner, conversation=True)
        # the world moved between turns: a row added, so the start layer's count changed
        world.collections.add("food_log", {"food": sentence}, {"by": "alpha"})
    assert seen[0].system == seen[1].system == seen[2].system
    assert "food_log" not in seen[0].system and "Today's date is" not in seen[0].system
    # a new session is given the start layer and the turn layer; a resumed one the turn's only
    assert [r.resume for r in seen] == [None, "s1", "s1"]
    assert "WHAT ALPHA HOLDS" in gave[0] and "NOW" in gave[0]
    assert "WHAT ALPHA HOLDS" not in gave[1] + gave[2] and "NOW" in gave[1] and "NOW" in gave[2]
    assert seen[0].injected == ["start"] and seen[1].injected == ["turn"]
    # what the model saw is kept as it saw it
    kept = [world.journal.context(e["id"]) for e in world.journal.recent(20, thread=tid)
            if e["kind"] == "said"]
    assert "WHAT ALPHA HOLDS" in str(kept[0]) and "WHAT ALPHA HOLDS" not in str(kept[1])


def test_a_compaction_gives_the_start_layer_again_and_the_record_says_so(world: World) -> None:
    tid = world.modules.home_thread()["id"]

    def runner(req: TurnRequest) -> RunResult:
        assert given(req, "SessionStart", {"source": "resume"}) == ""
        again = given(req, "SessionStart", {"source": "compact"})
        assert again == req.start_layer and "WHO THE PERSON IS" in again
        return RunResult(reply="ok", ok=True, session_id="s1")

    out = turn.ask(world, "what did we make earlier?", thread=tid, runner=runner,
                   conversation=True)
    kept = world.journal.context(out.said)
    assert kept is not None and "GIVEN AGAIN AFTER A COMPACTION" in kept["context"]


def test_a_run_with_no_layers_is_given_nothing(world: World) -> None:
    req = TurnRequest(sentence="compare", system="", world_path=world.path, turn_id="j1",
                      kind="judge")
    assert given(req, "UserPromptSubmit", {"prompt": "compare"}) == ""
    assert given(req, "SessionStart", {"source": "compact"}) == ""


def test_a_session_made_before_the_layers_starts_fresh_once_carrying_its_checkpoint(
        world: World, monkeypatch: Any) -> None:
    """A session made while the world rode in the system prompt keeps that prompt (the SDK
    records a session's first one): it is not resumed once, a fresh one starts with the start
    layer and the conversation's checkpoint, and the next turn resumes the new one."""
    from alpha.runtime.agents import watson

    assert watson.carried in turn.CARRY_OVER  # Watson's checkpoint is what a fresh one carries
    seen: list[TurnRequest] = []
    gave: list[str] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        if req.kind == "judge":  # Watson's checkpoint
            return RunResult(ok=True, reply='{"decisions": [{"what": "Track deals in a table",'
                                            ' "why": null, "quote": "yes"}], "open": null}')
        gave.append(given(req, "UserPromptSubmit", {"prompt": req.sentence}))
        return RunResult(ok=True, reply="ok", session_id=f"s{len(seen)}")

    monkeypatch.setattr(engine, "tools_fingerprint", "names-v1")
    tid = world.modules.home_thread()["id"]
    world.journal.append("said", "keep my deals in a table", actor="person", thread=tid)
    world.journal.append("replied", "Made a Deals table.", thread=tid)
    # kept before step 1: the fingerprint was the names alone
    world.modules.set_session(tid, "s-old", tools="names-v1")
    turn.ask(world, "what next?", thread=tid, runner=runner, conversation=True)
    fresh = [r for r in seen if r.kind == "turn"][-1]
    assert fresh.resume is None and "WHAT ALPHA HOLDS" in gave[-1]
    assert fresh.sentence == "what next?"
    assert "WHAT WAS GOING ON HERE BEFORE THIS FRESH SESSION" in gave[-1]
    assert "Track deals in a table" in gave[-1]
    turn.ask(world, "and then?", thread=tid, runner=runner, conversation=True)
    again = [r for r in seen if r.kind == "turn"][-1]
    assert again.resume == fresh_id(seen, fresh) and "WHAT ALPHA HOLDS" not in gave[-1]


def fresh_id(seen: list[TurnRequest], req: TurnRequest) -> str:
    return f"s{seen.index(req) + 1}"


def test_an_open_session_is_sent_the_prompt_as_it_is_now(world: World) -> None:
    """The SDK keeps a resumed session's first system prompt unless told not to: a change to
    turn.md would never reach an open conversation."""
    req = TurnRequest(sentence="hi", system="the rules", world_path=world.path, turn_id="j1",
                      resume="s1", persist=True)
    prompt = cast(dict[str, Any], engine.options_for(req).system_prompt)
    assert prompt["append"] == "the rules" and prompt["snapshot"] is False


def test_codex_is_given_the_layers_in_its_instructions(world: World) -> None:
    """Codex has no hooks: the layers go into its AGENTS.md, the start layer only when the run
    is not resumed (Q32's route, section B)."""
    from alpha.runtime import codex_cli

    new = TurnRequest(sentence="hi", system="the rules", world_path=world.path, turn_id="j1",
                      start_layer="WHO THE PERSON IS\n- x", turn_layer="NOW\n- y")
    resumed = TurnRequest(sentence="hi", system="the rules", world_path=world.path, turn_id="j2",
                          resume="s1", start_layer="WHO THE PERSON IS\n- x", turn_layer="NOW\n- y")
    given = codex_cli.instructions(new)
    assert "WHO THE PERSON IS" in given and "NOW" in given
    assert "WHO THE PERSON IS" not in codex_cli.instructions(resumed)
    assert "NOW" in codex_cli.instructions(resumed)


def test_a_compaction_is_told_what_to_keep_and_the_checkpoint_is_written_afresh(
        world: World) -> None:
    """B6: the PreCompact hook's message is the summary's instructions (what to keep), and a
    turn whose session was compacted has Watson write the conversation's checkpoint again."""
    from alpha import config
    from alpha.runtime.agents import watson

    assert watson.refreshed in turn.AFTER_COMPACTION
    judged: list[str] = []

    def runner(req: TurnRequest) -> RunResult:
        if req.kind == "judge":  # Watson's checkpoint
            judged.append(req.sentence)
            return RunResult(ok=True, reply='{"decisions": [{"what": "Log food in Food log",'
                                            ' "why": null, "quote": "yes"}], "open": null}')
        hook: Any = engine._hooks(req)["PreCompact"][0].hooks[0]
        out = asyncio.run(hook({"trigger": "auto", "custom_instructions": None}, None,
                               cast(Any, None)))
        assert out == {"systemMessage": config.prompt("compact")}
        return RunResult(ok=True, reply="ok", session_id="s1")

    tid = world.modules.home_thread()["id"]
    turn.ask(world, "log two eggs", thread=tid, runner=runner, conversation=True)
    note = world.knowledge.find_note(f"conversation:{tid}", watson.CHECKPOINT)
    assert judged and note is not None and "Decided: Log food in Food log" in note["body"]
    # a judge's run is never told what to keep: it has no conversation
    judge = TurnRequest(sentence="x", system="", world_path=world.path, turn_id="j", kind="judge")
    hook: Any = engine._hooks(judge)["PreCompact"][0].hooks[0]
    assert asyncio.run(hook({"trigger": "auto"}, None, cast(Any, None))) == {}
