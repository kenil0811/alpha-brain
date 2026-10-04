"""The desktop acceptance check (`just check-desktop`): every page of the window, at the sizes
a person uses it, against a core on a copy of the world.

What runs, in order: the world is copied with SQLite's backup (`copy_home`, never `cp`); a core
starts on the copy as `alpha serve --no-background` (no scheduler, second opinion or noticing,
so nothing runs on its own there); the window is built with `vite build` into the copy's folder,
pointed at that core, and served on port 1430 (the one loopback origin the core's CORS allows
besides the app's own); then `desktop/scripts/check-pages.ts` opens every page in headless
Chromium at each size and says what a person would call broken (a failed request, an error, a
problem notice, nothing rendered, overflow, clipped text). The sizes are the window's own: its
minimum and its default from `tauri.conf.json`, the default again in dark.

The report lands in `docs/checks/<stamp>.md` (and `.json`, written first); the screenshots in
`desktop/.check/<stamp>/`. Acceptance is still a real run in the app (CLAUDE.md): this check
finds what a page shows when it is merely opened, which is most of what a review of screenshots
finds, in minutes and the same way every time.
"""
from __future__ import annotations

import http.server
import json
import logging
import os
import secrets
import select
import shutil
import socket
import subprocess
import sys
import threading
import time
from datetime import datetime
from functools import partial
from pathlib import Path
from typing import Any

from alpha.api.server import READY_PREFIX
from alpha.connectors.browser import node_binary
from alpha.journeys.suite import copy_home, default_world
from alpha.world.store import Problem

log = logging.getLogger(__name__)

REPO = Path(__file__).resolve().parents[3]
DESKTOP = REPO / "desktop"
APP_PORT = 1430  # the origin the core allows for a window served outside the app
CORE_START_S = 90


def sizes(conf: Path | None = None) -> list[dict[str, Any]]:
    """The window's sizes to check: its minimum and its default, from the window's own
    configuration, and the default in dark."""
    window = json.loads((conf or DESKTOP / "src-tauri" / "tauri.conf.json").read_text())
    w = window["app"]["windows"][0]
    return [
        {"width": w["minWidth"], "height": w["minHeight"], "scheme": "light"},
        {"width": w["width"], "height": w["height"], "scheme": "light"},
        {"width": w["width"], "height": w["height"], "scheme": "dark"},
    ]


def _free(port: int) -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        if s.connect_ex(("127.0.0.1", port)) == 0:
            raise Problem(f"Port {port} is in use (a dev server?). Stop it, then run the check.")


class _Core:
    """A check core on the copy, started the way the app starts one, stopped when done."""

    def __init__(self, home: Path, world: Path, token: str) -> None:
        env = {**os.environ, "ALPHA_HOME": str(home), "ALPHA_WORLD": str(world),
               "ALPHA_TOKEN": token}
        self.log_path = home / "logs" / "check-core.log"
        self._log = self.log_path.open("w")
        self.proc = subprocess.Popen(
            [sys.executable, "-m", "alpha.cli", "serve", "--port", "0", "--no-background"],
            env=env, stdout=subprocess.PIPE, stderr=self._log, text=True)
        self.url = f"http://127.0.0.1:{self._ready()}"

    def _ready(self) -> int:
        assert self.proc.stdout is not None
        deadline = time.monotonic() + CORE_START_S
        while time.monotonic() < deadline:
            readable, _, _ = select.select([self.proc.stdout], [], [], 0.5)
            if not readable:
                if self.proc.poll() is not None:
                    break
                continue
            line = self.proc.stdout.readline()
            if not line:
                break
            if line.startswith(READY_PREFIX):
                return int(json.loads(line[len(READY_PREFIX):])["port"])
        self.stop()
        tail = self.log_path.read_text()[-800:]
        raise Problem(f"The check core did not start. Its log ends:\n{tail}")

    def stop(self) -> None:
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(10)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        self._log.close()


def _build_window(node: str, into: Path, core_url: str, token: str) -> Path:
    """`vite build` of the window pointed at the check core, as the app's own build but served
    from a folder: the thing a person opens, not the dev server."""
    dist = into / "dist"
    env = {**os.environ, "PATH": f"{Path(node).parent}:{os.environ.get('PATH', '')}",
           "VITE_ALPHA_CORE_URL": core_url, "VITE_ALPHA_CORE_TOKEN": token,
           "TAURI_ENV_DEBUG": "1"}
    run = subprocess.run([node, "node_modules/vite/bin/vite.js", "build", "--outDir", str(dist),
                          "--emptyOutDir", "--logLevel", "warn"],
                         cwd=DESKTOP, env=env, capture_output=True, text=True)
    if run.returncode != 0 or not (dist / "index.html").exists():
        raise Problem(f"The window did not build:\n{(run.stderr or run.stdout)[-1500:]}")
    return dist


class _Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:  # noqa: A002 (the base's name)
        return


class _Served:
    """The built window on the check port, for the length of a `with`."""

    def __init__(self, dist: Path, port: int) -> None:
        handler = partial(_Quiet, directory=str(dist))
        self.server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)

    def __enter__(self) -> _Served:
        self.thread.start()
        return self

    def __exit__(self, *exc: object) -> None:
        self.server.shutdown()
        self.server.server_close()


def _check_pages(node: str, job: dict[str, Any]) -> dict[str, Any]:
    run = subprocess.run([node, "scripts/check-pages.ts"], cwd=DESKTOP, input=json.dumps(job),
                         capture_output=False, stdout=subprocess.PIPE, text=True)
    if run.returncode != 0 or not run.stdout.strip():
        raise Problem("The page check did not finish; its output is above.")
    result: dict[str, Any] = json.loads(run.stdout.strip().splitlines()[-1])
    return result


def report(result: dict[str, Any], *, source: Path, shots: Path, began: datetime) -> str:
    """The report a person reads: one row per page with each size's verdict, then every
    problem under its page and size."""
    pages: list[dict[str, Any]] = result["pages"]
    labels: list[str] = []
    for p in pages:
        label = f"{p['width']}×{p['height']}" + (" dark" if p["scheme"] == "dark" else "")
        if label not in labels:
            labels.append(label)
    by_page: dict[str, dict[str, dict[str, Any]]] = {}
    for p in pages:
        label = f"{p['width']}×{p['height']}" + (" dark" if p["scheme"] == "dark" else "")
        by_page.setdefault(p["path"], {})[label] = p
    clean = sum(1 for sizes_ in by_page.values()
                if all(not p["problems"] for p in sizes_.values()))
    problems = sum(sum(q["count"] for q in p["problems"]) for p in pages)
    lines = [f"# Desktop check, {began.strftime('%-d %b %Y %H:%M')}", "",
             f"{clean} of {len(by_page)} pages clean at every size; {problems} problem(s) in all."
             f" World: a copy of `{source}`. Screenshots: `{shots}`.", "",
             "| Page | " + " | ".join(labels) + " |", "|---|" + "---|" * len(labels)]
    for path, sizes_ in by_page.items():
        title = next(iter(sizes_.values()))["title"]
        cells = []
        for label in labels:
            at = sizes_.get(label)
            if at is None:
                cells.append("—")
            elif at["problems"]:
                cells.append(f"**{sum(q['count'] for q in at['problems'])} problem(s)**")
            else:
                cells.append(f"clean, {at['ms'] / 1000:.1f} s")
        lines.append(f"| {title} (`{path}`) | " + " | ".join(cells) + " |")
    if problems:
        lines += ["", "## Problems"]
        for path, sizes_ in by_page.items():
            for label, p in sizes_.items():
                if not p["problems"]:
                    continue
                lines += ["", f"### {p['title']} (`{path}`), {label} — `{p['shot']}`", ""]
                for q in p["problems"]:
                    times = f" (× {q['count']})" if q["count"] > 1 else ""
                    lines.append(f"- **{q['kind']}**: {q['detail']}{times}")
    return "\n".join(lines) + "\n"


def run_check(only: list[str] | None = None, *, world_path: Path | None = None,
              scratch: Path | None = None, out_dir: Path | None = None,
              shots_dir: Path | None = None, keep: bool = False) -> tuple[int, Path]:
    """Copy the world, start a check core, build and serve the window, check every page, write
    `docs/checks/<stamp>.md` and `.json`. Returns (pages with problems, report path)."""
    began = datetime.now().astimezone()
    source = world_path or default_world()
    stamp = began.strftime("%Y-%m-%d-%H%M")
    home = scratch or Path(os.environ.get("TMPDIR", "/tmp")) / "alpha-check" / stamp
    shots = (shots_dir or DESKTOP / ".check") / stamp
    node = node_binary()
    _free(APP_PORT)
    copied = copy_home(source, home)
    token = secrets.token_hex(16)
    core = _Core(home, copied, token)
    try:
        dist = _build_window(node, home, core.url, token)
        with _Served(dist, APP_PORT):
            job = {"app": f"http://127.0.0.1:{APP_PORT}", "core": core.url, "token": token,
                   "out": str(shots), "sizes": sizes(), "only": only or []}
            result = _check_pages(node, job)
    finally:
        core.stop()
    folder = out_dir or REPO / "docs" / "checks"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / f"{stamp}.json").write_text(json.dumps(result, indent=1, ensure_ascii=False))
    text = report(result, source=source, shots=shots, began=began)
    (folder / f"{stamp}.md").write_text(text)
    if not keep:
        shutil.rmtree(home, ignore_errors=True)
    failures = sum(1 for p in result["pages"] if p["problems"])
    return failures, folder / f"{stamp}.md"
