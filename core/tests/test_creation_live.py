"""Live check of the creation process's first step against a real model (Alpha pr1 d7ccb2ee,
Part A): six vague and six specific requests. A vague one must ask what it can't know (role
and tools); a specific one names them, so it asks less. Target: at least 80% of the
high-impact unknowns asked. Skipped unless ALPHA_LIVE=1 and a model is connected."""

from __future__ import annotations

import os

import pytest

from alpha.models.accounts import Accounts
from alpha.runtime import turn
from alpha.runtime.route import Router
from alpha.world.world import World

pytestmark = pytest.mark.skipif(os.environ.get("ALPHA_LIVE") != "1",
                                reason="live: set ALPHA_LIVE=1 with a model connected")

# (request, the unknowns that matter: what a good first step asks about)
FIXTURES = [
    ("help with academics", {"role", "tools"}),
    ("keep track of my clients", {"role", "tools"}),
    ("something for my team's work", {"role", "tools"}),
    ("I want to be more organised", {"role", "tools"}),
    ("track the money stuff", {"role", "tools"}),
    ("follow up with people better", {"role", "tools"}),
    ("As a high-school teacher I grade in Canvas; track late assignments", set()),
    ("I'm a recruiter on LinkedIn Recruiter; keep my candidate pipeline", set()),
    ("Log my runs from Strava and show weekly distance", set()),
    ("As a landlord using a Google Sheet, track rent paid per flat", set()),
    ("I review papers for NeurIPS in OpenReview; track deadlines", set()),
    ("As a freelance designer invoicing in FreshBooks, chase unpaid invoices", set()),
]


def test_the_first_step_asks_what_it_cannot_know(world: World) -> None:
    runner = Router(Accounts(world.store))
    wanted = asked = 0
    for request, unknowns in FIXTURES:
        m = world.modules.create(world.modules.untitled())
        tid = world.modules.open_thread("Making it", "build", m["id"])["id"]
        world.modules.set_creation(m["id"], {"stage": "new", "thread": tid})
        turn.ask(world, request, thread=tid, runner=runner, timeout=300)
        creation = world.modules.get(m["id"])["creation"] or {}
        ids = {q["id"] for q in creation.get("questions", [])}
        wanted += len(unknowns)
        asked += len(unknowns & ids)
        if not unknowns:
            assert len(ids) <= 2, f"{request!r} asked {ids}"
    assert asked >= 0.8 * wanted, f"asked {asked} of {wanted} high-impact unknowns"

