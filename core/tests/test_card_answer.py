"""Section C, C4 (Q108): "go ahead" in words answers one open yes card. The desk answers it on
the person's words with `card_answer`, through the same wait the card's button resolves; a
piece of work or an agent never does; a question is answered on its own card."""

from __future__ import annotations

import asyncio
import threading
from typing import Any

from alpha.context import layers
from alpha.mcp.tools import Tools
from alpha.runtime import engine
from alpha.world.world import World


def waiting_card(world: World, thread: str | None = None) -> tuple[str, Any]:
    """A yes card a running piece of work waits on (a removal it asked for), as the permission
    callback puts it: the journal line and the wait in memory."""
    ask = world.journal.append(
        "asked", 'Remove "Old lead" from Leads? It leaves the table.',
        data={"options": ["Yes, remove it", "No, keep it"], "kind": "one",
              "permission": "world_change"}, thread=thread)
    loop = asyncio.new_event_loop()
    threading.Thread(target=loop.run_forever, daemon=True).start()

    async def make() -> asyncio.Future[str]:
        fut: asyncio.Future[str] = loop.create_future()
        engine.PENDING.add(ask, loop, fut)
        return fut

    fut = asyncio.run_coroutine_threadsafe(make(), loop).result()
    return ask, (loop, fut)


def answer_of(waited: Any) -> str:
    loop, fut = waited

    async def get() -> str:
        return str(await fut)

    return str(asyncio.run_coroutine_threadsafe(get(), loop).result(timeout=5))


def test_the_desk_answers_one_yes_card_on_the_persons_words(world: World) -> None:
    home = world.modules.home_thread()["id"]
    work = world.modules.open_thread("Rates research", "work")
    ask, waited = waiting_card(world, thread=work["id"])
    said = world.journal.append("said", "go ahead", actor="person", thread=home)
    # the desk's turn layer lists it with its options, wherever it arose
    layer = layers.turn_layer(world, "go ahead", thread=home)
    assert f"A yes card ({ask})" in layer and "Options: Yes, remove it; No, keep it." in layer
    out = Tools(world, turn=said, thread=home).card_answer(ask, "Yes, remove it", "go ahead")
    assert out["carried_on"] and answer_of(waited) == "Yes, remove it"
    answered = world.journal.read(out["answered"])
    assert answered["actor"] == "person" and answered["data"]["in_words"] == "go ahead"
    assert ask not in {a["id"] for a in world.journal.open_asks()}


def test_never_by_work_or_an_agent_and_only_a_yes_card_with_its_own_option(
        world: World) -> None:
    home = world.modules.home_thread()["id"]
    work = world.modules.open_thread("Rates research", "work")
    ask, _ = waiting_card(world, thread=work["id"])

    def refused(tools: Tools, card: str, option: str) -> str:
        return str(tools.card_answer(card, option, "go ahead").get("error") or "")

    assert "never does" in refused(Tools(world, thread=work["id"]), ask, "Yes, remove it")
    agent = world.agents.create("Look at my deals", name="Deal Watch")
    assert "never does" in refused(Tools(world, thread=home, actor=agent["id"]), ask,
                                   "Yes, remove it")
    assert "one of its options" in refused(Tools(world, thread=home), ask, "Sure")
    question = world.journal.append("asked", "Which size?", data={"options": ["S", "L"]},
                                    thread=home)
    assert "no yes card" in refused(Tools(world, thread=home), question, "S")
    engine.answer_permission(ask, "No, keep it")
    world.journal.close_ask(ask, "No, keep it")
    assert "no longer open" in refused(Tools(world, thread=home), ask, "Yes, remove it")


def test_a_hosts_card_answered_late_still_lists_it_and_tells_the_desk(world: World) -> None:
    """Q109: a host's card holds nothing, so it counts whenever it is answered: its button's
    yes lists the host and starts the desk's turn saying so; the desk's own words do the same
    through card_answer; a no lists nothing and starts nothing."""
    from fastapi.testclient import TestClient

    from alpha.api.server import create_app
    from alpha.runtime.running import RunResult, TurnRequest
    from alpha.world import grants

    seen: list[TurnRequest] = []

    def runner(req: TurnRequest) -> RunResult:
        seen.append(req)
        return RunResult(ok=True, reply="Running it again now.")

    home = world.modules.home_thread()["id"]
    work = world.modules.open_thread("Dog picture", "work")

    def card(host: str) -> str:
        return world.journal.append(
            "asked", f"Let Alpha's scripts reach {host}?",
            data={"options": ["Yes, always", "No"], "permission": "network", "host": host},
            thread=work["id"])

    c = TestClient(create_app(world, live=False, runner=runner))
    out = c.post(f"/api/asks/{card('dog.ceo')}/answer", json={"text": "Yes, always"}).json()
    assert "dog.ceo" in grants.world_hosts(world) and out["turn"]
    for _ in range(100):
        if seen:
            break
        import time
        time.sleep(0.02)
    assert seen and seen[0].sentence.startswith("dog.ceo is now allowed for scripts")
    assert seen[0].thread_id == home
    # answered together, each yes lists its host
    a, b = card("catfact.ninja"), card("api.github.com")
    c.post("/api/asks/answer", json={"answers": {a: "Yes, always", b: "No"}})
    assert "catfact.ninja" in grants.world_hosts(world)
    assert "api.github.com" not in grants.world_hosts(world)
    # the desk on the person's words
    said = world.journal.append("said", "go ahead", actor="person", thread=home)
    out = Tools(world, turn=said, thread=home).card_answer(card("httpbin.org"), "Yes, always",
                                                           "go ahead")
    assert out["allowed"] == "httpbin.org" and "httpbin.org" in grants.world_hosts(world)
