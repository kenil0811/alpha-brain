"""The person's contacts (P9 of people-and-contacts-proposal.md, Q97; 19 Oct 2026): the Mac's
Contacts (through a fake source here, never the real one) and a `.vcf` read by code, both into
people: one person per hard key, their organisation, what each source said kept beside them, a
contact gone from the Mac taking away what only it brought."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from conftest import building
from fastapi.testclient import TestClient

from alpha.api.server import create_app
from alpha.connectors.base import Connections
from alpha.connectors.contacts import Contact, MacContacts, read_vcf
from alpha.mcp.tools import Tools
from alpha.world.purge import remove_connection
from alpha.world.world import World

VCF = """BEGIN:VCARD
VERSION:3.0
FN:Anna Lee
N:Lee;Anna;;;
ORG:RestoPros;Field Ops
TITLE:Operations Lead
item1.EMAIL;type=INTERNET;type=WORK:anna@restopros.com
TEL;type=CELL:07700 900123
ADR;type=WORK:;;1 Market St;St. Louis;MO;63101;United States
URL:https://www.linkedin.com/in/annalee
UID:abc-1
END:VCARD
BEGIN:VCARD
VERSION:2.1
N;CHARSET=UTF-8;ENCODING=QUOTED-PRINTABLE:M=C3=BCller;J=C3=BCrgen;;;
TEL;CELL:+44 7700 900456
END:VCARD
BEGIN:VCARD
VERSION:4.0
FN:Ben Ortiz, Jr.
EMAIL:ben@
 example.test
TEL;VALUE=uri:tel:+44-7700-900789
END:VCARD
BEGIN:VCARD
VERSION:4.0
KIND:org
FN:Acme Plumbing
EMAIL:office@acmeplumbing.test
END:VCARD
"""


def test_a_vcf_is_read_by_code() -> None:
    anna, jurgen, ben, acme = read_vcf(VCF, "phone.vcf")
    assert (anna.name, anna.organisation, anna.title) == ("Anna Lee", "RestoPros",
                                                           "Operations Lead")
    assert anna.emails == ["anna@restopros.com"] and anna.phones == ["07700 900123"]
    assert anna.places == ["St. Louis, United States"] and anna.ref == "phone.vcf#abc-1"
    assert anna.urls == ["https://www.linkedin.com/in/annalee"]
    assert jurgen.name == "Jürgen Müller" and jurgen.ref == "phone.vcf#1"
    assert ben.name == "Ben Ortiz, Jr." and ben.emails == ["ben@example.test"]
    assert ben.phones == ["+44-7700-900789"]
    assert acme.is_company and acme.name == "Acme Plumbing"


class FakeMac:
    """The Mac's Contacts, as the framework would give them."""

    def __init__(self, contacts: list[Contact], access: str = "not_asked") -> None:
        self.list, self.state, self.asked = contacts, access, 0

    def access(self) -> str:
        return self.state

    def request_access(self) -> str:
        self.asked += 1
        self.state = "granted"
        return self.state

    def contacts(self) -> list[Contact]:
        return list(self.list)


def mac(world: World, contacts: list[Contact]) -> tuple[MacContacts, FakeMac]:
    source = FakeMac(contacts)
    return MacContacts(world, source), source


def who(world: World, **keys: str) -> dict[str, Any]:
    [hit] = world.entities.find(keys=keys)
    return hit


def test_the_macs_contacts_become_people_once_each(world: World) -> None:
    contacts = [
        Contact(ref="c1", name="Anna Lee", emails=["anna@restopros.com"],
                phones=["07700 900123"], organisation="RestoPros", title="Ops"),
        Contact(ref="c2", name="Anna L.", phones=["+44 7700 900123"]),  # the same phone
        Contact(ref="c3", name="Ben Ortiz", phones=["+44 7700 900456"]),
        Contact(ref="c4", name="Cleo Park", emails=["cleo@gmail.com"]),
    ]
    contacts_, source = mac(world, contacts)
    conn = contacts_.connect()
    assert source.asked == 1 and conn["status"] == "connected"
    anna = who(world, email="anna@restopros.com")
    # the local number read as the country the others are in (+44), so one person
    assert who(world, phone="+447700900123")["id"] == anna["id"]
    assert sorted(anna["aliases"]) == ["Anna L."]
    [org] = world.entities.links(anna["id"])
    assert org["name"] == "RestoPros"
    assert world.entities.links(who(world, email="cleo@gmail.com")["id"]) == []
    rows = world.store.all("SELECT ref, details FROM entity_sources WHERE source ="
                           " 'mac-contacts' ORDER BY ref")
    assert [r["ref"] for r in rows] == ["c1", "c2", "c3", "c4"]
    assert json.loads(rows[0]["details"])["title"] == "Ops"
    line = world.journal.recent(5, kinds=["saw"])[0]
    assert line["text"] == "Read your contacts: 4 people, 3 new."


def test_a_contact_gone_from_the_mac_takes_only_what_it_brought(world: World) -> None:
    contacts = [Contact(ref="c1", name="Anna Lee", emails=["anna@restopros.com"]),
                Contact(ref="c2", name="Ben Ortiz", emails=["ben@ortiz.test"])]
    contacts_, source = mac(world, contacts)
    contacts_.connect()
    # Ben is also a row of a table: known another way, he stays
    building(world, turn="j_0").world_shape(
        "people_i_know", "People I know", [{"name": "name", "kind": "text"},
                                           {"name": "email", "kind": "text"}],
        title_field="name", rows_are="person", identity_field="email")
    Tools(world, turn="j_1").world_write("people_i_know",
                                         [{"name": "Ben", "email": "ben@ortiz.test"}],
                                         source="stated")
    source.list = []
    out = contacts_.sync()
    assert out["gone"] == 1
    assert world.entities.find(keys={"email": "anna@restopros.com"}) == []
    # her organisation, made only for her, went too
    assert world.entities.find(name="Restopros", kind="organisation") == []
    assert who(world, email="ben@ortiz.test")["name"] == "Ben Ortiz"


def test_removing_the_connection_says_what_goes_and_takes_it(world: World) -> None:
    contacts_, _ = mac(world, [Contact(ref="c1", name="Anna Lee",
                                       emails=["anna@restopros.com"])])
    conn = contacts_.connect()
    plan = remove_connection(world, conn["id"], dry_run=True)
    assert plan["what"] == "what Alpha read from 1 contact"
    remove_connection(world, conn["id"])
    assert world.entities.find(keys={"email": "anna@restopros.com"}) == []
    assert Connections(world.store).find("contacts", "macos") is None


def test_a_dropped_vcf_is_read_into_people_without_a_turn(world: World,
                                                         tmp_path: Path) -> None:
    building(world, turn="j_0").module_create("Network", "who I know")
    c = TestClient(create_app(world, live=False))
    out = c.post("/api/files", data={"module": "Network"},
                 files=[("files", ("phone.vcf", VCF.encode(), "text/vcard"))])
    assert out.status_code == 200, out.text
    [read] = out.json()["contacts"]
    assert read == {"file": "phone.vcf", "read": 4, "new": 4, "known": 0}
    assert who(world, email="anna@restopros.com")["name"] == "Anna Lee"
    assert who(world, phone="+447700900456")["name"] == "Jürgen Müller"
    company = world.entities.find(name="Acme Plumbing", kind="organisation")
    assert len(company) == 1
    # the model can do the same with a kept .vcf
    again = Tools(world, turn="j_1").world_file("import", ref="phone.vcf")
    assert isinstance(again, dict) and again["known"] == 4, again
