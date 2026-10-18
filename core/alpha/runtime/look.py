"""Alpha looks at a page before it says it is done (harness slice 7b, 18 October 2026).

Kenil, 18 Oct, on the first page the model drew: "it's not clean"; the model's own reply had
said "I haven't looked at the rendered page". So after a page is made or changed, the core
renders it as the window would (headless Chromium, the app's variables, no network), keeps the
image beside the page (`pages/.looks/<name>.png`, inside the module's directory where the
model may Read it), and asks one small judgement with eyes (`page_look.md`): clean, or what is
wrong. The hand hands both back; a page that is not clean is fixed in the same turn. The
journal keeps the verdict.
"""

from __future__ import annotations

import json
import logging
import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from alpha import config
from alpha.connectors.base import connectors_dir
from alpha.connectors.browser import chromium_path, node_binary
from alpha.runtime import judge, route
from alpha.runtime.running import RunResult, TurnRequest
from alpha.world.store import Problem
from alpha.world.world import World

log = logging.getLogger(__name__)
Shooter = Callable[[str, Path, dict[str, Any]], dict[str, Any]]
Runner = Callable[[TurnRequest], RunResult]
WIDTH = 900
# The window's variables for the look, light: the same names PageFrame posts, with the app's
# light values (desktop/src/styles/app.css); the look is of the page's shape, not its theme.
LIGHT_VARS = {
    "--bg": "#fafbfc", "--surface": "#ffffff", "--surface-2": "#f3f5f7", "--text": "#1a2b3c",
    "--text-2": "#4b5a6a", "--text-3": "#5f6b78", "--border": "#e3e6ea", "--line": "#f1f3f5",
    "--hover": "#eef1f4", "--primary": "#3f6f99", "--primary-ink": "#ffffff",
    "--primary-soft": "#e4edf5", "--good": "#4f7a52", "--good-soft": "#e5eee5",
    "--warn": "#8a5f2c", "--warn-soft": "#f6eee2", "--bad": "#b4413a", "--bad-soft": "#f6e5e3",
    "--chart-3": "#6b7c65", "--font-ui": "-apple-system, BlinkMacSystemFont, 'SF Pro Text',"
                                          " 'Segoe UI', sans-serif",
    "--font-mono": "'SF Mono', ui-monospace, Menlo, monospace", "--text-xs": "11px",
    "--text-sm": "12px", "--text-md": "13px", "--text-base": "14px", "--text-lg": "16px",
    "--text-xl": "20px", "--text-2xl": "26px",
}


@dataclass
class Look:
    image: Path | None
    clean: bool
    words: str
    errors: list[str]


def shot(html: str, out: Path, theme: dict[str, Any]) -> dict[str, Any]:
    """Render the page in Alpha's own Chromium and keep the image at `out`."""
    if chromium_path() is None:
        raise Problem("Alpha's browser isn't installed yet, so it cannot look at the page.")
    script = connectors_dir() / "browser" / "scripts" / "page_shot.mjs"
    out.parent.mkdir(parents=True, exist_ok=True)
    job = json.dumps({"html": html, "out": str(out), "width": WIDTH, "theme": theme})
    done = subprocess.run([node_binary(), str(script)], input=job, capture_output=True,
                          text=True, timeout=60, cwd=str(script.parent.parent))
    if done.returncode != 0 or not out.exists():
        tail = (done.stderr or done.stdout).strip().splitlines()[-1:] or ["no output"]
        raise Problem(f"The page could not be rendered for a look: {tail[0][:200]}")
    try:
        return dict(json.loads(done.stdout.strip().splitlines()[-1]))
    except (ValueError, IndexError):
        return {}


def page(world: World, module_ref: str, name: str, *, runner: Runner = route.run,
         shooter: Shooter = shot, turn: str | None = None) -> Look:
    """One look at a page: the image kept beside it, the judgement, the journal line."""
    m = world.modules.get(module_ref)
    html = world.pages.render(m["id"], name)
    image = world.pages.dir_of(m["id"]) / ".looks" / f"{name}.png"
    try:
        rendered = shooter(html, image, {"vars": LIGHT_VARS, "theme": "light"})
    except Problem as e:
        world.journal.append("failed", f"Alpha could not look at the page {name}: {e}",
                             actor="alpha", module=m["id"], data={"page": name, "turn": turn})
        return Look(image=None, clean=False, words=str(e), errors=[])
    errors = [str(e) for e in (rendered.get("errors") or [])]
    if errors:
        words = f"its script failed: {errors[0][:160]}"
        clean = False
    else:
        verdict = judge.ask(judge.Question(
            kind="yes_no", state=f"Read the image at {image} with the Read tool; it is the page"
                                 f" '{name}' as the person sees it, {rendered.get('height', '?')}"
                                 " px tall at 900 px wide.",
            text="Is the page clean by the rules?"),
            runner=runner, model=config.model_for("look"), world_path=world.path,
            turn_id=turn or "look", kind="look", system=config.prompt("page_look"))
        clean = verdict.answer == "yes" and verdict.confidence >= 0.5
        words = verdict.why or ("clean" if clean else "not clean")
    world.journal.append("checked", f"Alpha looked at the page {name}: "
                         + ("clean." if clean else f"not clean: {words}"),
                         actor="alpha", module=m["id"],
                         data={"page": name, "clean": clean, "image": str(image), "turn": turn})
    return Look(image=image, clean=clean, words=words, errors=errors)
