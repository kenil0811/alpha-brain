"""A conversation renamed by the person, named by its first message only while unnamed, and
deleted from the lists with the journal keeping its turns (13 Oct, slice 2 G1, C9)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.mcp.tools import Tools
from alpha.runtime import conversations
from alpha.world.world import World

BODY = {"purpose": "Track the sites.", "steps": [{"title": "A site arrives", "what": "You type it.",
                                                  "who": "you", "when": "when a site arrives"}],
        "keeps": [{"thing": "Site", "fields": ["address"]}]}


def test_the_persons_title_is_kept_and_an_unnamed_one_takes_its_first_message(world: World
                                                                               ) -> None:
    c = TestClient(create_app(world, live=False))
    chat = conversations.open_item(world, "New conversation", None)
    conversations.name_from_first(world, chat["id"], "find founding engineer roles in London")
    assert world.modules.thread(chat["id"])["title"] == "Find founding engineer roles in London"
    out = c.post(f"/api/conversations/{chat['id']}/rename", json={"title": "Job hunt"}).json()
    assert out["title"] == "Job hunt"
    assert world.journal.recent(1)[0]["text"] == (
        "You renamed Find founding engineer roles in London to Job hunt.")
    # a named one keeps the person's title
    named = conversations.open_item(world, "New conversation", None)
    conversations.rename(world, named["id"], "New conversation")
    conversations.name_from_first(world, named["id"], "anything")
    assert world.modules.thread(named["id"])["title"] == "New conversation"
    assert c.post(f"/api/conversations/{chat['id']}/rename", json={"title": "  "}
                  ).json()["error"] == "A work item needs a title."


def test_deleting_a_conversation_closes_what_waits_in_it_and_keeps_its_history(world: World
                                                                                ) -> None:
    c = TestClient(create_app(world, live=False))
    chat = conversations.open_item(world, "Plan the car wash", None)
    cid = chat["id"]
    world.journal.append("said", "Plan the car wash", actor="person", thread=cid)
    Tools(world, thread=cid).ask_person("Which city first?")
    wf = world.workflows.draft("Car wash scorecard", BODY, conversation=cid)
    plan = c.get(f"/api/conversations/{cid}/removal").json()
    assert plan["what"] == "its 1 open question closed; what Alpha learned from it stays"
    c.delete(f"/api/conversations/{cid}")
    assert [t["id"] for t in world.modules.items()] == []
    assert [a for a in world.journal.open_asks() if a["thread"] == cid] == []
    assert world.workflows.get(wf["id"])["conversation"] is None  # the page stays
    said = world.journal.mark_removed(world.journal.search("car wash"))
    assert said and said[0]["removed"].startswith(
        'the conversation "Plan the car wash" was removed')


def test_a_conversation_alpha_is_working_in_is_not_deleted(world: World) -> None:
    chat = conversations.open_item(world, "Busy", None)
    world.modules.update_thread(chat["id"], state="working")
    out = TestClient(create_app(world, live=False)).delete(f"/api/conversations/{chat['id']}")
    assert out.json()["error"] == "Alpha is working in this conversation; stop the turn first."
