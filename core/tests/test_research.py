"""The research pass before a build (Q37): a plan only out of a pass; a look whose findings
are resolved by code; pieces that may only cite what was read; the decisions carried into the
brief and the leftovers onto the module's page; the pass run to its end, stopped, or failed
with a line in the conversation; the scheduler and the journey suite picking passes up."""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from conftest import PIECES, building, researching
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.journeys import suite
from alpha.mcp.tools import Tools
from alpha.runtime import build, route
from alpha.runtime import research as research_runtime
from alpha.runtime.automation import Scheduler
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world import purge
from alpha.world.plans import decided_words, not_this_time
from alpha.world.research import clean_findings
from alpha.world.store import Problem
from alpha.world.world import World

JOB = "For me, to pick which sites to pursue; today by hand; no scorecard exists."
LOOK_REPLY = json.dumps({"findings": [
    {"claim": "GrowthFactor scores sites 0-100", "quote": "a 0–100 score",
     "url": "https://growthfactor.ai/tour", "title": "GrowthFactor"},
    {"claim": "A page that is gone", "url": "https://example.com/missing", "title": "Gone"},
    {"claim": "A claim with no page"},
    {"claim": "", "url": "https://example.com/empty"}],
    "gaps": ["foot traffic"]})


def said(world: World, text: str) -> str:
    return world.journal.append("said", text, actor="person")


# ---- the gate and the start ----


def test_a_plan_comes_only_out_of_a_research_pass(world: World) -> None:
    t = Tools(world, turn=said(world, "build me a site scorer"))
    out = t.plan_propose("Scorer", "Plan.", "score a site", pieces=PIECES)
    assert "research_start" in out["error"] and world.plans.all() == []
    assert "research pass" in t.research_look("products", "what do they have")["error"]
    assert "job" in t.research_start("Scorer", "build me a site scorer", "")["error"]
    started = t.research_start("Scorer", "build me a site scorer", JOB)
    rs = world.research.get(started["research"])
    assert rs["state"] == "waiting" and rs["job"] == JOB and rs["turn"] == t.turn
    assert rs["conversation"] is None  # the stream asked, not a conversation
    assert [e["text"] for e in world.journal.recent(1)] == [
        "Looking into how this is done: Scorer."]
    assert [r["id"] for r in world.research.waiting()] == [rs["id"]]


def test_a_pass_started_in_a_conversation_remembers_it_and_not_from_a_build(world: World) -> None:
    chat = world.modules.open_thread("New conversation", "chat", None)
    t = Tools(world, turn=said(world, "track x"), thread=chat["id"])
    out = t.research_start("Tracker", "track x", JOB)
    assert world.research.get(out["research"])["conversation"] == chat["id"]
    assert "conversation" in building(world).research_start("T", "ask", JOB)["error"]
    assert "conversation" in researching(world).research_start("T", "ask", JOB)["error"]


# ---- a look ----


def test_a_look_keeps_findings_and_resolves_their_pages_by_code(world: World) -> None:
    t = researching(world, turn="j_1")
    rs = world.research.of_thread(t.thread)
    assert rs is not None
    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        return RunResult(ok=True, reply=f"Here you are:\n{LOOK_REPLY}", duration_ms=1200)

    out = research_runtime.look(world, rs["id"], "products", "what do they have",
                                runner=runner, fetch=lambda url: url.endswith("/tour"))
    assert seen[0].kind == "independent" and "The angle: products" in seen[0].sentence
    assert [(f["claim"], f["resolved"]) for f in out["findings"]] == [
        ("GrowthFactor scores sites 0-100", True), ("A page that is gone", False),
        ("A claim with no page", False)]
    assert out["gaps"] == ["foot traffic"]
    kept = {f["claim"]: f["resolved"] for f in world.research.findings(rs["id"])}
    assert kept["GrowthFactor scores sites 0-100"] == 1 and kept["A page that is gone"] == 0
    assert kept["A claim with no page"] is None  # no page: about the person's world
    citable = world.research.citable(rs["id"])
    ids = {f["claim"]: f["id"] for f in out["findings"]}
    assert ids["GrowthFactor scores sites 0-100"] in citable
    assert ids["A claim with no page"] in citable and ids["A page that is gone"] not in citable
    line = world.journal.recent(1, thread=t.thread)[0]
    assert line["text"] == "Looked at products: 3 findings from 2 pages, 1 answered."
    assert line["data"]["gaps"] == ["foot traffic"]
    assert world.research.get(rs["id"])["model_ms"] == 1200
    with pytest.raises(Problem):  # a look that doesn't come back is a problem, not findings
        research_runtime.look(world, rs["id"], "x", "y", fetch=lambda u: True,
                              runner=lambda req: RunResult(ok=False, reply="", error="down"))


def test_clean_findings_and_the_fetch_rules(monkeypatch: pytest.MonkeyPatch) -> None:
    assert clean_findings([{"claim": " a  b ", "url": "ftp://x"}, {"claim": ""}, "no"]) == [
        {"claim": "a b", "quote": None, "url": None, "title": None}]
    assert research_runtime.parse_look("not json")["findings"] == []

    def raising(code: int) -> Any:
        def open_(*a: Any, **k: Any) -> Any:
            raise urllib.error.HTTPError("https://x", code, "x", None, None)  # type: ignore[arg-type]
        return open_

    monkeypatch.setattr(urllib.request, "urlopen", raising(404))
    assert research_runtime._fetch("https://x/gone") is False
    monkeypatch.setattr(urllib.request, "urlopen", raising(403))
    assert research_runtime._fetch("https://x/refuses-bots") is True  # the page exists

    def failing(*a: Any, **k: Any) -> Any:
        raise urllib.error.URLError("no route")

    monkeypatch.setattr(urllib.request, "urlopen", failing)
    assert research_runtime._fetch("https://x/unreachable") is False
    assert research_runtime.resolve_urls(["https://a", "https://a", ""],
                                         fetch=lambda u: True) == {"https://a": True}


# ---- pieces ----


def test_pieces_may_only_cite_what_was_read(world: World) -> None:
    t = researching(world, turn="j_1")
    base = ("P", "Body.", "score a site")
    assert "not a finding" in t.plan_propose(*base, pieces=[
        {"title": "Map", "what": "A map.", "evidence": ["f_nope"]}])["error"]
    assert "no evidence" in t.plan_propose(*base, pieces=[{"title": "Map",
                                                           "what": "A map."}])["error"]
    assert "kind 'maybe'" in t.plan_propose(*base, pieces=[
        {"title": "Map", "what": "A map.", "evidence": ["f_ok"], "kind": "maybe"}])["error"]
    assert "pieces" in t.plan_propose(*base)["error"]
    assert world.plans.all() == []
    pieces: list[dict[str, Any]] = [
        {"title": "Sites list", "what": "Every candidate, one row.", "evidence": ["f_ok"],
         "kind": "kept", "build": "One table.", "id": "Sites List"},
        {"title": "Gates", "what": "A site fails on one miss.", "known": "the Deal Tracker",
         "kind": "choice", "can": "not yet", "needs": "a score over rows",
         "recommend": "defer", "why": "operators kill sites, they don't average them"},
        {"title": "Foot traffic", "what": "Visits per day.", "evidence": ["f_ok"],
         "kind": "wont", "needs": "paid data"}]
    out = t.plan_propose(*base, pieces=pieces)
    plan = world.plans.get(out["plan"])
    p = plan["pieces"]
    assert out["pieces"] == ["sites_list", "piece_2", "piece_3"]
    assert p[0]["recommend"] == "keep" and p[0]["decision"] is None
    assert p[1]["can"] == "not_yet" and p[1]["recommend"] == "defer" and p[1]["evidence"] == []
    assert p[2]["recommend"] == "skip"
    rs = world.research.of_thread(t.thread)
    assert rs is not None and plan["research"] == rs["id"]
    assert world.research.get(rs["id"])["plan"] == plan["id"]
    proposed = world.journal.recent(1, kinds=["proposed"])[0]
    assert proposed["data"]["research"] == rs["id"] and proposed["thread"] is None


def test_decisions_go_into_the_brief_and_the_leftovers_onto_the_page(world: World) -> None:
    module = world.modules.create("Scorer")
    t = researching(world, turn="j_1", module=module["id"])
    pieces: list[dict[str, Any]] = [
        {"title": "Sites list", "what": "Every candidate.", "evidence": ["f_ok"], "kind": "kept",
         "build": "One table."},
        {"title": "Gates", "what": "A site fails on one miss.", "known": "their process",
         "kind": "choice", "can": "not_yet", "needs": "a score over rows", "recommend": "defer"},
        {"title": "Foot traffic", "what": "Visits per day.", "evidence": ["f_ok"], "kind": "wont",
         "why": "it tells you the real catchment"}]
    pid = t.plan_propose("Scorer", "Body.", "score a site", pieces=pieces, questions=[
        {"text": "Miles or km?", "options": ["Miles", "Km"], "default": "Miles"}])["plan"]
    with pytest.raises(Problem):
        world.plans.decide_pieces(pid, {"nope": "keep"})
    with pytest.raises(Problem):
        world.plans.decide_pieces(pid, {"piece_2": "maybe"})
    plan = world.plans.decide_pieces(pid, {"piece_2": "keep"})
    words = decided_words(plan)
    assert "Build these:" in words and "Sites list — Every candidate. How: One table." in words
    assert "Gates — A site fails on one miss. Can't be built now (a score over rows)" in words
    assert "(their choice)" in words and "Skipped (not wanted):\n- Foot traffic" in words
    assert "Questions:\n1. Miles or km? — Miles (Alpha's pick; they didn't say)" in words
    assert "Decided before the build" in build.brief(plan)
    assert not_this_time(plan) == [
        "Skipped: Foot traffic — Visits per day. (why it would matter: it tells you the real"
        " catchment)"]
    world.plans.approve(pid, "yes")
    with pytest.raises(Problem):  # settled with the yes
        world.plans.decide_pieces(pid, {"piece_2": "skip"})
    assert "Skipped (not wanted)" in world.plans.get(pid)["approval"]
    thread = world.modules.open_thread("Build: Scorer", "build", module["id"])["id"]
    world.plans.set_module(pid, module["id"])  # as module_create does in the build
    build.not_this_time(world, world.plans.get(pid), thread)
    page = world.knowledge.find_note("module:Scorer", "Scorer")
    assert page and "## Not this time\n- Skipped: Foot traffic" in page["body"]
    assert world.journal.recent(1, thread=thread)[0]["text"].startswith(
        "Noted on the Scorer page what was left out this time: 1 piece.")


def test_the_app_approves_with_pieces_and_answers(world: World) -> None:
    t = researching(world, turn=said(world, "track it"))
    pid = t.plan_propose("Tracker", "Body.", "which are new", pieces=PIECES + [
        {"title": "A map", "what": "Dots.", "evidence": ["f_ok"], "kind": "choice"}],
        questions=[{"text": "Daily or weekly?", "options": ["Daily", "Weekly"],
                    "default": "Daily"}])["plan"]
    c = TestClient(create_app(world, live=False))
    item = c.get("/api/home").json()["needs_you"][0]
    assert [p["title"] for p in item["pieces"]] == ["A list", "A map"]
    # The card shows where each piece comes from: the findings' titles and pages.
    assert item["pieces"][0]["sources"] == [{"title": "Example", "url": "https://example.com/a"}]
    shown = c.get("/api/conversation").json()["plans"][0]
    assert shown["pieces"][1]["sources"] == [{"title": "Example", "url": "https://example.com/a"}]
    out = c.post(f"/api/plans/{pid}/approve",
                 json={"answers": {"0": "Weekly"}, "pieces": {"piece_2": "skip"}}).json()
    assert out["state"] == "approved" and out["pieces"][1]["decision"] == "skip"
    assert "Skipped (not wanted):\n- A map" in out["approval"] and "Weekly" in out["approval"]
    assert c.post("/api/plans/nope/approve").status_code == 400


# ---- the pass, end to end with a fake model ----


def lead_runner(world_path: Path, *, propose: bool = True) -> Callable[[TurnRequest], RunResult]:
    """A model that, as the lead, looks once and proposes a plan of pieces; as a look, returns
    findings; the independent and judge kinds as the check expects."""

    def runner(req: TurnRequest) -> RunResult:
        if req.kind == "independent":
            return RunResult(ok=True, reply=LOOK_REPLY, duration_ms=800)
        if req.kind == "judge":
            return RunResult(ok=True, reply='{"agree": true, "differences": [], "unstated": []}')
        w = World(world_path)
        try:
            t = Tools(w, turn=req.turn_id, thread=req.thread_id)
            look = t.research_look("what the products have", "what do they measure and show")
            assert "findings" in look, look
            if not propose:
                return RunResult(ok=True, reply="I looked, and that's all.", duration_ms=100)
            good = [f["id"] for f in look["findings"] if f["resolved"]]
            out = t.plan_propose(
                "Site Scorer", "## What you want\nA scorer.\n## What I looked at\nProducts.",
                "score 6900 N Lamar Blvd, Austin as an express tunnel", pieces=[
                    {"title": "Sites list", "what": "Every candidate.", "evidence": good,
                     "kind": "kept", "build": "One table."},
                    {"title": "Gates", "what": "One miss kills a site.", "evidence": good,
                     "kind": "choice", "can": "not_yet", "needs": "a score over rows",
                     "recommend": "defer", "why": "operators kill sites"},
                    {"title": "Foot traffic", "what": "Visits.", "evidence": good, "kind": "wont",
                     "needs": "paid data"}])
            assert "plan" in out, out
        finally:
            w.close()
        return RunResult(ok=True, reply="I looked at the products; the plan is on its card.",
                         duration_ms=3000)

    return runner


def test_a_pass_runs_its_looks_and_proposes_the_plan_in_the_conversation(
        world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(research_runtime, "FETCH", lambda url: url.endswith("/tour"))
    runner = lead_runner(world.path)
    monkeypatch.setattr(route, "run", runner)
    chat = world.modules.open_thread("New conversation", "chat", None)
    t = Tools(world, turn=said(world, "build me a site scorer"), thread=chat["id"])
    rid = t.research_start("Site Scorer", "build me a site scorer", JOB)["research"]
    done = research_runtime.run(world, rid, runner=runner)
    assert done["state"] == "done" and done["verdict"] == "partial"  # one page did not answer
    assert "1 findings dropped" in done["why"] and done["model_ms"] == 3800
    assert world.modules.thread(done["thread"])["state"] == "done"
    plan = world.plans.get(done["plan"])
    assert plan["state"] == "proposed" and [p["kind"] for p in plan["pieces"]] == [
        "kept", "choice", "wont"]
    assert "Looking into: Site Scorer" == world.modules.thread(done["thread"])["title"]
    in_chat = world.journal.recent(5, thread=chat["id"])
    assert [e["kind"] for e in in_chat][-2:] == ["proposed", "replied"]
    assert in_chat[-1]["text"] == "I looked at the products; the plan is on its card."
    assert in_chat[-1]["data"] == {"research": rid, "plan": plan["id"], "verdict": "partial"}
    page = world.knowledge.find_note("topic:site-scorer", "Site Scorer: what such things have")
    assert page and "## Table stakes\n- **Sites list**" in page["body"]
    assert "GrowthFactor (https://growthfactor.ai/tour)" in page["body"]
    assert "## Not this time\n- **Foot traffic**" in page["body"]
    assert "## Not found\n- foot traffic" in page["body"]
    assert world.research.waiting() == []
    # Once done, it is no longer a running pass: nothing more is looked at or proposed in it.
    later = Tools(world, thread=done["thread"])
    assert "research pass" in later.research_look("x", "y")["error"]
    assert "research_start" in later.plan_propose("P", "B.", "t t", pieces=PIECES)["error"]


def test_a_pass_that_never_proposes_fails_and_says_so(world: World,
                                                       monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(research_runtime, "FETCH", lambda url: True)
    runner = lead_runner(world.path, propose=False)
    monkeypatch.setattr(route, "run", runner)
    chat = world.modules.open_thread("New conversation", "chat", None)
    t = Tools(world, turn=said(world, "build me a site scorer"), thread=chat["id"])
    rid = t.research_start("Site Scorer", "build me a site scorer", JOB)["research"]
    for n in (1, 2):
        rs = research_runtime.run(world, rid, runner=runner)
        assert rs["state"] == "running" and rs["attempts"] == n
    failed = research_runtime.run(world, rid, runner=runner)
    assert failed["state"] == "failed" and "3 times without proposing" in failed["why"]
    assert world.journal.recent(1, thread=chat["id"])[0]["text"].startswith(
        "I couldn't finish looking into Site Scorer")
    # A run cut off leaves it running; a run that errors fails it with the error.
    rid2 = Tools(world, turn=said(world, "again"), thread=chat["id"]).research_start(
        "Again", "again", JOB)["research"]
    cut = research_runtime.run(world, rid2, runner=lambda req: RunResult(
        ok=False, reply="", error="Reached the step ceiling", cut_off=True))
    assert cut["state"] == "running"
    gone = research_runtime.run(world, rid2, runner=lambda req: RunResult(
        ok=False, reply="", error="the model did not answer"))
    assert gone["state"] == "failed" and gone["why"] == "the model did not answer"


def test_a_pass_that_asks_waits_for_the_person(world: World,
                                                monkeypatch: pytest.MonkeyPatch) -> None:
    def asking(req: TurnRequest) -> RunResult:
        w = World(world.path)
        try:
            Tools(w, turn=req.turn_id, thread=req.thread_id).ask_person(
                "Which metro first?", ["Austin", "Denver"])
        finally:
            w.close()
        return RunResult(ok=True, reply="Which metro first?")

    monkeypatch.setattr(route, "run", asking)
    rid = world.research.start("T", "ask", job=JOB)["id"]
    rs = research_runtime.run(world, rid, runner=asking)
    assert rs["state"] == "running" and world.modules.thread(rs["thread"])["state"] == "waiting"


def test_stopping_a_pass_says_so_in_the_conversation(world: World) -> None:
    chat = world.modules.open_thread("New conversation", "chat", None)
    rid = world.research.start("T", "ask", job=JOB, conversation=chat["id"])["id"]
    c = TestClient(create_app(world, live=False))
    out = c.post(f"/api/research/{rid}/stop").json()
    assert out["state"] == "stopped" and out["verdict"] == "failed"
    assert world.journal.recent(1, thread=chat["id"])[0]["text"].startswith(
        "Stopped looking into T.")
    assert c.post(f"/api/research/{rid}/stop").status_code == 400
    assert c.get("/api/conversation").json()["research"] == []


def test_the_scheduler_picks_up_a_waiting_pass(world: World,
                                                monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(research_runtime, "FETCH", lambda url: True)
    runner = lead_runner(world.path)
    monkeypatch.setattr(route, "run", runner)
    rid = world.research.start("Site Scorer", "ask", job=JOB)["id"]
    scheduler = Scheduler(world, runner)
    scheduler.kick()
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline and world.research.get(rid)["state"] != "done":
        time.sleep(0.05)
    assert world.research.get(rid)["state"] == "done"
    scheduler.stop_event.set()


def test_removing_a_module_stops_its_passes(world: World) -> None:
    module = world.modules.create("Scorer")
    t = researching(world, module=module["id"])
    rs = world.research.of_thread(t.thread)
    assert rs is not None and world.research.findings(rs["id"])
    purge.remove_module(world, "Scorer")
    assert world.research.get(rs["id"])["state"] == "stopped"
    assert world.research.findings(rs["id"]) == []


# ---- the journey suite ----


def test_the_suite_settles_a_pass_and_checks_the_plans_pieces(
        world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(research_runtime, "FETCH", lambda url: url.endswith("/tour"))
    lead = lead_runner(world.path)

    def runner(req: TurnRequest) -> RunResult:
        if req.kind == "turn" and req.thread_id is None:
            # The conversation's turn: the job is in the ask, so the pass starts at once.
            w = World(world.path)
            try:
                Tools(w, turn=req.turn_id).research_start("Site Scorer", req.sentence, JOB)
            finally:
                w.close()
            return RunResult(ok=True, reply="I'll look into how this is done; a few minutes.")
        return lead(req)

    monkeypatch.setattr(route, "run", runner)
    run = suite.Run(world, runner=runner)
    step = run.step({"say": "build me a car wash site scorer; for me, to pick sites"})
    assert step["ok"]
    ok, why = run.check_research({"state": "done", "looks_min": 1, "verdict": "partial"})
    assert ok, why
    ok, why = run.check_plan({"state": "proposed", "pieces_min": 3,
                              "kinds": ["kept", "choice", "wont"], "evidence_min": 1})
    assert ok, why
    ok, why = run.check_plan({"state": "proposed", "pieces_min": 4})
    assert not ok and "3 pieces" in why
    ok, why = run.check_research({"state": "done", "looks_min": 2})
    assert not ok and "1 look" in why
    assert run.check_no_new_tables({})[0] and run.check_no_new_modules({})[0]
