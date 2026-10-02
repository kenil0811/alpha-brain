"""Understand and propose before building; build in the background after a yes; sources with a
status; pipelines that run with no model."""

from __future__ import annotations

from typing import Any

from conftest import building
from fastapi.testclient import TestClient

import alpha.connectors.browser as browser_module
from alpha.api.server import create_app
from alpha.connectors.browser import Browser
from alpha.mcp.tools import Tools
from alpha.runtime import build, pipeline
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world.world import World

FIELDS = [{"name": "title", "kind": "text"}, {"name": "url", "kind": "url"},
          {"name": "status", "kind": "choice", "choices": ["Active", "Pending", "Sold"]}]


def said(world: World, text: str) -> str:
    return world.journal.append("said", text, actor="person")


# ---- the gate ----


def test_lasting_things_are_refused_outside_an_approved_build(world: World) -> None:
    t = Tools(world, turn=said(world, "i want a tracker for everything on my list"))
    for out in (t.module_create("Deals"), t.collection_create("deals", "Deals", FIELDS),
                t.automation_create("Daily", "daily 07:00", "read it"),
                t.source_add("A broker", "https://example.com/listings")):
        assert "approved" in out["error"] and "plan_propose" in out["error"]
    assert world.collections.names() == [] and world.modules.all() == []


def test_a_plain_log_with_no_home_still_gets_the_simplest_table(world: World) -> None:
    t = Tools(world, turn=said(world, "log two boiled eggs"))
    out = t.table_start("Food log", [{"name": "food", "kind": "text"},
                                     {"name": "kcal", "kind": "number"}],
                        {"food": "Two boiled eggs", "kcal": 155}, module="Food", estimated=True)
    assert out["row"]["food"] == "Two boiled eggs" and world.modules.get("Food")
    assert "One new table" in t.table_start("Water", [{"name": "ml", "kind": "number"}],
                                            {"ml": 250})["error"]
    run = world.journal.append("did", "Run the automation", actor="alpha")
    assert "error" in Tools(world, turn=run).table_start("X", [{"name": "a", "kind": "text"}],
                                                        {"a": "b"})


# ---- plans ----


def test_a_plan_needs_the_persons_yes_after_it_was_proposed(world: World) -> None:
    ask = said(world, "i want a live daily tracker of all deals from my list")
    t = Tools(world, turn=ask)
    plan = t.plan_propose("Daily deal tracker", "## What I understood\nYour 20 sites…\n"
                          "## Questions\n1. Only accounting firms?")["plan"]
    home = TestClient(create_app(world, live=False)).get("/api/home").json()
    assert [n["text"] for n in home["needs_you"]] == ["Plan: Daily deal tracker"]
    assert "error" in t.plan_approve(plan, "a live daily tracker of all deals")  # same turn
    reply = Tools(world, turn=said(world, "Yes, go ahead. Only accounting firms."))
    assert "error" in reply.plan_approve(plan, "something they never said")
    out = reply.plan_approve(plan, "Yes, go ahead", answers="Only accounting firms.")
    assert out["state"] == "approved"
    assert "Only accounting firms." in world.plans.get(plan)["approval"]
    assert TestClient(create_app(world, live=False)).get("/api/home").json()["needs_you"] == []


def test_the_app_approves_a_plan_without_another_turn(world: World) -> None:
    plan = Tools(world, turn=said(world, "track it")).plan_propose("Tracker", "The plan.")
    c = TestClient(create_app(world, live=False))
    proposal = c.get("/api/home").json()["needs_you"][0]
    out = c.post(f"/api/proposals/{proposal['id']}/decide", json={"accept": True}).json()
    assert out["turn"] is None and world.plans.get(plan["plan"])["state"] == "approved"


# ---- builds ----


def test_a_build_runs_on_past_the_time_limit_and_reports_with_coverage(world: World) -> None:
    plan = world.plans.propose("Deal tracker", "Make a deals table; read example.com.")
    world.plans.approve(plan["id"], '"go ahead"')
    runs: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        runs.append(req)
        t = Tools(world, turn=req.turn_id, thread=req.thread_id)
        if len(runs) == 1:
            t.module_create("Deals")
            t.collection_create("deals", "Deals", FIELDS, module="Deals")
            t.source_add("Example brokers", "https://example.com/listings", module="Deals",
                         status="blocked", detail="A bot check stops automated reading.")
            t.thread_brief("# Deal tracker\n## Progress\n- Table made; next: readers.")
            return RunResult(reply="", ok=False, error="The model took longer than 900 s.")
        return RunResult(reply="Your deals table is ready.", ok=True)

    first = build.run_build(world, plan["id"], runner=runner)
    assert first["state"] == "building" and first["attempts"] == 1
    assert "Progress" in runs[0].system and "go ahead" in runs[0].system
    done = build.run_build(world, plan["id"], runner=runner)
    assert done["state"] == "done" and "Continue the build" in runs[1].sentence
    assert "Table made; next: readers." in runs[1].system  # from the brief, not a session
    report = world.journal.recent(1, stream=True, kinds=["replied"])[0]["text"]
    assert report.startswith("Your deals table is ready.")
    assert "Sources: 1 in all — 1 blocked." in report


def test_a_build_that_cannot_finish_says_what_was_done(world: World) -> None:
    plan = world.plans.propose("Tracker", "Make a table.")
    world.plans.approve(plan["id"], "yes")

    def runner(req: TurnRequest) -> RunResult:
        Tools(world, turn=req.turn_id, thread=req.thread_id).module_create("Tracker")
        return RunResult(reply="", ok=False, error="No answer from the model: boom")

    stopped = build.run_build(world, plan["id"], runner=runner)
    assert stopped["state"] == "stopped" and "Made the module Tracker" in stopped["report"]


# ---- readers, sources and pipelines ----


def listings(n: int, site: str = "a.example", status: str = "ACTIVE") -> list[dict[str, Any]]:
    return [{"title": f"Firm {i}", "url": f"https://{site}/l/{i}", "status": status}
            for i in range(n)]


class Pages:
    """A fake browser: what each address returns, changeable between runs."""

    def __init__(self) -> None:
        self.pages: dict[str, dict[str, Any]] = {}

    def __call__(self, job: dict[str, Any], timeout: int) -> dict[str, Any]:
        page = self.pages[job["url"]]
        return {"status": 200, "final_url": job["url"], "title": "Listings", "text": "",
                "links": [], **page}


def setup_pipeline(world: World) -> tuple[Pages, dict[str, Any]]:
    t = building(world)
    t.module_create("Deals")
    t.collection_create("deals", "Deals", FIELDS, module="Deals", title_field="title")
    for name, site in (("big", "a.example"), ("small", "b.example")):
        world.readers.save(name, site=site, url=f"https://{site}/listings", script="return []",
                           description=f"Listings on {site}", to_end=False, count=1)
    auto = t.automation_create("Every morning, read the listings", "daily 07:00", steps=[
        {"read": "big", "into": "deals", "key": "url"},
        {"read": "small", "into": "deals", "key": "url", "map": {"status": {"For Sale": "Active"}}},
        {"tell": "deals"}], module="Deals")
    pages = Pages()
    pages.pages = {"https://a.example/listings": {"result": listings(20)},
                   "https://b.example/listings": {"result": listings(4, "b.example",
                                                                     "For Sale")}}
    return pages, auto


def test_a_pipeline_runs_with_no_model_and_tells_what_changed(world: World) -> None:
    pages, auto = setup_pipeline(world)
    browser = Browser(world, runner=pages)

    def no_model(req: TurnRequest) -> RunResult:
        raise AssertionError("a pipeline that works never calls the model")

    line, problem = pipeline.run_pipeline(world, world.automations.get(auto["id"]),
                                          runner=no_model, browser=browser)
    assert problem is None and line.startswith("Read 2 of 2 sources.")
    rows = world.collections.query("deals", limit=None)
    assert len(rows) == 24 and {r["status"] for r in rows} == {"Active"}  # case and map
    # The small reader is healthy beside the big one: only its own rows count.
    assert world.collections.held_by("deals", "small") == 4
    sources = {s["reader"]: s for s in world.sources.all(auto["module"])}
    assert sources["big"]["status"] == "working" and sources["big"]["last_rows"] == 20
    # Next morning: one listing is gone, one is new, one went pending.
    with world.store.tx() as db:
        db.execute("UPDATE records SET created_at = '2026-01-01T07:00:00+00:00',"
                   " seen_at = '2026-01-01T07:00:00+00:00'")
        db.execute("UPDATE automations SET last_run_at = '2026-01-01T07:01:00+00:00'")
    pages.pages["https://a.example/listings"]["result"] = (
        listings(19)[1:] + [{"title": "Firm 99", "url": "https://a.example/l/99",
                             "status": "Pending"},
                            {"title": "Firm 19", "url": "https://a.example/l/19",
                             "status": "ACTIVE"}])
    pages.pages["https://a.example/listings"]["result"][0]["status"] = "Pending"
    line, _ = pipeline.run_pipeline(world, world.automations.get(auto["id"]),
                                    runner=no_model, browser=browser)
    assert "1 new, 1 changed, 1 gone" in line and "Firm 99" in line and "Firm 0" in line
    gone = next(r for r in world.collections.query("deals", limit=None)
                if r["url"] == "https://a.example/l/0")
    assert gone["_gone_at"]


def test_walls_and_breakage_are_explicit(world: World) -> None:
    pages, auto = setup_pipeline(world)
    pages.pages["https://a.example/listings"] = {"bot_check": True, "result": None}
    pages.pages["https://b.example/listings"] = {"blocked": True, "result": None}
    line, problem = pipeline.run_pipeline(world, world.automations.get(auto["id"]),
                                          browser=Browser(world, runner=pages))
    assert line.startswith("Read 0 of 2 sources.") and problem is not None
    assert "b.example needs your sign-in" in problem and "a.example stops automated" in problem
    statuses = {s["reader"]: s["status"] for s in world.sources.all(auto["module"])}
    assert statuses == {"big": "blocked", "small": "needs_signin"}
    asks = world.journal.open_asks()
    assert len(asks) == 1 and "Sign in to b.example" in asks[0]["text"]
    pipeline.run_pipeline(world, world.automations.get(auto["id"]),
                          browser=Browser(world, runner=pages))
    assert len(world.journal.open_asks()) == 1  # asked once


def test_a_broken_step_gets_one_repair_then_runs_again(world: World) -> None:
    pages, auto = setup_pipeline(world)
    pipeline.run_pipeline(world, world.automations.get(auto["id"]),
                          browser=Browser(world, runner=pages))
    pages.pages["https://a.example/listings"]["result"] = listings(3)  # reads part of the list
    repaired: list[str] = []

    def repair(w: World, a: dict[str, Any], reader: str, problem: str, runner: Any) -> None:
        repaired.append(f"{reader}: {problem}")
        pages.pages["https://a.example/listings"]["result"] = listings(20)

    line, problem = pipeline.run_pipeline(world, world.automations.get(auto["id"]),
                                          browser=Browser(world, runner=pages), repair=repair)
    assert len(repaired) == 1 and repaired[0].startswith("big: the reader returned 3 rows")
    assert problem is None and line.startswith("Read 2 of 2 sources.")


def test_a_bot_check_on_any_read_marks_that_sites_sources(world: World) -> None:
    t = building(world)
    t.module_create("Deals")
    t.source_add("Sunbelt listings", "https://www.sunbelt.example/listings", module="Deals")
    pages = Pages()
    pages.pages = {"https://sunbelt.example/buy": {"bot_check": True, "title": "Just a moment..."}}
    out = Browser(world, runner=pages).read("https://sunbelt.example/buy")
    assert out["bot_check"]
    source = world.sources.all(world.modules.get("Deals")["id"])[0]
    assert source["status"] == "blocked" and "bot check" in source["detail"]
    assert "stopped Alpha with a bot check" in world.journal.recent(5, kinds=["saw"])[-1]["text"]


def test_a_reader_on_a_paged_list_must_say_whether_it_reads_every_page(world: World) -> None:
    t = building(world)
    t.module_create("Deals")
    pages = Pages()
    pages.pages = {"https://a.example/listings": {"result": listings(12), "more_pages": True}}
    original = browser_module.run_job
    browser_module.run_job = pages
    try:
        refused = t.reader_save("a_list", "https://a.example/listings", "return rows", "A list")
        assert "shows more pages" in refused["error"] and "12 rows" in refused["error"]
        saved = t.reader_save("a_list", "https://a.example/listings", "return rows",
                              "The newest listings on A", whole=False)
        assert saved["rows"] == 12 and world.readers.get("a_list")["whole"] is False
    finally:
        browser_module.run_job = original


def test_a_newest_page_reader_never_marks_rows_gone(world: World) -> None:
    pages, auto = setup_pipeline(world)
    world.readers.save("big", site="a.example", url="https://a.example/listings",
                       script="return []", description="Newest on A", to_end=False, count=20,
                       whole=False)
    browser = Browser(world, runner=pages)
    pipeline.run_pipeline(world, world.automations.get(auto["id"]), browser=browser)
    with world.store.tx() as db:
        db.execute("UPDATE records SET seen_at = '2026-01-01T07:00:00+00:00'")
    pages.pages["https://a.example/listings"]["result"] = listings(20)[5:]
    pipeline.run_pipeline(world, world.automations.get(auto["id"]), browser=browser)
    assert not any(r.get("_gone_at") for r in world.collections.query("deals", limit=None)
                   if "a.example" in r["url"])
    source = next(s for s in world.sources.all(auto["module"]) if s["reader"] == "big")
    assert source["status"] == "working" and "newest page only" in source["detail"]


def test_a_source_the_person_skipped_stays_skipped(world: World) -> None:
    t = building(world)
    t.module_create("Deals")
    t.source_add("Big marketplace", "https://big.example/", module="Deals", status="skipped",
                 detail="Skipped for now: no filter yet.")
    t.source_add("Old broker", "https://old.example/x", module="Deals", status="unavailable",
                 detail="The address is dead.")
    pages = Pages()
    pages.pages = {"https://big.example/": {"bot_check": True}}
    Browser(world, runner=pages).read("https://big.example/")
    deals = world.modules.get("Deals")["id"]
    statuses = {s["title"]: s["status"] for s in world.sources.all(deals)}
    assert statuses == {"Big marketplace": "skipped", "Old broker": "unavailable"}
    assert world.sources.coverage_line(world.modules.get("Deals")["id"]) == (
        "Sources: 2 in all — 1 nothing to read, 1 skipped by you.")
