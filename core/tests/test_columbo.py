"""Columbo, the checker (design Q47, on Q50's substrate): known, assumed or asked; what Alpha
works out checked two ways; the mark on what was checked; Alpha corrects from the source and
the person decides what is still in doubt; a part's first row and an outward card's numbers."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from conftest import building
from fastapi.testclient import TestClient
from test_actions import PAYLOAD, Driver, gmail_connected, keep_procedure, restore, with_fake
from test_workflow_build import agreed_page, builder, home  # noqa: F401  (the fixture)

from alpha import config
from alpha.api.server import create_app
from alpha.mcp.tools import Tools, provenance_of, provenance_words
from alpha.runtime import claude_cli, workflow_build
from alpha.runtime import parts as parts_module
from alpha.runtime.agents import builtin, columbo, look_and_run
from alpha.runtime.agents import runner as agent_runner
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world.world import World

FIELDS = [{"name": "item", "kind": "text"}, {"name": "kcal", "kind": "number", "unit": "kcal"},
          {"name": "protein", "kind": "number", "unit": "g"}]
AGREE = '{"agree": true, "differences": [], "unstated": []}'
DIFFERS = json.dumps({"agree": False, "differences": [
    {"what": "kcal", "alpha": "160", "independent": "215", "source": "ocado.com"}],
    "unstated": ["which size"]})


def food_log(world: World) -> None:
    t = building(world)
    t.module_create("Nutrition")
    t.collection_create("food_log", "Food log", FIELDS, module="Nutrition")


def said(world: World, text: str) -> str:
    return world.journal.append("said", text, actor="person")


def with_columbo(world: World) -> dict[str, Any]:
    return next(a for a in builtin.ensure(world) if a["kind"] == "columbo")


def world_way(req: TurnRequest) -> bool:
    """The judge of the world way (the outside way's judge compares two answers)."""
    return "person's world already held" in req.system


def shake(world: World, kcal: int = 160) -> tuple[str, dict[str, Any]]:
    """A turn in which Alpha logged a shake at an estimated number of calories."""
    turn_id = said(world, "i had a for goodness shakes 35g protein shake")
    rec = Tools(world, turn=turn_id).records_add(
        "food_log", {"item": "FGS shake", "kcal": kcal, "protein": 35}, source="estimated")
    world.journal.append("replied", f"Logged: FGS shake, ~{kcal} kcal (estimated).",
                         data={"turn": turn_id})
    return turn_id, rec


# ---- provenance ----


def test_the_rules_say_known_assumed_or_asked() -> None:
    rules = config.prompt("turn")
    assert "never guessed" in rules and "Never pick silently" in rules
    assert "what you assumed" in rules and "source=" in rules


def test_values_carry_where_they_came_from() -> None:
    looked = provenance_of("label on ocado.com", "the 330 ml bottle", turn="j1")
    assert looked == {"by": "alpha", "turn": "j1", "source": "label on ocado.com",
                      "estimated": False, "assumed": "the 330 ml bottle"}
    assert provenance_words(looked) == " (from label on ocado.com; assumed the 330 ml bottle)"
    assert provenance_of("stated", None, turn="j1")["source"] == "stated"
    assert provenance_words(provenance_of("stated", None, turn="j1")) == ""
    guessed = provenance_of("guess", "  ", turn="j1")
    assert guessed["estimated"] and guessed["source"] == "estimated" and "assumed" not in guessed
    assert provenance_words(guessed) == " (estimated)"


def test_a_record_says_what_it_rests_on_and_a_correction_can_change_it(world: World) -> None:
    food_log(world)
    t = Tools(world, turn=said(world, "i had a for goodness shakes 35g protein shake"))
    rec = t.records_add("food_log", {"item": "For Goodness Shakes", "kcal": 215, "protein": 35},
                        source="https://www.ocado.com/products/fgs", assumed="the 330 ml bottle")
    did = world.journal.recent(1, kinds=["did"])[0]
    assert did["text"] == ("Added For Goodness Shakes to Food log (from"
                           " https://www.ocado.com/products/fgs; assumed the 330 ml bottle).")
    # A change with no source keeps what the record rested on.
    kept = t.records_update("food_log", rec["id"], {"protein": 34}, rec["revision"])
    assert kept["_provenance"]["source"] == "https://www.ocado.com/products/fgs"
    assert kept["_provenance"]["assumed"] == "the 330 ml bottle"
    # A correction from a source says so.
    fixed = t.records_update("food_log", rec["id"], {"kcal": 216}, kept["revision"],
                             source="label on morrisons.com")
    assert fixed["_provenance"] == {"by": "alpha", "turn": t.turn,
                                    "source": "label on morrisons.com", "estimated": False}
    assert world.journal.recent(1, kinds=["changed"])[0]["text"].endswith(
        "kcal 215 → 216 (from label on morrisons.com).")


def test_a_plain_log_with_no_home_is_journaled_with_its_source(world: World) -> None:
    t = Tools(world, turn=said(world, "log two boiled eggs"))
    t.table_start("Food log", FIELDS, {"item": "Two boiled eggs", "kcal": 155}, module="Food",
                  source="estimated")
    texts = [e["text"] for e in world.journal.recent(5)]
    assert "Added Two boiled eggs to Food log (estimated)." in texts


# ---- what is checked, and how the verdict is read ----


def test_independent_and_judging_runs_never_see_alpha(world: World) -> None:
    def req(kind: str = "turn") -> TurnRequest:
        return TurnRequest(sentence="s", system="x", world_path=world.path, turn_id="j1", kind=kind)
    independent = claude_cli.argv(req("independent"), Path("/tmp/mcp.json"))
    # Strict with an empty config: neither Alpha's tools nor the person's own MCP servers.
    assert "--strict-mcp-config" in independent and "mcp__alpha" not in independent
    assert claude_cli.mcp_config(req("independent")) == {"mcpServers": {}}
    assert independent[independent.index("--allowedTools") + 1:][:2] == ["WebSearch", "WebFetch"]
    judge = claude_cli.argv(req("judge"), Path("/tmp/m.json"))
    assert "--allowedTools" not in judge and "mcp__alpha" not in judge
    assert claude_cli.mcp_config(req("judge")) == {"mcpServers": {}}
    assert "WebSearch" in judge[judge.index("--disallowedTools") + 1:]
    ordinary = claude_cli.argv(req(), Path("/tmp/m.json"))
    assert "--mcp-config" in ordinary and "mcp__alpha" in ordinary
    assert "alpha" in claude_cli.mcp_config(req())["mcpServers"]


def test_what_columbo_checks_by_shape(world: World) -> None:
    # a turn that wrote worked-out values, once it has its reply
    food_log(world)
    stated = said(world, "log 215 kcal of shake")
    Tools(world, turn=stated).records_add("food_log", {"item": "Shake", "kcal": 215},
                                          source="stated")
    world.journal.append("replied", "Logged.", data={"turn": stated})
    assert not columbo.worth_checking(world, stated)
    guessed = said(world, "i had a shake")
    Tools(world, turn=guessed).records_add("food_log", {"item": "Shake", "kcal": 160},
                                           source="estimated")
    assert not columbo.worth_checking(world, guessed)  # no reply yet
    world.journal.append("replied", "Logged, ~160 kcal (estimated).", data={"turn": guessed})
    assert columbo.worth_checking(world, guessed)
    # an answer carrying a number the person will rely on: a measurement, money, a percentage
    for text in ("About 155 kcal for two large eggs.", "It lists at $1.2m, or £950,000.",
                 "35g protein per bottle", "Up 12% on last month", "1.5 l of water a day"):
        assert columbo.carries_numbers(text), text
    # not a bare count, a date, a time, a year: the person's own, which no source outside knows
    for text in ("You have 3 meetings today.", "On 16 October at 10:30.", "I'm 2 minutes away.",
                 "Founded in 2019.", "3 emails from Sania."):
        assert not columbo.carries_numbers(text), text


def test_the_judges_answer_is_read_however_it_is_wrapped() -> None:
    v = columbo.parse_verdict(f"Here:\n```json\n{DIFFERS}\n```")
    assert not v["agree"] and v["unstated"] == ["which size"]
    assert v["differences"][0] == {"what": "kcal", "alpha": "160", "other": "215",
                                   "source": "ocado.com",
                                   "words": "kcal: Alpha 160, independent 215 (ocado.com)"}
    # the old sentence form is read into the same shape
    v = columbo.parse_verdict('{"agree": true, "differences": ["kcal: Alpha 160, independent 215'
                              ' (ocado.com)"], "unstated": []}')
    assert not v["agree"]  # a difference is a difference whatever the flag says
    assert (v["differences"][0]["what"], v["differences"][0]["other"],
            v["differences"][0]["source"]) == ("kcal", "215", "ocado.com")
    v = columbo.parse_verdict("I think they agree.")
    assert v["agree"] and "note" in v


# ---- an answer, checked both ways ----


def test_a_wrong_answer_is_caught_alpha_corrects_itself_and_the_row_is_marked(
        world: World) -> None:
    food_log(world)
    me = with_columbo(world)
    turn_id, rec = shake(world)
    runs: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        runs.append(req)
        if req.kind == "independent":
            assert "for goodness shakes" in req.sentence
            return RunResult(reply="Per 330 ml bottle: 215 kcal, 35 g protein (ocado.com).",
                             ok=True)
        if req.kind == "judge" and world_way(req):
            assert "Rows this turn wrote" in req.sentence and "kcal = 160" in req.sentence
            return RunResult(reply=AGREE, ok=True)
        if req.kind == "judge":
            assert "Alpha's answer" in req.sentence and "215 kcal" in req.sentence
            return RunResult(reply=DIFFERS, ok=True)
        # The repair turn: Alpha corrects the record from the source and tells the person.
        assert "second opinion" in req.sentence.lower() and rec["id"] in req.sentence
        Tools(world, turn=req.turn_id).records_update(
            "food_log", rec["id"], {"kcal": 215}, rec["revision"], source="label on ocado.com",
            assumed="the 330 ml bottle")
        return RunResult(reply="Checked the label: 215 kcal, not 160 (ocado.com); corrected."
                         " I assumed the 330 ml bottle.", ok=True)

    result = columbo.check_turn(world, turn_id, runner=runner)
    assert [r.kind for r in runs] == ["independent", "judge", "judge", "turn"]
    assert result["checked"] and not result["agree"] and result["asked"] == []
    checked = world.journal.read(result["entry"])
    assert checked["kind"] == "checked" and checked["actor"] == me["id"]
    assert checked["data"]["turn"] == turn_id and checked["data"]["agent"] == me["id"]
    assert checked["text"] == ("Checked against an independent answer: it differs on kcal: Alpha"
                               " 160, independent 215 (ocado.com). it would have asked or said:"
                               " which size; against your world: it agrees.")
    fixed = world.collections.get("food_log", rec["id"])
    assert fixed["kcal"] == 215 and fixed["_provenance"]["source"] == "label on ocado.com"
    # the mark: corrected from the source, so it agrees now, and says against what
    mark = fixed["_provenance"]["checked"]
    assert mark["agree"] and mark["source"] == "ocado.com" and mark["by"] == me["id"]
    assert mark["entry"] == result["entry"]
    # The correction is in the person's conversation, as Alpha's words.
    stream = world.journal.recent(3, stream=True, kinds=["replied"])
    assert stream[-1]["text"].startswith("Checked the label: 215 kcal")
    assert result["repaired"] == stream[-1]["text"]
    notes = world.knowledge.find_note(f"agent:{me['id']}", "Notes")
    assert notes and "## kcal" in notes["body"]
    assert "Alpha corrected it from ocado.com" in notes["body"]
    assert "## ocado.com" in notes["body"] and "differed with Alpha" in notes["body"]


def test_an_agreeing_answer_leaves_things_alone_and_marks_the_row(world: World) -> None:
    food_log(world)
    me = with_columbo(world)
    turn_id = said(world, "i had two boiled eggs")
    rec = Tools(world, turn=turn_id).records_add("food_log", {"item": "Two eggs", "kcal": 155},
                                                 source="estimated")
    world.journal.append("replied", "Logged two eggs, ~155 kcal (estimated).",
                         data={"turn": turn_id})
    kinds: list[str] = []

    def runner(req: TurnRequest) -> RunResult:
        kinds.append(req.kind)
        return RunResult(reply=AGREE if req.kind == "judge"
                         else "About 155 kcal for two large eggs.", ok=True)

    result = columbo.check_turn(world, turn_id, runner=runner)
    assert kinds == ["independent", "judge", "judge"] and result["agree"]
    assert result["repaired"] is None and result["asked"] == []
    assert world.journal.recent(1)[0]["text"] == ("Checked against an independent answer and"
                                                  " your world: both agree.")
    mark = world.collections.get("food_log", rec["id"])["_provenance"]["checked"]
    assert mark["agree"] and mark["source"] == "an independent answer and your world"
    assert mark["by"] == me["id"]


def test_when_alpha_stands_by_its_own_the_person_is_asked_once_and_the_answer_binds(
        world: World) -> None:
    food_log(world)
    me = with_columbo(world)
    turn_id, rec = shake(world)

    def runner(req: TurnRequest) -> RunResult:
        if req.kind == "independent":
            return RunResult(reply="215 kcal per 330 ml bottle (ocado.com).", ok=True)
        if req.kind == "judge":
            return RunResult(reply=AGREE if world_way(req) else DIFFERS, ok=True)
        return RunResult(reply="I stand by 160: you said the small 250 ml bottle.", ok=True)

    result = columbo.check_turn(world, turn_id, runner=runner)
    assert result["repaired"] and len(result["asked"]) == 1
    ask = world.journal.read(result["asked"][0])
    assert ask["kind"] == "asked" and ask["actor"] == me["id"]
    assert ask["text"] == ("Kcal of FGS shake: Alpha has 160, ocado.com says 215. Which should"
                           " Alpha keep?")
    assert ask["data"]["options"] == ["160", "215"] and ask["data"]["turn"] == turn_id
    about = ask["data"]["columbo"]
    assert (about["record"], about["field"]) == (rec["id"], "kcal")
    # the mark says it differs, until the person decides
    marked = world.collections.get("food_log", rec["id"])["_provenance"]["checked"]
    assert marked["agree"] is False
    # asked once: a second check while the question is open asks nothing more
    assert columbo.check_turn(world, turn_id, runner=runner)["asked"] == []
    # the person's answer, through the route: it binds by code, with no model turn
    c = TestClient(create_app(world, live=False))
    out = c.post(f"/api/asks/{ask['id']}/answer", json={"text": "215"}).json()
    assert out["turn"] is None and out["decision"]
    row = world.collections.get("food_log", rec["id"])
    assert row["kcal"] == 215 and row["_provenance"]["by"] == "person"
    assert row["_provenance"]["source"] == "ocado.com" and row["_provenance"]["checked"]["agree"]
    [d] = world.decisions.about("record", rec["id"])
    assert d["by"] == "person" and d["state"] == "binding"
    assert d["what"] == "Keep kcal = 215 for FGS shake (ocado.com)" and d["alternatives"] == ["160"]
    assert world.journal.recent(1, kinds=["changed"])[0]["text"] == \
        "You kept kcal = 215 for FGS shake (ocado.com)."
    assert world.journal.recent(1, kinds=["changed"])[0]["actor"] == "person"
    assert world.journal.open_asks() == []
    notes = world.knowledge.find_note(f"agent:{me['id']}", "Notes")
    assert notes and "you took Columbo's side" in notes["body"]
    # an answer that is neither value is a message like any other
    assert columbo.decide(world, ask, "neither, it was the 500 ml one") is None


def test_columbo_looks_at_replies_that_carry_numbers_and_runs_as_an_agent(world: World) -> None:
    me = with_columbo(world)
    eggs = said(world, "how many calories in two boiled eggs")
    world.journal.append("replied", "About 155 kcal for two large eggs.", data={"turn": eggs})
    meetings = said(world, "how many meetings today")
    world.journal.append("replied", "You have 3 meetings today.", data={"turn": meetings})
    kinds: list[str] = []

    def runner(req: TurnRequest) -> RunResult:
        kinds.append(req.kind)
        return RunResult(reply=AGREE if req.kind == "judge" else "155 kcal (usda.gov).", ok=True)

    out = look_and_run(world, "columbo", runner=runner)
    assert out and out["last_result"] == "Checked 1 answer: it agrees."
    # no rows and no kept context: the world has nothing to say, and is not asked
    assert kinds == ["independent", "judge"]
    run = world.runs.last(me["id"])
    assert run and run["trigger"] == "event" and run["verdict"] == "succeeded"
    checked = [e for e in world.journal.recent(10, kinds=["checked"])]
    assert [e["data"]["turn"] for e in checked] == [eggs]
    assert checked[0]["text"] == "Checked against an independent answer and your world: both agree."
    # nothing new: no run; an answer checked once is not checked again
    assert look_and_run(world, "columbo", runner=runner) is None
    # its page says in its own words when it works and what a good run is (the frame's, Q50)
    page = TestClient(create_app(world, live=False)).get(f"/api/agents/{me['id']}").json()
    assert page["when"].startswith("after a turn of yours in which Alpha worked a number out")
    assert page["good_run"].startswith("both ways answered for everything it checked")
    assert page["runs"][0]["verdict"] == "succeeded"


def test_the_persons_earlier_sentences_go_with_a_sentence_answered_alone(world: World) -> None:
    with_columbo(world)
    said(world, "i bought a for goodness shakes 35g protein shake")
    later = said(world, "how many kcal is it")
    world.journal.append("replied", "About 215 kcal per 330 ml bottle.", data={"turn": later})
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        return RunResult(reply=AGREE if req.kind == "judge" else "215 kcal (ocado.com).", ok=True)

    assert columbo.check_turn(world, later, runner=runner)["agree"]
    independent = seen[0].sentence
    assert independent.startswith('Earlier in the same conversation the person said: "i bought a'
                                  ' for goodness shakes 35g protein shake"')
    assert independent.endswith('The person said: "how many kcal is it"')
    assert "215 kcal" not in independent  # never Alpha's replies, only the person's words


def test_a_sentence_with_nothing_to_look_up_has_no_outside_opinion(world: World) -> None:
    food_log(world)
    with_columbo(world)
    turn_id = said(world, "load the figures from the file i dropped")
    Tools(world, turn=turn_id).records_add("food_log", {"item": "From the file", "kcal": 321},
                                           source="the file figures.xlsx")
    world.journal.append("replied", "Loaded 321 kcal from the file.", data={"turn": turn_id})
    kinds: list[str] = []

    def runner(req: TurnRequest) -> RunResult:
        kinds.append(req.kind)
        if req.kind == "independent":
            return RunResult(reply="NOTHING TO LOOK UP — the figures are in the person's own"
                                   " file, which I cannot see.", ok=True)
        return RunResult(reply=AGREE, ok=True)

    result = columbo.check_turn(world, turn_id, runner=runner)
    assert kinds == ["independent", "judge"]  # no judge for the outside way: nothing to compare
    assert result["agree"] and result["unstated"] == [] and result["repaired"] is None
    assert columbo.words(result) == ("Checked against an independent answer: nothing to look up;"
                                     " against your world: it agrees.")
    assert result["outside"]["note"].startswith("nothing to look up: the figures are in the")


def test_one_way_failing_makes_the_run_partial(world: World) -> None:
    food_log(world)
    with_columbo(world)
    turn_id, rec = shake(world)

    def runner(req: TurnRequest) -> RunResult:
        if req.kind == "independent":
            return RunResult(reply="", ok=False, error="no network")
        return RunResult(reply=AGREE, ok=True)

    out = look_and_run(world, "columbo", runner=runner)
    assert out and out["last_result"] == "Checked 1 answer: it agrees."
    assert out["last_error"].startswith("one way gave no answer for the reply to")
    checked = world.journal.recent(1, kinds=["checked"])[0]
    assert checked["text"] == ("Checked against an independent answer: no answer came back;"
                               " against your world: it agrees.")
    assert checked["data"]["failed"] == ["outside"]
    assert world.collections.get("food_log", rec["id"])["_provenance"]["checked"]["source"] == \
        "your world"


# ---- a part's values ----


def test_a_parts_first_filled_row_is_checked_once_and_again_after_a_repair(
        world: World, home: Path) -> None:  # noqa: F811
    wf = agreed_page(world)
    built = workflow_build.run(world, wf["id"], runner=builder())
    module = world.modules.get(built["module"])
    me = with_columbo(world)
    c = TestClient(create_app(world, live=False))
    seen: list[TurnRequest] = []
    verdict = {"judge": AGREE}

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        if req.kind == "independent":
            assert "checking values on your own" in req.system
            assert "households = 52000" in req.sentence and "Census ACS" in req.sentence
            return RunResult(reply="52,000 households (census.gov); 31,000 cars a day (txdot.gov).",
                             ok=True)
        return RunResult(reply=verdict["judge"], ok=True)

    rec = c.post("/api/tables/site/records", json={"values": {"address": "1 Main St"}}).json()
    parts_module.run_due(world, module_id=module["id"])
    out = look_and_run(world, "columbo", runner=runner)
    # the checks part filled two numbers (checked); the memo part filled words (not a number)
    assert out and out["last_result"] == "Checked 1 part: it agrees."
    assert [r.kind for r in seen] == ["independent", "judge"]  # no rows before it: no world judge
    row = world.collections.get("site", rec["id"])
    marks = row["_provenance"]["fields"]
    assert marks["households"]["checked"]["agree"] and marks["traffic"]["checked"]["agree"]
    assert marks["households"]["source"].startswith("Census ACS")  # the origin stays
    checked = world.journal.recent(1, kinds=["checked"])[0]
    assert checked["data"]["part"] == "checks" and checked["module"] == module["id"]
    assert checked["text"].startswith("The part Trade area checks on 1 Main St: checked against")
    # a second row the part fills is not checked again
    c.post("/api/tables/site/records", json={"values": {"address": "2 Main St"}})
    parts_module.run_due(world, module_id=module["id"])
    assert look_and_run(world, "columbo", runner=runner) is None
    # after Doc repairs the part, its next filled row is checked again, this time with the
    # rows before it for the world way; a difference asks the person
    world.journal.append("changed", "Doc fixed the part Trade area checks: a wrong column.",
                         actor="a_doc", module=module["id"],
                         data={"part": "checks", "repair": "run_x", "module": module["id"]})
    verdict["judge"] = json.dumps({"agree": False, "differences": [
        {"what": "households", "alpha": "52000", "independent": "48,100", "source": "census.gov"}],
        "unstated": []})
    seen.clear()
    third = c.post("/api/tables/site/records", json={"values": {"address": "3 Main St"}}).json()
    parts_module.run_due(world, module_id=module["id"])
    out = look_and_run(world, "columbo", runner=runner)
    assert out and out["last_result"] == "Checked 1 part: 0 agree, 1 differs; asked you about 1."
    assert [r.kind for r in seen] == ["independent", "judge", "judge"]
    assert "Other rows the part" in seen[2].sentence and "1 Main St" in seen[2].sentence
    row3 = world.collections.get("site", third["id"])
    assert row3["households"] == 52000  # Columbo never changes a value
    assert row3["_provenance"]["fields"]["households"]["checked"]["agree"] is False
    assert row3["_provenance"]["fields"]["traffic"]["checked"]["agree"] is True
    [ask] = world.journal.open_asks()
    assert ask["actor"] == me["id"] and ask["data"]["options"] == ["52000", "48,100"]
    assert ask["text"] == ("Households of 3 Main St: the part Trade area checks has 52000,"
                           " census.gov says 48,100. Which should Alpha keep?")
    # the person's pick binds the field, as their own edit
    c.post(f"/api/asks/{ask['id']}/answer", json={"text": "48,100"})
    row3 = world.collections.get("site", third["id"])
    assert row3["households"] == 48100 and row3["_provenance"]["by"] == "person"
    assert row3["_provenance"]["fields"]["households"]["checked"]["agree"] is True
    [d] = world.decisions.about("record", third["id"])
    assert d["what"] == "Keep households = 48,100 for 3 Main St (census.gov)"


# ---- an outward card ----


def test_an_outward_cards_numbers_are_checked_before_the_yes_and_never_block(
        world: World) -> None:
    gmail_connected(world)
    me = with_columbo(world)
    driver = Driver()
    with_fake(driver)
    try:
        # a listing in the person's world the card's price can be checked against
        building(world).collection_create("listings", "Listings", [
            {"name": "title", "kind": "text"}, {"name": "price", "kind": "number"}])
        Tools(world, turn="j_0").records_add("listings", {"title": "Bakery on High St",
                                                          "price": 320000}, source="stated")
        turn_id = said(world, "tell sania the bakery's price")
        t = keep_procedure(world, turn=turn_id)
        plain = t.action_propose("gmail_draft", "Draft to Sania", PAYLOAD, "deletable")["action"]
        priced = t.action_propose("gmail_draft", "Draft to Sania about the bakery",
                                  {**PAYLOAD, "body": "The bakery lists at £300,000."},
                                  "deletable", evidence="the listing you saved")["action"]
        kinds: list[str] = []

        def runner(req: TurnRequest) -> RunResult:
            kinds.append(req.kind)
            if req.kind == "judge" and world_way(req):
                assert "£300,000" in req.sentence
                return RunResult(reply=json.dumps({"agree": False, "differences": [
                    {"what": "price", "alpha": "£300,000", "world": "£320,000",
                     "where": "record r_x in listings"}]}), ok=True)
            return RunResult(reply=AGREE if req.kind == "judge" else "No public price.", ok=True)

        out = look_and_run(world, "columbo", runner=runner)
        # the card with words only is left alone; the one with a price is checked both ways
        assert out and out["last_result"] == "Checked 1 card: 0 agree, 1 differs."
        assert sorted(kinds) == ["independent", "judge", "judge"]
        assert world.actions.get(plain)["checked"] is None
        card = world.actions.get(priced)
        assert card["state"] == "proposed"  # never held up
        assert card["checked"] == ("Checked against an independent answer: it agrees; against"
                                   " your world: it differs on price: Alpha £300,000, world"
                                   " £320,000 (record r_x in listings).")
        c = TestClient(create_app(world, live=False))
        shown = next(i for i in c.get("/api/home").json()["needs_you"]
                     if i["kind"] == "action" and i["id"] == priced)
        assert shown["action"]["checked"] == card["checked"]
        checked = world.journal.recent(1, kinds=["checked"])[0]
        assert checked["actor"] == me["id"] and checked["data"]["action"] == priced
        # decided before Columbo looked: nothing to inform
        world.actions.decline(priced)
        assert columbo.check_action(world, me, priced, runner=runner)["why"] == \
            "it was decided before Columbo looked"
    finally:
        restore()


# ---- @Columbo ----


def test_at_columbo_checks_the_conversations_last_answer(world: World) -> None:
    me = with_columbo(world)
    eggs = said(world, "how many calories in two boiled eggs")
    world.journal.append("replied", "About 155 kcal for two large eggs.", data={"turn": eggs})
    kinds: list[str] = []

    def runner(req: TurnRequest) -> RunResult:
        kinds.append(req.kind)
        return RunResult(reply=AGREE if req.kind == "judge" else "155 kcal (usda.gov).", ok=True)

    out = agent_runner.mention(world, me, "@Columbo check that", thread=None, runner=runner)
    assert out.ok and out.reply == ("Checked against an independent answer and your world: both"
                                    " agree.")
    assert kinds == ["independent", "judge"]  # the model never answered as Columbo: code did
    assert world.journal.read(out.said)["text"] == "@Columbo check that"
    assert world.journal.read(out.replied)["actor"] == me["id"]
    run = world.runs.last(me["id"])
    assert run and run["trigger"] == "mention" and run["verdict"] == "succeeded"
    assert world.journal.recent(1, kinds=["checked"])[0]["data"]["turn"] == eggs
    # with nothing to check, the generic mention answers (the model, as Columbo)
    fresh = World(world.path.parent / "fresh.sqlite")
    try:
        you = with_columbo(fresh)
        out = agent_runner.mention(fresh, you, "@Columbo hello", thread=None,
                                   runner=lambda req: RunResult(reply="Hello. Nothing to check"
                                                                " yet.", ok=True))
        assert out.reply.startswith("Hello") and kinds == ["independent", "judge"]
    finally:
        fresh.close()
