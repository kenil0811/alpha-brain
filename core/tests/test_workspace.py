"""The workspace (§6.4, kept by §12): the walled build run, the no-network profile for the
workspace's own scripts, a workspace inside Alpha's home, and the proxy as the one road out."""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path
from typing import Any

import pytest

from alpha.runtime import workspace as workspace_module
from alpha.runtime.claude_cli import TurnRequest, argv, tools_allowed


@pytest.fixture
def home(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    monkeypatch.setenv("ALPHA_HOME", str(tmp_path / "home"))
    return tmp_path / "home"


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
    assert str(ws / "inputs") in sandbox["filesystem"]["denyWrite"]
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



def test_the_proxy_lets_the_pages_hosts_through_and_refuses_the_rest() -> None:
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
