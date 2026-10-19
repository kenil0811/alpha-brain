from __future__ import annotations

import re

from alpha.context import prepack
from alpha.runtime.running import RunResult, TurnRequest
from alpha.runtime.turn import ask, timings
from alpha.world.world import World


def test_a_turn_journals_both_sides_and_carries_the_world(world: World) -> None:
    world.modules.create("Food")
    world.collections.create("food_log", "Food log", [{"name": "food", "kind": "text"}],
                             module=world.modules.get("Food")["id"])
    world.collections.add("food_log", {"food": "Two boiled eggs"}, {"by": "alpha"})
    home = world.modules.home_thread()["id"]  # a sentence with no item of its own is Home's
    world.journal.append("said", "log two boiled eggs", actor="person", thread=home)
    world.journal.append("replied", "Logged two boiled eggs in Food.", thread=home)
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        return RunResult(reply="You've had two boiled eggs today.", ok=True, session_id="s1",
                         num_turns=3, duration_ms=4200)

    out = ask(world, "how many eggs have I eaten", runner=runner)
    assert out.ok and out.reply.startswith("You've had")
    # the world rides on the sentence, never in the system prompt (B, Q99); the conversation is
    # the session's, not a copy
    system, start, layer = seen[0].system, seen[0].start_layer, seen[0].turn_layer
    assert "Module Food" not in system and "MATCHES" not in system
    assert "Module Food" in start and "food_log (1 row)" in start
    assert "MATCHES FOR THIS SENTENCE" in layer and "Two boiled [eggs]" in layer
    assert "THIS CONVERSATION" not in start + layer
    assert seen[0].turn_id == out.said and seen[0].world_path == world.path
    replied = world.journal.read(out.replied)
    assert replied["kind"] == "replied" and replied["data"]["duration_ms"] == 4200


def test_a_failed_turn_is_journaled_plainly(world: World) -> None:
    out = ask(world, "hello", runner=lambda r: RunResult(reply="", ok=False, error="timed out"))
    assert not out.ok and "timed out" in out.reply
    assert world.journal.read(out.replied)["kind"] == "failed"


def test_what_the_model_saw_is_kept_with_dates(world: World) -> None:
    def runner(req: TurnRequest) -> RunResult:
        return RunResult(reply="Noted.", ok=True)

    ask(world, "log two boiled eggs", runner=runner)
    out = ask(world, "how many boiled eggs", runner=runner)
    kept = world.journal.context(out.said)
    assert kept is not None and "MATCHES FOR THIS SENTENCE" in kept["context"]
    line = next(x for x in kept["context"].splitlines() if "log two [boiled]" in x)
    assert re.match(r"- (Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} [A-Z][a-z]{2} \d\d:\d\d ", line)


def test_prepack_states_the_clock_and_emptiness(world: World) -> None:
    text = prepack.build(world, "anything")
    assert "Today's date is" in text and "created_at >=" in text
    assert "Nothing yet: no modules, no tables." in text
    assert "WORK ITEMS" in text and "- None open." in text


def test_the_prepack_lists_each_tables_fields_and_keeps_every_section_within_its_budget(
        world: World) -> None:
    """A data question is one query, not a describe and a query (3 Oct: every such turn paid
    the step); a long section says what it left out instead of the tail being cut blind."""
    from conftest import building

    t = building(world)
    module = t.module_create("Nutrition", "eat well")["id"]
    t.collection_create("food_log", "Food log", [
        {"name": "date", "kind": "date"}, {"name": "meal", "kind": "choice",
                                           "choices": ["Breakfast", "Lunch"]},
        {"name": "item", "kind": "text"}, {"name": "calories", "kind": "number", "unit": "kcal"},
        {"name": "client", "kind": "relation", "relation": "clients"}], module=module)
    text = prepack.build(world, "how much did I eat")
    assert "WHAT ALPHA HOLDS (each table with its fields: query it straight away)" in text
    assert ("  food_log (0 rows): date date, meal choice[Breakfast|Lunch], item,"
            " calories number kcal, client relation->clients") in text
    assert f"- Module Nutrition ({module}) — eat well" in text
    # A long conversation is the session's: neither layer carries a copy of it (B3).
    home = world.modules.home_thread()["id"]
    for i in range(12):
        world.journal.append("said", f"turn {i} " + "words " * 80, actor="person", thread=home)
        world.journal.append("replied", f"reply {i} " + "words " * 80, thread=home)
    assert "reply 11" not in prepack.build(world, "anything")
    # A world with a long index still fits: the start layer shrinks by section, never cut short.
    for i in range(300):
        world.knowledge.write_note(f"topic:t{i}", f"Topic {i}", "Body.", summary="s" * 120)
    start = prepack.start_layer(world)
    assert len(start) <= prepack.MAX_CHARS and "cut short" not in start
    assert "lines left out for room" in start[start.index("WHAT ALPHA KNOWS"):]


def test_turn_timings_are_measured_from_the_journal(world: World) -> None:
    def runner(req: TurnRequest) -> RunResult:
        return RunResult(reply="Done.", ok=True, duration_ms=1200, num_turns=3, session_id="s1")

    ask(world, "log two eggs", runner=runner)
    ask(world, "and a banana", runner=runner)
    rows = timings(world)
    assert [r["model_s"] for r in rows] == [1.2, 1.2] and [r["steps"] for r in rows] == [3, 3]
    assert [r["resumed"] for r in rows] == [False, True] and all(r["ok"] for r in rows)
    assert rows[0]["wall_s"] >= 0 and rows[0]["text"] == "log two eggs"


