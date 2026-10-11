"""The build from the page (§12, piece 2): the module, one table per thing with relations,
the settings table; the workspace with the page in it; a session that writes parts and a
document template; parts run on rows (when they arrive, when asked, after another) through
the core with the source of every value in the row's provenance; a stopped build waits for
the person's continue."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from test_workflows import BODY, said

from alpha.api.server import create_app
from alpha.runtime import parts as parts_module
from alpha.runtime import workflow_build
from alpha.runtime.automation import Scheduler
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world.store import Problem
from alpha.world.workflows import hosts_of
from alpha.world.world import World

PARTS_YAML = """parts:
  - id: checks
    step: trade_area_and_target_zone_checks
    title: Trade area checks
    reads: {thing: site, fields: [address]}
    fills: {thing: site, fields: [households, traffic]}
    when: arrives
    reaches: [api.census.gov]
    command: ["python", "parts/checks.py"]
  - id: visibility
    step: score_the_site
    title: Visibility
    reads: {thing: site, fields: [address]}
    fills: {thing: score, fields: [score, note]}
    when: after:checks
    command: ["python", "parts/item.py"]
  - id: memo
    step: the_memo
    title: Draft the memo
    reads: {thing: site, fields: [address, households, score]}
    fills: {thing: site, fields: [memo]}
    when: after:visibility
    command: ["python", "parts/memo.py"]
  - id: rescore
    step: score_the_site
    title: Re-check on request
    reads: {thing: site, fields: [address]}
    fills: {thing: site, fields: [households]}
    when: asked
    command: ["python", "parts/checks.py"]
"""

CHECKS_PY = """import json, sys
row = json.load(sys.stdin)
floor = row["settings"].get("min_households")
if "fail" in row["address"]:
    print(json.dumps({"values": {}, "sources": {}, "problems": {
        "households": "the geocoder found nothing", "traffic": "no count"}}))
else:
    print("some log line")
    print(json.dumps({"values": {"households": 52000, "traffic": 31000},
                      "sources": {"households": {"source": "Census ACS B11001 (api.census.gov)",
                                                 "fetched_at": "2026-10-11T10:00:00Z"},
                                  "traffic": {"source": "TxDOT",
                                              "fetched_at": "2026-10-11T10:00:01Z"}},
                      "problems": {}}))
"""
ITEM_PY = """import json, sys
row = json.load(sys.stdin)
print(json.dumps({"values": {"note": f"Seen from the road at {row['address']}"},
                  "sources": {"note": {"source": "trade practice"}},
                  "problems": {"score": "needs a drive-by, not a guess"}}))
"""
MEMO_PY = """import json, sys
row = json.load(sys.stdin)
items = ", ".join(f"{s['item']}: {s.get('score')} ({s['note']})" for s in row["score"])
print(json.dumps({"values": {"memo": f"Memo for {row['address']}: {row['households']} households;"
                                     f" {items}"},
                  "sources": {"memo": {"source": "drafted from the checks"}}, "problems": {}}))
"""
BODY2: dict[str, Any] = {
    **BODY,
    "steps": [
        {**BODY["steps"][0]},
        {**BODY["steps"][1], "reaches": ["Census ACS (api.census.gov)", "TxDOT counts"]},
        *BODY["steps"][2:],
    ],
    "keeps": [
        {"thing": "Site", "fields": ["address", {"name": "households", "kind": "number"},
                                     {"name": "traffic", "kind": "number", "unit": "cars/day"},
                                     {"name": "memo", "kind": "long_text"},
                                     {"name": "status", "kind": "status"}]},
        {"thing": "Score", "fields": [{"name": "item", "kind": "text"},
                                      {"name": "score", "kind": "number"}, "note"],
         "relates_to": ["Site"]},
    ],
}


@pytest.fixture
def home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("ALPHA_HOME", str(tmp_path / "home"))
    return tmp_path / "home"


def agreed_page(world: World) -> dict[str, Any]:
    chat = world.modules.open_thread("New conversation", "chat", None)
    wf = world.workflows.draft("Picking car wash sites", BODY2, conversation=chat["id"],
                               turn=said(world, "help me"), words="# Your workflow\n…")
    return world.workflows.agree(wf["id"], "yes")


def builder(*, stuck: bool = False, write_parts: bool = True) -> Any:
    def runner(req: TurnRequest) -> RunResult:
        assert req.workspace and req.kind == "turn"
        ws = Path(req.workspace)
        assert (ws / "WORKFLOW.md").read_text().startswith("# Picking car wash sites")
        page = json.loads((ws / "workflow.json").read_text())
        assert page["tables"]["site"] == "site" and page["tables"]["settings"] == "settings"
        assert "api.census.gov" in req.hosts
        if stuck:
            return RunResult(ok=True, reply="STUCK: the geocoder needs a key.")
        if write_parts:
            (ws / "parts.yaml").write_text(PARTS_YAML)
            (ws / "parts" / "checks.py").write_text(CHECKS_PY)
            (ws / "parts" / "item.py").write_text(ITEM_PY)
            (ws / "parts" / "memo.py").write_text(MEMO_PY)
        (ws / "documents" / "Investor memo.md").write_text("# Memo\n\n{site.address}\n")
        return RunResult(ok=True, reply="Built: add a site and the checks fill in.")
    return runner


def test_the_hosts_come_from_what_the_steps_reach() -> None:
    body = {"steps": [{"reaches": ["Census ACS (api.census.gov)", "https://gis.x.gov/a/b",
                                   "the broker's email"]}],
            "suggestions": [{"sources": ["https://not-for-the-build.com"]}]}
    assert hosts_of(body) == ["api.census.gov", "gis.x.gov"]


@pytest.mark.skipif(sys.platform != "darwin", reason="parts run under sandbox-exec")
def test_the_page_becomes_a_module_with_tables_and_parts_that_fill_rows(
        world: World, home: Path) -> None:
    wf = agreed_page(world)
    built = workflow_build.run(world, wf["id"], runner=builder())
    assert built["state"] == "built" and built["module"]
    module = world.modules.get(built["module"])
    assert module["name"] == "Picking car wash sites" and module["workspace"]
    tables = {t["name"]: t for t in world.collections.overview(module["id"])}
    assert set(tables) == {"site", "score", "settings"}
    site = world.collections.describe("site")
    assert [f["name"] for f in site["fields"]] == ["address", "households", "traffic", "memo",
                                                   "status"]
    assert next(f for f in site["fields"] if f["name"] == "traffic")["unit"] == "cars/day"
    score = world.collections.describe("score")
    rel = next(f for f in score["fields"] if f["kind"] == "relation")
    assert rel["name"] == "site" and rel["relation"] == "site"
    settings = world.collections.query("settings", limit=None)
    assert {r["key"]: r["origin"] for r in settings} == {
        "min_households": "your document", "site_traffic_floor": "your document"}
    docs = [d for d in world.store.all("SELECT title, origin, module FROM documents")]
    assert [(d["title"], d["origin"]) for d in docs] == [("Investor memo.md", "template")]
    report = world.journal.recent(1, thread=wf["conversation"])[0]
    assert report["kind"] == "replied"
    assert "Parts: checks, visibility, memo, rescore" in report["text"]
    assert "Steps with no part yet" not in report["text"]  # the person's steps need none
    # A site added through the app: the "arrives" part fills it, then the one after it.
    c = TestClient(create_app(world, live=False))
    rec = c.post("/api/tables/site/records", json={"values": {"address": "1 Main St"}}).json()
    assert parts_module.due(world, module["id"]) == [("checks", rec["id"])]
    # One call runs the chain: the checks, the item that waits on them (a row of Score, linked
    # to the site, named after the part; its score a problem, so tried twice), then the memo,
    # which reads the site's scores and waits only for the item to have run, not to succeed.
    assert parts_module.run_due(world, module_id=module["id"]) == 4
    row = world.collections.get("site", rec["id"])
    assert row["households"] == 52000 and row["traffic"] == 31000
    fields = row["_provenance"]["fields"]
    assert fields["households"]["source"].startswith("Census ACS")
    assert fields["households"]["part"] == "checks"
    assert fields["households"]["fetched_at"] == "2026-10-11T10:00:00Z"
    scores = world.collections.query("score", limit=None)
    assert len(scores) == 1 and scores[0]["site"] == rec["id"]
    assert scores[0]["item"] == "Visibility" and scores[0].get("score") is None
    assert scores[0]["note"] == "Seen from the road at 1 Main St"
    assert scores[0]["_provenance"]["part"] == "visibility"
    assert scores[0]["_provenance"]["fields"]["score"]["problem"] == "needs a drive-by, not a guess"
    assert scores[0]["_provenance"]["fields"]["score"]["attempts"] == 2
    assert row["memo"] == ("Memo for 1 Main St: 52000 households; Visibility: None"
                           " (Seen from the road at 1 Main St)")
    assert fields["memo"]["part"] == "memo"
    assert parts_module.due(world, module["id"]) == []
    # Try again on the item from the score's own page runs it for the site it belongs to.
    out = c.post(f"/api/modules/{module['id']}/parts/visibility/run",
                 json={"row": scores[0]["id"]}).json()
    assert out["ok"] and world.collections.query("score", limit=None)[0]["id"] == scores[0]["id"]
    did = [e for e in world.journal.recent(6, module=module["id"]) if e["kind"] == "did"]
    assert any("Trade area checks on a row of site: households = 52000" in e["text"] for e in did)
    # A row the part cannot fill: the problem on the row, two tries, then left alone.
    bad = c.post("/api/tables/site/records", json={"values": {"address": "fail st"}}).json()
    # The checks fail twice in the one call (two rounds); the parts after them still run, with
    # the empty fields in as null: the item (twice), then the memo once.
    assert parts_module.run_due(world, module_id=module["id"]) == 5
    row = world.collections.get("site", bad["id"])
    assert row.get("households") is None
    assert row["memo"].startswith("Memo for fail st: None households; Visibility: None")
    assert row["_provenance"]["fields"]["households"]["problem"] == "the geocoder found nothing"
    assert row["_provenance"]["fields"]["households"]["attempts"] == 2
    assert parts_module.due(world, module["id"]) == []  # two tries, left alone
    # When asked, from the page.
    out = c.post(f"/api/modules/{module['id']}/parts/rescore/run", json={"row": rec["id"]}).json()
    assert out["ok"] and out["values"] == {"households": 52000}
    assert [p["id"] for p in c.get(f"/api/modules/{module['id']}/parts").json()] == [
        "checks", "visibility", "memo", "rescore"]
    assert c.post(f"/api/modules/{module['id']}/parts/nope/run",
                  json={"row": rec["id"]}).status_code == 400


def test_a_stuck_build_waits_for_the_persons_continue(world: World, home: Path) -> None:
    wf = agreed_page(world)
    out = workflow_build.run(world, wf["id"], runner=builder(stuck=True))
    assert out["state"] == "stopped"
    line = world.journal.recent(1, thread=wf["conversation"])[0]
    assert "stopped: the geocoder needs a key" in line["text"]
    assert world.workflows.waiting() == []  # the scheduler leaves it
    c = TestClient(create_app(world, live=False))
    assert c.post(f"/api/workflows/{wf['id']}/resume").json()["state"] == "agreed"
    assert [w["id"] for w in world.workflows.waiting()] == [wf["id"]]
    # The next run finds the module and the tables already made; nothing is made twice.
    done = workflow_build.run(world, wf["id"], runner=builder())
    assert done["state"] == "built"
    assert len([m for m in world.modules.all() if m["name"] == "Picking car wash sites"]) == 1
    assert len(world.collections.overview(done["module"])) == 3


def test_the_scheduler_builds_an_agreed_workflow(world: World, home: Path,
                                                  monkeypatch: pytest.MonkeyPatch) -> None:
    import time

    wf = agreed_page(world)
    scheduler = Scheduler(world, builder())
    scheduler.kick()
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline and world.workflows.get(wf["id"])["state"] != "built":
        time.sleep(0.05)
    assert world.workflows.get(wf["id"])["state"] == "built"
    scheduler.stop_event.set()


def test_a_parts_output_is_read_strictly() -> None:
    out = parts_module.parse_output('log\n{"values": {"a": 1}, "sources": {}, "problems": {}}')
    assert out["values"] == {"a": 1}
    with pytest.raises(Problem):
        parts_module.parse_output("nothing here")
    assert parts_module.parts_of(None) == []
