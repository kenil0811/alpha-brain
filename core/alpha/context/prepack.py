"""The pre-pack: what the model sees before it looks anything up.

Deterministic and free: no model call, at most MAX_CHARS (12,000 characters, roughly three
thousand tokens). Every line names where it came from. It carries who the person is and how they
want things done, what they are working towards, what Alpha holds (every table with its fields,
so a question about the data is one query, not a describe and then a query), the recent stream,
the records and moments that match the sentence, and what is open. Everything else the model
fetches itself through the tools.

Each section has a budget; one over it keeps whole lines from its start (or its end, where the
newest matter most: the conversation, a thread's history, a day's turns) and says how many it
left out. The whole stays under MAX_CHARS by shrinking the largest section, never by a blind cut
of the tail (found 3 Oct: the tail held the matches for the sentence, the one part that was
about the sentence; cut whenever the index and a module's page were long).
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, time, timedelta
from typing import Any

from alpha.connectors.base import Connections
from alpha.connectors.calendar import Calendar
from alpha.connectors.files import Files
from alpha.world.world import World

# Raised from 12,000 on 3 Oct when every table's fields joined the pack: about 500 more tokens a
# turn, measured on Kenil's world (13 tables), against one model step saved per data question.
MAX_CHARS = 14_000
RECENT_TURNS = 12
THREAD_HISTORY = 15
MATCHES = 5
# Characters a section may take before it says what it left out; matched by the title's start.
BUDGET = {"WHAT ALPHA HOLDS": 3_600, "WHAT ALPHA CAN DO": 2_000, "WHAT ALPHA KNOWS": 1_600,
          "THIS MODULE'S PAGE": 1_700, "THIS CONVERSATION": 2_400, "SINCE YOUR LAST TURN": 800,
          "WHAT WAS SAID": 1_600, "MATCHES FOR THIS SENTENCE": 2_200, "THIS THREAD": 2_400,
          "OPEN": 900, "WHO THE SENTENCE NAMES": 1_200, "TODAY'S CALENDAR": 700}
DEFAULT_BUDGET = 900
# Sections where the newest lines matter most: they are cut from the front.
KEEP_NEWEST = ("THIS CONVERSATION", "THIS THREAD", "WHAT WAS SAID", "SINCE YOUR LAST TURN")
# When the whole still runs over, sections give up room in this order: the index and the skills
# first (both are reachable by a tool), what the sentence is about last.
SHRINK_ORDER = ("WHAT ALPHA KNOWS", "WHAT ALPHA CAN DO", "THIS MODULE'S PAGE",
                "THIS CONVERSATION", "THIS THREAD", "WHAT WAS SAID", "WHAT ALPHA HOLDS", "OPEN",
                "WHO THE SENTENCE NAMES", "MATCHES FOR THIS SENTENCE")
FIELDS_LINE = 320


def _budget(title: str) -> int:
    return next((cap for key, cap in BUDGET.items() if title.startswith(key)), DEFAULT_BUDGET)


def _fit(title: str, lines: list[str], cap: int) -> list[str]:
    """The lines of a section within `cap` characters: whole lines, from the start (or the end
    for the sections where the newest matter), and one line saying how many were left out."""
    if len(title) + 1 + sum(len(line) + 1 for line in lines) <= cap:
        return lines
    newest = title.startswith(KEEP_NEWEST)
    room = cap - len(title) - 60
    kept: list[str] = []
    used = 0
    for line in (reversed(lines) if newest else lines):
        if used + len(line) + 1 > room:
            break
        kept.append(line)
        used += len(line) + 1
    if newest:
        kept.reverse()
    left = len(lines) - len(kept)
    note = (f"- … {left} {'earlier ' if newest else ''}line{'s' if left != 1 else ''}"
            " left out for room")
    return [note, *kept] if newest else [*kept, note]


def _assemble(sections: list[tuple[str, list[str]]]) -> str:
    """Every section within its budget, and the whole within MAX_CHARS: when it still runs
    over, sections give up a third of their room in SHRINK_ORDER, round after round, until it
    fits; a section down to two lines gives up no more."""
    caps = [_budget(title) for title, _ in sections]
    fitted = [(title, _fit(title, lines, cap)) for (title, lines), cap in zip(sections, caps,
                                                                              strict=True)]

    def join(parts: list[tuple[str, list[str]]]) -> str:
        return "\n\n".join(f"{title}\n" + "\n".join(lines) for title, lines in parts)

    text = join(fitted)

    def rank(i: int) -> int:
        title = sections[i][0]
        return next((n for n, key in enumerate(SHRINK_ORDER) if title.startswith(key)),
                    len(SHRINK_ORDER))

    while len(text) > MAX_CHARS:
        sizes = [len(title) + sum(len(line) + 1 for line in lines) for title, lines in fitted]
        shrinkable = [i for i, (_, lines) in enumerate(fitted) if len(lines) > 2
                      and sizes[i] > 400 and rank(i) < len(SHRINK_ORDER)]
        if not shrinkable:
            break
        i = min(shrinkable, key=lambda j: (rank(j), -sizes[j]))
        caps[i] = int(sizes[i] * 0.66)
        fitted[i] = (sections[i][0], _fit(sections[i][0], sections[i][1], caps[i]))
        text = join(fitted)
    return text if len(text) <= MAX_CHARS else text[: MAX_CHARS - 40] + "\n…(pre-pack cut short)"


def table_line(world: World, table: dict[str, Any]) -> str:
    """A table with its fields in one line: name kind unit[choices]->relation, so the model
    queries it without a describe first (3 Oct: every data question paid that step)."""
    desc = world.collections.describe(table["name"])
    parts = []
    for f in desc["fields"]:
        bit = f["name"]
        if f["kind"] != "text":
            bit += f" {f['kind']}"
        if f.get("unit"):
            bit += f" {f['unit']}"
        if f.get("choices"):
            shown = [str(c)[:20] for c in f["choices"][:5]]
            bit += "[" + "|".join(shown) + ("|…" if len(f["choices"]) > 5 else "") + "]"
        if f.get("relation"):
            bit += f"->{f['relation']}"
        parts.append(bit)
    rows = table["records"]
    return "  " + _clip(f"{table['name']} ({rows} row{'s' if rows != 1 else ''}): "
                        + ", ".join(parts), FIELDS_LINE - 2)


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
        goal = f" — {_clip(m['goal'], 140)}" if m["goal"] else ""
        held.append(f"- Module {m['name']} ({m['id']}){goal}"
                    + ("" if own else ": no tables yet"))
        held += [table_line(world, t) for t in own]
    loose = [t for group in by_module.values() for t in group]
    if loose:
        held.append("- Tables in no module:")
        held += [table_line(world, t) for t in loose]
    sections.append(("WHAT ALPHA HOLDS (each table with its fields: query it straight away)",
                     held or ["- Nothing yet: no modules, no tables."]))

    reach = [
        f"- {c['connector']}: {c['target']} — {c['status']}"
        + (f", last read {c['last_sync'][:16]}Z" if c["last_sync"] else "")
        + (f" (problem: {_clip(c['last_error'], 80)})" if c["last_error"] else "")
        for c in Connections(world.store).all() if c["status"] != "off"
    ]
    sections.append(("WHAT ALPHA CAN REACH", reach or [
        "- Nothing connected yet. Public web pages can always be read (page_read); folders,"
        " sites to sign into and the calendar are connected when the person asks."]))

    # Know-how: every skill, always, but compact (design §3.7 point 7): act and run skills one
    # line each, read skills as a list by site; bodies by skill_read, search by skills_find.
    # Found 3 Oct: a line per skill with its description ate a third of the pack and cut the
    # matches off; the cap is 12,000 characters for everything.
    can_do = []
    reads = []
    for sk in world.skills.index()[:120]:
        where = sk["site"] or (world.modules.get(sk["module"])["name"] if sk["module"] else "")
        mark = "" if sk["health"] == "ok" else f", {sk['health']}"
        use = f" When: {_clip(sk['when_to_use'], 80)}" if sk["when_to_use"] else ""
        if sk["kind"] == "read":
            rows = f", {sk['last_count']} rows" if sk["last_count"] else ""
            reads.append(f"{sk['name']} ({where}{rows}{mark}{use})")
        else:
            can_do.append(f"- [{sk['kind']}] {sk['name']} ({where}{mark}"
                          + (f", {sk['effect']}" if sk["effect"] else "")
                          + f"): {_clip(sk['description'], 90)}{use}")
    if reads:
        can_do.append("- [read] " + "; ".join(reads))
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
            body = page["body"]
            if len(body) > 1500:
                body = body[:1500].rsplit("\n", 1)[0] + "\n  … (note_read for the rest)"
            sections.append((f"THIS MODULE'S PAGE ({page['title']})",
                             [f"  {line}" for line in body.splitlines()[:40]]))

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
    # The journal's hits have a cap of their own: records and documents never crowd them out
    # (found 3 Oct: a day-named question's own sentence sat beyond the shared cap).
    found = 0
    for hit in hits:
        if hit["id"] in recent_ids:
            continue
        gone = f" [history: {hit['removed']}]" if "removed" in hit else ""
        matches.append(f"- {when(hit['at'])} {hit['kind']} ({hit['id']}):"
                       f" {_clip(hit['snippet'], 160)}{gone}")
        found += 1
        if found >= MATCHES * 2:
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

    return _assemble(sections)
