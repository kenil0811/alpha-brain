"""The pre-pack: what the model sees before it looks anything up.

Deterministic and free: no model call, bounded to about three thousand tokens. Every line names
where it came from. It carries who the person is and how they want things done, what they are
working towards, what Alpha holds, the recent stream, the records and moments that match the
sentence, and what is open. Everything else the model fetches itself through the tools.
"""

from __future__ import annotations

from datetime import UTC, datetime, time, timedelta
from typing import Any

from alpha.connectors.base import Connections
from alpha.connectors.calendar import Calendar
from alpha.connectors.files import Files
from alpha.world.world import World

MAX_CHARS = 12_000
RECENT_TURNS = 12
MATCHES = 5


def _clip(text: str, n: int) -> str:
    text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 1] + "…"


def clock(at: datetime | None = None) -> list[str]:
    local = (at or datetime.now()).astimezone()
    midnight = datetime.combine(local.date(), time(0), tzinfo=local.tzinfo)
    offset = local.strftime("%z")
    return [
        f"- {local.strftime('%A %d %B %Y, %H:%M')} local time (UTC{offset[:3]}:{offset[3:]}).",
        f"- Today's date is {local.date().isoformat()}. Record times (created_at, updated_at)"
        f" are stored in UTC: records made today have created_at >="
        f" {midnight.astimezone(UTC).replace(microsecond=0).isoformat()}.",
    ]


def build(world: World, sentence: str, *, module: str | None = None) -> str:
    sections: list[tuple[str, list[str]]] = []
    k = world.knowledge

    sections.append(("NOW", clock()))

    who = [f"- {f['predicate']}: {f['value']} (fact {f['id']}, {f['state']}, from {f['source']})"
           for f in k.facts("person")]
    profile = k.find_note("person", "Profile")
    if profile and profile["body"].strip():
        who.append(f"- Profile note ({profile['id']}): {_clip(profile['body'], 800)}")
    sections.append(("WHO THE PERSON IS", who or ["- Nothing known yet."]))

    rules = []
    for title in ("Standing instructions", "Permissions"):
        note = k.find_note("person", title)
        if note and note["body"].strip():
            rules.append(f"- {title} ({note['id']}): {_clip(note['body'], 800)}")
    sections.append(("THEIR INSTRUCTIONS", rules or ["- None given yet."]))

    goals = [f"- {g['text']} (goal {g['id']}{', module ' + g['module'] if g['module'] else ''})"
             for g in k.goals("active")]
    sections.append(("ACTIVE GOALS", goals or ["- None yet."]))

    tables = world.collections.overview()
    modules = world.modules.all()
    by_module: dict[str | None, list[dict[str, Any]]] = {}
    for t in tables:
        by_module.setdefault(t["module"], []).append(t)
    held = []
    ordered = sorted(modules, key=lambda m: (m["name"] != module and m["id"] != module, m["name"]))
    for m in ordered:
        own = by_module.pop(m["id"], []) + by_module.pop(m["name"], [])
        listing = ", ".join(f"{t['name']} ({t['records']})" for t in own) or "no tables yet"
        goal = f" — {m['goal']}" if m["goal"] else ""
        held.append(f"- Module {m['name']} ({m['id']}){goal}: {listing}")
    loose = [t for group in by_module.values() for t in group]
    if loose:
        held.append("- Tables in no module: "
                    + ", ".join(f"{t['name']} ({t['records']})" for t in loose))
    sections.append(("WHAT ALPHA HOLDS", held or ["- Nothing yet: no modules, no tables."]))

    reach = [
        f"- {c['connector']}: {c['target']} — {c['status']}"
        + (f", last read {c['last_sync'][:16]}Z" if c["last_sync"] else "")
        + (f" (problem: {_clip(c['last_error'], 80)})" if c["last_error"] else "")
        for c in Connections(world.store).all() if c["status"] != "off"
    ]
    sections.append(("WHAT ALPHA CAN REACH", reach or [
        "- Nothing connected yet. Public web pages can always be read (page_read); folders,"
        " sites to sign into and the calendar are connected when the person asks."]))

    local = datetime.now().astimezone()
    day_start = datetime.combine(local.date(), time(0), tzinfo=local.tzinfo).astimezone(UTC)
    day_end = (day_start + timedelta(days=1)).isoformat()
    today = Calendar(world).between(day_start.isoformat(), day_end)
    if today:
        sections.append(("TODAY'S CALENDAR", [
            f"- {datetime.fromisoformat(e['starts_at']).astimezone().strftime('%H:%M')}"
            f"–{datetime.fromisoformat(e['ends_at']).astimezone().strftime('%H:%M')}"
            f" {e['title']}"
            + (f" with {', '.join(a['name'] or a['email'] for a in e['attendees'][:4])}"
               if e["attendees"] else "")
            for e in today[:15]
        ]))

    notes = [f"- [{n['scope']}] {n['title']} ({n['id']}): {_clip(n['body'], 100)}"
             for n in k.notes() if n["title"] not in ("Profile", "Standing instructions",
                                                      "Permissions")][:20]
    if notes:
        sections.append(("NOTES", notes))

    recent = []
    for e in world.journal.recent(RECENT_TURNS, stream=True, kinds=["said", "replied"]):
        who_said = "person" if e["kind"] == "said" else "alpha"
        recent.append(f"- {e['at'][11:16]}Z {who_said}: {_clip(e['text'], 400)}")
    sections.append(("RECENT CONVERSATION (oldest first)", recent or ["- This is the first."]))

    matches = []
    for hit in world.collections.search(sentence, MATCHES):
        matches.append(f"- record {hit['id']} in {hit['collection']}: {_clip(hit['snippet'], 160)}")
    for doc in Files(world).search(sentence, 3):
        matches.append(f"- document {doc['id']} {doc['title']}: {_clip(doc['snippet'], 160)}")
    recent_ids = {e["id"] for e in world.journal.recent(RECENT_TURNS, stream=True)}
    hits = world.journal.mark_removed(world.journal.search(sentence, MATCHES + len(recent_ids)))
    for hit in hits:
        if hit["id"] in recent_ids:
            continue
        gone = f" [history: {hit['removed']}]" if "removed" in hit else ""
        matches.append(f"- {hit['at'][:16]}Z {hit['kind']} ({hit['id']}):"
                       f" {_clip(hit['snippet'], 160)}{gone}")
        if len(matches) >= MATCHES * 2:
            break
    if matches:
        sections.append(("MATCHES FOR THIS SENTENCE", matches))

    open_items = [f"- Thread {t['title']} ({t['id']}, {t['kind']}, {t['state']})"
                  for t in world.modules.threads()]
    open_items += [f"- Asked the person ({a['id']}): {_clip(a['text'], 200)}"
                   for a in world.journal.open_asks()]
    if open_items:
        sections.append(("OPEN", open_items))

    text = "\n\n".join(f"{title}\n" + "\n".join(lines) for title, lines in sections)
    return text if len(text) <= MAX_CHARS else text[: MAX_CHARS - 40] + "\n…(pre-pack cut short)"
