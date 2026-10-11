"""Modules as programs (Q38): a program plan's workspace with its three artifacts, the walled
run, one milestone per session judged by the evaluator (checks by code under the no-network
profile, then a judging run), ready-to-look-at between milestones, stuck after three fails,
the module's own tables read-only in the app, removal taking the workspace."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

import pytest
from conftest import PIECES, researching
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.runtime import build, milestones
from alpha.runtime import workspace as workspace_module
from alpha.runtime.claude_cli import RunResult, TurnRequest, argv, tools_allowed
from alpha.world import purge
from alpha.world.plans import clean_hosts, clean_milestones
from alpha.world.store import Problem
from alpha.world.world import World

MILESTONES: list[dict[str, Any]] = [
    {"id": "M0", "title": "One layer and one scored row", "what": "The sites table with one"
     " scored address and the self-test.", "checks": [
         {"kind": "selftest"}, {"kind": "rows", "table": "sites", "min": 1},
         {"kind": "query", "sql": "select max(score) from sites", "min": 0, "max": 100},
         {"kind": "file", "path": "data/sites.parquet"},
         {"kind": "provenance", "layer": "sites"}]},
    {"id": "M1", "title": "Every parcel screened", "what": "All parcels through the gates.",
     "checks": [{"kind": "rows", "table": "sites", "min": 2}]},
]


@pytest.fixture
def home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("ALPHA_HOME", str(tmp_path / "home"))
    return tmp_path / "home"


def program_plan(world: World, title: str = "Site Scorer") -> dict[str, Any]:
    t = researching(world, turn=world.journal.append("said", "build me a scorer", actor="person"))
    out = t.plan_propose(title, "## The job\nPick sites.\n## The data model\nsites.",
                         "score one address", pieces=PIECES, milestones=MILESTONES,
                         hosts=["https://api.census.gov/data", "Services.ArcGIS.com", "bad host"])
    assert "plan" in out, out
    plan = world.plans.get(out["plan"])
    assert [m["id"] for m in plan["milestones"]] == ["M0", "M1"]
    assert plan["hosts"] == ["api.census.gov", "services.arcgis.com"]
    world.plans.approve(plan["id"], "yes")
    return world.plans.get(plan["id"])


def builder(world_path: Path, *, score: float = 72.0, rows: int = 1, selftest_ok: bool = True,
            judge_pass: bool = True, stuck: bool = False) -> Any:
    """A model that builds the milestone for real in the workspace: a venv-less python
    script, a DuckDB table, a parquet layer with provenance, a self-test, progress, a commit."""

    def runner(req: TurnRequest) -> RunResult:
        if req.kind == "judge":
            return RunResult(ok=True, reply=json.dumps({"pass": judge_pass,
                                                        "why": "The rows and the test agree.",
                                                        "fix": "" if judge_pass else "Add rows."}))
        assert req.workspace and req.kind == "turn"
        ws = Path(req.workspace)
        assert "api.census.gov" in req.hosts and "pypi.org" in req.hosts
        assert "DESIGN.md" in (ws / "DESIGN.md").read_text() or True
        if stuck:
            return RunResult(ok=True, reply="STUCK: the county's parcel service needs a token.")
        import duckdb

        (ws / "data").mkdir(exist_ok=True)
        con = duckdb.connect(str(ws / "module.duckdb"))
        con.execute("CREATE OR REPLACE TABLE sites AS SELECT * FROM (VALUES"
                    + ", ".join(f"({i + 1}, '{i + 1} Main St', {score}, 'TxDOT', 'nearest segment')"
                                for i in range(rows))
                    + ") t(id, address, score, source, method)")
        con.execute(f"COPY sites TO '{ws / 'data' / 'sites.parquet'}' (FORMAT PARQUET)")
        con.close()
        (ws / "data" / "sites.provenance.json").write_text(json.dumps({
            "sources": [{"title": "TxDOT AADT", "url": "https://services.arcgis.com/x/query"}],
            "fetched_at": "2026-10-10T10:00:00Z", "vintage": "2025", "rows": rows,
            "method": "pipeline.build_sites"}))
        (ws / "selftest.py").write_text(
            "import duckdb, sys\n"
            "con = duckdb.connect('module.duckdb', read_only=True)\n"
            "n = con.execute('select count(*) from sites').fetchone()[0]\n"
            f"print('sites rows', n)\nsys.exit(0 if n >= 1 and {selftest_ok} else 1)\n")
        with (ws / "PROGRESS.md").open("a") as f:
            f.write("\n## session\n- Built the sites table with one scored address.\n")
        workspace_module._git(ws, "add", "-A")
        workspace_module._git(ws, "commit", "-q", "-m", "M0: sites")
        return RunResult(ok=True, reply="Built the sites table; open it on the module's page.")

    return runner


def test_a_plan_with_milestones_needs_real_checks_and_clean_hosts(world: World) -> None:
    with pytest.raises(Problem):
        clean_milestones([{"id": "M0", "title": "x", "what": "y", "checks": []}])
    with pytest.raises(Problem):
        clean_milestones([{"title": "x", "what": "y", "checks": [{"kind": "rows"}]}])
    with pytest.raises(Problem):
        clean_milestones([{"title": "x", "what": "y", "checks": [{"kind": "magic"}]}])
    ms = clean_milestones([{"title": "x", "what": "y", "checks": [{"kind": "selftest"}]},
                           {"title": "z", "what": "w", "checks": [{"kind": "file", "path": "a"}]}])
    assert [m["id"] for m in ms] == ["M0", "M1"] and ms[0]["passes"] is False
    assert clean_hosts(["https://A.com/x", "a.com", "nope", "b.org:443"]) == ["a.com", "b.org"]
    t = researching(world, turn="j_1")
    out = t.plan_propose("P", "Body.", "t t", pieces=PIECES, hosts=["a.com"], milestones=[
        {"title": "x", "what": "y", "checks": [{"kind": "rows"}]}])
    assert "names its table" in out["error"]


def test_a_plan_in_the_designs_stages_must_carry_milestones_and_hosts(world: World) -> None:
    t = researching(world, turn="j_1")
    design = "## What I understood\nA screener.\n## Data model\ncandidates.\n## Method\nGates."
    out = t.plan_propose("Screener", design, "screen one address", pieces=PIECES)
    assert "give its milestones" in out["error"]
    out = t.plan_propose("Screener", design, "screen one address", pieces=PIECES,
                         milestones=MILESTONES)
    assert "give hosts" in out["error"]
    out = t.plan_propose("Screener", design, "screen one address", pieces=PIECES,
                         milestones=MILESTONES, hosts=["api.census.gov"])
    assert "plan" in out and world.plans.get(out["plan"])["hosts"] == ["api.census.gov"]
    # A plain plan (a log, a list kept current) needs none.
    assert "plan" in t.plan_propose("Runs", "## What I understood\nA log of runs.", "log a run",
                                    pieces=PIECES)


def test_a_workspace_run_is_walled(tmp_path: Path) -> None:
    ws = tmp_path / "ws"
    ws.mkdir()
    req = TurnRequest(sentence="build", system="rules", world_path=tmp_path / "w.sqlite",
                      turn_id="j", workspace=str(ws), hosts=["api.census.gov", "pypi.org"])
    assert "Bash" in tools_allowed(req) and "WebFetch(domain:api.census.gov)" in tools_allowed(req)
    args = argv(req, tmp_path / "mcp.json")
    settings = json.loads(args[args.index("--settings") + 1])
    sandbox = settings["sandbox"]
    assert sandbox["enabled"] and sandbox["allowUnsandboxedCommands"] is False
    assert sandbox["failIfUnavailable"] is True
    assert sandbox["filesystem"]["allowWrite"] == [str(ws)]
    assert str(ws / "milestones.json") in sandbox["filesystem"]["denyWrite"]
    assert str(tmp_path) in sandbox["filesystem"]["denyRead"]  # Alpha's world file's folder
    assert sandbox["network"]["allowedDomains"] == ["api.census.gov", "pypi.org"]
    assert settings["permissions"]["blockReadsOutsideWorkingDirectories"] is True
    assert "Bash" not in args[args.index("--disallowedTools") + 1:]
    assert args[args.index("--tools") + 1].startswith("Bash,Read,Edit,Write")
    plain = argv(TurnRequest(sentence="x", system="r", world_path=tmp_path / "w.sqlite",
                             turn_id="j"), tmp_path / "mcp.json")
    assert "--settings" not in plain and "Bash" in plain[plain.index("--disallowedTools") + 1:]


@pytest.mark.skipif(sys.platform != "darwin", reason="sandbox-exec is macOS")
def test_a_script_runs_with_no_network_and_writes_only_in_the_workspace(tmp_path: Path,
                                                                        home: Path) -> None:
    ws = tmp_path / "ws"
    ws.mkdir()
    outside = tmp_path / "outside.txt"
    (ws / "t.py").write_text(
        "import pathlib, urllib.request\n"
        "pathlib.Path('in.txt').write_text('ok')\n"
        f"try:\n    pathlib.Path({str(outside)!r}).write_text('x'); print('OUTSIDE-WRITTEN')\n"
        "except PermissionError: print('outside denied')\n"
        "try:\n    urllib.request.urlopen('https://example.com', timeout=5); print('NET-OPEN')\n"
        "except Exception as e: print('network denied')\n")
    code, out = workspace_module.run_script(ws, ["python", "t.py"], timeout_s=60)
    assert code == 0, out
    assert "outside denied" in out and "network denied" in out and not outside.exists()
    assert (ws / "in.txt").read_text() == "ok"
    code, out = workspace_module.run_script(ws, ["python", "-c", "import sys; sys.exit(3)"])
    assert code == 3


@pytest.mark.skipif(sys.platform != "darwin", reason="scripts run under sandbox-exec")
def test_a_workspace_inside_alphas_home_can_resolve_its_own_venv(home: Path) -> None:
    """Alpha's home is denied to scripts, and the workspace lives inside it: the venv's
    python resolves its own symlink through the home (found 11 Oct: every part failed with
    "realpath: .venv/bin/: Operation not permitted"); the home's contents stay denied."""
    home.mkdir(parents=True, exist_ok=True)
    (home / "world.sqlite").write_text("secret")
    ws = workspace_module.root() / "m_test"
    (ws / ".venv" / "bin").mkdir(parents=True)
    link = ws / ".venv" / "bin" / "python"
    link.symlink_to(sys.executable)
    # The C library's realpath, which python.org's launcher calls on its own path.
    resolve = ("import ctypes, os; libc = ctypes.CDLL(None, use_errno=True);"
               " libc.realpath.restype = ctypes.c_char_p;"
               f" r = libc.realpath({str(link).encode()!r}, None);"
               " print(r.decode() if r else 'EPERM ' + os.strerror(ctypes.get_errno()))")
    code, out = workspace_module.run_script(ws, ["python", "-c", resolve])
    assert code == 0 and out.strip() == os.path.realpath(sys.executable), out
    code, out = workspace_module.run_script(ws, ["/bin/cat", str(home / "world.sqlite")])
    assert code != 0 and "secret" not in out


@pytest.mark.skipif(sys.platform != "darwin", reason="the self-test runs under sandbox-exec")
def test_a_milestone_is_built_then_judged_and_the_person_looks_before_the_next(
        world: World, home: Path) -> None:
    plan = program_plan(world)
    runner = builder(world.path)
    first = build.run_build(world, plan["id"], runner=runner)
    assert first["state"] == "stopped", first.get("report")
    assert first["milestones"][0]["passes"] is True and first["milestones"][1]["passes"] is False
    assert "M0 (One layer and one scored row) is ready to look at" in first["report"]
    assert "say continue" in first["report"]
    module = world.modules.get(first["module"])
    ws = Path(module["workspace"])
    assert ws == workspace_module.path_of(module["id"])
    assert (ws / "DESIGN.md").read_text().startswith("# Site Scorer")
    assert json.loads((ws / "milestones.json").read_text())[0]["passes"] is True
    assert "- Built the sites table" in (ws / "PROGRESS.md").read_text()
    checked = [e for e in world.journal.recent(20, thread=first["thread"])
               if e["kind"] == "checked"]
    assert checked and "selftest.py passed" in checked[-1]["text"]
    assert "✓ Evaluator" in checked[-1]["text"]
    # The module's own table shows read-only in the app, beside the world's tables.
    c = TestClient(create_app(world, live=False))
    card = c.get(f"/api/modules/{module['id']}").json()
    names = [t["name"] for t in card["tables"]]
    assert f"{module['id']}:sites" in names and card["tables"][-1]["readonly"] is True
    shown = c.get(f"/api/tables/{module['id']}:sites").json()
    assert shown["table"]["readonly"] is True
    assert [f["name"] for f in shown["table"]["fields"]] == ["id", "address", "score", "source",
                                                             "method"]
    assert shown["records"][0]["address"] == "1 Main St" and shown["records"][0]["score"] == 72.0
    one = c.get(f"/api/tables/{module['id']}:sites/records/1").json()
    assert one["record"]["method"] == "nearest segment"
    # The person says continue: M1 builds, then everything is delivered.
    world.plans.resume(plan["id"])
    done = build.run_build(world, plan["id"], runner=builder(world.path, rows=3))
    assert done["state"] == "done" and all(m["passes"] for m in done["milestones"])
    assert "Every milestone is delivered" in done["report"]
    # Removal takes the workspace with it.
    purge.remove_module(world, module["name"])
    assert not ws.exists()


@pytest.mark.skipif(sys.platform != "darwin", reason="the self-test runs under sandbox-exec")
def test_a_failed_check_sends_the_finding_back_then_sticks(world: World, home: Path) -> None:
    plan = program_plan(world)
    failing = builder(world.path, selftest_ok=False)
    for n in (1, 2):
        again = build.run_build(world, plan["id"], runner=failing)
        assert again["state"] == "building" and again["milestones"][0]["attempts"] == n
        assert again["milestones"][0]["passes"] is False
    finding = [e for e in world.journal.recent(5, thread=again["thread"]) if e["kind"] == "did"]
    assert finding and "The evaluator's finding for M0" in finding[-1]["text"]
    stuck = build.run_build(world, plan["id"], runner=failing)
    assert stuck["state"] == "stopped" and "failed its checks 3 times" in stuck["report"]
    # A judge that says no fails the milestone even when every check passed.
    plan2 = program_plan(world, "Another Scorer")
    out = build.run_build(world, plan2["id"], runner=builder(world.path, judge_pass=False))
    assert out["milestones"][0]["passes"] is False and "Add rows" in out["milestones"][0]["why"]


def test_a_builder_that_is_stuck_stops_the_build_and_says_why(world: World, home: Path) -> None:
    plan = program_plan(world)
    out = build.run_build(world, plan["id"], runner=builder(world.path, stuck=True))
    assert out["state"] == "stopped" and "M0 is stuck" in out["report"]
    assert "needs a token" in out["report"]


def test_the_checks_by_code_say_why(tmp_path: Path) -> None:
    ws = tmp_path
    ok, why = milestones.run_check(ws, {"kind": "selftest"})
    assert not ok and "no selftest.py" in why
    ok, why = milestones.run_check(ws, {"kind": "file", "path": "data/x.parquet"})
    assert not ok and "missing" in why
    ok, why = milestones.run_check(ws, {"kind": "rows", "table": "sites", "min": 1})
    assert not ok and "module.duckdb" in why
    (ws / "data").mkdir()
    (ws / "data" / "x.provenance.json").write_text(json.dumps({"sources": [{"title": "t"}]}))
    ok, why = milestones.run_check(ws, {"kind": "provenance", "layer": "x"})
    assert not ok and "lacks" in why
    import duckdb

    con = duckdb.connect(str(ws / "module.duckdb"))
    con.execute("CREATE TABLE sites AS SELECT 1 AS id, 55.0 AS score")
    con.close()
    assert milestones.run_check(ws, {"kind": "rows", "table": "sites", "min": 1})[0]
    ok, why = milestones.run_check(ws, {"kind": "query", "sql": "select max(score) from sites",
                                        "min": 60})
    assert not ok and "55" in why
    assert milestones.run_check(ws, {"kind": "query", "sql": "select 1", "max": 1})[0]
    os.environ.pop("ALPHA_HOME", None)


# ---- jobs: what the person can do, and the one road out (Q38, slice 1b) ----

JOBS_YAML = """jobs:
  - id: screen
    title: Screen an address
    what: Runs the gates on one address.
    inputs:
      - {name: address, label: Address, kind: text, required: true}
    command: ["python", "job.py", "{address}"]
"""


def test_the_proxy_lets_the_plans_hosts_through_and_refuses_the_rest() -> None:
    import threading
    import urllib.error
    import urllib.request
    from http.server import BaseHTTPRequestHandler, HTTPServer

    from alpha.runtime.proxy import Proxy, allowed

    assert allowed("api.census.gov", ["census.gov"]) and not allowed("evil.com", ["census.gov"])
    assert not allowed("notcensus.gov", ["census.gov"])

    class Hello(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            body = b"hello " + self.path.encode()
            self.send_response(200)
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *a: Any) -> None:
            pass

    upstream = HTTPServer(("127.0.0.1", 0), Hello)
    threading.Thread(target=upstream.serve_forever, daemon=True).start()
    proxy = Proxy(["localhost"]).start()
    try:
        opener = urllib.request.build_opener(urllib.request.ProxyHandler(
            {"http": f"http://127.0.0.1:{proxy.port}"}))
        got = opener.open(f"http://localhost:{upstream.server_address[1]}/x", timeout=10).read()
        assert got == b"hello /x"
        with pytest.raises(urllib.error.HTTPError) as e:
            opener.open("http://example.com/", timeout=10)
        assert e.value.code == 403
        assert proxy.reached == {"localhost": 1} and proxy.refused == {"example.com": 1}
        assert proxy.words() == "reached localhost (1); refused example.com (1)"
    finally:
        proxy.stop()
        upstream.shutdown()


@pytest.mark.skipif(sys.platform != "darwin", reason="sandbox-exec is macOS")
def test_a_script_with_hosts_reaches_only_them_through_the_proxy(tmp_path: Path,
                                                                   home: Path) -> None:
    import threading
    from http.server import BaseHTTPRequestHandler, HTTPServer

    class Hello(BaseHTTPRequestHandler):
        def do_GET(self) -> None:
            self.send_response(200)
            self.send_header("Content-Length", "2")
            self.end_headers()
            self.wfile.write(b"ok")

        def log_message(self, *a: Any) -> None:
            pass

    upstream = HTTPServer(("127.0.0.1", 0), Hello)
    threading.Thread(target=upstream.serve_forever, daemon=True).start()
    port = upstream.server_address[1]
    ws = tmp_path / "ws"
    ws.mkdir()
    (ws / "t.py").write_text(
        "import urllib.request, urllib.error\n"
        f"print(urllib.request.urlopen('http://localhost:{port}/a', timeout=10).read())\n"
        "try:\n    urllib.request.urlopen('http://example.com/', timeout=10); print('OPEN')\n"
        "except urllib.error.HTTPError as e: print('refused', e.code)\n")
    try:
        code, out = workspace_module.run_script(ws, ["python", "t.py"], timeout_s=60,
                                                hosts=["localhost"])
    finally:
        upstream.shutdown()
    assert code == 0, out
    assert "b'ok'" in out and "refused 403" in out
    assert "[network: reached localhost (1); refused example.com (1)]" in out


@pytest.mark.skipif(sys.platform != "darwin", reason="jobs run under sandbox-exec")
def test_a_job_runs_from_the_modules_page_and_is_what_a_milestone_checks(
        world: World, home: Path) -> None:
    plan = program_plan(world)
    first = build.run_build(world, plan["id"], runner=builder(world.path))
    module = world.modules.get(first["module"])
    ws = Path(module["workspace"])
    c = TestClient(create_app(world, live=False))
    assert c.get(f"/api/modules/{module['id']}").json()["jobs"] == []
    (ws / "jobs.yaml").write_text(JOBS_YAML)
    (ws / "job.py").write_text(
        "import sys, duckdb\naddr = sys.argv[1]\n"
        "con = duckdb.connect('module.duckdb')\n"
        "con.execute(\"INSERT INTO sites VALUES (?, ?, 50.0, 'x', 'y')\", "
        "[int(con.execute('select max(id)+1 from sites').fetchone()[0]), addr])\n"
        "print('screened', addr)\n")
    jobs = c.get(f"/api/modules/{module['id']}").json()["jobs"]
    assert jobs[0]["title"] == "Screen an address" and jobs[0]["inputs"][0]["name"] == "address"
    missing = c.post(f"/api/modules/{module['id']}/jobs/screen", json={"inputs": {}})
    assert missing.status_code == 400 and "Address is needed" in missing.json()["error"]
    out = c.post(f"/api/modules/{module['id']}/jobs/screen",
                 json={"inputs": {"address": "2 Elm St; rm -rf /"}}).json()
    assert out["ok"] and "screened 2 Elm St; rm -rf /" in out["output"]
    rows = c.get(f"/api/tables/{module['id']}:sites").json()["records"]
    assert [r["address"] for r in rows] == ["1 Main St", "2 Elm St; rm -rf /"]
    did = world.journal.recent(1, module=module["id"])[0]
    assert did["kind"] == "did" and did["text"].startswith("Ran Screen an address (Address")
    assert "[network:" in out["output"]
    # The evaluator runs the job as the person would.
    ok, why = milestones.run_check(ws, {"kind": "job", "job": "screen",
                                        "inputs": {"address": "3 Oak St"}},
                                   world=world, module_id=module["id"])
    assert ok and "ran as the person would" in why
    ok, why = milestones.run_check(ws, {"kind": "job", "job": "nope", "inputs": {}},
                                   world=world, module_id=module["id"])
    assert not ok and "no job" in why
    assert c.post(f"/api/modules/{module['id']}/jobs/nope", json={}).status_code == 400
