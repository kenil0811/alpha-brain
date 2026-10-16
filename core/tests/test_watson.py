"""Watson (design Q46, on Q50's substrate): what a turn says in passing is kept beside the
verbatim, each note filed by type; a conversation's checkpoint; a document; the refiling."""

from __future__ import annotations

import json
from typing import Any

from alpha.runtime.agents import builtin, look_and_run, watson
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
    assert not watson.worth_noticing(world, exchange(world, "yes", "Done."))
    assert not watson.worth_noticing(world, exchange(world, "log two eggs", "Logged."))
    sid = world.journal.append("said", "a sentence without a reply yet, four words plus",
                               actor="person")
    assert not watson.worth_noticing(world, sid)
    assert watson.worth_noticing(
        world, exchange(world, "had coffee with Vikas this morning", "Nice. Noted."))


def test_a_stated_fact_is_kept_and_an_inferred_one_waits(world: World) -> None:
    sid = exchange(world, "I moved to Lisbon last month, and I think I'll like the food scene",
                   "Welcome to Lisbon.")
    out = watson.notice(world, sid, runner=answering([
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
    out = watson.notice(world, sid, runner=answering([
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
    out = watson.notice(world, sid, runner=answering([
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
    watson.notice(world, sid, runner=answering([
        {"kind": "note", "about": "Vikas Badami", "about_kind": "person",
         "line": "Had coffee; is moving to Bangalore next month and wants to co-found"
                 " something in fintech."}]))
    page = world.knowledge.find_note(f"entity:{vikas['id']}", "Vikas Badami")
    assert page and page["body"].count("Bangalore") == 1


def test_a_first_name_alone_never_becomes_a_new_person(world: World) -> None:
    sid = exchange(world, "met Priya at the meetup, she runs growth at a fintech",
                   "Noted.")
    out = watson.notice(world, sid, runner=answering([
        {"kind": "note", "about": "Priya", "about_kind": "person",
         "line": "Met at the meetup; runs growth at a fintech."}]))
    assert not out["kept"] and world.entities.find(name="Priya") == []
    # A full name the pass is sure of is started, with the turn as its source.
    out = watson.notice(world, sid, runner=answering([
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
    out = watson.notice(world, sid, runner=answering([
        {"kind": "fact", "about": "Sam Lee", "about_kind": "person", "predicate": "audit_start",
         "value": "May", "stated": True, "quote": "wants to start in May"}]))
    assert not out["kept"]
    assert len(world.entities.find(name="Sam Lee")) == 2


def test_a_module_line_goes_on_the_modules_page(world: World) -> None:
    mod = world.modules.create("Nutrition", goal="eat well")
    sid = exchange(world, "from this week I'm cutting rice at dinner, see how the numbers move",
                   "Understood.", module=mod["id"])
    out = watson.notice(world, sid, runner=answering([
        {"kind": "note", "about": "module", "line": "Cutting rice at dinner from this week."}]))
    assert out["kept"]
    page = world.knowledge.find_note("module:Nutrition", "Nutrition")
    assert page and "Cutting rice at dinner" in page["body"]


def test_garbage_from_the_model_keeps_nothing(world: World) -> None:
    sid = exchange(world, "had a long chat with the bank about the mortgage today", "Noted.")
    out = watson.notice(world, sid, runner=lambda req: RunResult(ok=True, reply="no json here"))
    assert not out["kept"]
    down = RunResult(ok=False, reply="", error="down")
    out = watson.notice(world, sid, runner=lambda req: down)
    assert not out["kept"] and "down" in out["why"]
    assert watson.parse('{"items": [{"kind": "fact"}, 3, "x"]}') == [{"kind": "fact"}]


def test_a_commitment_and_a_decision_are_filed_by_type_and_the_rest_stays_in_the_journal(
        world: World) -> None:
    vikas = world.entities.resolve("person", "Vikas Badami",
                                   {"email": "vikas@example.com"})["entity"]
    mod = world.modules.create("Deals", goal="find a firm")
    sid = exchange(world, "I'll send Vikas the deck by Friday; let's go with the Austin list"
                          " first, the data is better there. Also log two eggs.",
                   "Noted; logged.", module=mod["id"])
    out = watson.notice(world, sid, runner=answering([
        {"kind": "commitment", "who": "person", "what": "send the deck", "to": "Vikas",
         "due": "2026-10-17", "quote": "I'll send Vikas the deck by Friday"},
        {"kind": "decision", "what": "Start with the Austin list",
         "why": "the data is better there", "quote": "let's go with the Austin list first"},
        {"kind": "other", "what": "a request to log two eggs"},
        {"kind": "fact", "about": "person", "predicate": "car_wash_lot_size_gate",
         "value": "≥0.8 acres", "stated": True, "quote": "x"},
    ]))
    assert out["kept"] and len(out["commitments"]) == 1 and len(out["decisions"]) == 1
    [c] = world.commitments.of("person")
    assert (c["what"], c["to_whom"], c["due"], c["state"]) == (
        "send the deck", f"entity:{vikas['id']}", "2026-10-17", "open")
    assert world.commitments.of(f"entity:{vikas['id']}") == [c]  # owed to him: on his page too
    [d] = world.decisions.about("module", mod["id"])
    assert d["by"] == "person" and d["state"] == "binding"
    assert d["what"] == "Start with the Austin list"
    assert d["why"] == "the data is better there" and d["evidence"]["source"] == f"turn:{sid}"
    # the fact the model still called a fact is kept as before: the type is the model's call,
    # the filing is code's; "other" is filed nowhere
    assert [f["predicate"] for f in world.knowledge.facts("person")] == ["car_wash_lot_size_gate"]
    trail = world.journal.recent(1, kinds=["noticed"])[0]
    assert "commitment: send the deck by 2026-10-17" in trail["text"]
    assert "decided: Start with the Austin list" in trail["text"]
    assert trail["data"]["commitments"] == [c["id"]] and trail["data"]["decisions"] == [d["id"]]
    # the same commitment twice is one
    watson.notice(world, sid, runner=answering([
        {"kind": "commitment", "who": "person", "what": "Send the deck", "to": "Vikas",
         "due": "2026-10-17", "quote": "x"}]))
    assert len(world.commitments.of("person")) == 1


def test_commitments_due_within_a_week_reach_the_prepack(world: World) -> None:
    from datetime import date, timedelta

    from alpha.context import prepack

    soon = (date.today() + timedelta(days=3)).isoformat()
    later = (date.today() + timedelta(days=30)).isoformat()
    world.commitments.record("person", "send the deck", due=soon, source="turn:x")
    world.commitments.record("person", "renew the lease", due=later, source="turn:x")
    world.commitments.record("person", "call mum", source="turn:x")  # no date: not "due"
    pack = prepack.build(world, "what's on this week?")
    assert "COMMITMENTS DUE" in pack and "send the deck" in pack
    assert "renew the lease" not in pack and "call mum" not in pack
    assert [c["what"] for c in world.commitments.due_within(7)] == ["send the deck"]
    done = world.commitments.set_state(world.commitments.of("person")[0]["id"], "done")
    assert done["state"] == "done" and world.commitments.due_within(7) == []


def test_a_conversations_checkpoint_keeps_what_it_decided_and_what_is_open(world: World) -> None:
    from alpha.runtime import conversations

    mod = world.modules.create("Deals", goal="find a firm")
    chat = conversations.open_conversation(world, "which list first?", mod["id"])
    world.journal.append("said", "which list first, Austin or Dallas?", actor="person",
                         thread=chat["id"], module=mod["id"])
    world.journal.append("replied", "Austin has better data.", thread=chat["id"], module=mod["id"])
    world.journal.append("said", "Austin then; and ask the broker about the second site",
                         actor="person", thread=chat["id"], module=mod["id"])
    world.journal.append("replied", "Austin it is. I'll note the broker question.",
                         thread=chat["id"], module=mod["id"])
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        return RunResult(ok=True, reply=json.dumps({
            "decisions": [{"what": "Start with Austin", "why": "better data",
                           "quote": "Austin then"}],
            "open": "Whether to ask the broker about the second site."}))

    out = watson.checkpoint(world, chat["id"], runner=runner)
    assert out["kept"] and seen[0].kind == "judge" and "Person: Austin then" in seen[0].sentence
    [d] = world.decisions.about("conversation", chat["id"])
    assert d["what"] == "Start with Austin" and d["about"]["module"] == mod["id"]
    page = world.knowledge.find_note("module:Deals", "Deals")
    assert page and "## Open" in page["body"] and "ask the broker" in page["body"]


def test_a_document_alpha_read_is_noticed_for_the_people_in_it(world: World, tmp_path: Any) -> None:
    from alpha.connectors.files import Files

    doc = tmp_path / "notes.txt"
    doc.write_text("Minutes. Priya Raman (Lumen) confirmed she will send the term sheet by"
                   " 2026-11-01. " + "More words follow here. " * 20)
    did = Files(world).take(doc, module=None, origin="the person", by="person")["id"]
    out = watson.read_document(world, did, runner=answering([
        {"kind": "fact", "about": "Priya Raman", "about_kind": "person", "predicate": "works_at",
         "value": "Lumen", "stated": True, "quote": "Priya Raman (Lumen)"},
        {"kind": "commitment", "who": "Priya Raman", "what": "send the term sheet",
         "to": "person", "due": "2026-11-01", "quote": "x"},
    ]))
    assert out["kept"]
    [priya] = world.entities.find(name="Priya Raman")
    facts = world.knowledge.facts(f"entity:{priya['id']}")
    # never stated by the person themselves: suggested, whatever the document says
    assert [(f["predicate"], f["state"]) for f in facts] == [("works_at", "suggested")]
    [c] = world.commitments.of(f"entity:{priya['id']}")
    assert c["who"] == f"entity:{priya['id']}" and c["to_whom"] == "person"


def test_watson_is_made_once_and_works_from_the_journal_cursor(world: World) -> None:
    """The substrate (Q50) under a built-in kind: the row made on open with its cursor at the
    journal's end, the look over what came after, the run under its name, the verdict."""
    world.journal.append("said", "something said before Watson existed, four words",
                         actor="person")
    [made] = builtin.ensure(world)
    assert made["kind"] == "watson" and made["name"] == "Watson" and made["on"]
    assert made["may"] == ["facts", "notes", "commitments", "decisions"]
    brief = world.knowledge.find_note(f"agent:{made['id']}", "Brief")
    assert brief and brief["body"].startswith("## What Watson files")
    assert builtin.ensure(world) == []  # once
    agent = world.agents.get(made["id"])
    assert agent["cursor"] >= world.journal.rowid(world.journal.recent(1)[0]["id"])
    # nothing new: no run, the cursor moves (the refiling of nothing is still a run? no: it
    # is recorded as done the first time there is work)
    sid = exchange(world, "I moved to Lisbon last month, loving it", "Welcome to Lisbon.")
    calls: list[str] = []

    def runner(req: TurnRequest) -> RunResult:
        calls.append(req.system[:30])
        if req.system.startswith("A person's second brain"):  # the refiling: nothing to move
            return RunResult(ok=True, reply=json.dumps({"facts": {}}))
        return RunResult(ok=True, reply=json.dumps({"items": [
            {"kind": "fact", "about": "person", "predicate": "lives_in", "value": "Lisbon",
             "stated": True, "quote": "I moved to Lisbon last month"}]}))

    out = look_and_run(world, "watson", runner=runner)
    assert out and out["last_result"] == "Kept 1 facts."
    run = world.runs.last(agent["id"])
    assert run and run["verdict"] == "succeeded" and run["trigger"] == "event"
    assert world.knowledge.facts("person")[0]["predicate"] == "lives_in"
    noticed = world.journal.recent(1, kinds=["noticed"])[0]
    assert noticed["actor"] == agent["id"] and noticed["data"]["turn"] == sid
    assert watson.refiled(world, agent)  # the refiling ran once, with nothing to move
    assert look_and_run(world, "watson", runner=runner) is None  # the same exchange is not news
    # a turn still waiting for its reply holds the cursor back, so it is not missed
    waiting = world.journal.append("said", "and I started a new job there last week",
                                   actor="person")
    assert look_and_run(world, "watson", runner=runner) is None
    assert world.agents.get(agent["id"])["cursor"] < world.journal.rowid(waiting)
    world.journal.append("replied", "Congratulations.", data={"turn": waiting})
    out = look_and_run(world, "watson", runner=runner)
    assert out and world.agents.get(agent["id"])["cursor"] >= world.journal.rowid(waiting)


def test_the_refiling_moves_what_is_not_about_the_person_once(world: World) -> None:
    for predicate, value in (("age", "27"), ("car_wash_lot_size_gate", "≥0.8 acres"),
                             ("wants_workout_logging", "True"), ("using_module", "Advisory")):
        world.knowledge.record_fact("person", predicate, value, source="turn:old",
                                    state="accepted")
    [agent] = builtin.ensure(world)
    ids = {f["predicate"]: f["id"] for f in world.knowledge.facts("person")}

    def runner(req: TurnRequest) -> RunResult:
        assert "car_wash_lot_size_gate" in req.sentence and req.kind == "judge"
        return RunResult(ok=True, reply=json.dumps({"facts": {
            ids["age"]: "keep", ids["car_wash_lot_size_gate"]: "setting",
            ids["wants_workout_logging"]: "request", ids["using_module"]: "state"}}))

    out = watson.refile(world, agent, runner=runner)
    assert out["kept"] and len(out["moved"]) == 3
    assert [f["predicate"] for f in world.knowledge.facts("person")] == ["age"]
    lines = [e["text"] for e in world.journal.recent(5, kinds=["changed"])]
    assert any(t.startswith("Watson refiled car_wash_lot_size_gate = ≥0.8 acres: a setting of a"
                            " workflow") for t in lines)
    assert any("wants_workout_logging" in t and "something you asked for" in t for t in lines)
    assert watson.refiled(world, agent)
    [d] = world.decisions.about("agent", agent["id"])
    assert d["by"] == agent["id"] and d["what"].startswith("Refiled the facts kept before Watson")
