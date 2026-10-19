"""People for real, the second half (P8b of people-and-contacts-proposal.md, Q97; 19 Oct 2026):
interactions from meetings and from any table whose rows say they are interactions, last contact
and the last 90 days in plain numbers, the same counts for the model (`world_query`'s views) and
the window, and a removed table taking the people only it brought."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

from conftest import building
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.mcp.tools import Tools
from alpha.world import people
from alpha.world.purge import remove_module
from alpha.world.store import dumps, new_id
from alpha.world.world import World


def day(n: int) -> str:
    return (datetime.now(UTC) + timedelta(days=n)).date().isoformat()


def emails(world: World) -> None:
    """A messages table such as a Gmail reader writes, declared as interactions."""
    t = building(world, turn="j_0")
    t.module_create("Network", "who I know")
    t.world_shape("emails", "Emails", [
        {"name": "subject", "kind": "text"}, {"name": "who", "kind": "text"},
        {"name": "on", "kind": "date"}, {"name": "way", "kind": "text"}],
        module="Network", title_field="subject")
    out = Tools(world, turn="j_1").world_shape("emails", rows_are="interaction",
                                               identity_field="who", date_field="on",
                                               direction_field="way")
    assert "error" not in out, out
    Tools(world, turn="j_2").world_write("emails", [
        {"subject": "Sept P&L", "who": "anna@restopros.com", "on": day(-2), "way": "received"},
        {"subject": "Re: Sept P&L", "who": "anna@restopros.com", "on": day(-1), "way": "sent"},
        {"subject": "Old thread", "who": "anna@restopros.com", "on": day(-200), "way": "sent"},
        {"subject": "Hello", "who": "ben@ortiz.test", "on": day(-10), "way": "received"},
    ], source="the inbox")


def meeting(world: World, title: str, when: int, eid: str) -> None:
    entity = world.entities.resolve("event", title, {"uid": new_id("u")})["entity"]["id"]
    at = (datetime.now(UTC) + timedelta(days=when)).replace(microsecond=0).isoformat()
    with world.store.tx() as db:
        db.execute("INSERT INTO events (id, entity_id, connection, uid, calendar, title,"
                   " starts_at, ends_at, all_day, attendees, updated_at) VALUES"
                   " (?,?,NULL,?,'Work',?,?,?,0,?,?)",
                   (new_id("ev"), entity, new_id("u"), title, at, at,
                    dumps([{"name": "Anna", "email": "anna@restopros.com", "entity_id": eid}]),
                    at))


def who(world: World, email: str) -> dict[str, Any]:
    [hit] = world.entities.find(keys={"email": email})
    return hit


def test_last_contact_and_the_last_90_days_in_plain_numbers(world: World) -> None:
    emails(world)
    anna = who(world, "anna@restopros.com")
    assert anna["name"] == "anna@restopros.com"  # an interaction row names no one by name
    meeting(world, "Call with Anna", -5, anna["id"])
    meeting(world, "Visit RestoPros", 3, anna["id"])  # ahead: not contact yet
    numbers = people.contact(world, anna["id"])
    assert numbers["last"] == day(-1) and numbers["total"] == 3
    assert {c["channel"]: c["count"] for c in numbers["channels"]} == {"Emails": 2, "meeting": 1}
    assert (numbers["you"], numbers["them"]) == (1, 1)
    # the model reads the same in SQL
    out = Tools(world, turn="j_3").world_query(
        "SELECT name, emails, organisations, last_contact, in_90_days FROM people"
        " WHERE emails LIKE '%restopros%'")
    assert isinstance(out, dict), out
    [row] = out["rows"]
    assert row["organisations"] == "Restopros" and row["in_90_days"] == 3
    assert row["last_contact"] == day(-1)
    titles = [i["title"] for i in people.interactions(world, anna["id"])]
    assert titles[:2] == ["Visit RestoPros", "Re: Sept P&L"]


def test_a_merged_person_counts_everything_of_both(world: World) -> None:
    emails(world)
    anna, ben = who(world, "anna@restopros.com"), who(world, "ben@ortiz.test")
    world.entities.merge(anna["id"], ben["id"])
    assert people.contact(world, anna["id"])["total"] == 3
    out = Tools(world, turn="j_3").world_query("SELECT COUNT(*) AS n FROM people")
    assert isinstance(out, dict) and out["rows"][0]["n"] == 1, out


def test_the_list_has_no_cap_and_carries_the_numbers(world: World) -> None:
    emails(world)
    with world.store.tx() as db:
        for n in range(520):
            db.execute("INSERT INTO entities (id, kind, canonical, created_at, updated_at)"
                       " VALUES (?, 'person', ?, '2026', '2026')", (f"e_{n:04d}", f"P {n}"))
    c = TestClient(create_app(world, live=False))
    listed = c.get("/api/people", params={"kind": "person"}).json()
    assert len(listed) == 522
    anna = next(p for p in listed if p["keys"].get("email") == ["anna@restopros.com"])
    assert anna["organisation_names"] == "Restopros" and anna["in_90_days"] == 2
    page = c.get(f"/api/entities/{anna['id']}").json()
    assert page["contact"]["total"] == 2 and page["interactions"][0]["title"] == "Re: Sept P&L"
    assert [o["name"] for o in page["organisations"]] == ["Restopros"]


def test_a_removed_tables_people_go_unless_known_another_way(world: World) -> None:
    emails(world)
    anna = who(world, "anna@restopros.com")
    # Ben is in the person's contacts too
    with world.store.tx() as db:
        db.execute("INSERT INTO entity_sources (entity_id, source, ref, created_at, updated_at)"
                   " VALUES (?, 'mac-contacts', 'c1', '2026', '2026')",
                   (who(world, "ben@ortiz.test")["id"],))
    counts = remove_module(world, "Network")
    assert counts["people"] == 1
    assert world.entities.find(keys={"email": "anna@restopros.com"}) == []
    assert world.store.one("SELECT 1 FROM entities WHERE id = ?", (anna["id"],)) is None
    assert who(world, "ben@ortiz.test")["name"] == "ben@ortiz.test"


def test_a_person_named_by_their_address_takes_their_name(world: World) -> None:
    emails(world)
    anna = world.entities.resolve("person", "Anna Lee", {"email": "anna@restopros.com"})
    assert anna["entity"]["name"] == "Anna Lee"
    assert anna["entity"]["aliases"] == []  # the address was a key, never a name


def test_an_address_never_becomes_a_name(world: World) -> None:
    anna = world.entities.resolve("person", "Anna Lee", {"email": "anna@restopros.com"})
    emails(world)  # its rows name her only by her address
    assert world.entities.get(anna["entity"]["id"])["aliases"] == []
