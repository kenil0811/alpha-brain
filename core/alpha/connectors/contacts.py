"""The person's contacts (P9 of people-and-contacts-proposal.md, Q97; 19 Oct 2026): macOS
Contacts, read through the Mac's own Contacts framework, and a `.vcf` file, read by code.

macOS Contacts carries the iPhone's contacts through iCloud, and Google's or Exchange's once
those accounts are added to the Mac, so no sign-in or token is involved and nothing leaves the
Mac. macOS asks the person once (the app's Info.plist says why); until they answer, the
connection is "needs your OK". A `.vcf` (an iPhone, Google or Outlook export) is read the same
way when the person drops it.

Both land as people, never as a table (Q97): each contact is a person entity keyed by its
emails, phones (E.164) and profile addresses, belonging to the organisation of its work email
and of its company's name; the same person from two sources is one by a shared key, and what
may be the same is proposed (`world/people.py`). Each contact keeps its source and what the
source said of it (`entity_sources`), so a contact read again updates its person, and one gone
from the Mac takes away what only it brought.
"""

from __future__ import annotations

import quopri
import re
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Protocol

from alpha.connectors.base import Connections
from alpha.world import people, phones
from alpha.world.purge import forget_refs
from alpha.world.store import Problem, dumps, now
from alpha.world.world import World

MAC = "mac-contacts"
ACCESS = {0: "not_asked", 1: "restricted", 2: "denied", 3: "granted", 4: "granted"}


@dataclass
class Contact:
    """One contact as a source gives it."""
    ref: str
    name: str
    emails: list[str] = field(default_factory=list)
    phones: list[str] = field(default_factory=list)
    urls: list[str] = field(default_factory=list)
    organisation: str | None = None
    title: str | None = None
    places: list[str] = field(default_factory=list)
    is_company: bool = False

    def details(self) -> dict[str, Any]:
        """What the source said of them, kept beside the person."""
        out: dict[str, Any] = {"name": self.name}
        for key in ("organisation", "title"):
            if getattr(self, key):
                out[key] = getattr(self, key)
        for key in ("emails", "phones", "urls", "places"):
            if getattr(self, key):
                out[key] = getattr(self, key)
        return out


class Source(Protocol):
    def access(self) -> str: ...
    def request_access(self) -> str: ...
    def contacts(self) -> list[Contact]: ...


def _text(value: Any) -> str:
    return " ".join(str(value or "").split())


class MacContactsSource:
    """The real contacts, through the Contacts framework. Asking for access shows macOS's own
    prompt."""

    def __init__(self) -> None:
        import Contacts

        self.cn = Contacts
        self.store = Contacts.CNContactStore.alloc().init()

    def access(self) -> str:
        status = self.cn.CNContactStore.authorizationStatusForEntityType_(
            self.cn.CNEntityTypeContacts)
        return ACCESS.get(int(status), "not_asked")

    def request_access(self) -> str:
        done = threading.Event()
        self.store.requestAccessForEntityType_completionHandler_(
            self.cn.CNEntityTypeContacts, lambda granted, error: done.set())
        done.wait(timeout=300)
        return self.access()

    def contacts(self) -> list[Contact]:
        cn = self.cn
        keys = [cn.CNContactIdentifierKey, cn.CNContactGivenNameKey, cn.CNContactFamilyNameKey,
                cn.CNContactNicknameKey, cn.CNContactOrganizationNameKey,
                cn.CNContactJobTitleKey, cn.CNContactEmailAddressesKey,
                cn.CNContactPhoneNumbersKey, cn.CNContactUrlAddressesKey,
                cn.CNContactSocialProfilesKey, cn.CNContactPostalAddressesKey,
                cn.CNContactTypeKey]
        request = cn.CNContactFetchRequest.alloc().initWithKeysToFetch_(keys)
        out: list[Contact] = []

        def each(c: Any, stop: Any) -> None:
            given, family = _text(c.givenName()), _text(c.familyName())
            organisation = _text(c.organizationName()) or None
            name = " ".join(p for p in (given, family) if p) or _text(c.nickname()) \
                or organisation or ""
            urls = [_text(v.value()) for v in (c.urlAddresses() or [])]
            urls += [_text(v.value().urlString()) for v in (c.socialProfiles() or [])
                     if v.value().urlString()]
            places = []
            for v in c.postalAddresses() or []:
                where = ", ".join(p for p in (_text(v.value().city()),
                                              _text(v.value().country())) if p)
                if where:
                    places.append(where)
            out.append(Contact(
                ref=str(c.identifier()), name=name,
                emails=[_text(v.value()) for v in (c.emailAddresses() or [])],
                phones=[_text(v.value().stringValue()) for v in (c.phoneNumbers() or [])],
                urls=[u for u in urls if u], organisation=organisation,
                title=_text(c.jobTitle()) or None, places=places,
                is_company=int(c.contactType()) == int(cn.CNContactTypeOrganization)))

        ok, error = self.store.enumerateContactsWithFetchRequest_error_usingBlock_(
            request, None, each)
        if not ok:
            raise Problem(f"macOS didn't give Alpha the contacts: {error}")
        return out


# ---- a .vcf, read by code ----


def _unfold(text: str) -> list[str]:
    """vCard lines with their continuations joined (a line that starts with a space or a tab
    goes on the one before; a quoted-printable line ending in "=" goes on too)."""
    lines: list[str] = []
    for raw in text.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if raw[:1] in (" ", "\t") and lines:
            lines[-1] += raw[1:]
        elif lines and lines[-1].endswith("=") and "QUOTED-PRINTABLE" in lines[-1].upper():
            lines[-1] = lines[-1][:-1] + raw
        else:
            lines.append(raw)
    return lines


def _value(params: str, value: str) -> str:
    if "QUOTED-PRINTABLE" in params.upper():
        value = quopri.decodestring(value.encode()).decode("utf-8", "replace")
    return re.sub(r"\\([,;\\])", r"\1", value.replace("\\n", " ").replace("\\N", " "))


def read_vcf(text: str, label: str) -> list[Contact]:
    """The contacts of a vCard file (3.0 or 4.0, and the old 2.1 phones wrote): name, emails,
    phones, organisation, title, addresses' city and country, web and profile addresses."""
    out: list[Contact] = []
    card: dict[str, list[tuple[str, str]]] | None = None
    for line in _unfold(text):
        head, colon, value = line.partition(":")
        if not colon:
            continue
        name, _, params = head.partition(";")
        name = name.split(".")[-1].upper()  # "item1.EMAIL" is an EMAIL
        if name == "BEGIN" and value.strip().upper() == "VCARD":
            card = {}
        elif name == "END" and value.strip().upper() == "VCARD" and card is not None:
            out.append(_contact(card, label, len(out)))
            card = None
        elif card is not None:
            card.setdefault(name, []).append((params, _value(params, value.strip())))
    return [c for c in out if c.name or c.emails or c.phones]


def _contact(card: dict[str, list[tuple[str, str]]], label: str, index: int) -> Contact:
    def first(key: str) -> str:
        return card[key][0][1] if card.get(key) else ""

    def every(key: str) -> list[str]:
        return [v for _, v in card.get(key, []) if v]

    parts = first("N").split(";") if first("N") else []
    named = " ".join(p for p in (parts[1:2] + parts[0:1]) if p.strip()) if parts else ""
    organisation = first("ORG").split(";")[0].strip() or None
    name = _text(first("FN")) or _text(named) or _text(first("NICKNAME")) or organisation or ""
    places = []
    for _, adr in card.get("ADR", []):
        bits = adr.split(";") + [""] * 7
        where = ", ".join(p.strip() for p in (bits[3], bits[6]) if p.strip())
        if where:
            places.append(where)
    uid = first("UID")
    return Contact(
        ref=f"{label}#{uid or index}", name=name,
        emails=[e.removeprefix("mailto:") for e in every("EMAIL")],
        phones=[t.removeprefix("tel:") for t in every("TEL")],
        urls=every("URL") + every("X-SOCIALPROFILE"), organisation=organisation,
        title=_text(first("TITLE")) or None, places=places,
        is_company=first("KIND").lower() == "org"
        or first("X-ABSHOWAS").upper() == "COMPANY")


# ---- saving contacts as people ----


def save(world: World, contacts: list[Contact], source: str) -> dict[str, int]:
    """Contacts into people: each one resolved by its keys (or found again by its source and
    ref), its organisation linked, what the source said kept beside it. A number without its
    country is read as the country most of the batch's and the world's numbers are in (Q97)."""
    entities = world.entities
    region = phones.likely_region(
        [p for c in contacts for p in c.phones]
        + [r["value"] for r in world.store.all("SELECT value FROM entity_keys WHERE key ="
                                                " 'phone' AND value LIKE '+%'")])
    counts = {"read": 0, "new": 0, "known": 0}
    for c in contacts:
        counts["read"] += 1
        keys: dict[str, Any] = {k: v for k, v in (("email", c.emails), ("phone", c.phones),
                                                  ("url", c.urls)) if v}
        before = world.store.one("SELECT entity_id FROM entity_sources WHERE source = ? AND"
                                 " ref = ?", (source, c.ref))
        kind = "organisation" if c.is_company else "person"
        name = c.name or next((v[0] for v in keys.values()), "") or "Someone"
        if before is not None and not keys:
            eid = entities.get(before["entity_id"])["id"]
            created = False
        else:
            resolved = entities.resolve(kind, name, keys, source=source, region=region,
                                        organisation=None if c.is_company else c.organisation)
            eid, created = resolved["entity"]["id"], resolved["created"]
            for a, b in resolved.get("pairs", []):
                entities.note_pair(a, b, "one contact names both")
            if before is not None and entities.get(before["entity_id"])["id"] != eid:
                entities.note_pair(before["entity_id"], eid, "one contact names both")
        counts["new" if created else "known"] += 1
        stamp = now()
        with world.store.tx() as db:
            db.execute(
                "INSERT INTO entity_sources (entity_id, source, ref, details, created_at,"
                " updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT (source, ref) DO UPDATE SET"
                " entity_id = excluded.entity_id, details = excluded.details,"
                " updated_at = excluded.updated_at",
                (eid, source, c.ref, dumps(c.details()), stamp, stamp))
    return counts


def import_vcf(world: World, path: Path, *, label: str | None = None) -> dict[str, Any]:
    """A `.vcf` the person dropped: its contacts as people, said in one line."""
    name = label or path.name
    contacts = read_vcf(path.read_text(errors="replace"), name)
    if not contacts:
        raise Problem(f"{name} holds no contacts Alpha can read.")
    counts = save(world, contacts, f"vcf:{name}")
    world.journal.append(
        "did", f"Read {counts['read']} contacts from {name}: {counts['new']} new,"
        f" {counts['known']} already known.", actor="alpha", data={"contacts": counts,
                                                                   "file": name})
    people.settle(world)
    return {"file": name, **counts}


class MacContacts:
    """macOS Contacts as a connection: connect (macOS asks once), sync on open and daily."""

    def __init__(self, world: World, source: Source | None = None) -> None:
        self.world = world
        self.connections = Connections(world.store)
        self._source = source

    @property
    def source(self) -> Source:
        if self._source is None:
            self._source = MacContactsSource()
        return self._source

    def status(self) -> dict[str, Any]:
        return {"access": self.source.access(),
                "connection": self.connections.find("contacts", "macos")}

    def connect(self) -> dict[str, Any]:
        """Ask macOS for access (the person answers macOS's own prompt), then read."""
        access = self.source.access()
        if access == "not_asked":
            access = self.source.request_access()
        status = "connected" if access == "granted" else "needs_ok"
        conn = self.connections.upsert("contacts", "macos", status=status,
                                       config={"access": access})
        self.world.journal.append(
            "made" if status == "connected" else "noticed",
            "Connected your contacts." if status == "connected"
            else "Contacts access isn't allowed yet; it can be turned on in System Settings ›"
                 " Privacy & Security › Contacts.",
            data={"connection": conn["id"], "access": access}, source="connector:contacts")
        if status == "connected":
            self.sync()
        return self.connections.get(conn["id"])

    def sync(self) -> dict[str, int]:
        conn = self.connections.find("contacts", "macos")
        if conn is None or conn["status"] == "off":
            raise Problem("Contacts aren't connected; connect them in Intelligence ›"
                          " Connections first.")
        if self.source.access() != "granted":
            self.connections.upsert("contacts", "macos", status="needs_ok")
            raise Problem("macOS isn't letting Alpha read your contacts; allow it in System"
                          " Settings › Privacy & Security › Contacts.")
        contacts = self.source.contacts()
        counts = save(self.world, contacts, MAC)
        seen = {c.ref for c in contacts}
        gone = [r["ref"] for r in self.world.store.all(
            "SELECT ref FROM entity_sources WHERE source = ?", (MAC,)) if r["ref"] not in seen]
        counts["gone"] = forget_refs(self.world, MAC, gone)
        if counts["new"] or counts["gone"]:
            self.world.journal.append(
                "saw", f"Read your contacts: {counts['read']} people, {counts['new']} new"
                + (f", {counts['gone']} gone from your Mac" if counts["gone"] else "") + ".",
                data={"contacts": counts}, source="connector:contacts")
        self.connections.synced(conn["id"])
        people.settle(self.world)
        return counts
