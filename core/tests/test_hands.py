"""The hands (harness design §4, slice 2b): the tools the model sees, each over the operations
the code keeps. No model: the hands are called as the server would call them."""

from __future__ import annotations

from typing import Any

from alpha.mcp.tools import Tools
from alpha.world.store import Problem
from alpha.world.world import World


def hands(world: World) -> Tools:
    return Tools(world, turn="j_h")


def test_the_model_sees_the_hands_and_the_plan_mode_only(world: World) -> None:
    names = sorted(f.__name__ for f in hands(world).all())
    assert names == ["act_outward", "agent_keep", "ask_person", "browser_read", "browser_script",
                     "connect", "page_keep", "skill_find", "skill_keep", "skill_run", "tell_person",
                     "workflow_agree", "workflow_decline", "workflow_draft", "workflow_revise",
                     "world_change", "world_file", "world_query", "world_remember",
                     "world_search", "world_shape", "world_write"]
    ops = {f.__name__ for f in hands(world).operations()}
    assert {"records_add", "reader_save", "agent_create", "collection_create"} <= ops


def test_shape_write_query_change_round_trip(world: World) -> None:
    h = hands(world)
    made = h.world_shape(table="food_log", title="Food log", module="Food", goal="what I eat",
                         fields=[{"name": "food", "kind": "text"},
                                 {"name": "calories", "kind": "number", "unit": "kcal"}])
    assert made["table"]["name"] == "food_log" and world.modules.get("Food")
    written = h.world_write("food_log", [{"food": "eggs", "calories": 144},
                                         {"food": "toast", "calories": 80}], source="estimated",
                            assumed="two large eggs")
    assert written["count"] == 2
    q = h.world_query("SELECT food, calories FROM rows_food_log ORDER BY calories")
    assert [r["food"] for r in q["rows"]] == ["toast", "eggs"]
    assert q["columns"] == ["food", "calories"]
    total = h.world_query("SELECT SUM(calories) AS kcal FROM rows_food_log")["rows"][0]["kcal"]
    assert total == 224
    row = h.world_query("SELECT id, revision FROM rows_food_log WHERE food = 'eggs'")["rows"][0]
    changed = h.world_change("food_log", row["id"], row["revision"], {"calories": 150},
                             source="stated")
    assert changed["calories"] == 150
    # the world's own things are views too, and a write is refused by the database
    assert "food_log" in [r["name"] for r in h.world_query("SELECT name FROM tables")["rows"]]
    bad = h.world_query("DELETE FROM records")
    assert "cannot change the world" in bad["error"]
    wrong = h.world_query("SELECT no_such_column FROM rows_food_log")
    assert "The views:" in wrong["error"] and "rows_food_log(" in wrong["error"]
    removed = h.world_change("food_log", row["id"], changed["revision"], remove=True)
    assert "error" not in removed
    assert h.world_query("SELECT COUNT(*) AS n FROM rows_food_log")["rows"][0]["n"] == 1


def test_a_query_is_cut_at_the_limit_and_says_so(world: World) -> None:
    h = hands(world)
    h.world_shape(table="things", title="Things", fields=[{"name": "n", "kind": "number"}])
    h.world_write("things", [{"n": i} for i in range(12)], source="stated")
    out = h.world_query("SELECT n FROM rows_things", limit=5)
    assert out["count"] == 5 and "only the first 5 rows" in out["cut"]


def test_shape_adds_fields_identifies_people_and_keeps_a_list(world: World) -> None:
    h = hands(world)
    h.world_shape(table="contacts", title="Contacts",
                  fields=[{"name": "name", "kind": "text"}, {"name": "email", "kind": "text"}])
    out = h.world_shape(table="contacts", fields=[{"name": "company", "kind": "text"}],
                        rows_are="person", identity_field="email",
                        saved_list={"title": "Everyone", "columns": ["name", "email"]})
    assert out["fields_added"] and out["identified"] and out["saved_list"]
    assert "company" in [f["name"] for f in world.collections.describe("contacts")["fields"]]
    # a module alone
    made = h.world_shape(module="Work", goal="my job search")
    assert made["name"] == "Work" if "name" in made else made.get("module")
    assert h.world_shape(module="Work")["note"] == "It exists already."
    assert "does not exist yet" in h.world_shape(table="nothing")["error"]


def test_remember_keeps_facts_people_goals_notes_and_instructions(world: World) -> None:
    h = hands(world)
    assert "error" not in h.world_remember("fact", predicate="weight_kg", value="63", stated=True)
    assert world.knowledge.facts("person")[0]["predicate"] == "weight_kg"
    who = h.world_remember("person", name="Vikas Rao", keys={"email": "vikas@example.com"})
    assert who["kind"] == "person"
    found = h.world_search("", who="Vikas")
    assert found["people"] and found["people"][0]["name"] == "Vikas Rao"
    goal = h.world_remember("goal", text="80 g of protein a day")
    assert goal["state"] == "active"
    assert h.world_remember("goal", id=goal["id"], state="done")["state"] == "done"
    note = h.world_remember("note", scope="topic:eggs", title="Eggs", body="Boil for 7 minutes.")
    assert note["title"] == "Eggs"
    kept = h.world_remember("instruction", text="always log food in grams",
                            quote="always log food in grams")
    assert "error" in kept  # the quote must be the person's own words in this turn
    assert "kind is one of" in h.world_remember("thing")["error"]
    src = h.world_remember("source", title="Brokers", url="https://b.test", status="blocked",
                           detail="a bot check")
    assert src["status"] == "blocked"


def test_tell_person_notes_and_proposes(world: World) -> None:
    h = hands(world)
    noted = h.tell_person("Checked the label on ocado.com.")
    assert "error" not in noted
    assert world.journal.recent(1, kinds=["did"])[0]["text"] == "Checked the label on ocado.com."
    out = h.tell_person("Set a protein target of 80 g?", kind="proposal",
                        why="you asked twice this week")
    assert out["proposed"]
    why = world.journal.recent(1, kinds=["proposed"])[0]["data"]["why"]
    assert why == "you asked twice this week"


def test_skill_keep_and_agent_keep_refuse_what_is_missing(world: World) -> None:
    h = hands(world)
    assert "needs url and script" in h.skill_keep("x", "read", "Reads x")["error"]
    assert "needs url, steps and effect" in h.skill_keep("x", "act", "Does x")["error"]
    assert "kind is read or act" in h.skill_keep("x", "run", "Runs x")["error"]
    assert "needs title and schedule" in h.agent_keep(title="Weekly")["error"]
    assert "to propose" in h.act_outward(title="Send it")["error"]
    assert "decision is yes or no" in h.act_outward(action="a_1")["error"]
    teleport: Any = h.connect("teleport")
    assert "what is one of" in teleport["error"]
    burn: Any = h.world_file("burn")
    assert "action is one of" in burn["error"]
    assert "rows is empty" in h.world_write("t", [], source="stated")["error"]


def test_agent_keep_makes_a_pipeline_and_changes_it(world: World) -> None:
    h = hands(world)
    h.world_shape(table="jobs", title="Jobs", fields=[{"name": "title", "kind": "text"},
                                                        {"name": "url", "kind": "url"}])
    world.readers.save("jobs_site", site="j.test", url="https://j.test", script="return []",
                       description="Reads jobs", to_end=False, count=3)
    made = h.agent_keep(title="Every morning, check jobs", schedule="daily 08:30",
                        steps=[{"read": "jobs_site", "into": "jobs", "key": "url"},
                               {"tell": "jobs"}])
    assert made["schedule"] == "daily 08:30" and made["steps"][0]["read"] == "jobs_site"
    paused = h.agent_keep(id=made["id"], state="paused")
    assert paused["state"] == "paused"
    custom = h.world_query("SELECT name FROM agents WHERE kind = 'custom'")["rows"]
    assert [a["name"] for a in custom]


def test_skill_find_lists_and_reads(world: World) -> None:
    h = hands(world)
    world.readers.save("jobs_site", site="j.test", url="https://j.test", script="return []",
                       description="Reads jobs", to_end=False, count=3,
                       when_to_use="the job board")
    found: Any = h.skill_find(site="j.test")
    assert [f["name"] for f in found] == ["jobs_site"] and "script" not in found[0]
    one = h.skill_find(name="jobs_site")
    assert one["script"] == "return []" and one["form"] == "by script"


def test_connect_lists_what_alpha_reaches(world: World) -> None:
    out = hands(world).connect()
    assert isinstance(out, list)


def test_a_problem_in_an_operation_comes_back_in_words(world: World) -> None:
    h = hands(world)
    try:
        out = h.world_change("nothing", "r_1", 1, {"a": 1})
    except Problem:  # the hands never raise: the model reads the words
        raise AssertionError("a hand raised instead of answering in words") from None
    assert "error" in out


def test_several_rows_are_removed_in_one_call_with_one_journal_line(world: World) -> None:
    t = hands(world)
    t.world_shape(table="jobs", title="Job listings", fields=[{"name": "title", "kind": "text"}])
    t.world_write("jobs", [{"title": f"Role {i}"} for i in range(4)], source="test")
    ids = [r["id"] for r in world.collections.query("jobs")]
    out = t.world_change("jobs", ids=ids[:3] + ["r_gone"], remove=True)
    assert out["removed"] == ids[:3] and out["missing"] == ["r_gone"]
    assert len(world.collections.query("jobs")) == 1
    line = world.journal.recent(1, kinds=["changed"])[-1]
    assert line["text"].startswith("Removed 3 rows from Job listings: Role")
    assert line["data"]["records"] == ids[:3]
    assert "error" in t.world_change("jobs", ids=ids[3:], remove=False)
    assert "error" in t.world_change("jobs")


def test_a_site_signed_in_already_answers_so_and_opens_no_window(world: World) -> None:
    """18 Oct: a resumed session believed Gmail unconnected and asked the person to sign in
    again; the hand knows what is held and says so instead of opening a window."""
    from alpha.connectors.base import Connections

    Connections(world.store).upsert("browser", "gmail.com", status="connected")
    out = hands(world).connect(what="site", target="gmail.com")
    assert out["status"] == "connected" and out["note"].startswith("gmail.com is signed in already")
    assert "error" not in hands(world).connect(what="list")
