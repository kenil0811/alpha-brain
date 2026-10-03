"""The desktop acceptance check's own mechanisms: the sizes come from the window's
configuration, the report says what a person needs, the check port must be free. The browser
half runs for real only in `just check-desktop` (its pure parts are tested with vitest)."""
from __future__ import annotations

import json
import socket
from datetime import datetime
from pathlib import Path
from typing import Any

import pytest

from alpha.journeys import desktop
from alpha.world.store import Problem


def test_sizes_are_the_windows_own(tmp_path: Path) -> None:
    conf = tmp_path / "tauri.conf.json"
    conf.write_text(json.dumps({"app": {"windows": [
        {"width": 1240, "height": 820, "minWidth": 860, "minHeight": 560}]}}))
    assert desktop.sizes(conf) == [
        {"width": 860, "height": 560, "scheme": "light"},
        {"width": 1240, "height": 820, "scheme": "light"},
        {"width": 1240, "height": 820, "scheme": "dark"},
    ]


def test_the_real_configuration_has_the_sizes() -> None:
    found = desktop.sizes()
    assert len(found) == 3
    assert found[0]["width"] < found[1]["width"]


def _page(path: str, title: str, width: int, scheme: str = "light",
          **problem: object) -> dict[str, Any]:
    problems = [problem] if problem else []
    return {"path": path, "title": title, "width": width, "height": 560 if width == 860 else 820,
            "scheme": scheme, "ms": 1234, "shot": f"{path.strip('/')}@{width}.png",
            "problems": problems}


def test_report_has_a_row_per_page_and_every_problem_under_its_page() -> None:
    result = {"pages": [
        _page("/home", "Home", 860), _page("/home", "Home", 1240),
        _page("/home", "Home", 1240, "dark"),
        _page("/m/m_1", "Module: Deals", 860, kind="text clipped",
              detail="span.cell needs 200px, has 100px", count=3),
        _page("/m/m_1", "Module: Deals", 1240), _page("/m/m_1", "Module: Deals", 1240, "dark"),
    ]}
    text = desktop.report(result, source=Path("/w/world.sqlite"), shots=Path("/s"),
                          began=datetime(2026, 10, 3, 23, 5))
    assert "1 of 2 pages clean at every size; 3 problem(s) in all." in text
    assert "| Page | 860×560 | 1240×820 | 1240×820 dark |" in text
    assert "| Home (`/home`) | clean, 1.2 s | clean, 1.2 s | clean, 1.2 s |" in text
    assert "| Module: Deals (`/m/m_1`) | **3 problem(s)** | clean, 1.2 s | clean, 1.2 s |" in text
    assert "### Module: Deals (`/m/m_1`), 860×560 — `m/m_1@860.png`" in text
    assert "- **text clipped**: span.cell needs 200px, has 100px (× 3)" in text


def test_report_without_problems_has_no_problems_section() -> None:
    text = desktop.report({"pages": [_page("/home", "Home", 860)]}, source=Path("/w"),
                          shots=Path("/s"), began=datetime(2026, 10, 3, 23, 5))
    assert "1 of 1 pages clean" in text
    assert "## Problems" not in text


def test_a_busy_check_port_is_named_plainly() -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        s.listen(1)
        port = s.getsockname()[1]
        with pytest.raises(Problem, match=f"Port {port} is in use"):
            desktop._free(port)
    desktop._free(port)  # closed: free again
