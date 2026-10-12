"""The dashboards' event pass (12 Oct 2026, the owner: "an event based automation that runs
across all modules and updates the dashboard"). A kept card's numbers follow the rows by
themselves (the window works them out each time), so what this pass watches is a change that
matters in what a table holds: a new table with rows, its first rows, new fields, new choices
(`world/cards.what_changed`). On one, Alpha gets a short turn to propose cards for that table; the
person's yes keeps them. Tables there before the pass first ran are taken as they are, so Alpha
starts quietly rather than proposing for everything at once.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from alpha.runtime import route, turn
from alpha.world.cards import shape_of, what_changed
from alpha.world.world import World

log = logging.getLogger(__name__)


def review(world: World, runner: turn.Runner = route.run,
           stop: Callable[[], bool] = lambda: False) -> list[dict[str, Any]]:
    """Look at every table once; propose cards where a change matters. Returns what it asked.
    A table's new shape is recorded before Alpha is asked, so a turn that fails is not asked
    again every pass (the change is let go; the person can still ask from the table's ⋮)."""
    first = not world.cards.started()
    seen = world.cards.shapes()
    asked = []
    for t in world.collections.overview():
        if stop():
            break
        try:
            desc = world.collections.describe(t["name"])
            shape = shape_of(desc)
            before = seen.get(t["name"])
            if before == shape or not world.cards.claim(t["name"], before, shape):
                continue  # unchanged, or another pass took this change
            change = None if first else what_changed(before, shape)
            if change is None:
                continue
            kept = world.cards.of(t["name"])
            waiting = world.cards.pending(t["name"])
            sentence = (
                f"The {desc['title']} table ({t['name']}) changed: {change}. It keeps "
                + (f"{len(kept)} dashboard card(s): " + "; ".join(c["title"] for c in kept)
                   if kept else "no dashboard cards yet")
                + (f", and {len(waiting)} proposed card(s) wait for the person's answer"
                   if waiting else "")
                + ". If a card would help the person act on what is now in it, propose it with"
                " card_propose (only ones it doesn't keep or wait for); if none would, propose"
                " nothing. Answer in one line.")
            outcome = turn.ask(world, sentence, module=desc["module"], runner=runner,
                               actor="alpha", journal_as=f"Looked at {desc['title']}'s"
                               f" dashboard: {change}.")
            asked.append({"collection": t["name"], "change": change, "ok": outcome.ok})
        except Exception:
            log.exception("dashboard cards for %s", t["name"])
    if first:
        world.cards.start()
    return asked
