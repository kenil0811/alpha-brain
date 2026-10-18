"""Alpha looks at a page before it says it is done (slice 7b): the image kept beside the page,
one small judgement with eyes, the journal line; a page whose script fails is not clean."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from test_pages import CHART, DAYS, food

from alpha.runtime import look
from alpha.runtime.running import RunResult, TurnRequest
from alpha.world.world import World


def shooter_that_draws(errors: list[str] | None = None) -> tuple[look.Shooter, list[str]]:
    seen: list[str] = []

    def shoot(html: str, out: Path, theme: dict[str, Any]) -> dict[str, Any]:
        seen.append(html)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(b"png")
        assert theme["vars"]["--primary"] == "#3f6f99"
        return {"height": 640, "errors": errors or []}

    return shoot, seen


def runner_saying(answer: str, why: str) -> tuple[look.Runner, list[TurnRequest]]:
    asked: list[TurnRequest] = []

    def run(req: TurnRequest) -> RunResult:
        asked.append(req)
        return RunResult(ok=True, reply=f'{{"answer": "{answer}", "confidence": 0.9,'
                                        f' "why": "{why}"}}')

    return run, asked


def test_a_clean_page_is_seen_judged_and_journaled(world: World) -> None:
    food(world)
    world.pages.keep("Food", "overview", "Food", CHART, {"days": DAYS})
    shoot, html = shooter_that_draws()
    run, asked = runner_saying("yes", "clean")
    seen = look.page(world, "Food", "overview", runner=run, shooter=shoot, turn="t1")
    assert seen.clean and seen.words == "clean" and seen.image is not None
    assert seen.image.name == "overview.png" and seen.image.parent.name == ".looks"
    assert seen.image.is_file() and "alpha.ui" in html[0]
    assert asked[0].kind == "look" and "Read the image at" in asked[0].sentence
    assert str(seen.image) in asked[0].sentence
    checked = world.journal.recent(3, kinds=["checked"])[-1]
    assert checked["text"] == "Alpha looked at the page overview: clean."
    assert checked["data"]["clean"] is True


def test_a_page_that_is_not_clean_says_what_is_wrong(world: World) -> None:
    food(world)
    world.pages.keep("Food", "overview", "Food", CHART, {"days": DAYS})
    shoot, _ = shooter_that_draws()
    run, _ = runner_saying("no", "the bottom axis labels are cut off")
    seen = look.page(world, "Food", "overview", runner=run, shooter=shoot)
    assert not seen.clean and seen.words == "the bottom axis labels are cut off"
    assert world.journal.recent(2, kinds=["checked"])[-1]["text"].endswith(
        "not clean: the bottom axis labels are cut off")
    # a script that fails is not clean without asking anyone
    shoot2, _ = shooter_that_draws(["ReferenceError: days is not defined"])
    run2, asked = runner_saying("yes", "clean")
    seen = look.page(world, "Food", "overview", runner=run2, shooter=shoot2)
    assert not seen.clean and seen.words.startswith("its script failed: ReferenceError")
    assert asked == []


def test_no_browser_means_no_look_not_a_failed_page(world: World) -> None:
    from alpha.world.store import Problem
    food(world)
    world.pages.keep("Food", "overview", "Food", CHART, {"days": DAYS})

    def no_browser(html: str, out: Path, theme: dict[str, Any]) -> dict[str, Any]:
        raise Problem("Alpha's browser isn't installed yet, so it cannot look at the page.")

    run, asked = runner_saying("yes", "clean")
    seen = look.page(world, "Food", "overview", runner=run, shooter=no_browser)
    assert seen.image is None and not seen.clean and "browser" in seen.words and asked == []
    assert world.journal.recent(2, kinds=["failed"])[-1]["text"].startswith(
        "Alpha could not look at the page overview")
