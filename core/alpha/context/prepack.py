"""The pre-pack: what the model sees before it looks anything up.

Deterministic and free: no model call, cut at MAX_CHARS (12,000 characters, roughly
three thousand tokens). Every line names
where it came from. It carries who the person is and how they want things done, what they are
working towards, what Alpha holds, the recent stream, the records and moments that match the
sentence, and what is open. Everything else the model fetches itself through the tools.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, time, timedelta
from typing import Any

from alpha.connectors.base import Connections
from alpha.connectors.calendar import Calendar
from alpha.connectors.files import Files
from alpha.world.world import World

MAX_CHARS = 12_000
RECENT_TURNS = 12
THREAD_HISTORY = 15
MATCHES = 5


def _clip(text: str, n: int) -> str:
    text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 1] + "…"


def when(iso: str) -> str:
    """A journal time as the person would say it, in local time: "Thu 1 Oct 20:21"."""
    local = datetime.fromisoformat(iso).astimezone()
    return f"{local.strftime('%a')} {local.day} {local.strftime('%b %H:%M')}"


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


DAY_WORDS = {"today": 0, "yesterday": 1, "day before yesterday": 2}
WEEKDAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]


def day_named(sentence: str, at: datetime | None = None) -> tuple[str, str, str] | None:
    """The day a sentence names ("yesterday", "on Tuesday", "3 days ago", "last week"), as a
    UTC window and a label; None when it names none."""
    words = " ".join(sentence.lower().split())
    local = (at or datetime.now()).astimezone()
    start = datetime.combine(local.date(), time(0), tzinfo=local.tzinfo)
    span = 1
    chosen: datetime | None = None
    label = ""
    for phrase, back in sorted(DAY_WORDS.items(), key=lambda kv: -len(kv[0])):
        if re.search(rf"\b{phrase}\b", words):
            chosen, label = start - timedelta(days=back), phrase
            break
    if chosen is None:
        m = re.search(r"\b(\d{1,2}) days? ago\b", words)
        if m:
            chosen, label = start - timedelta(days=int(m.group(1))), m.group(0)
    if chosen is None:
        m = re.search(r"\b(?:on |last )?(" + "|".join(WEEKDAYS) + r")\b", words)
        if m:
            back = (local.weekday() - WEEKDAYS.index(m.group(1))) % 7 or 7
            chosen, label = start - timedelta(days=back), m.group(1)
    if chosen is None and re.search(r"\blast week\b", words):
        chosen, span, label = start - timedelta(days=local.weekday() + 7), 7, "last week"
    if chosen is None and re.search(r"\bthis week\b", words):
        chosen, span, label = start - timedelta(days=local.weekday()), 7, "this week"
    if chosen is None:
        return None
    return (chosen.astimezone(UTC).replace(microsecond=0).isoformat(),
            (chosen + timedelta(days=span)).astimezone(UTC).replace(microsecond=0).isoformat(),
            label)


def entities_named(world: World, sentence: str) -> list[dict[str, Any]]:
    """People and organisations the sentence names, by canonical name or alias (whole words,
    case-insensitive). Retrieval, not routing: it only decides which cards to show."""
    words = " " + " ".join(sentence.lower().split()) + " "
    out = []
    for e in world.entities.find(limit=2000):
        if e["kind"] not in ("person", "organisation"):
            continue
        names = [e["name"], *(e.get("aliases") or [])]
        for name in names:
            n = " ".join(str(name).lower().split())
            if len(n) >= 3 and f" {n} " in words:
                out.append(e)
                break
            first = n.split(" ")[0]
            if len(first) >= 4 and f" {first} " in words and e["kind"] == "person":
                out.append(e)
                break
    return out


def build(world: World, sentence: str, *, module: str | None = None,
          thread: str | None = None) -> str:
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

    # Know-how: every skill in one line, always, so an existing one is used before a new
    # one is written (design §3.7 point 7). Bodies by skill_read; notes on its wiki page.
    can_do = []
    for sk in world.skills.index()[:80]:
        where = sk["site"] or (world.modules.get(sk["module"])["name"] if sk["module"] else "")
        mark = "" if sk["health"] == "ok" else f", {sk['health']}"
        line = (f"- [{sk['kind']}] {sk['name']} ({where}, v{sk['version']}{mark}"
                + (f", {sk['effect']}" if sk["effect"] else "")
                + f"): {_clip(sk['description'], 110)}")
        if sk["when_to_use"]:
            line += f" When: {_clip(sk['when_to_use'], 90)}"
        can_do.append(line)
    if can_do:
        sections.append(("WHAT ALPHA CAN DO (skills it wrote; skill_read for one, skills_find"
                         " to search; use one before writing another)", can_do))

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

    # The wiki's index: every page in one line, always; bodies on demand (note_read).
    index = [f"- [{p['scope']}] {p['title']}: {_clip(p['summary'], 140)}"
             for p in k.index() if p["title"] not in ("Profile", "Standing instructions",
                                                      "Permissions")][:200]
    if index:
        sections.append(("WHAT ALPHA KNOWS (the index; note_read for a page)", index))
    if module:
        page = next((n for n in k.notes(f"module:{world.modules.get(module)['name']}")), None)
        if page:
            sections.append((f"THIS MODULE'S PAGE ({page['title']})",
                             [f"  {line}" for line in page["body"].splitlines()[:40]]))

    # Entity cards: anyone or anything the sentence names, with what Alpha knows of them.
    cards = []
    for e in entities_named(world, sentence)[:3]:
        facts_ = world.knowledge.facts(f"entity:{e['id']}")
        page = next((n for n in k.notes(f"entity:{e['id']}")), None)
        last = world.store.one(
            "SELECT j.at, j.text FROM journal j, json_each(j.entity_ids) x WHERE x.value = ?"
            " AND j.deleted_at IS NULL ORDER BY j.at DESC LIMIT 1", (e["id"],))
        cards.append(f"- {e['name']} ({e['kind']}, {e['id']}; keys: "
                     + ", ".join(f"{kk}={', '.join(v)}" for kk, v in (e.get('keys') or {}).items())
                     + ")")
        if page:
            cards.append(f"  page: {_clip(page.get('summary') or page['body'], 200)}")
        for f in facts_[:8]:
            cards.append(f"  {f['predicate']}: {f['value']} ({f['state']}, from {f['source']})")
        if last:
            cards.append(f"  last seen: {when(last['at'])} {_clip(last['text'], 160)}")
    if cards:
        sections.append(("WHO THE SENTENCE NAMES", cards))

    chat = world.modules.thread(thread) if thread else None
    chat = chat if chat and chat.get("kind") == "chat" else None
    recent = []
    if chat:
        turns_ = world.journal.recent(RECENT_TURNS, thread=thread, kinds=["said", "replied"])
    else:
        turns_ = world.journal.recent(RECENT_TURNS, stream=True, kinds=["said", "replied"])
    for e in turns_:
        who_said = "person" if e["kind"] == "said" else "alpha"
        recent.append(f"- {when(e['at'])} {who_said}: {_clip(e['text'], 400)}")
    sections.append((f"THIS CONVERSATION{' (' + chat['title'] + ')' if chat else ''}"
                     " (oldest first)", recent or ["- This is the first."]))
    if chat and chat.get("session_ref"):
        # The model's session carries this conversation; the world may have moved meanwhile.
        last_row = world.store.one("SELECT MAX(at) AS at FROM journal WHERE thread = ?"
                                   " AND kind = 'replied'", (thread,))
        last_at = str(last_row["at"]) if last_row and last_row["at"] else None
        delta = []
        if last_at:
            for e in world.journal.recent(40, kinds=["changed", "did", "made", "answered",
                                                     "noticed"]):
                if e["at"] > last_at and e["thread"] != thread:
                    delta.append(f"- {when(e['at'])} {e['kind']}: {_clip(e['text'], 200)}")
        sections.append(("SINCE YOUR LAST TURN HERE (elsewhere in the world; these override"
                         " anything you remember)", delta[-10:] or ["- Nothing changed."]))

    matches = []
    for hit in world.collections.search(sentence, MATCHES):
        matches.append(f"- record {hit['id']} in {hit['collection']}: {_clip(hit['snippet'], 160)}")
    for doc in Files(world).search(sentence, 3):
        matches.append(f"- document {doc['id']} {doc['title']}: {_clip(doc['snippet'], 160)}")
    recent_ids = {e["id"] for e in world.journal.recent(RECENT_TURNS, stream=True)}
    # A sentence that names a day looks there first: matches within it, and that day's turns.
    window = day_named(sentence)
    if window:
        since, until, label = window
        that_day = [f"- {when(e['at'])} {'person' if e['kind'] == 'said' else 'alpha'}:"
                    f" {_clip(e['text'], 220)}"
                    for e in world.journal.between(since, until, kinds=["said", "replied"],
                                                   limit=14)]
        sections.append((f"WHAT WAS SAID {label.upper()}", that_day or ["- Nothing was said."]))
    hits = world.journal.mark_removed(world.journal.search(
        sentence, MATCHES + len(recent_ids),
        since=window[0] if window else None, until=window[1] if window else None))
    for hit in hits:
        if hit["id"] in recent_ids:
            continue
        gone = f" [history: {hit['removed']}]" if "removed" in hit else ""
        matches.append(f"- {when(hit['at'])} {hit['kind']} ({hit['id']}):"
                       f" {_clip(hit['snippet'], 160)}{gone}")
        if len(matches) >= MATCHES * 2:
            break
    if matches:
        sections.append(("MATCHES FOR THIS SENTENCE", matches))

    if thread and not chat:
        t = world.modules.thread(thread)
        lines = [f"- {t['title']} ({t['id']}, {t['kind']})",
                 f"- Brief: {t['brief']}" if t.get("brief") else
                 "- Brief: none yet. Write one with thread_brief when you learn how this work"
                 " should go."]
        history = world.journal.mark_removed(world.journal.recent(THREAD_HISTORY, thread=thread))
        lines += [f"- {when(e['at'])} {e['kind']}: {_clip(e['text'], 300)}" for e in history]
        sections.append(("THIS THREAD (its brief and its own history, oldest first)", lines))

    open_items = [f"- Thread {t['title']} ({t['id']}, {t['kind']}, {t['state']})"
                  for t in world.modules.threads()]
    open_items += [f"- Asked the person ({a['id']}): {_clip(a['text'], 200)}"
                   for a in world.journal.open_asks()]
    words = {"proposed": "proposed, waiting for their reply", "approved": "approved, starting",
             "building": "building in the background",
             "stopped": "stopped before it finished; plan_resume if they say continue"}
    open_items += [f"- Plan {p['title']} ({p['id']}): {words[p['state']]}"
                   for p in world.plans.recent()]
    if open_items:
        sections.append(("OPEN", open_items))

    text = "\n\n".join(f"{title}\n" + "\n".join(lines) for title, lines in sections)
    return text if len(text) <= MAX_CHARS else text[: MAX_CHARS - 40] + "\n…(pre-pack cut short)"
