"""People for real (P8a of people-and-contacts-proposal.md, Q97; 19 Oct 2026): phones in one
form, a table's rows as people by any of their keys, organisations by email domain and by the
exact company name, possible same people proposed on one card and never merged by code, Keep
apart remembered, Unmerge."""

from __future__ import annotations

from typing import Any

from conftest import building
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.api.views import needs_you
from alpha.mcp.tools import Tools
from alpha.world import people, phones
from alpha.world.world import World


def contacts_table(world: World, rows: list[dict[str, Any]]) -> None:
    building(world, turn="j_0").world_shape(
        "contacts", "Contacts", [{"name": "name", "kind": "text"},
                                 {"name": "email", "kind": "text"},
                                 {"name": "phone", "kind": "text"},
                                 {"name": "profile_url", "kind": "url"},
                                 {"name": "company", "kind": "text"}],
        title_field="name")
    if rows:
        Tools(world, turn="j_1").world_write("contacts", rows, source="stated")


def person(world: World, **keys: str) -> dict[str, Any]:
    [hit] = world.entities.find(keys=keys)
    return hit


def test_phones_are_kept_in_one_form() -> None:
    assert phones.e164("07700 900123", "GB") == "+447700900123"
    assert phones.e164("+44 7700 900123") == "+447700900123"
    assert phones.e164("0044 7700 900123") == "+447700900123"
    assert phones.e164("123") is None and phones.e164("call me", "GB") is None
    assert phones.likely_region(["+65 9123 4567", "+44 7700 900123", "+44 7700 900456",
                                 "07700 900789"]) == "GB"


def test_a_tables_rows_are_people_by_any_of_their_keys(world: World) -> None:
    contacts_table(world, [
        {"name": "Anna Lee", "email": "anna@restopros.com", "phone": "+44 7700 900123"},
        {"name": "Ben Ortiz", "phone": "+44 7700 900456"},
    ])
    out = Tools(world, turn="j_2").world_shape(
        "contacts", rows_are="person", identity_field=["email", "phone", "profile_url"],
        organisation_field="company")
    assert out["identified"]["linked"] == 2, out
    anna = person(world, email="anna@restopros.com")
    # another way of writing her phone, in another table's row, is her
    assert person(world, phone="07700 900123")["id"] == anna["id"]
    Tools(world, turn="j_3").world_write("contacts", [
        {"name": "A. Lee", "phone": "07700 900123", "profile_url": "https://linkedin.com/in/al"}],
        source="stated")
    assert person(world, url="https://linkedin.com/in/al")["id"] == anna["id"]
    rows = world.collections.linked_to(anna["id"])
    assert sorted(r["name"] for r in rows) == ["A. Lee", "Anna Lee"]


def test_organisations_come_from_the_email_domain_and_the_company(world: World) -> None:
    contacts_table(world, [])
    Tools(world, turn="j_2").world_shape("contacts", rows_are="person",
                                         identity_field="email, phone",
                                         organisation_field="company")
    Tools(world, turn="j_3").world_write("contacts", [
        {"name": "Anna Lee", "email": "anna@restopros.com"},
        {"name": "Cleo Park", "email": "cleo@gmail.com"},
        {"name": "Dan Fox", "email": "dan@restopros.com", "company": "RestoPros"},
        {"name": "Eve Hart", "phone": "+44 7700 900999", "company": "restopros"},
    ], source="stated")
    [org] = world.entities.links(person(world, email="anna@restopros.com")["id"])
    # named by the company once a source names it; one organisation by domain and by name
    assert org["name"] == "RestoPros" and "Restopros" in org["aliases"]
    assert world.entities.links(person(world, email="cleo@gmail.com")["id"]) == []
    eve = world.entities.links(person(world, phone="+447700900999")["id"])
    assert [o["id"] for o in eve] == [org["id"]]  # the same company name, case aside
    assert sorted(m["name"] for m in world.entities.members(org["id"])) == [
        "Anna Lee", "Dan Fox", "Eve Hart"]


def test_possible_same_people_wait_on_one_card_and_a_keep_apart_is_remembered(
        world: World) -> None:
    contacts_table(world, [])
    Tools(world, turn="j_2").world_shape("contacts", rows_are="person", identity_field="email")
    Tools(world, turn="j_3").world_write("contacts", [
        {"name": "Sara Ramos", "email": "sara@restopros.com"},
        {"name": "Sara Ramos", "email": "sara.ramos@gmail.com"},
        {"name": "Tom Wu", "email": "tomwu@acme.test"},
        {"name": "Thomas Wu", "email": "tomwu@gmail.com"},
        {"name": "Sam", "email": "sam@a.test"}, {"name": "Sam", "email": "sam@b.test"},
    ], source="stated")
    people.settle(world)
    [need] = needs_you(world)
    assert need["kind"] == "pairs" and need["text"] == (
        "2 pairs that may be the same person or company")
    whys = sorted(p["why"] for p in need["pairs"]["pairs"])
    assert whys == ["same email name at another domain", "same name"]  # "Sam" alone isn't
    assert len(world.store.all("SELECT 1 FROM entities WHERE kind = 'person' AND merged_into"
                               " IS NULL")) == 6  # nothing merged by code
    c = TestClient(create_app(world, live=False))
    sara = next(p for p in need["pairs"]["pairs"] if p["why"] == "same name")
    tom = next(p for p in need["pairs"]["pairs"] if p["why"] != "same name")
    assert c.post(f"/api/pairs/{sara['id']}/decide", json={"merge": False}).status_code == 200
    out = c.post(f"/api/pairs/{tom['id']}/decide", json={"merge": True}).json()
    assert out["open"] == 0
    card = world.cards.get(need["id"])
    assert card["state"] == "yes" and card["answer"] == "Merged 1, kept 1 apart."
    tom_wu = person(world, email="tomwu@acme.test")
    assert person(world, email="tomwu@gmail.com")["id"] == tom_wu["id"]
    # decided pairs never come back
    people.settle(world)
    assert needs_you(world) == []
    # Unmerge: they stand apart again, and stay apart
    [merged_in] = world.entities.merged_into_it(tom_wu["id"])
    assert c.post(f"/api/entities/{merged_in['id']}/unmerge").status_code == 200
    one, two = person(world, email="tomwu@acme.test"), person(world, email="tomwu@gmail.com")
    assert one["id"] != two["id"] and merged_in["id"] in (one["id"], two["id"])
    assert one["keys"]["email"] == ["tomwu@acme.test"]  # each keeps only its own again
    assert two["keys"]["email"] == ["tomwu@gmail.com"]
    people.settle(world)
    assert needs_you(world) == []


def test_a_row_naming_two_known_people_never_merges_them(world: World) -> None:
    contacts_table(world, [])
    Tools(world, turn="j_2").world_shape("contacts", rows_are="person",
                                         identity_field="email, phone")
    Tools(world, turn="j_3").world_write("contacts", [
        {"name": "Anna Lee", "email": "anna@restopros.com"},
        {"name": "Ben Ortiz", "phone": "+44 7700 900456"}], source="stated")
    Tools(world, turn="j_4").world_write("contacts", [
        {"name": "Anna Lee", "email": "anna@restopros.com", "phone": "07700 900456"}],
        source="stated")
    anna, ben = person(world, email="anna@restopros.com"), person(world, phone="+447700900456")
    assert anna["id"] != ben["id"] and "phone" not in anna["keys"]
    people.settle(world)
    [need] = needs_you(world)
    assert [p["why"] for p in need["pairs"]["pairs"]] == ["one row names both"]


def test_merge_all_with_the_same_name_and_organisation_and_a_whole_no(world: World) -> None:
    contacts_table(world, [])
    Tools(world, turn="j_2").world_shape("contacts", rows_are="person",
                                         identity_field="email, phone",
                                         organisation_field="company")
    Tools(world, turn="j_3").world_write("contacts", [
        {"name": "Jo Banks", "email": "jo@acme.test"},
        {"name": "Jo Banks", "email": "jo.banks@acme.test", "phone": "+44 7700 900111"},
        # an organisation named only after its domain is not one by name with a company:
        # the two organisations are proposed instead
        {"name": "Lu Chen", "phone": "+44 7700 900222", "company": "Acme"},
        {"name": "Kim Lo", "email": "kim@one.test"}, {"name": "Kim Lo", "email": "kim@two.test"},
    ], source="stated")
    people.settle(world)
    [need] = needs_you(world)
    assert sorted(p["why"] for p in need["pairs"]["pairs"]) == [
        "same name", "same name", "same name and organisation"]
    assert sorted({p["a"]["kind"] for p in need["pairs"]["pairs"]}) == [
        "organisation", "person"]
    c = TestClient(create_app(world, live=False))
    batch = need["pairs"]["id"]
    out = c.post(f"/api/pairs/batch/{batch}/merge-same-place").json()
    assert out["open"] == 2
    assert c.post(f"/api/proposals/{need['id']}/decide", json={"accept": True}).status_code == 400
    c.post(f"/api/proposals/{need['id']}/decide", json={"accept": False})
    assert needs_you(world) == []
    assert person(world, email="kim@one.test")["id"] != person(world, email="kim@two.test")["id"]


def test_phones_and_organisations_kept_before_are_read_again(world: World) -> None:
    eid = world.entities.resolve("person", "Old Friend", {"email": "old@x.test"})["entity"]["id"]
    with world.store.tx() as db:
        db.execute("INSERT INTO entity_keys (key, value, entity_id) VALUES ('phone',"
                   " '+6591234567', ?)", (eid,))
        db.execute("INSERT INTO entity_keys (key, value, entity_id) VALUES ('phone',"
                   " '0065 9123 9999', ?)", (eid,))
        db.execute("INSERT INTO entities (id, kind, canonical, created_at, updated_at) VALUES"
                   " ('e_org', 'organisation', 'Acme Ltd', '2026', '2026')")
    assert world.entities.renormalise_phones() == 1
    assert person(world, phone="+65 9123 9999")["id"] == eid
    assert world.entities.index_orgnames() == 1
    org = world.entities.resolve("organisation", "ACME LTD")["entity"]
    assert org["id"] == "e_org"
