"""The stream (section C, C3): GET /api/conversation as the one place to talk. The person's
sentences and the desk's replies in order, the conversations from before C as its history, the
work beside the desk where it started and its outcome in the desk's words, a module's page
narrowed to it, one piece of work narrowed to it with the sentence that started it, the Now
strip, every card wherever it arose; an agent's own thread stays out."""

from __future__ import annotations

from typing import Any

from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.runtime import desk
from alpha.world.world import World


def seeded(world: World) -> dict[str, Any]:
    home = world.modules.home_thread()["id"]
    deals = world.modules.create("Deals")
    # a conversation from before C: an item of the person's own, its turns now history
    old = world.modules.open_thread("Log the shake", "work")
    world.journal.append("said", "log a shake", actor="person", thread=old["id"])
    world.journal.append("replied", "Logged the shake.", actor="alpha", thread=old["id"])
    # an agent's own thread: its runs stay out of the stream (C5)
    agent = world.agents.create("Look at my deals", name="Deal Watch")
    athread = world.modules.open_thread("Deal Watch", "work")
    world.agents.set_thread(agent["id"], athread["id"])
    world.journal.append("replied", "Two new listings.", actor=agent["id"], thread=athread["id"])
    # the desk: a sentence, work started beside it, its steps, its outcome, the desk's words
    said = world.journal.append("said", "look into the deals in the background",
                                actor="person", thread=home, module=deals["id"])
    work = world.modules.open_thread("Deal research", "work", deals["id"])
    world.modules.set_session(work["id"], "task_1", tools=desk.WORK)
    world.journal.append("did", "Started work beside the conversation: Deal research",
                         actor="alpha", thread=home, data={"work": work["id"], "turn": said})
    world.journal.append("did", "Reading the deals", actor="alpha", thread=work["id"],
                         data={"work": work["id"], "step": True})
    world.journal.append("replied", "Two are new.", actor="alpha", thread=work["id"],
                         data={"work": work["id"], "outcome": True})
    world.journal.append("did", "Work finished: Deal research", actor="alpha", thread=home,
                         data={"work": [work["id"]]})
    world.journal.append("replied", "The deal research is back: two are new.", actor="alpha",
                         thread=home, data={"work": [work["id"]]})
    world.modules.update_thread(work["id"], state="done", last_line="Two are new.")
    running = world.modules.open_thread("Broker emails", "work")
    world.modules.set_session(running["id"], "task_2", tools=desk.WORK)
    world.modules.update_thread(running["id"], state="working", last_line="Searching")
    world.journal.append("did", "Started work beside the conversation: Broker emails",
                         actor="alpha", thread=home, data={"work": running["id"]})
    world.journal.append("said", "what is two and two", actor="person", thread=home)
    world.journal.append("replied", "Four.", actor="alpha", thread=home)
    return {"home": home, "deals": deals["id"], "work": work["id"], "running": running["id"],
            "said": said}


def test_the_stream_is_one_place_with_its_history_its_work_and_its_cards(world: World) -> None:
    s = seeded(world)
    c = TestClient(create_app(world, live=False))
    out = c.get("/api/conversation").json()
    texts = [e["text"] for e in out["turns"]]
    assert texts == ["log a shake", "Logged the shake.", "look into the deals in the background",
                     "Started work beside the conversation: Deal research",
                     "The deal research is back: two are new.",
                     "Started work beside the conversation: Broker emails",
                     "what is two and two", "Four."]
    # the work's steps and its own outcome are its thread's (the fold), not the stream's
    assert "Reading the deals" not in texts and "Two are new." not in texts
    assert "Two new listings." not in texts  # an agent's run stays out (C5)
    assert set(out["work"]) == {s["work"], s["running"]}
    assert [w["title"] for w in out["now"]] == ["Broker emails"]
    steps = c.get(f"/api/threads/{s['work']}").json()["journal"]
    assert [e["text"] for e in steps] == ["Reading the deals", "Two are new."]


def test_the_stream_narrowed_to_a_module_or_to_one_piece_of_work(world: World) -> None:
    s = seeded(world)
    c = TestClient(create_app(world, live=False))
    deals = c.get("/api/conversation", params={"module": s["deals"]}).json()
    assert [e["text"] for e in deals["turns"]] == [
        "look into the deals in the background",
        "Started work beside the conversation: Deal research",
        "The deal research is back: two are new."]
    one = c.get("/api/conversation", params={"work": s["work"]}).json()
    # the sentence that started it comes with it
    assert [e["text"] for e in one["turns"]] == [
        "look into the deals in the background",
        "Started work beside the conversation: Deal research",
        "The deal research is back: two are new."]


def test_an_agents_own_thread_is_its_own(world: World) -> None:
    seeded(world)
    agent = next(a for a in world.agents.all() if a["name"] == "Deal Watch")
    c = TestClient(create_app(world, live=False))
    out = c.get("/api/conversation", params={"conversation": agent["thread"]}).json()
    assert [e["text"] for e in out["turns"]] == ["Two new listings."]


def test_an_at_name_and_its_answer_show_in_the_stream_with_the_agents_name(world: World) -> None:
    """Q107, question 3: the person asked the agent directly, so its answer is in the stream."""
    from alpha.runtime import conversations

    home = world.modules.home_thread()["id"]
    agent = world.agents.create("Look at my deals", name="Deal Analyst")
    thread = world.modules.open_thread("Deal Analyst", "work")
    world.agents.set_thread(agent["id"], thread["id"])
    sentence = "@Deal Analyst compare the two deals"
    conversations.mentioned(world, sentence, thread["id"])
    said = world.journal.append("said", sentence, actor="person", thread=thread["id"])
    world.journal.append("replied", "Midwest HVAC is cheaper for its revenue.",
                         actor=agent["id"], thread=thread["id"], data={"turn": said})
    c = TestClient(create_app(world, live=False))
    turns = c.get("/api/conversation").json()["turns"]
    assert [(e["text"], e["data"].get("agent_name")) for e in turns] == [
        (sentence, None), ("Midwest HVAC is cheaper for its revenue.", "Deal Analyst")]
    assert all(e["thread"] != home for e in turns)  # they live in the agent's own thread


def test_a_world_from_before_c_opens_with_its_history_and_its_one_pending_card(
        world: World) -> None:
    """C7's proof. A world made before section C: the person's items, one finished and one
    waiting on a question. It opens with their sentences and replies as the stream's history
    and the one pending card at the bottom; no item is listed anywhere, and the item routes
    are gone."""
    from alpha.runtime import conversations

    done = world.modules.open_thread("Log the shake", "work")
    world.journal.append("said", "log a shake", actor="person", thread=done["id"])
    world.journal.append("replied", "Logged the shake.", actor="alpha", thread=done["id"])
    world.modules.update_thread(done["id"], state="done", last_line="Logged the shake.")
    waiting = world.modules.open_thread("Plan the car wash", "work")
    world.journal.append("said", "plan the car wash visit", actor="person",
                         thread=waiting["id"])
    ask = world.journal.append("asked", "Which day suits you?",
                               data={"options": ["Friday", "Saturday"]}, thread=waiting["id"])
    world.modules.update_thread(waiting["id"], state="needs_you", last_line="Which day?")
    conversations.reset_working(world)  # the core starting on it
    assert world.modules.thread(waiting["id"])["state"] == "needs_you"
    c = TestClient(create_app(world, live=False))
    out = c.get("/api/conversation").json()
    assert [e["text"] for e in out["turns"] if e["kind"] in ("said", "replied")] == [
        "log a shake", "Logged the shake.", "plan the car wash visit"]
    assert [a["id"] for a in out["asks"]] == [ask]
    assert "threads" not in out and "conversations" not in out
    assert "threads" not in c.get("/api/home").json()
    assert set(c.get("/api/companion").json()) == {"needs_you", "troubles", "look"}
    for method, path in (("GET", "/api/conversations"), ("POST", "/api/conversations"),
                         ("POST", f"/api/conversations/{done['id']}/close"),
                         ("POST", f"/api/conversations/{done['id']}/focus"),
                         ("POST", f"/api/conversations/{done['id']}/rename"),
                         ("DELETE", f"/api/conversations/{done['id']}")):
        assert c.request(method, path, json={}).status_code in (404, 405), path
