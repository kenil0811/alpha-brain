"""Noticing (design §3.7, point 3): what a turn says in passing is kept beside the verbatim."""

from __future__ import annotations

import json
from typing import Any

from alpha.runtime import noticing
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world.world import World


def exchange(world: World, said: str, replied: str, module: str | None = None) -> str:
    sid = world.journal.append("said", said, actor="person", module=module)
    world.journal.append("replied", replied, data={"turn": sid}, module=module)
    return sid


def answering(items: list[dict[str, Any]], seen: list[TurnRequest] | None = None) -> Any:
    def runner(req: TurnRequest) -> RunResult:
        if seen is not None:
            seen.append(req)
        return RunResult(ok=True, reply=json.dumps({"items": items}))

    return runner


def test_small_turns_are_not_worth_a_pass(world: World) -> None:
    assert not noticing.worth_noticing(world, exchange(world, "yes", "Done."))
    assert not noticing.worth_noticing(world, exchange(world, "log two eggs", "Logged."))
    sid = world.journal.append("said", "a sentence without a reply yet, four words plus",
                               actor="person")
    assert not noticing.worth_noticing(world, sid)
    assert noticing.worth_noticing(
        world, exchange(world, "had coffee with Vikas this morning", "Nice. Noted."))


def test_a_stated_fact_is_kept_and_an_inferred_one_waits(world: World) -> None:
    sid = exchange(world, "I moved to Lisbon last month, and I think I'll like the food scene",
                   "Welcome to Lisbon.")
    out = noticing.notice(world, sid, runner=answering([
        {"kind": "fact", "about": "person", "predicate": "lives_in", "value": "Lisbon",
         "stated": True, "quote": "I moved to Lisbon last month"},
        {"kind": "fact", "about": "person", "predicate": "likes", "value": "food scenes",
         "stated": False, "quote": "I think I'll like the food scene"},
    ]))
    assert out["kept"]
    facts = {f["predicate"]: f for f in world.knowledge.facts("person")}
    assert facts["lives_in"]["state"] == "accepted"
    assert facts["lives_in"]["why"] == "I moved to Lisbon last month"
    assert facts["lives_in"]["source"] == f"turn:{sid}"
    assert facts["likes"]["state"] == "suggested"
    trail = world.journal.recent(3, kinds=["noticed"])[-1]
    assert trail["text"].startswith("Noticed: you: lives_in = Lisbon (kept)")
    assert trail["data"]["turn"] == sid and len(trail["data"]["facts"]) == 2


def test_known_facts_are_not_kept_again(world: World) -> None:
    world.knowledge.record_fact("person", "lives_in", "Lisbon", source="stated",
                                state="accepted")
    sid = exchange(world, "life in Lisbon is good, the weather helps", "Glad to hear it.")
    out = noticing.notice(world, sid, runner=answering([
        {"kind": "fact", "about": "person", "predicate": "lives_in", "value": "Lisbon",
         "stated": True, "quote": "life in Lisbon"}]))
    assert not out["kept"]
    assert len(world.knowledge.facts("person")) == 1
    assert world.journal.recent(3, kinds=["noticed"]) == []


def test_what_is_said_about_a_person_lands_on_their_page(world: World) -> None:
    vikas = world.entities.resolve("person", "Vikas Badami",
                                   {"email": "vikas@example.com"})["entity"]
    seen: list[TurnRequest] = []
    sid = exchange(world, "had coffee with Vikas this morning, he's moving to Bangalore next"
                          " month and wants to co-found something in fintech",
                   "Sounds like a good conversation.")
    out = noticing.notice(world, sid, runner=answering([
        {"kind": "note", "about": "Vikas", "about_kind": "person",
         "line": "Had coffee; is moving to Bangalore next month and wants to co-found"
                 " something in fintech."},
        {"kind": "fact", "about": "Vikas", "about_kind": "person", "predicate": "moving_to",
         "value": "Bangalore (next month)", "stated": True,
         "quote": "he's moving to Bangalore next month"},
    ], seen))
    # The pass saw who the exchange names and what is already known of them.
    assert "Vikas Badami" in seen[0].sentence and "KNOWN" in seen[0].sentence
    assert seen[0].kind == "judge"
    assert out["kept"] and out["pages"] == [
        "Vikas Badami: Had coffee; is moving to Bangalore next month and wants to co-found"
        " something in fintech."]
    page = world.knowledge.find_note(f"entity:{vikas['id']}", "Vikas Badami")
    assert page and "## Noticed" in page["body"] and "Bangalore" in page["body"]
    assert page["summary"]  # the index line exists
    facts = world.knowledge.facts(f"entity:{vikas['id']}")
    assert [(f["predicate"], f["state"]) for f in facts] == [("moving_to", "accepted")]
    trail = world.journal.recent(3, kinds=["noticed"])[-1]
    assert trail["entity_ids"] == [vikas["id"]]
    # Twice the same line is one line.
    noticing.notice(world, sid, runner=answering([
        {"kind": "note", "about": "Vikas Badami", "about_kind": "person",
         "line": "Had coffee; is moving to Bangalore next month and wants to co-found"
                 " something in fintech."}]))
    page = world.knowledge.find_note(f"entity:{vikas['id']}", "Vikas Badami")
    assert page and page["body"].count("Bangalore") == 1


def test_a_first_name_alone_never_becomes_a_new_person(world: World) -> None:
    sid = exchange(world, "met Priya at the meetup, she runs growth at a fintech",
                   "Noted.")
    out = noticing.notice(world, sid, runner=answering([
        {"kind": "note", "about": "Priya", "about_kind": "person",
         "line": "Met at the meetup; runs growth at a fintech."}]))
    assert not out["kept"] and world.entities.find(name="Priya") == []
    # A full name the pass is sure of is started, with the turn as its source.
    out = noticing.notice(world, sid, runner=answering([
        {"kind": "note", "about": "Priya Raman", "about_kind": "person",
         "line": "Met at the meetup; runs growth at a fintech."}]))
    assert out["kept"]
    [priya] = world.entities.find(name="Priya Raman")
    assert priya["source"] == f"turn:{sid}" if "source" in priya else True
    assert world.knowledge.find_note(f"entity:{priya['id']}", "Priya Raman")


def test_two_people_of_one_name_are_left_alone(world: World) -> None:
    world.entities.resolve("person", "Sam Lee", {"email": "sam@a.com"})
    world.entities.resolve("person", "Sam Lee", {"email": "sam@b.com"})
    sid = exchange(world, "Sam Lee called about the audit, wants to start in May", "Noted.")
    out = noticing.notice(world, sid, runner=answering([
        {"kind": "fact", "about": "Sam Lee", "about_kind": "person", "predicate": "audit_start",
         "value": "May", "stated": True, "quote": "wants to start in May"}]))
    assert not out["kept"]
    assert len(world.entities.find(name="Sam Lee")) == 2


def test_a_module_line_goes_on_the_modules_page(world: World) -> None:
    mod = world.modules.create("Nutrition", goal="eat well")
    sid = exchange(world, "from this week I'm cutting rice at dinner, see how the numbers move",
                   "Understood.", module=mod["id"])
    out = noticing.notice(world, sid, runner=answering([
        {"kind": "note", "about": "module", "line": "Cutting rice at dinner from this week."}]))
    assert out["kept"]
    page = world.knowledge.find_note("module:Nutrition", "Nutrition")
    assert page and "Cutting rice at dinner" in page["body"]


def test_garbage_from_the_model_keeps_nothing(world: World) -> None:
    sid = exchange(world, "had a long chat with the bank about the mortgage today", "Noted.")
    out = noticing.notice(world, sid, runner=lambda req: RunResult(ok=True, reply="no json here"))
    assert not out["kept"]
    down = RunResult(ok=False, reply="", error="down")
    out = noticing.notice(world, sid, runner=lambda req: down)
    assert not out["kept"] and "down" in out["why"]
    assert noticing.parse('{"items": [{"kind": "fact"}, 3, "x"]}') == [{"kind": "fact"}]
