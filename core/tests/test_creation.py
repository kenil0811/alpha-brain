"""Making a new project: the blank project, creation_show and its caps, the creation thread's own
pre-pack (so web research stays on under the taint rule), each stage end to end with a fake
model, failures and timeouts, and the project management around it (sub projects, chats, the
bell, the bug log, import by path)."""

from __future__ import annotations

import json
import time
from pathlib import Path
from typing import Any

from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.mcp.tools import OUTCOMES_OPEN, Tools
from alpha.runtime import turn as turns
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world import taint
from alpha.world.world import World

SEARCH = {"tool_name": "WebSearch", "tool_input": {"query": "canvas integrations for teachers"}}
QUESTIONS = [
    {"id": "role", "question": "Who is this for?", "why_it_matters": "Shapes every table",
     "options": ["A teacher", "A student", "A parent"]},
    {"id": "tools", "question": "What do you use today?",
     "options": ["Canvas", "Google Classroom", "A spreadsheet"]},
    {"id": "outcomes", "question": "What should it get you?",
     "options": ["Grades on time", "Fewer late papers", "Parents kept informed"]},
]
OPTIONS = [
    {"id": "book", "title": "A gradebook", "summary": "Keeps every grade and reads Canvas.",
     "why": "Everything in one place"},
    {"id": "late", "title": "Late work only", "summary": "Keeps late papers and nudges you.",
     "why": "Smallest first version"},
]
PLAN = "# Grades on time\n\nEvery grade in by Friday.\n\n## How you'll use it\n1. Open it\n"


def stage_runner(log: list[TurnRequest] | None = None, *, building_s: float = 0,
                 fail_at: str | None = None) -> Any:
    """A fake model that walks the creation process one step per message, the way
    CREATION_RULES asks: questions, then research and options, then the plan, then the
    build."""

    def run(req: TurnRequest) -> RunResult:
        if log is not None:
            log.append(req)
        world = World(req.world_path)
        try:
            t = Tools(world, turn=req.turn_id, thread=req.thread_id, module=req.module_id)
            stage = (world.modules.making(req.thread_id) or {}).get("creation", {}).get("stage")
            if fail_at == stage:
                return RunResult(reply="", ok=False,
                                 error="The model took longer than 900 s.")
            if stage == "new":
                t.creation_show("asking", questions=QUESTIONS, project_name="Grade Tracker",
                                project_icon="graduation-cap",
                                assumptions=[{"text": "Weekly", "source": "default"}])
                reply = "Questions and options are on the page."
            elif stage == "asking":
                t.creation_show("researching")
                assert taint.gate(world.store, req.turn_id, req.thread_id, SEARCH) is None
                t.creation_show("proposing", intro="I looked at how teachers grade.",
                                findings=["Teachers on Reddit grade on Sundays"],
                                options=OPTIONS, default="book",
                                evidence=[{"title": "r/Teachers", "url": "https://reddit.com/r/Teachers",
                                           "note": "Sunday grading", "kind": "community"}])
                reply = "Options are on the page."
            elif stage == "proposing":
                t.creation_show("planned", plan=PLAN)
                reply = "The plan is on the page."
            else:
                t.creation_show("building")
                t.collection_create("grades", "Grades", [
                    {"name": "student", "kind": "text"}, {"name": "score", "kind": "number"},
                    {"name": "due", "kind": "date"}], module=req.module_id)
                time.sleep(building_s)
                t.list_save("grades", "By due date", sort_by="due")
                t.creation_show("done")
                reply = "Grade Tracker is ready."
            return RunResult(reply=reply, ok=True, session_id=f"s-{req.thread_id}")
        finally:
            world.close()

    return run


def client(world: World, runner: Any) -> TestClient:
    return TestClient(create_app(world, live=False, runner=runner))


def wait(c: TestClient, turn: dict[str, Any]) -> dict[str, Any]:
    for _ in range(200):
        state: dict[str, Any] = c.get(f"/api/turns/{turn['id']}").json()
        if state["state"] != "running":
            return state
        time.sleep(0.02)
    raise AssertionError("the turn never finished")


def creation(c: TestClient, mid: str) -> dict[str, Any]:
    page: dict[str, Any] = c.get(f"/api/modules/{mid}").json()
    return page


# ---- creation_show ----


def making(world: World) -> tuple[dict[str, Any], Tools]:
    m = world.modules.create(world.modules.untitled())
    tid = world.modules.open_thread("Making it", "build", m["id"])["id"]
    world.modules.set_creation(m["id"], {"stage": "new", "thread": tid})
    return m, Tools(world, turn="j_x", thread=tid, module=m["id"])


def test_creation_show_checks_the_caps_and_names_the_untitled_project(world: World) -> None:
    m, t = making(world)
    assert m["name"] == "Untitled project"
    assert world.modules.untitled() == "Untitled project 2"
    five = [*QUESTIONS, *QUESTIONS[:2]]
    assert "needs 3 to 6" in t.creation_show("asking", questions=[
        {"id": "role", "question": "Who?", "options": ["A", "B"]}])["error"]
    out = t.creation_show("asking", questions=five, project_name="Grade  Tracker",
                          project_icon="not-an-icon")
    assert out["shown"] == "asking"
    m = world.modules.get(m["id"])
    assert (m["name"], m["icon"]) == ("Grade Tracker", "folder")
    shown = m["creation"]["questions"]
    assert len(shown) == 4  # at most four
    assert shown[2]["options"][-1] == OUTCOMES_OPEN  # the open outcome is always there
    # Named once: a later name doesn't rename what the person (or the first turn) named.
    t.creation_show("asking", questions=QUESTIONS, project_name="Something Else")
    assert world.modules.get(m["id"])["name"] == "Grade Tracker"

    assert "two or three" in t.creation_show("proposing", options=OPTIONS[:1])["error"]
    assert "three findings" in t.creation_show("proposing", options=OPTIONS,
                                               findings=["a", "b", "c", "d"])["error"]
    t.creation_show("proposing", intro="x", options=OPTIONS, default="nope")
    assert world.modules.get(m["id"])["creation"]["proposal"]["default"] == "book"

    assert "needs the plan" in t.creation_show("planned")["error"]
    t.creation_show("planned", plan=PLAN)
    note = world.knowledge.find_note("module:Grade Tracker", "Plan")
    assert note and note["body"] == PLAN
    t.creation_show("building")
    assert "can't go back" in t.creation_show("asking", questions=QUESTIONS)["error"]
    t.creation_show("done")
    assert "can't go back" in t.creation_show("building")["error"]


def test_creation_show_only_in_a_creation_thread_and_questions_never_go_home(
        world: World) -> None:
    assert "only for a project being made" in Tools(world, turn="j").creation_show(
        "asking", questions=QUESTIONS)["error"]
    _, t = making(world)
    assert "go on its page" in t.ask_person("Who is it for?")["error"]
    assert world.journal.open_asks() == []


# ---- research stays on: the creation thread's own pre-pack ----


def test_creation_research_runs_with_no_private_pre_pack(world: World) -> None:
    """The same sentence taints an ordinary turn (its pre-pack matches the person's records),
    but not a creation turn, whose pre-pack is the creation conversation alone; reading a
    private tool still taints the creation thread (the rule is not weakened)."""
    world.collections.create("grades", "Grades", [{"name": "student", "kind": "text"}])
    world.collections.add("grades", {"student": "Maya Chen failing algebra"}, {"by": "person"})
    world.knowledge.record_fact("person", "lives_in", "Pune", source="person", state="accepted")
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        return RunResult(reply="ok", ok=True)

    sentence = "a tracker for students failing algebra like Maya Chen"
    stream = turns.ask(world, sentence, runner=runner)
    assert taint.reason(world.store, stream.said, None) == "read the person's records"
    assert taint.gate(world.store, stream.said, None, SEARCH)

    m, _ = making(world)
    tid = world.modules.get(m["id"])["creation"]["thread"]
    made = turns.ask(world, sentence, thread=tid, runner=runner)
    assert taint.reason(world.store, made.said, tid) is None
    assert taint.gate(world.store, made.said, tid, SEARCH) is None
    system = seen[-1].system
    assert "THIS TURN IS MAKING A NEW PROJECT" in system and "CURRENT CREATION" in system
    assert "failing algebra like Maya Chen" in system  # their own words, in the conversation
    assert "Pune" not in system and "Maya Chen failing algebra" not in system  # nothing private
    assert "Project Untitled project" in system  # shapes and counts do

    Tools(world, turn=made.said, thread=tid).records_query("grades")
    assert taint.gate(world.store, made.said, tid, SEARCH)  # reading still switches it off


# ---- every stage, end to end, through the API ----


def test_new_project_walks_every_stage_on_its_page(world: World) -> None:
    log: list[TurnRequest] = []
    c = client(world, stage_runner(log))
    blank = c.post("/api/modules", json={}).json()
    assert blank["name"] == "Untitled project" and blank["creation"]["stage"] == "new"
    tid = blank["creation"]["thread"]
    assert world.modules.thread(tid)["kind"] == "build"

    turn = c.post(f"/api/modules/{blank['id']}/creation/answer",
                  json={"text": "help me keep grades for my class"}).json()["turn"]
    assert wait(c, turn)["state"] == "done"
    page = creation(c, blank["id"])
    assert (page["name"], page["icon"]) == ("Grade Tracker", "graduation-cap")
    assert page["creation"]["stage"] == "asking" and len(page["creation"]["questions"]) == 3
    assert world.modules.thread(tid)["state"] == "waiting"
    replied = world.journal.recent(1, thread=tid, kinds=["replied"])[0]
    assert replied["data"]["creation_stage"] == "asking"  # the chat shows only a pointer

    turn = c.post(f"/api/modules/{blank['id']}/creation/answer", json={
        "answers": {"role": "A teacher", "tools": "Canvas; A spreadsheet"}}).json()["turn"]
    assert wait(c, turn)["state"] == "done"
    said = world.journal.recent(1, thread=tid, kinds=["said"])[0]["text"]
    assert said == "Who is this for? A teacher\nWhat do you use today? Canvas; A spreadsheet"
    proposal = creation(c, blank["id"])["creation"]["proposal"]
    assert proposal["default"] == "book" and len(proposal["evidence"]) == 1

    turn = c.post(f"/api/modules/{blank['id']}/creation/answer",
                  json={"choice": "late"}).json()["turn"]
    assert wait(c, turn)["state"] == "done"
    assert world.journal.recent(1, thread=tid, kinds=["said"])[0]["text"] == (
        'Go with "Late work only": Keeps late papers and nudges you.')
    page = creation(c, blank["id"])
    assert page["creation"]["stage"] == "planned" and page["plan"]["body"] == PLAN

    turn = c.post(f"/api/modules/{blank['id']}/creation/answer", json={"build": True}).json()
    assert wait(c, turn["turn"])["state"] == "done"
    page = creation(c, blank["id"])
    assert page["creation"]["stage"] == "done" and [t["name"] for t in page["tables"]] == ["grades"]
    assert world.modules.thread(tid)["state"] == "done"
    assert c.post(f"/api/modules/{blank['id']}/creation/answer",
                  json={"build": True}).status_code == 400
    # Every creation turn ran without the person's world: research was never switched off.
    assert all("CURRENT CREATION" in r.system for r in log)
    assert [taint.reason(world.store, r.turn_id, tid) for r in log] == [None] * 4


def test_defaults_and_the_persons_own_words_name_it(world: World) -> None:
    def quiet(req: TurnRequest) -> RunResult:
        return RunResult(reply="On the page.", ok=True)

    c = client(world, quiet)
    blank = c.post("/api/modules", json={}).json()
    wait(c, c.post(f"/api/modules/{blank['id']}/creation/answer",
                   json={"text": "I want to track my reading list"}).json()["turn"])
    assert creation(c, blank["id"])["name"] == "Reading List"
    wait(c, c.post(f"/api/modules/{blank['id']}/creation/answer",
                   json={"use_defaults": True}).json()["turn"])
    assert world.journal.recent(1, kinds=["said"])[0]["text"].startswith(
        "Use your defaults for anything still open")


def test_a_build_that_runs_out_of_time_keeps_what_is_made_and_carries_on(world: World) -> None:
    c = client(world, stage_runner(fail_at="building"))
    blank = c.post("/api/modules", json={}).json()
    mid = blank["id"]
    for body in ({"text": "grades for my class"}, {"answers": {"role": "A teacher"}},
                 {"choice": "book"}):
        wait(c, c.post(f"/api/modules/{mid}/creation/answer", json=body).json()["turn"])
    world.modules.set_creation(mid, {"stage": "building"})
    assert wait(c, c.post(f"/api/modules/{mid}/creation/answer",
                          json={"build": True}).json()["turn"])["state"] == "failed"
    page = creation(c, mid)["creation"]
    assert page["timed_out"] and page["error"] == turns.STOPPED_BY_TIME
    assert "the model didn't answer" in (Path(world.path).parent / "bugs.md").read_text()
    c.post(f"/api/modules/{mid}/creation/answer", json={"carry_on": True})
    assert world.journal.recent(1, kinds=["said"])[0]["text"].startswith("Carry on building")


def test_a_failed_turn_says_why_and_try_again_resends_the_same_words(world: World) -> None:
    def down(req: TurnRequest) -> RunResult:
        return RunResult(reply="", ok=False, error="Claude Code isn't on this Mac yet")

    c = client(world, down)
    mid = c.post("/api/modules", json={}).json()["id"]
    wait(c, c.post(f"/api/modules/{mid}/creation/answer",
                   json={"text": "a reading list"}).json()["turn"])
    assert creation(c, mid)["creation"]["error"] == "Alpha could not reach its model service"
    wait(c, c.post(f"/api/modules/{mid}/creation/answer", json={"retry": True}).json()["turn"])
    assert [e["text"] for e in world.journal.recent(5, kinds=["said"])] == ["a reading list"] * 2
    fresh = c.post(f"/api/modules/{mid}/creation/answer", json={"start_over": True}).json()
    assert fresh["module"]["creation"]["stage"] == "new"
    assert "error" not in fresh["module"]["creation"]


def test_a_restart_while_thinking_is_said_on_the_page(world: World) -> None:
    m, _ = making(world)
    tid = world.modules.get(m["id"])["creation"]["thread"]
    world.modules.update_thread(tid, state="working")
    c = client(world, stage_runner())
    assert creation(c, m["id"])["creation"]["error"] == turns.RESTARTED


# ---- project management ----


def test_sub_projects_are_one_level_and_come_back_when_the_parent_goes(world: World) -> None:
    c = client(world, stage_runner())
    school = world.modules.create("School")["id"]
    grades = world.modules.create("Grades")["id"]
    books = world.modules.create("Books")["id"]
    assert c.patch(f"/api/modules/{grades}", json={"project": school}).json()["project"] == school
    assert "sub project already" in c.patch(f"/api/modules/{books}",
                                            json={"project": grades}).json()["error"]
    assert "sub projects of its own" in c.patch(f"/api/modules/{school}",
                                                json={"project": books}).json()["error"]
    itself = c.patch(f"/api/modules/{books}", json={"project": books}).json()
    assert "under itself" in itself["error"]
    assert [s["name"] for s in creation(c, school)["sub_projects"]] == ["Grades"]
    assert c.patch(f"/api/modules/{grades}", json={"goal": "  Pass  "}).json()["project"] == school
    assert world.modules.get(grades)["goal"] == "Pass"
    out = Tools(world, turn="j").module_update("Books", project="School")
    assert out["project"] == school
    assert Tools(world, turn="j").module_update("Books", top_level=True)["project"] is None
    assert c.delete(f"/api/modules/{school}").json()["sub_projects"] == 1
    assert world.modules.get(grades)["project"] is None


def test_chats_are_topic_threads_per_place_with_archive(world: World) -> None:
    def runner(req: TurnRequest) -> RunResult:
        return RunResult(reply="Sure.", ok=True, session_id="s1")

    c = client(world, runner)
    mid = world.modules.create("Food")["id"]
    chat = c.post("/api/threads", json={"title": "x" * 90, "module": mid}).json()
    assert chat["kind"] == "topic" and len(chat["title"]) == 60
    wait(c, c.post("/api/ask", json={"text": "how am I doing", "thread": chat["id"]}).json())
    listed = c.get(f"/api/threads?module={mid}").json()
    assert [(t["id"], t["turns"], t["state"]) for t in listed] == [(chat["id"], 1, "open")]
    assert c.get("/api/threads").json() == []  # the global place has its own
    assert creation(c, mid)["sessions"][0]["id"] == chat["id"]
    c.patch(f"/api/threads/{chat['id']}", json={"state": "done"})
    assert c.get(f"/api/threads?module={mid}").json() == []
    assert len(c.get(f"/api/threads?module={mid}&include_done=true").json()) == 1


def test_the_bell_counts_what_needs_you_and_failed_runs(world: World) -> None:
    c = client(world, stage_runner())
    Tools(world, turn="j").propose("A weekly summary", "You asked twice")
    auto = world.automations.create("Read the board", "daily 08:00", "reader_run")
    world.automations.finished(auto["id"], result=None, error="the site said no")
    seen = c.get("/api/attention").json()
    assert seen["count"] == 2 and seen["failed"][0]["title"] == "Read the board"


def test_import_by_path_checks_the_file(world: World, tmp_path: Path) -> None:
    c = client(world, stage_runner())
    world.modules.create("Trips")
    bundle = c.get("/api/modules/Trips/export").json()
    good = tmp_path / "Trips.alphaproject"
    good.write_text(json.dumps(bundle))
    assert c.post("/api/modules/import", json={"path": str(good)}).json()["name"] == "Trips 2"
    bad = tmp_path / "notes.txt"
    bad.write_text("{}")
    assert "isn't a project file" in c.post("/api/modules/import",
                                            json={"path": str(bad)}).json()["error"]


def test_the_bug_log_counts_and_fixes(world: World) -> None:
    from alpha.bugs import bug_log

    log = bug_log(world)
    log.record("model", "the model didn't answer", "timeout")
    log.record("model", "the model didn't answer")
    text = log.read() or ""
    assert "seen 2 times" in text and "## Open" in text
    log.resolve("model", "the model didn't answer")
    assert (log.read() or "").split("## Fixed")[1].count("the model didn't answer") == 1
    assert client(world, stage_runner()).get("/api/bugs").json()["text"] == log.read()



def test_a_project_page_makes_lasting_things_only_after_build_is_pressed(world: World) -> None:
    seen: list[Any] = []

    def runner(req: TurnRequest) -> RunResult:
        t = Tools(world, turn=req.turn_id, thread=req.thread_id, module=req.module_id)
        seen.append(t.collection_create("grades", "Grades", [{"name": "student", "kind": "text"}]))
        return RunResult(reply="ok", ok=True)

    c = client(world, runner)
    blank = c.post("/api/modules", json={}).json()
    turn = c.post(f"/api/modules/{blank['id']}/creation/answer",
                  json={"text": "keep grades"}).json()["turn"]
    wait(c, turn)
    assert "error" in seen[-1]  # the model can't build on its own say-so
    turn = c.post(f"/api/modules/{blank['id']}/creation/answer",
                  json={"build": True}).json()["turn"]
    wait(c, turn)
    assert "error" not in seen[-1] and world.collections.describe("grades")
