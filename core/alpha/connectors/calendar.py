"""The calendar connector: the person's calendars as macOS Calendar sees them (EventKit).

Google, iCloud and Exchange calendars all appear once they are added to macOS Calendar, so no
account sign-in or cloud token is involved and nothing leaves the Mac. macOS asks the person once
whether Alpha may read their calendars; until they answer, the connection is "needs your OK".

Syncing reads a window of events (30 days back, 60 ahead) into the world. Each event is an
`event` entity keyed by its calendar UID, and every attendee with an email address becomes (or
resolves to) a `person` entity keyed by that address: this is how the Priya in a meeting is the
same Priya who emailed and the one on LinkedIn. Adding an event is an outbound write and waits
for the person's yes (not part of this version).
"""

from __future__ import annotations

import threading
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol

from alpha.connectors.base import Connections
from alpha.world.store import Problem, dumps, loads, new_id, now
from alpha.world.world import World

BACK_DAYS = 30
AHEAD_DAYS = 60
ACCESS = {0: "not_asked", 1: "restricted", 2: "denied", 3: "granted", 4: "write_only"}


@dataclass
class Attendee:
    name: str | None
    email: str | None
    status: str | None = None


@dataclass
class CalendarEvent:
    uid: str
    title: str
    starts_at: datetime
    ends_at: datetime
    calendar: str | None = None
    all_day: bool = False
    location: str | None = None
    notes: str | None = None
    url: str | None = None
    organiser: Attendee | None = None
    attendees: list[Attendee] = field(default_factory=list)


class Source(Protocol):
    def access(self) -> str: ...
    def request_access(self) -> str: ...
    def events(self, start: datetime, end: datetime) -> list[CalendarEvent]: ...


def _email(url: Any) -> str | None:
    text = str(url.absoluteString()) if url is not None else ""
    return text[7:].lower() if text.lower().startswith("mailto:") else None


def _when(nsdate: Any) -> datetime:
    return datetime.fromtimestamp(nsdate.timeIntervalSince1970(), UTC)


class EventKitSource:
    """The real calendars, through EventKit. Asking for access shows macOS's own prompt."""

    def __init__(self) -> None:
        import EventKit

        self.ek = EventKit
        self.store = EventKit.EKEventStore.alloc().init()

    def access(self) -> str:
        status = self.ek.EKEventStore.authorizationStatusForEntityType_(self.ek.EKEntityTypeEvent)
        return ACCESS.get(int(status), "not_asked")

    def request_access(self) -> str:
        done = threading.Event()
        self.store.requestFullAccessToEventsWithCompletion_(lambda granted, error: done.set())
        done.wait(timeout=300)
        return self.access()

    def events(self, start: datetime, end: datetime) -> list[CalendarEvent]:
        from Foundation import NSDate

        predicate = self.store.predicateForEventsWithStartDate_endDate_calendars_(
            NSDate.dateWithTimeIntervalSince1970_(start.timestamp()),
            NSDate.dateWithTimeIntervalSince1970_(end.timestamp()),
            None,
        )
        out = []
        for e in self.store.eventsMatchingPredicate_(predicate) or []:
            def person(p: Any) -> Attendee | None:
                if p is None:
                    return None
                return Attendee(name=str(p.name()) if p.name() else None, email=_email(p.URL()),
                                status=str(p.participantStatus()))
            attendees = [a for a in (person(p) for p in (e.attendees() or [])) if a]
            out.append(CalendarEvent(
                uid=str(e.calendarItemExternalIdentifier() or e.eventIdentifier()),
                title=str(e.title() or "(no title)"),
                starts_at=_when(e.startDate()),
                ends_at=_when(e.endDate()),
                calendar=str(e.calendar().title()) if e.calendar() else None,
                all_day=bool(e.isAllDay()),
                location=str(e.location()) if e.location() else None,
                notes=str(e.notes())[:4000] if e.notes() else None,
                url=str(e.URL().absoluteString()) if e.URL() else None,
                organiser=person(e.organizer()),
                attendees=attendees,
            ))
        return out


def _iso(d: datetime) -> str:
    return d.astimezone(UTC).replace(microsecond=0).isoformat()


class Calendar:
    def __init__(self, world: World, source: Source | None = None) -> None:
        self.world = world
        self.connections = Connections(world.store)
        self._source = source

    @property
    def source(self) -> Source:
        if self._source is None:
            self._source = EventKitSource()
        return self._source

    def status(self) -> dict[str, Any]:
        access = self.source.access()
        conn = self.connections.find("calendar", "macos")
        return {"access": access, "connection": conn}

    def connect(self) -> dict[str, Any]:
        """Ask macOS for access (the person answers macOS's own prompt), then sync."""
        access = self.source.access()
        if access == "not_asked":
            access = self.source.request_access()
        status = "connected" if access == "granted" else "needs_ok"
        conn = self.connections.upsert("calendar", "macos", status=status,
                                       config={"access": access})
        self.world.journal.append(
            "made" if status == "connected" else "noticed",
            "Connected your calendars." if status == "connected"
            else "Calendar access isn't allowed yet; it can be turned on in System Settings ›"
                 " Privacy & Security › Calendars.",
            data={"connection": conn["id"], "access": access}, source="connector:calendar",
        )
        if status == "connected":
            self.sync()
        return self.connections.get(conn["id"])

    def sync(self) -> dict[str, int]:
        conn = self.connections.find("calendar", "macos")
        if conn is None or conn["status"] == "off":
            raise Problem("Calendars aren't connected; ask Alpha to connect them first.")
        if self.source.access() != "granted":
            self.connections.upsert("calendar", "macos", status="needs_ok")
            raise Problem("macOS isn't letting Alpha read calendars; allow it in System Settings"
                          " › Privacy & Security › Calendars.")
        start = datetime.now(UTC) - timedelta(days=BACK_DAYS)
        end = datetime.now(UTC) + timedelta(days=AHEAD_DAYS)
        counts = {"added": 0, "changed": 0, "unchanged": 0, "removed": 0, "people": 0}
        seen: set[str] = set()
        for ev in self.source.events(start, end):
            seen.add(ev.uid)
            counts[self._save(conn["id"], ev, counts)] += 1
        stale = self.world.store.all(
            "SELECT id, uid, title FROM events WHERE connection = ? AND removed_at IS NULL"
            " AND starts_at >= ? AND starts_at <= ?", (conn["id"], _iso(start), _iso(end)),
        )
        for row in stale:
            if row["uid"] not in seen:
                with self.world.store.tx() as db:
                    db.execute("UPDATE events SET removed_at = ? WHERE id = ?", (now(), row["id"]))
                self.world.journal.append("saw", f"{row['title']} was removed from your calendar.",
                                          data={"event": row["id"]}, source="connector:calendar")
                counts["removed"] += 1
        self.connections.synced(conn["id"])
        return counts

    def _save(self, cid: str, ev: CalendarEvent, counts: dict[str, int]) -> str:
        entities = self.world.entities
        event_entity = entities.resolve("event", ev.title, {"uid": ev.uid})["entity"]
        people: list[dict[str, Any]] = []
        person_ids: list[str] = []
        for a in ([ev.organiser] if ev.organiser else []) + ev.attendees:
            if not a.email:
                continue
            r = entities.resolve("person", a.name or a.email, {"email": a.email})
            counts["people"] += 1 if r["created"] else 0
            person_ids.append(r["entity"]["id"])
            people.append({"name": a.name, "email": a.email, "status": a.status,
                           "entity_id": r["entity"]["id"]})
        organiser = ev.organiser.email if ev.organiser else None
        row = (ev.calendar, ev.title, _iso(ev.starts_at), _iso(ev.ends_at), int(ev.all_day),
               ev.location, ev.notes, ev.url, organiser, dumps(people), now())
        prior = self.world.store.one("SELECT * FROM events WHERE uid = ?", (ev.uid,))
        with self.world.store.tx() as db:
            if prior is None:
                db.execute(
                    "INSERT INTO events (id, entity_id, connection, uid, calendar, title,"
                    " starts_at, ends_at, all_day, location, notes, url, organiser, attendees,"
                    " updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (new_id("ev"), event_entity["id"], cid, ev.uid, *row),
                )
            else:
                same = (prior["title"], prior["starts_at"], prior["ends_at"], prior["location"],
                        loads(prior["attendees"], [])) == (ev.title, row[2], row[3], ev.location,
                                                            people) and prior["removed_at"] is None
                if same:
                    return "unchanged"
                db.execute(
                    "UPDATE events SET calendar = ?, title = ?, starts_at = ?, ends_at = ?,"
                    " all_day = ?, location = ?, notes = ?, url = ?, organiser = ?,"
                    " attendees = ?, updated_at = ?, removed_at = NULL WHERE id = ?",
                    (*row, prior["id"]),
                )
        local = ev.starts_at.astimezone().strftime("%a %d %b %H:%M")
        self.world.journal.append(
            "saw",
            f"{'Calendar changed' if prior else 'On your calendar'}: {ev.title}, {local}"
            + (f" with {', '.join(p['name'] or p['email'] for p in people[:4])}" if people else "")
            + ".",
            data={"uid": ev.uid}, entity_ids=[event_entity["id"], *person_ids],
            source="connector:calendar",
        )
        return "changed" if prior else "added"

    def between(self, start: str, end: str) -> list[dict[str, Any]]:
        rows = self.world.store.all(
            "SELECT * FROM events WHERE removed_at IS NULL AND starts_at < ? AND ends_at > ?"
            " ORDER BY starts_at", (end, start),
        )
        out = []
        for r in rows:
            item = {k: r[k] for k in r.keys() if k not in {"connection", "removed_at"}}
            item["attendees"] = loads(r["attendees"], [])
            item["all_day"] = bool(r["all_day"])
            out.append(item)
        return out
