"""Known, assumed or asked: values carry where they came from, and Alpha's answers are checked
against an independent one."""

from __future__ import annotations

from pathlib import Path

from conftest import building

from alpha import config
from alpha.mcp.tools import Tools, provenance_of, provenance_words
from alpha.runtime import check, claude_cli
from alpha.runtime.claude_cli import RunResult, TurnRequest
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


# ---- the check ----


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


def test_only_turns_where_alpha_worked_values_out_are_checked(world: World) -> None:
    food_log(world)
    stated = said(world, "log 215 kcal of shake")
    Tools(world, turn=stated).records_add("food_log", {"item": "Shake", "kcal": 215},
                                          source="stated")
    world.journal.append("replied", "Logged.", data={"turn": stated})
    assert not check.worth_checking(world, stated)
    guessed = said(world, "i had a shake")
    Tools(world, turn=guessed).records_add("food_log", {"item": "Shake", "kcal": 160},
                                           source="estimated")
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
    rec = t.records_add("food_log", {"item": "FGS shake", "kcal": 160, "protein": 35},
                        source="estimated")
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
    Tools(world, turn=turn_id).records_add("food_log", {"item": "Two eggs", "kcal": 155},
                                           source="estimated")
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
