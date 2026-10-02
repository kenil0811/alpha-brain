"""Known, assumed or asked: values carry where they came from, and Alpha's answers are checked
against an independent one."""

from __future__ import annotations

from pathlib import Path

from conftest import building

from alpha.mcp.tools import Tools, provenance_of, provenance_words
from alpha.runtime import build, check, claude_cli
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.runtime.turn import RULES
from alpha.world.world import World

FIELDS = [{"name": "item", "kind": "text"}, {"name": "kcal", "kind": "number", "unit": "kcal"},
          {"name": "protein", "kind": "number", "unit": "g"}]


def food_log(world: World) -> None:
    t = building(world)
    t.module_create("Nutrition")
    t.collection_create("food_log", "Food log", FIELDS, module="Nutrition")


def said(world: World, text: str) -> str:
    return world.journal.append("said", text, actor="person")


# ---- provenance ----


def test_the_rules_say_known_assumed_or_asked() -> None:
    assert "never guessed" in RULES and "Never pick silently" in RULES
    assert "what you assumed" in RULES and "source=" in RULES


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


# ---- the check ----


def test_independent_and_judging_runs_never_see_alpha(world: World) -> None:
    def req(kind: str = "turn") -> TurnRequest:
        return TurnRequest(sentence="s", system="x", world_path=world.path, turn_id="j1", kind=kind)
    independent = claude_cli.argv(req("independent"), Path("/tmp/mcp.json"))
    assert "--mcp-config" not in independent
    assert independent[independent.index("--allowedTools") + 1:][:2] == ["WebSearch", "WebFetch"]
    judge = claude_cli.argv(req("judge"), Path("/tmp/m.json"))
    assert "--allowedTools" not in judge and "--mcp-config" not in judge
    assert "WebSearch" in judge[judge.index("--disallowedTools") + 1:]
    ordinary = claude_cli.argv(req(), Path("/tmp/m.json"))
    assert "--mcp-config" in ordinary and "mcp__alpha" in ordinary


def test_only_turns_where_alpha_worked_values_out_are_checked(world: World) -> None:
    food_log(world)
    stated = said(world, "log 215 kcal of shake")
    Tools(world, turn=stated).records_add("food_log", {"item": "Shake", "kcal": 215},
                                          source="stated")
    world.journal.append("replied", "Logged.", data={"turn": stated})
    assert not check.worth_checking(world, stated)
    guessed = said(world, "i had a shake")
    Tools(world, turn=guessed).records_add("food_log", {"item": "Shake", "kcal": 160})
    assert not check.worth_checking(world, guessed)  # no reply yet
    world.journal.append("replied", "Logged, ~160 kcal (estimated).", data={"turn": guessed})
    assert check.worth_checking(world, guessed)


def test_the_judges_answer_is_read_however_it_is_wrapped() -> None:
    v = check.parse_verdict('Here:\n```json\n{"agree": false, "differences": ["kcal: Alpha 160,'
                            ' independent 215 (ocado.com)"], "unstated": []}\n```')
    assert not v["agree"] and v["differences"][0].startswith("kcal")
    v = check.parse_verdict('{"agree": true, "differences": ["x"], "unstated": []}')
    assert not v["agree"]  # a difference is a difference whatever the flag says
    v = check.parse_verdict("I think they agree.")
    assert v["agree"] and "note" in v


def test_a_wrong_answer_is_caught_and_alpha_corrects_itself(world: World) -> None:
    food_log(world)
    turn_id = said(world, "i had a for goodness shakes 35g protein shake")
    t = Tools(world, turn=turn_id)
    rec = t.records_add("food_log", {"item": "FGS shake", "kcal": 160, "protein": 35})
    world.journal.append("replied", "Logged: FGS shake, ~160 kcal (estimated).",
                         data={"turn": turn_id})
    runs: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        runs.append(req)
        if req.kind == "independent":
            assert "for goodness shakes" in req.sentence
            return RunResult(reply="Per 330 ml bottle: 215 kcal, 35 g protein (ocado.com).",
                             ok=True)
        if req.kind == "judge":
            assert "Alpha's answer" in req.sentence and "215 kcal" in req.sentence
            return RunResult(reply='{"agree": false, "differences": ["kcal: Alpha 160,'
                             ' independent 215 (ocado.com)"], "unstated": ["which size"]}',
                             ok=True)
        # The repair turn: Alpha corrects the record from the source and tells the person.
        assert "second opinion" in req.sentence.lower() and rec["id"] in req.sentence
        Tools(world, turn=req.turn_id).records_update(
            "food_log", rec["id"], {"kcal": 215}, rec["revision"], source="label on ocado.com",
            assumed="the 330 ml bottle")
        return RunResult(reply="Checked the label: 215 kcal, not 160 (ocado.com); corrected."
                         " I assumed the 330 ml bottle.", ok=True)

    result = check.check(world, turn_id, runner=runner)
    assert [r.kind for r in runs] == ["independent", "judge", "turn"]
    assert result["checked"] and not result["agree"]
    checked = world.journal.read(result["entry"])
    assert checked["kind"] == "checked" and checked["data"]["turn"] == turn_id
    assert checked["text"] == ("Checked against an independent answer: it differs on kcal:"
                               " Alpha 160, independent 215 (ocado.com). it would have asked"
                               " or said: which size.")
    fixed = world.collections.get("food_log", rec["id"])
    assert fixed["kcal"] == 215 and fixed["_provenance"]["source"] == "label on ocado.com"
    # The correction is in the person's conversation, as Alpha's words.
    stream = world.journal.recent(3, stream=True, kinds=["replied"])
    assert stream[-1]["text"].startswith("Checked the label: 215 kcal")
    assert result["repaired"] == stream[-1]["text"]


def test_an_agreeing_answer_leaves_things_alone(world: World) -> None:
    food_log(world)
    turn_id = said(world, "i had two boiled eggs")
    Tools(world, turn=turn_id).records_add("food_log", {"item": "Two eggs", "kcal": 155})
    world.journal.append("replied", "Logged two eggs, ~155 kcal (estimated).",
                         data={"turn": turn_id})
    kinds: list[str] = []

    def runner(req: TurnRequest) -> RunResult:
        kinds.append(req.kind)
        return RunResult(reply='{"agree": true, "differences": [], "unstated": []}'
                         if req.kind == "judge" else "About 155 kcal for two large eggs.",
                         ok=True)

    result = check.check(world, turn_id, runner=runner)
    assert kinds == ["independent", "judge"] and result["agree"] and result["repaired"] is None
    assert world.journal.recent(1)[0]["text"] == ("Checked against an independent answer:"
                                                  " it agrees.")


# ---- the build's trial ----


def test_a_finished_build_tries_the_first_thing_and_is_sent_back_when_wrong(world: World) -> None:
    plan = world.plans.propose("Nutrition tracker", "Food log with calories from labels.",
                               trial="log a for goodness shakes 35g protein shake")
    world.plans.approve(plan["id"], '"yes"')
    runs: list[TurnRequest] = []
    verdicts = iter(['{"agree": false, "differences": ["kcal: Alpha 160, independent 215'
                     ' (ocado.com)"], "unstated": []}',
                     '{"agree": true, "differences": [], "unstated": []}'])

    def runner(req: TurnRequest) -> RunResult:
        runs.append(req)
        t = Tools(world, turn=req.turn_id, thread=req.thread_id)
        if req.kind == "independent":
            return RunResult(reply="215 kcal per 330 ml bottle (ocado.com).", ok=True)
        if req.kind == "judge":
            return RunResult(reply=next(verdicts), ok=True)
        if req.sentence.startswith("Trial of the build"):
            assert "for goodness shakes" in req.sentence
            n = len([r for r in runs if r.sentence.startswith("Trial")])
            t.records_add("food_log", {"item": "FGS shake", "kcal": 160 if n == 1 else 215},
                          source="estimated" if n == 1 else "label on ocado.com")
            return RunResult(reply=f"Logged: FGS shake, {160 if n == 1 else 215} kcal.", ok=True)
        if req.sentence.startswith("Build the approved plan"):
            t.module_create("Nutrition")
            t.collection_create("food_log", "Food log", FIELDS, module="Nutrition")
            return RunResult(reply="Your food log is ready.", ok=True)
        assert req.sentence.startswith("Continue the build")
        assert "The trial" in req.system and "independent 215" in req.system
        return RunResult(reply="Values now come from the label.", ok=True)

    first = build.run_build(world, plan["id"], runner=runner)
    assert first["state"] == "building" and first["checks"] == 1
    assert world.collections.describe("food_log")["records"] == 0  # the trial's row is gone
    thread = world.journal.recent(50, thread=first["thread"])
    assert any(e["kind"] == "checked" for e in thread)
    assert any("Fix how this module obtains such values" in e["text"] for e in thread)
    assert world.journal.recent(5, stream=True, kinds=["replied"]) == []  # nothing told yet
    done = build.run_build(world, plan["id"], runner=runner)
    assert done["state"] == "done"
    report = world.journal.recent(1, stream=True, kinds=["replied"])[0]["text"]
    assert report.startswith("Values now come from the label.")
    assert 'Tried "log a for goodness shakes 35g protein shake" as you would: Logged: FGS' in report
    assert "it agrees." in report and "still differed" not in report
    assert world.collections.describe("food_log")["records"] == 0
    assert [r.kind for r in runs] == ["turn", "turn", "independent", "judge",
                                      "turn", "turn", "independent", "judge"]


def test_a_build_whose_trial_keeps_differing_says_so_and_stops_trying(world: World) -> None:
    plan = world.plans.propose("Tracker", "Plan.", trial="log a shake")
    world.plans.approve(plan["id"], '"yes"')

    def runner(req: TurnRequest) -> RunResult:
        if req.kind == "independent":
            return RunResult(reply="215 kcal (ocado.com).", ok=True)
        if req.kind == "judge":
            return RunResult(reply='{"agree": false, "differences": ["kcal: Alpha 160,'
                             ' independent 215 (ocado.com)"], "unstated": []}', ok=True)
        if req.sentence.startswith("Trial"):
            return RunResult(reply="Logged, 160 kcal.", ok=True)
        return RunResult(reply="Built.", ok=True)

    states = [build.run_build(world, plan["id"], runner=runner)["state"] for _ in range(3)]
    assert states == ["building", "building", "done"]
    report = world.plans.get(plan["id"])["report"]
    assert "it differs on kcal" in report and "still differed" in report
