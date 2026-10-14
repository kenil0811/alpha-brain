"""A module as the person's workflow (§12, Q39): the page drafted from the interview, checked;
revised as a new version with the old one kept and decisions carried over; agreed in the app
or in words; on Home and in the conversation; removed with its module."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.mcp.tools import Tools
from alpha.world import purge
from alpha.world.store import Problem
from alpha.world.workflows import clean_body
from alpha.world.world import World

BODY: dict[str, Any] = {
    "purpose": "Decide which car wash sites to pursue, and brief investors.",
    "steps": [
        {"title": "A site arrives", "what": "You type the address; later it is read from the"
         " broker's email.", "who": "you", "gives": "a site", "when": "when a site arrives"},
        {"title": "Trade area and target zone checks", "what": "Households within 3 miles,"
         " density, drive-time population, traffic on the fronting road, TAQ.", "who": "alpha",
         "takes": "a site", "gives": "each check with its value and source",
         "reaches": ["Census ACS", "TxDOT counts"], "when": "when a site arrives"},
        {"title": "Score the site", "what": "You score the fourteen items with a note each;"
         " Alpha shows what it can see beside them.", "who": "both", "when": "when asked"},
        {"title": "The memo", "what": "Alpha drafts the investor memo from your template.",
         "who": "alpha", "gives": "a memo", "when": "after Score the site"},
        {"title": "Send it", "what": "The memo goes to the investors.", "who": "you",
         "outward": True, "when": "when asked"},
    ],
    "keeps": [
        {"thing": "Site", "fields": ["address", {"name": "status", "kind": "choice"}]},
        {"thing": "Check", "fields": [{"name": "value", "kind": "number"}, "source"],
         "relates_to": ["Site"]},
        {"thing": "Score", "fields": [{"name": "score", "kind": "number"}, "note"],
         "relates_to": ["Site"]},
    ],
    "documents": [{"name": "Investor memo", "from": "the site's checks and scores",
                   "for": "investors"}],
    "settings": [{"key": "min_households", "label": "Households within 3 miles", "value": 45000,
                  "origin": "your document"},
                 {"label": "Site traffic floor", "value": 30000, "unit": "cars/day",
                  "origin": "your document"}],
    "assumptions": ["Traffic is read from the road the site fronts."],
    "suggestions": [{"title": "Check thresholds against your four best stores",
                     "what": "Run the checks on Cherry Creek and the others first.",
                     "why": "That is how the trade calibrates.", "sources": ["https://x.example/a"]},
                    {"title": "A map of sites and competitors", "what": "Dots on a map."}],
    "questions": [{"text": "Which metro first?", "options": ["Austin", "Denver"],
                   "default": "Austin"}],
}


def said(world: World, text: str) -> str:
    return world.journal.append("said", text, actor="person")


def test_the_page_is_checked_and_normalized() -> None:
    body = clean_body(BODY)
    assert [s["id"] for s in body["steps"]][:2] == ["a_site_arrives",
                                                     "trade_area_and_target_zone_checks"]
    assert body["steps"][1]["reaches"] == ["Census ACS", "TxDOT counts"]
    assert body["steps"][4]["outward"] is True and body["steps"][2]["who"] == "both"
    assert [k["key"] for k in body["keeps"]] == ["site", "check", "score"]
    assert body["keeps"][1]["relates_to"] == ["site"]
    assert body["keeps"][0]["fields"][1] == {"name": "status", "label": "status",
                                             "kind": "choice", "unit": None}
    assert body["settings"][1]["key"] == "site_traffic_floor"
    assert body["suggestions"][0]["id"] == "check_thresholds_against_your_four_best_stores"
    assert body["suggestions"][0]["decision"] is None
    for bad, words in [
        ({**BODY, "purpose": ""}, "purpose"),
        ({**BODY, "steps": []}, "steps"),
        ({**BODY, "steps": [{"title": "x", "what": "y", "who": "robot"}]}, "who does it"),
        ({**BODY, "keeps": [{"thing": "A", "relates_to": ["B"]}]}, "not among the things"),
        ({**BODY, "settings": [{"label": "x", "value": 1, "origin": "nowhere"}]}, "origin"),
    ]:
        with pytest.raises(Problem) as e:
            clean_body(bad)
        assert words in str(e.value)


def test_the_page_is_drafted_revised_with_the_version_kept_and_agreed_in_words(
        world: World) -> None:
    chat = world.modules.open_thread("New conversation", "chat", None)
    t = Tools(world, turn=said(world, "help me pick car wash sites"), thread=chat["id"])
    out = t.workflow_draft("Picking car wash sites", BODY, "# Your workflow\n1. A site arrives…")
    wf = world.workflows.get(out["workflow"])
    assert wf["state"] == "drafted" and wf["version"] == 1 and wf["conversation"] == chat["id"]
    assert wf["words"].startswith("# Your workflow")
    proposed = world.journal.recent(1, kinds=["proposed"])[0]
    assert proposed["data"]["workflow"] == wf["id"] and proposed["thread"] == chat["id"]
    # Agreeing in the turn that drafted it is refused; the person's words from a later turn work.
    assert "reply" in t.workflow_agree(wf["id"], "help me pick car wash sites")["error"]
    # The person decides a suggestion, then says what is different: a new version, the old kept.
    world.workflows.decide_suggestion(wf["id"], "a_map_of_sites_and_competitors", "skip")
    changed = {**BODY, "steps": BODY["steps"] + [
        {"title": "Lot size check", "what": "At least 0.8 acres.", "who": "alpha",
         "when": "when a site arrives"}],
        "suggestions": [{"title": "A map of sites and competitors", "what": "Dots on a map."}]}
    later = Tools(world, turn=said(world, "add a minimum lot size of 0.8 acres"),
                  thread=chat["id"])
    rev = later.workflow_revise(wf["id"], "add a minimum lot size of 0.8 acres", changed)
    wf = world.workflows.get(wf["id"])
    assert rev["version"] == 2 and wf["version"] == 2
    assert wf["body"]["steps"][-1]["title"] == "Lot size check"
    assert wf["body"]["suggestions"][0]["decision"] == "skip"  # carried over by title
    assert "removed" not in rev
    # A revision that leaves the suggestions and questions out altogether keeps them, and one
    # that drops a thing, a step or a setting says so.
    thinner = {**BODY, "steps": BODY["steps"][:3], "keeps": BODY["keeps"][:2],
               "settings": BODY["settings"][:1], "suggestions": [], "questions": []}
    rev = later.workflow_revise(wf["id"], "shorter", thinner)
    assert rev["version"] == 3 and rev["removed"] == [
        "the thing Score", "the step The memo", "the step Send it", "the step Lot size check",
        "the setting Site traffic floor"]
    body = world.workflows.get(wf["id"])["body"]
    assert len(body["suggestions"]) == 1 and body["suggestions"][0]["decision"] == "skip"
    assert body["questions"][0]["text"] == "Which metro first?"
    assert "It also removed the thing Score" in world.journal.recent(1)[0]["text"]
    rev = later.workflow_revise(wf["id"], "back", changed)
    assert rev["version"] == 4
    versions = world.workflows.versions(wf["id"])
    assert len(versions) == 3 and versions[0]["version"] == 1
    assert versions[0]["why"] == "add a minimum lot size of 0.8 acres"
    assert len(versions[0]["body"]["steps"]) == 5
    yes = Tools(world, turn=said(world, "Yes, build it, Austin first"), thread=chat["id"])
    assert "error" in yes.workflow_agree(wf["id"], "something they never said")
    out = yes.workflow_agree(wf["id"], "Yes, build it", suggestions={
        "a_map_of_sites_and_competitors": "accept"}, answers="Austin first")
    assert out["state"] == "agreed", out
    wf = world.workflows.get(wf["id"])
    assert wf["agreement"].startswith('"Yes, build it"') and "Austin first" in wf["agreement"]
    assert wf["body"]["suggestions"][0]["decision"] == "accept"
    assert world.workflows.revise(wf["id"], BODY)["version"] == 5  # agreed: still revisable
    assert world.workflows.decline(wf["id"])["state"] == "declined"
    with pytest.raises(Problem):
        world.workflows.revise(wf["id"], BODY)


def test_the_page_is_on_home_and_in_the_conversation_and_agreed_in_the_app(
        world: World) -> None:
    chat = world.modules.open_thread("New conversation", "chat", None)
    t = Tools(world, turn=said(world, "help me pick sites"), thread=chat["id"])
    wid = t.workflow_draft("Picking sites", BODY, "The page.")["workflow"]
    c = TestClient(create_app(world, live=False))
    needs = c.get("/api/home").json()["needs_you"]
    assert [n["kind"] for n in needs] == ["workflow"]  # not also a plain proposal
    assert needs[0]["workflow"]["body"]["purpose"].startswith("Decide which")
    shown = c.get("/api/conversation", params={"conversation": chat["id"]}).json()
    assert [w["id"] for w in shown["workflows"]] == [wid]
    out = c.post(f"/api/workflows/{wid}/agree", json={
        "suggestions": {"a_map_of_sites_and_competitors": "accept"},
        "answers": {"0": "Denver"}}).json()
    assert out["state"] == "agreed" and out["body"]["questions"][0]["answer"] == "Denver"
    assert out["body"]["suggestions"][1]["decision"] == "accept"
    assert c.get("/api/home").json()["needs_you"] == []
    assert world.workflows.versions(wid) == []
    assert c.post(f"/api/workflows/{wid}/agree").status_code == 400  # not drafted any more
    assert c.post(f"/api/workflows/{wid}/decline").json()["state"] == "declined"
    assert world.workflows.get(wid)["state"] == "declined"


def test_a_deleted_modules_workflow_page_goes_with_it(world: World) -> None:
    module = world.modules.create("Sites")
    wf = world.workflows.draft("Sites", BODY, module=module["id"])
    purge.remove_module(world, "Sites")
    with pytest.raises(Problem, match="no workflow"):
        world.workflows.get(wf["id"])
    assert world.workflows.of_module(module["id"]) is None
