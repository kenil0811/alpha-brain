"""Sherlock, the researcher (design Q45, on Q50's substrate): a fixed frame around a free
method. When a look is warranted is judged once; what comes back is checked by code; it lands
on the page marked Sherlock's, as cards, or on a findings page; Skip is the person's decision."""

from __future__ import annotations

import json
from typing import Any

import pytest
from conftest import building
from fastapi.testclient import TestClient
from test_workflows import BODY

from alpha.api.server import create_app
from alpha.runtime.agents import builtin, look_and_run, sherlock
from alpha.runtime.agents import runner as agent_runner
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world.world import World

FULL = json.dumps({"look": "full", "kind_of_work": "site selection", "open": [],
                   "why": "a new kind of work for this person"})
NONE = json.dumps({"look": "none", "kind_of_work": "food logging", "open": [],
                   "why": "Alpha already keeps a food log"})
FINDINGS = {
    "lenses": {"world": "nothing of yours covers this yet", "tools": "two site-selection tools",
               "open_source": "skipped: nothing maintained", "practice": "gates before a score",
               "public_data": "Census ACS and TxDOT counts"},
    "suggestions": [
        {"title": "Gates before the score", "what": "A site that fails a gate is never scored.",
         "why": "your Trade area checks keep a score for sites that fail the households floor",
         "sources": ["https://example.com/gates"], "lens": "practice"},
        {"title": "A map of the trade area", "what": "A map around each site.",
         "why": "it looks nice", "sources": ["https://example.com/map"], "lens": "tools"},
        {"title": "Drive-time population", "what": "Population within a ten-minute drive.",
         "why": "your households within 3 miles misses who can reach the site",
         "sources": ["https://dead.example.com/x"], "lens": "public_data"},
        {"title": "Competitor density", "what": "Washes within 2 miles.",
         "why": "a site with nine washes nearby scored well in your first version",
         "sources": ["not a url"], "lens": "practice"},
    ],
    "questions": [{"text": "Do you score sites yourself or does a partner?",
                   "options": ["I do", "A partner", "Both"], "pick": "I do"}],
    "not_applicable": ["metro-wide screening: you start from brokers' sites"],
}


def with_sherlock(world: World) -> dict[str, Any]:
    return next(a for a in builtin.ensure(world) if a["kind"] == "sherlock")


def alive(url: str) -> bool:
    return url.startswith("https://example.com/")


def drafted(world: World, *, conversation: bool = True) -> dict[str, Any]:
    """A workflow page as the interview drafts it, in a conversation."""
    from alpha.runtime import conversations

    cid = conversations.open_conversation(world, "car wash sites", None)["id"] if conversation \
        else None
    turn = world.journal.append("said", "I want help picking car wash sites to open",
                                actor="person", thread=cid)
    made = world.workflows.draft("Car wash sites", BODY, conversation=cid, turn=turn,
                                 words="Sites come from brokers; Alpha checks and scores them.")
    world.journal.append("proposed", f"Your workflow: {made['title']}",
                         data={"workflow": made["id"], "turn": turn}, thread=cid)
    return made


def fake(answers: dict[str, Any] | None = None) -> Any:
    """A runner: the judgement, then the look; `answers` overrides by kind."""
    seen: list[TurnRequest] = []
    answers = answers or {}

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        if req.kind == "judge":
            return RunResult(reply=answers.get("judge", FULL), ok=True)
        return RunResult(reply=answers.get("turn", "Looked.\n" + json.dumps(FINDINGS)), ok=True,
                         duration_ms=4200)

    runner.seen = seen  # type: ignore[attr-defined]
    return runner


def test_what_code_keeps_of_a_look() -> None:
    subject = {"title": "Car wash sites", "purpose": "pick car wash sites",
               "steps": ["Trade area checks", "Score the site"], "keeps": ["Site"],
               "settings": ["households floor"], "reaches": ["Census ACS"],
               "skipped": ["Competitor density"]}
    out = sherlock.check_findings(FINDINGS, subject, alive=alive)
    assert [s["title"] for s in out["suggestions"]] == ["Gates before the score"]
    assert out["dropped"] == ["A map of the trade area: its reason names nothing of yours",
                              "Drive-time population: no source that resolves",
                              "Competitor density: you skipped it before"]
    assert out["questions"] == [{"text": "Do you score sites yourself or does a partner?",
                                 "options": ["I do", "A partner", "Both"], "pick": "I do"}]
    assert out["lenses"]["open_source"] == "skipped: nothing maintained"
    assert out["not_applicable"] == ["metro-wide screening: you start from brokers' sites"]
    # garbage keeps nothing and breaks nothing
    empty = sherlock.check_findings("not json", subject, alive=alive)
    assert empty["suggestions"] == [] and empty["lenses"]["world"] == "skipped: not covered"


def test_a_drafted_page_gets_a_look_and_sherlocks_suggestions_land_on_it(
        world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sherlock, "url_alive", alive)
    me = with_sherlock(world)
    wf = drafted(world)
    runner = fake()
    out = look_and_run(world, "sherlock", runner=runner)
    assert out and out["last_result"] == "Brought back 1 suggestion and 1 question."
    kinds = [r.kind for r in runner.seen]
    assert kinds == ["judge", "turn"]  # the judgement, then one look
    assert "deserves" not in runner.seen[0].system and "look into" in runner.seen[0].system
    look = runner.seen[1]
    assert look.actor == me["id"] and "Lenses to cover" in look.sentence
    assert "You are Sherlock" in look.system and "never a new sign-in" in look.system
    # the judgement is Sherlock's decision, on record
    [d] = world.decisions.about("workflow", wf["id"])
    assert d["by"] == me["id"] and d["about"]["look"] == "full"
    assert d["what"] == "Full look at how others do Car wash sites"
    # the page: a new version with Sherlock's suggestion marked as its own
    after = world.workflows.get(wf["id"])
    assert after["version"] == 2 and after["state"] == "drafted"
    mine = [s for s in after["body"]["suggestions"] if s.get("by") == me["id"]]
    assert [s["title"] for s in mine] == ["Gates before the score"]
    assert mine[0]["by_name"] == "Sherlock" and mine[0]["sources"] == ["https://example.com/gates"]
    assert len(after["body"]["suggestions"]) == len(BODY["suggestions"]) + 1  # Alpha's kept
    # the question is a card in the conversation, Sherlock's pick first
    [ask] = world.journal.open_asks()
    assert ask["actor"] == me["id"] and ask["thread"] == wf["conversation"]
    assert ask["data"]["options"][0] == "I do" and ask["data"]["workflow"] == wf["id"]
    # the findings page, written by code, under a topic of its own
    page = world.knowledge.find_note("topic:car_wash_sites", "Research: Car wash sites")
    assert page and "## Left out (checked by code)" in page["body"]
    assert "Drive-time population: no source that resolves" in page["body"]
    # its run and its notes
    run = world.runs.last(me["id"])
    assert run and run["verdict"] == "succeeded" and run["model_ms"] == 4200
    notes = world.knowledge.find_note(f"agent:{me['id']}", "Notes")
    assert notes and "## site selection" in notes["body"] and "example.com" in notes["body"]
    # judged once: nothing more to do
    assert look_and_run(world, "sherlock", runner=runner) is None
    # the API: the card shows no research running, the page its stopped-able state
    c = TestClient(create_app(world, live=False))
    item = next(i for i in c.get("/api/home").json()["needs_you"] if i["kind"] == "workflow")
    assert item["workflow"]["research"] is None


def test_no_look_when_the_judgement_or_the_person_says_so(world: World) -> None:
    me = with_sherlock(world)
    wf = drafted(world)
    runner = fake({"judge": NONE})
    out = look_and_run(world, "sherlock", runner=runner)
    assert out and out["last_result"] == "No look needed for Car wash sites."
    assert [r.kind for r in runner.seen] == ["judge"]
    assert world.workflows.get(wf["id"])["version"] == 1
    [d] = world.decisions.about("workflow", wf["id"])
    assert d["what"] == "No look at how others do Car wash sites" and d["by"] == me["id"]
    # the person's words win without a judgement at all
    wf2 = drafted(world)
    world.journal.append("said", "no research, just build it", actor="person",
                         thread=wf2["conversation"])
    runner2 = fake()
    out = look_and_run(world, "sherlock", runner=runner2)
    assert out and out["last_result"] == "No look needed for Car wash sites."
    assert runner2.seen == []
    assert world.decisions.about("workflow", wf2["id"])[0]["why"] == "you said no research"


def test_an_interview_under_way_gets_a_look_and_the_findings_land_when_the_page_comes(
        world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    from alpha.runtime import conversations

    monkeypatch.setattr(sherlock, "url_alive", alive)
    me = with_sherlock(world)
    cid = conversations.open_conversation(world, "car wash sites", None)["id"]
    turn = world.journal.append("said", "I want help picking car wash sites to open",
                                actor="person", thread=cid)
    world.journal.append("replied", "A few questions first.", data={"turn": turn}, thread=cid)
    world.journal.append("asked", "Who is it for?", data={"options": ["Me", "Investors"],
                                                          "turn": turn}, thread=cid)
    runner = fake()
    out = look_and_run(world, "sherlock", runner=runner)
    assert out and out["last_result"] == "Brought back 1 question."
    assert [r.kind for r in runner.seen] == ["judge", "turn"]
    assert "I want help picking car wash sites" in runner.seen[1].sentence
    [d] = world.decisions.about("conversation", cid)
    assert d["by"] == me["id"] and d["about"]["look"] == "full"
    kept = world.journal.recent(5, thread=me["thread"] or world.agents.get(me["id"])["thread"],
                                kinds=["did"])[-1]
    assert kept["text"].startswith("Sherlock keeps 1 suggestions for")
    # the page is drafted later in that conversation: the kept suggestions land, no new look
    made = world.workflows.draft("Car wash sites", BODY, conversation=cid, turn=turn,
                                 words="Sites come from brokers.")
    world.journal.append("proposed", f"Your workflow: {made['title']}",
                         data={"workflow": made["id"], "turn": turn}, thread=cid)
    before = len(runner.seen)
    out = look_and_run(world, "sherlock", runner=runner)
    assert out and out["last_result"] == "Brought back 1 suggestion."
    assert len(runner.seen) == before  # no model run
    after = world.workflows.get(made["id"])
    assert after["version"] == 2
    assert [s["title"] for s in after["body"]["suggestions"] if s.get("by") == me["id"]] == \
        ["Gates before the score"]


def test_a_late_look_becomes_a_proposal_when_the_person_already_said_yes(
        world: World, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sherlock, "url_alive", alive)
    me = with_sherlock(world)
    wf = drafted(world)
    world.workflows.agree(wf["id"], "yes")

    def slow_yes(req: TurnRequest) -> RunResult:
        return RunResult(reply=FULL if req.kind == "judge" else json.dumps(FINDINGS), ok=True)

    out = look_and_run(world, "sherlock", runner=slow_yes)
    assert out and out["last_result"] == "Brought back 1 suggestion and 1 question."
    proposal = world.journal.recent(5, kinds=["proposed"])[-1]
    assert proposal["actor"] == me["id"] and proposal["data"]["workflow"] == wf["id"]
    assert proposal["text"].startswith("Sherlock found 1 things worth adding to Car wash sites:"
                                       " Gates before the score")
    assert world.workflows.get(wf["id"])["version"] == 1  # an agreed page is not rewritten


def test_skip_stops_the_look_and_is_the_persons_decision(world: World) -> None:
    me = with_sherlock(world)
    wf = drafted(world)

    def stopped(req: TurnRequest) -> RunResult:
        if req.kind == "judge":
            return RunResult(reply=FULL, ok=True)
        return RunResult(reply="", ok=False, error="You stopped it.", stopped=True)

    out = look_and_run(world, "sherlock", runner=stopped)
    assert out and out["last_error"] == "you stopped it"
    run = world.runs.last(me["id"])
    assert run and run["verdict"] == "stopped"
    # the route behind Skip, while a look is open: the decision that holds
    rid = world.runs.start(me["id"], trigger="now")
    thread = world.agents.get(me["id"])["thread"]
    world.journal.append("did", "Looking into how others do Car wash sites (full look).",
                         actor=me["id"], thread=thread, data={"agent": me["id"],
                                                               "workflow": wf["id"]})
    c = TestClient(create_app(world, live=False))
    out2 = c.post(f"/api/agents/{me['id']}/stop").json()
    assert out2["id"] == me["id"] and out2["stopped"] is False  # no model process to kill here
    world.runs.finish(rid, verdict="stopped", why="you stopped it")
    decisions = world.decisions.about("workflow", wf["id"])
    assert any(d["by"] == "person" and d["about"].get("no_research") for d in decisions)
    assert world.journal.recent(1, kinds=["did"])[0]["text"] == \
        "You skipped Sherlock's look at Car wash sites."
    # from now on, no look for this page without a judgement
    assert sherlock.no_research_said(world, sherlock.subject_of_workflow(
        world, world.workflows.get(wf["id"])))


def test_at_sherlock_answers_a_question_onto_a_page(world: World,
                                                    monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sherlock, "url_alive", alive)
    me = with_sherlock(world)
    subject_seen: list[str] = []

    def runner(req: TurnRequest) -> RunResult:
        subject_seen.append(req.sentence)
        return RunResult(reply="Two tools stand out.\n" + json.dumps({
            **FINDINGS, "suggestions": [{"title": "Gates before the score",
                                         "what": "Fail a gate, no score.",
                                         "why": "site scoring tools all gate first",
                                         "sources": ["https://example.com/gates"]}],
            "questions": []}), ok=True)

    from alpha.runtime import conversations

    cid = conversations.open_conversation(world, "site scoring", None)["id"]
    out = agent_runner.mention(world, me, "hi @Sherlock, what do site scoring tools do first?",
                               rest="hi what do site scoring tools do first?", thread=cid,
                               runner=runner)
    assert out.ok and out.reply.startswith("Two tools stand out.")
    assert "1 things worth having" in out.reply
    assert "hi what do site scoring tools do first?" in subject_seen[0]
    assert "@Sherlock" not in subject_seen[0]
    # the look ran in the conversation it was asked in: one card, no second thread open
    steps = world.journal.recent(5, thread=cid, kinds=["did"])
    assert any(e["text"].startswith("Sherlock looks into how others do hi what do site")
               for e in steps)
    assert world.modules.thread(cid)["state"] != "done"
    mine = world.agents.get(me["id"])["thread"]
    assert mine is None or world.modules.thread(mine)["state"] in ("done", "open")
    page = world.knowledge.find_note("topic:hi_what_do_site_scoring_tools_do_first",
                                     "Research: hi what do site scoring tools do first?")
    assert page and "Gates before the score" in page["body"]
    run = world.runs.last(me["id"])
    assert run and run["trigger"] == "mention" and run["verdict"] == "succeeded"
    assert world.journal.read(out.replied)["actor"] == me["id"]


def test_sherlock_never_touches_records_or_connections(world: World) -> None:
    from alpha.mcp.tools import Tools

    me = with_sherlock(world)
    building(world).collection_create("food_log", "Food log", [{"name": "item", "kind": "text"}])
    t = Tools(world, turn="j1", actor=me["id"])
    assert "may not change records" in t.records_add("food_log", {"item": "x"},
                                                      source="stated")["error"]
    assert t.ask_person("Which?", ["a", "b"])["asked"]  # asks are on its list
