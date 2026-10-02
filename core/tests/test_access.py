"""Access modes (+ -> Advanced -> Access): they only add approvals, never remove governance."""

from __future__ import annotations

from conftest import building
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.mcp.tools import Tools
from alpha.models import settings
from alpha.world import access
from alpha.world.actions import Actions
from alpha.world.world import World


def table(world: World) -> dict[str, str]:
    t = building(world, turn="j_seed")
    t.collection_create("openings", "Openings", [{"name": "title", "kind": "text"}])
    rec = t.records_add("openings", {"title": "Backend Engineer"}, source="stated")
    return {"id": rec["id"]}


def test_the_default_mode_is_ask_and_a_conversation_keeps_its_own(world: World) -> None:
    settings.update(world.store, {"access.mode": "ask"})
    assert settings.access_mode(world.store, None) == "ask"
    settings.set_access_mode(world.store, "t_1", "full")
    assert settings.access_mode(world.store, "t_1") == "full"
    assert settings.access_mode(world.store, None) == "ask"
    settings.set_access_mode(world.store, "t_1", None)
    assert settings.access_mode(world.store, "t_1") == "ask"
    assert access.gated("ask") == access.WEB | access.UNSAFE
    assert access.gated("approve_for_me") == access.UNSAFE
    assert access.gated("full") == set()


def test_removing_waits_for_the_persons_yes_then_runs_once(world: World) -> None:
    rid = table(world)["id"]
    rev = world.collections.get("openings", rid)["revision"]
    settings.set_access_mode(world.store, None, "approve_for_me")
    out = Tools(world, turn="j_t").records_delete("openings", rid, rev)
    assert out["state"] == "pending"
    assert world.collections.get("openings", rid)  # still there
    [action] = Actions(world).pending()
    assert action["summary"] == "Remove Backend Engineer from Openings"
    assert action["payload"]["tool"] == "records_delete"
    c = TestClient(create_app(world, live=False))
    done = c.post(f"/api/pending/{action['id']}/approve").json()
    assert done["state"] == "approved" and done["result"] == {"removed": rid}
    assert not [r for r in world.collections.query("openings") if r["id"] == rid]
    again = c.post(f"/api/pending/{action['id']}/approve")
    assert again.status_code == 400  # exactly once


def test_full_access_runs_at_once_and_ask_also_holds_browser_reads(world: World) -> None:
    rid = table(world)["id"]
    rev = world.collections.get("openings", rid)["revision"]
    settings.set_access_mode(world.store, None, "ask")
    held = Tools(world, turn="j_t").page_read("https://example.com/jobs")
    assert held["state"] == "pending"
    assert Actions(world).pending()[0]["summary"] == "Read example.com in Alpha's browser"
    settings.set_access_mode(world.store, None, "full")
    assert Tools(world, turn="j_t").records_delete("openings", rid, rev) == {"removed": rid}


def test_automations_and_project_making_are_not_held(world: World) -> None:
    settings.update(world.store, {"access.mode": "ask"})
    thread = world.modules.open_thread("Making Jobs", "build")
    rid = table(world)["id"]
    rev = world.collections.get("openings", rid)["revision"]
    assert Tools(world, turn="j_t", thread=thread["id"]).records_delete(
        "openings", rid, rev) == {"removed": rid}


def test_no_mode_lifts_the_never_list_or_outward_approval(world: World) -> None:
    settings.update(world.store, {"access.mode": "full"})
    t = building(world, turn="j_t")
    out = t.propose_action("send_email", "Send Priya a note", {"to": "p@example.com"})
    assert out["state"] == "pending"  # an outward write still waits, even in Full access
    refused = t.propose_action("pay_invoice", "Pay the invoice", {"amount": 10})
    assert "never moves money" in refused["error"]
