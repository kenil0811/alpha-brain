"""Questions become cards by mechanism (Q35)."""

from __future__ import annotations

from alpha.runtime import asking, turn
from alpha.runtime.running import RunResult, TurnRequest
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
    # a list with a quoted question mark in one item is a list, not a question (18 Oct)
    assert asking.trailing_question('Done.\n\n- Source label: rows carry "Who is hiring?"\n'
                                    "- Region: remote only") is None
    assert asking.trailing_question("Which one?\n- Daily\n- Weekly") == "Which one?"
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
    assert asking.or_options("Distance in miles or km?") == ["Miles", "Km"]
    assert asking.or_options("Daily or weekly?") == ["Daily", "Weekly"]
    assert asking.or_options("Proceed keyless on the Census API, or grab a key first?") == []
    assert asking.or_options("What is the client's name?") == []
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
    assert [r.kind for r in seen] == ["turn"]  # "A or B?" needs no model
    out2 = turn.ask(world, "x", runner=lambda r: RunResult(
        reply='{"options": ["Email attachments", "A shared folder"]}' if r.kind == "judge"
        else "Which way should they hand files over, by email or through a shared folder?",
        ok=True))
    asks = [a for a in world.journal.open_asks() if a["data"].get("turn") == out2.said]
    assert asks and asks[0]["data"]["options"] == ["Email attachments", "A shared folder"]
    assert turn.timings(world)[-1]["first_s"] == 0.9
    # The person's next words answer it, as with any ask.
    turn.ask(world, "weekly", runner=lambda r: RunResult(reply="Weekly it is.", ok=True))
    assert not [a for a in world.journal.open_asks() if a["data"].get("turn") == out.said]


def test_no_card_when_the_model_made_one_or_drafted_the_page_or_the_question_is_several(
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
    # A workflow page drafted in the turn: the page's card is the question.
    def drafting(req: TurnRequest) -> RunResult:
        world.workflows.draft("Invoices", {"purpose": "Keep invoices.", "steps": [
            {"id": "arrives", "title": "An invoice arrives", "what": "You add it.", "who": "you"},
            {"id": "keep", "title": "Keep it", "what": "In the table.", "who": "alpha"}],
            "keeps": [{"thing": "Invoice", "fields": ["number"]}]}, turn=req.turn_id)
        return RunResult(reply="Here is your workflow. Shall I build it?", ok=True)

    out = turn.ask(world, "track my invoices", runner=drafting)
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
