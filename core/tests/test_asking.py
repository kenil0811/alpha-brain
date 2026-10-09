"""Questions become cards by mechanism (Q35)."""

from __future__ import annotations

from typing import Any

from alpha.runtime import asking, claude_cli, turn
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world.world import World


def test_the_trailing_question_and_the_options_the_reply_listed() -> None:
    assert asking.trailing_question("Done.\n\nDaily or weekly?") == "Daily or weekly?"
    assert asking.trailing_question("I can keep it current. Daily or weekly?") == "Daily or weekly?"
    assert asking.trailing_question("Two things. Which folder? And which day?") == (
        "Which folder? And which day?")
    assert asking.trailing_question(
        "Quick check — do you mean a mayo-based chicken salad, or a salad bowl with grilled"
        " chicken? The calories differ a lot between the two.") == (
        "Quick check — do you mean a mayo-based chicken salad, or a salad bowl with grilled"
        " chicken?")
    assert asking.trailing_question("Is it done? " + "Here is a long remark. " * 12) is None
    assert asking.trailing_question("Logged two eggs (140 kcal).") is None
    assert asking.trailing_question("**Plan**\n\n1. Which folder?\n2. Daily or weekly?") is None
    reply = ("Got it.\n\n- Email attachments (Gmail)\n- Shared cloud folder\n- Something else\n\n"
             "Which way should they hand files over?")
    assert asking.options_in(reply) == ["Email attachments (Gmail)", "Shared cloud folder",
                                        "Something else"]
    assert asking.options_in("1. Which folder?\n2. Which day?\n\nTell me?") == []
    offered = ("This is already set up.\n\nIf you want something more specific, tell me which:\n\n"
               "- Only certain listings (e.g. just CPA practices, or under a price threshold)"
               " rather than everything\n- A different way to hear about it — right now it's a"
               " daily log entry; I could batch weekly")
    assert asking.trailing_question(offered) == (
        "If you want something more specific, tell me which?")
    assert asking.offered_choice(offered) == (
        "If you want something more specific, tell me which?",
        ["Only certain listings", "A different way to hear about it"])
    assert asking.offered_choice("Here is what I found:\n\n- a\n- b") is None
    assert asking.is_choice("Daily or weekly?") and asking.is_choice("Which folder?")
    assert not asking.is_choice("What is the client's name?")


def test_a_question_in_prose_becomes_a_card_with_options_from_the_seam(world: World) -> None:
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        if req.kind == "judge":
            return RunResult(reply='{"options": ["Daily", "Weekly"]}', ok=True)
        return RunResult(reply="I can keep it current. Daily or weekly?", ok=True,
                         duration_ms=3000, first_text_ms=900)

    out = turn.ask(world, "keep my connections current", runner=runner)
    asks = [a for a in world.journal.open_asks() if a["data"].get("turn") == out.said]
    assert len(asks) == 1 and asks[0]["text"] == "Daily or weekly?"
    assert asks[0]["data"]["options"] == ["Daily", "Weekly"] and asks[0]["data"]["derived"]
    assert [r.kind for r in seen] == ["turn", "judge"]
    assert seen[1].turn_id == f"options:{out.said}" and "Daily or weekly?" in seen[1].sentence
    assert turn.timings(world)[-1]["first_s"] == 0.9
    # The person's next words answer it, as with any ask.
    turn.ask(world, "weekly", runner=lambda r: RunResult(reply="Weekly it is.", ok=True))
    assert not [a for a in world.journal.open_asks() if a["data"].get("turn") == out.said]


def test_no_card_when_the_model_made_one_or_proposed_a_plan_or_the_question_is_several(
        world: World) -> None:
    calls: list[str] = []

    def runner(req: TurnRequest) -> RunResult:
        calls.append(req.kind)
        return RunResult(reply="What is the client's name?", ok=True)

    # The model asked properly: its card stands alone.
    def asking_runner(req: TurnRequest) -> RunResult:
        calls.append(req.kind)
        world.journal.append("asked", "Which folder?", data={"options": [], "turn": req.turn_id})
        return RunResult(reply="Which folder?", ok=True)

    out = turn.ask(world, "track my invoices", runner=asking_runner)
    assert len([a for a in world.journal.open_asks() if a["data"].get("turn") == out.said]) == 1
    # A plan proposed in the turn: the plan card is the question.
    def planning(req: TurnRequest) -> RunResult:
        world.plans.propose("Invoices", "A table.", turn=req.turn_id)
        return RunResult(reply="Here is the plan. Shall I build it?", ok=True)

    out = turn.ask(world, "track my invoices", runner=planning)
    assert not [a for a in world.journal.open_asks() if a["data"].get("turn") == out.said]
    # An open question gets a card with no options and no seam call; a "which" with no list
    # asks the seam, which answers [] when the question is open.
    out = turn.ask(world, "track my invoices", runner=runner)
    asks = [a for a in world.journal.open_asks() if a["data"].get("turn") == out.said]
    assert asks and asks[0]["data"]["options"] == [] and calls[-1] == "turn"
    out = turn.ask(world, "x", runner=lambda r: RunResult(
        reply='{"options": []}' if r.kind == "judge" else "Which folder holds the files?",
        ok=True))
    asks = [a for a in world.journal.open_asks() if a["data"].get("turn") == out.said]
    assert asks and asks[0]["data"]["options"] == []
    # Several questions at once stay prose.
    out = turn.ask(world, "x", runner=lambda r: RunResult(
        reply="Two things:\n\n1. Which folder?\n2. Daily or weekly?", ok=True))
    assert not [a for a in world.journal.open_asks() if a["data"].get("turn") == out.said]


def test_the_reply_streams_as_it_is_written() -> None:
    keys = ["t_stream"]
    claude_cli.LIVE.progress.pop(keys[0], None)
    delta: Any = {"type": "stream_event", "event": {"type": "content_block_delta",
                                                     "delta": {"type": "text_delta",
                                                               "text": "Logged "}}}
    claude_cli._watch(keys, {"type": "stream_event",
                             "event": {"type": "content_block_start",
                                       "content_block": {"type": "text"}}})
    claude_cli._watch(keys, delta)
    claude_cli._watch(keys, {**delta, "event": {**delta["event"],
                                                "delta": {"type": "text_delta",
                                                          "text": "two eggs."}}})
    live = claude_cli.LIVE.progress_for(keys[0])
    assert live and live["partial"] == "Logged two eggs." and live["first_text_at"]
    # A step after some text: that text was a thought, the reply starts over.
    claude_cli._watch(keys, {"type": "assistant", "message": {"content": [
        {"type": "tool_use", "name": "mcp__alpha__records_add", "input": {"collection": "food"}}]}})
    live = claude_cli.LIVE.progress_for(keys[0])
    assert live and live["partial"] == "" and live["doing"] == "Adding a row: food"
    claude_cli.LIVE.progress.pop(keys[0], None)


def test_the_window_sees_which_card_the_core_made_and_from_which_turn(world: World) -> None:
    from fastapi.testclient import TestClient

    from alpha.api.server import create_app

    out = turn.ask(world, "log my lunch", runner=lambda r: RunResult(
        reply="What did you have for lunch?", ok=True))
    c = TestClient(create_app(world, live=False))
    asks = c.get("/api/conversation").json()["asks"]
    assert asks[-1]["text"] == "What did you have for lunch?"
    assert asks[-1]["turn"] == out.said and asks[-1]["derived"] is True
    home = c.get("/api/home").json()
    cards = [i for lst in home.values() if isinstance(lst, list)
             for i in lst if isinstance(i, dict) and i.get("kind") == "ask"]
    assert cards and cards[-1]["derived"] is True and cards[-1]["turn"] == out.said
