"""What the model is given besides its fixed system prompt, in two layers (section B, Q99).

The system prompt is fixed (turn.md and the connectors' SKILL.md), so a session's cache holds
from its second turn on, and it is sent as it is now to every open session. What changes rides
on the person's message, never in the system prompt (19 Oct 2026: the SDK kept a resumed
session's first system prompt, so the pre-pack that lived there, deleted with B5, went stale
after a conversation's first turn):

- the start layer, once when a session is made and again after each compaction: who the person
  is; their standing instructions (ALPHA.md) and permissions, whole, never clipped; their goals;
  a map of their modules and tables with row counts (the fields are one query away, in
  world_query's `fields`); what Alpha can reach and do; the wiki's index; the module's NOTES.md,
  whole; an agent's own thread; and every open card;
- the turn layer, with every sentence, a few lines: the clock, what changed elsewhere since the
  last turn here, what is due today, the cards open here, the strongest matches for the sentence
  with their ids, who it names, and in Home the roster of work items.

Everything else the model fetches through its tools; the conversation is in the session it
resumes. Deterministic and free: no model call; every line names where it came from. No section
has a budget and the whole has no cap (B5): what is long is long; a line that summarises
something (a skill, a match, a page in the index) keeps the length it always had.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, time, timedelta
from typing import Any

from alpha.config import settings
from alpha.connectors.base import Connections
from alpha.connectors.calendar import Calendar
from alpha.connectors.files import Files
from alpha.world import grants
from alpha.world.knowledge import GATED_NOTES, INSTRUCTIONS
from alpha.world.store import local_midnight_utc
from alpha.world.world import World

# An agent's own thread, given at its run's start: its history, the newest this many lines.
THREAD_HISTORY = settings.views.thread_history
# The turn layer's lines, counted, never measured in characters (B3).
TURN_MATCHES = settings.views.turn_matches
TURN_ELSEWHERE = settings.views.turn_elsewhere
TURN_DUE = settings.views.turn_due
# the person's notes only they change (ALPHA.md's and the permissions), given whole
PERMISSIONS = GATED_NOTES[1]


def _module_name(world: World, module: str | None) -> str:
    """A module's name for a line, or its id when the world has no such module (a skill's
    folder copied from elsewhere): never a failed layer over a stray file."""
    if not module:
        return ""
    try:
        return str(world.modules.get(module)["name"])
    except Exception:
        return str(module)


def one_line(text: str, n: int) -> str:
    text = " ".join(text.split())
    return text if len(text) <= n else text[: n - 1] + "…"


def part_of(given: str, title: str) -> str:
    """One part of what a turn was given (`turn_contexts`), by the start of its title (a title
    may carry a suffix: "THIS THREAD (its brief ...)"): its lines, without the title, or "" when
    there is no such part. The journey suite's judge and Columbo read what the model was given
    this way."""
    m = re.search(rf"(?m)^{re.escape(title)}[^\n]*\n(.*?)(?=\n\n[A-Z]{{2}}|\Z)", given, re.S)
    return m.group(1).strip() if m else ""


def when(iso: str) -> str:
    """A journal time as the person would say it, in local time: "Thu 1 Oct 20:21"."""
    local = datetime.fromisoformat(iso).astimezone()
    return f"{local.strftime('%a')} {local.day} {local.strftime('%b %H:%M')}"


def clock(at: datetime | None = None) -> list[str]:
    local = (at or datetime.now()).astimezone()
    offset = local.strftime("%z")
    return [
        f"- {local.strftime('%A %d %B %Y, %H:%M')} local time (UTC{offset[:3]}:{offset[3:]}).",
        f"- Today's date is {local.date().isoformat()}. Record times (created_at, updated_at)"
        f" are stored in UTC: records made today have created_at >="
        f" {local_midnight_utc(local)}.",
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


def start_layer(world: World, *, module: str | None = None, thread: str | None = None) -> str:
    """What a session is given once, when it is made and again after a compaction: the world as
    it stands for this conversation, not for any one sentence (B2)."""
    sections: list[tuple[str, list[str]]] = []
    k = world.knowledge

    who = [f"- {f['predicate']}: {f['value']} (fact {f['id']}, {f['state']}, from {f['source']})"
           for f in k.facts("person")]
    profile = k.find_note("person", "Profile")
    if profile and profile["body"].strip():
        who += [f"- Profile note ({profile['id']}):", *_indented(profile["body"])]
    sections.append(("WHO THE PERSON IS", who or ["- Nothing known yet."]))

    # ALPHA.md is the standing instructions note, kept both ways by modfiles; both notes whole
    rules = []
    for title, said in ((INSTRUCTIONS, "Standing instructions (ALPHA.md)"),
                        (PERMISSIONS, "Permissions")):
        note = k.find_note("person", title)
        if note and note["body"].strip():
            rules += [f"- {said} ({note['id']}):", *_indented(note["body"])]
    sections.append(("THEIR INSTRUCTIONS", rules or ["- None given yet."]))

    goals = [f"- {g['text']} (goal {g['id']}{', module ' + g['module'] if g['module'] else ''})"
             for g in k.goals("active")]
    sections.append(("ACTIVE GOALS", goals or ["- None yet."]))

    sections.append(("WHAT ALPHA HOLDS (each module with its tables and their rows; a table's"
                     " fields: world_query's `fields`)", _map(world, module)))

    reach = [
        f"- {c['connector']}: {c['target']} — {c['status']}"
        + (f", last read {c['last_sync'][:16]}Z" if c["last_sync"] else "")
        + (f" (problem: {one_line(c['last_error'], 80)})" if c["last_error"] else "")
        for c in Connections(world.store).all() if c["status"] != "off"
    ]
    reach += grants.describe(world, module)
    sections.append(("WHAT ALPHA CAN REACH", reach))

    # Know-how: every skill, compact (design §3.7 point 7): act and run skills one line each,
    # read skills as a list by site; bodies and search by skill_find.
    can_do = []
    reads = []
    for sk in world.skills.index()[:120]:
        where = sk["site"] or _module_name(world, sk["module"])
        mark = "" if sk["health"] == "ok" else f", {sk['health']}"
        use = f" When: {one_line(sk['when_to_use'], 80)}" if sk["when_to_use"] else ""
        if sk["kind"] == "read":
            rows = f", {sk['last_count']} rows" if sk["last_count"] else ""
            reads.append(f"{sk['name']} ({where}{rows}{mark}{use})")
        else:
            can_do.append(f"- [{sk['kind']}] {sk['name']} ({where}{mark}"
                          + (f", {sk['effect']}" if sk["effect"] else "")
                          + f"): {one_line(sk['description'], 90)}{use}")
    if reads:
        can_do.append("- [read] " + "; ".join(reads))
    if can_do:
        sections.append(("WHAT ALPHA CAN DO (skills it wrote; skill_find with a name for one,"
                         " with words or a site to search; use one before writing another)",
                         can_do))

    # The wiki's index: every page in one line; bodies on demand (note_read).
    index = [f"- [{p['scope']}] {p['title']}: {one_line(p['summary'], 140)}"
             for p in k.index() if not str(p["scope"]).startswith("conversation:")
             and p["title"] not in ("Profile", INSTRUCTIONS, PERMISSIONS)][:200]
    if index:
        sections.append(("WHAT ALPHA KNOWS (the index; note_read for a page)", index))
    if module:
        page = next((n for n in k.notes(f"module:{world.modules.get(module)['name']}")), None)
        if page and page["body"].strip():
            # the module's NOTES.md, kept both ways by modfiles, whole
            sections.append((f"THIS MODULE'S NOTES (NOTES.md, {page['title']})",
                             _indented(page["body"])))

    # An agent's own item is a thread with a brief and a history; its runs are sessions of their
    # own (Q21), so they are given both at the start (B7 makes this the run's own start layer).
    row = world.modules.thread(thread) if thread else None
    if row and world.agents.of_thread(row["id"]):
        lines = [f"- {row['title']} ({row['id']}, {row['kind']})",
                 f"- Brief: {row['brief']}" if row.get("brief") else
                 "- Brief: none yet. Keep one with agent_keep (its brief) when you learn how"
                 " this work should go."]
        history = world.journal.mark_removed(world.journal.recent(THREAD_HISTORY, thread=thread))
        lines += [f"- {when(e['at'])} {e['kind']}: {one_line(e['text'], 300)}" for e in history]
        sections.append(("THIS THREAD (its brief and its own history, oldest first)", lines))

    open_items = [f"- Asked the person ({a['id']}): {one_line(a['text'], 200)}"
                  for a in world.journal.open_asks()]
    if open_items:
        sections.append(("OPEN", open_items))

    return _joined(sections)


def carried_part(checkpoint: str) -> str:
    """A fresh session's part of the start layer saying what was going on in the conversation
    before it (A12's checkpoint, Q99 question 5)."""
    return f"WHAT WAS GOING ON HERE BEFORE THIS FRESH SESSION\n{checkpoint.strip()}"


def _map(world: World, module: str | None) -> list[str]:
    """Every module with its tables and their rows, one line each, the module the turn is in
    first; no fields (B2: they are one query away)."""
    tables = [t for t in world.collections.overview() if not t.get("world")]
    by_module: dict[str | None, list[dict[str, Any]]] = {}
    for t in tables:
        by_module.setdefault(t["module"], []).append(t)
    modules = world.modules.all()
    kids: dict[str | None, list[dict[str, Any]]] = {}
    for m in modules:
        kids.setdefault(m.get("parent"), []).append(m)
    here = world.modules.get(module)["id"] if module else None
    branch = set(world.modules.subtree(here)) if here else set()
    root_of = {m["id"]: world.modules.path(m["id"])[0]["id"] for m in modules}
    mine = root_of.get(here) if here else None
    held: list[str] = []

    def rows(t: dict[str, Any]) -> str:
        n = t["records"]
        return f"{t['name']} ({n} row{'s' if n != 1 else ''})"

    def walk(parent: str | None, depth: int) -> None:
        for m in sorted(kids.get(parent, []),
                        key=lambda m: (m["id"] != mine, m["id"] not in branch, m["name"])):
            own = by_module.pop(m["id"], []) + by_module.pop(m["name"], [])
            goal = f" — {one_line(m['goal'], 140)}" if m["goal"] else ""
            inside = (f", holds {', '.join(c['name'] for c in kids.get(m['id'], []))}"
                      if kids.get(m["id"]) else "")
            held.append(f"{'  ' * depth}- Module {m['name']} ({m['id']}){goal}{inside}: "
                        + (", ".join(rows(t) for t in own) if own else "no tables of its own"))
            walk(m["id"], depth + 1)

    walk(None, 0)
    loose = [t for group in by_module.values() for t in group]
    if loose:
        held.append("- Tables in no module: " + ", ".join(rows(t) for t in loose))
    return held or ["- Nothing yet: no modules, no tables."]


def _indented(text: str) -> list[str]:
    return [f"  {line}" for line in text.strip().splitlines()]


def _joined(sections: list[tuple[str, list[str]]]) -> str:
    return "\n\n".join(f"{title}\n" + "\n".join(lines) for title, lines in sections)


def turn_layer(world: World, sentence: str, *, module: str | None = None,
               thread: str | None = None, said: str | None = None) -> str:
    """What rides with each sentence, a few lines: the clock, what changed elsewhere since the
    last turn here, what is due today, the cards open here, the strongest matches for the
    sentence with their ids (one query reaches each), who it names, and at the desk (Home) the
    page the sentence came from and the work beside it (section C).
    `said` is the sentence's own journal line, never a match for itself."""
    sections: list[tuple[str, list[str]]] = [("NOW", clock())]

    row = world.modules.thread(thread) if thread else None
    home = world.modules.home_thread()
    chat = row or home
    if chat.get("session_ref"):
        # The model's session carries this conversation; the world may have moved meanwhile.
        last_row = world.store.one("SELECT MAX(at) AS at FROM journal WHERE thread = ?"
                                   " AND kind = 'replied'", (chat["id"],))
        last_at = str(last_row["at"]) if last_row and last_row["at"] else None
        delta = []
        if last_at:
            for e in world.journal.recent(40, kinds=["changed", "did", "made", "answered",
                                                     "noticed"]):
                if e["at"] > last_at and e["thread"] != chat["id"] \
                        and not e["data"].get("step"):
                    delta.append(f"- {when(e['at'])} {e['kind']}: {one_line(e['text'], 200)}")
        if delta:
            sections.append(("SINCE YOUR LAST TURN HERE (elsewhere, meanwhile)",
                             delta[-TURN_ELSEWHERE:]))

    due = world.tasks.due_within(0)
    if due:
        sections.append(("DUE TODAY (or overdue; every task in world_query's tasks)", [
            f"- {t['title']} (due {t['due']}; {world.tasks.who_words(t.get('owner')) or 'You'}"
            + (f"; on {place}" if (place := world.tasks.place_words(t.get('anchor'))) else "")
            + f"; task {t['id']})" for t in due[:TURN_DUE]]))
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
            for e in today[:TURN_DUE]
        ]))

    here = [f"- Asked the person ({a['id']}): {one_line(a['text'], 200)}"
            for a in world.journal.open_asks() if (a["thread"] or home["id"]) == chat["id"]]
    if here:
        sections.append(("OPEN HERE", here))

    # The strongest hits of each kind, taken in turn: a record, a document, a journal line.
    # A sentence that names a day looks in that day's journal first.
    records = [f"- record {hit['id']} in {hit['collection']}: {one_line(hit['snippet'], 160)}"
               for hit in world.collections.search(sentence, TURN_MATCHES)]
    documents = [f"- document {doc['id']} {doc['title']}: {one_line(doc['snippet'], 160)}"
                 for doc in Files(world).search(sentence, TURN_MATCHES)]
    window = day_named(sentence)
    lines = []
    for hit in world.journal.mark_removed(world.journal.search(
            sentence, TURN_MATCHES + 1,
            since=window[0] if window else None, until=window[1] if window else None)):
        if hit["id"] == said:
            continue
        gone = f" [history: {hit['removed']}]" if "removed" in hit else ""
        lines.append(f"- {when(hit['at'])} {hit['kind']} ({hit['id']}):"
                     f" {one_line(hit['snippet'], 160)}{gone}")
    kinds = [records, documents, lines]
    matches: list[str] = []
    while len(matches) < TURN_MATCHES and any(kinds):
        for kind in kinds:
            if kind and len(matches) < TURN_MATCHES:
                matches.append(kind.pop(0))
    if matches:
        sections.append(("MATCHES FOR THIS SENTENCE", matches))
    named = [f"- {e['name']} ({e['kind']}, {e['id']})" for e in entities_named(world, sentence)]
    if named:
        sections.append(("WHO THE SENTENCE NAMES (the `people` and `organisations` views have"
                         " each)", named))

    if chat["kind"] == "home":
        # The desk (section C, Q107): one session for every page, so a sentence typed on a
        # module's page brings that module and its notes with it.
        if module:
            m = world.modules.get(module)
            lines = [f"- {m['name']} ({m['id']}); its folder: {grants.module_dir(world, module)}"]
            page = next((n for n in world.knowledge.notes(f"module:{m['name']}")), None)
            if page and page["body"].strip():
                lines.append(f"- Its notes (NOTES.md, {page['title']}):")
                lines += _indented(page["body"])
            sections.append(("THIS SENTENCE CAME FROM A MODULE'S PAGE", lines))
        # The work beside the desk: what runs now (a message reaches it by its task's id) and
        # what finished since the desk's last turn, one line each, never a transcript (C6).
        since = (datetime.now(UTC) - timedelta(hours=24)).isoformat()
        lines = []
        for t in world.modules.items(limit=40):
            if t.get("session_tools") != "desk-work":
                continue
            if t["state"] in ("done", "stopped") and t["updated_at"] < since:
                continue
            line = f"- {t['title']} (thread {t['id']}, task {t.get('session_ref')}," \
                   f" {t['state'].replace('_', ' ')})"
            lines.append(line + (f": {one_line(t['last_line'], 160)}" if t.get("last_line")
                                 else ""))
        if lines:
            sections.append(("WORK BESIDE YOU (running, or finished in the last day; what it"
                             " did is in the journal under its thread)", lines[:TURN_ELSEWHERE]))

    return _joined(sections)


def given(world: World, sentence: str, *, module: str | None = None,
          thread: str | None = None) -> str:
    """Both layers, as a new session is given them with its first sentence."""
    return (start_layer(world, module=module, thread=thread) + "\n\n"
            + turn_layer(world, sentence, module=module, thread=thread))
