"""Home and the work items: where a sentence goes (harness design §7, slice 3, 18 Oct 2026).

**Home** is the one conversation: the companion's voice and Home's box. Its session is the
coordinator: it answers what can be answered now and routes the rest. **A work item** is a
thread with its own model session, a state, one plain line (its card in Home) and its own box:
a build, a watch with its runs, a long answer, an agent's work. Memory is shared only through
the world, never through a session.

Routing, for a sentence typed in Home (or on a module's page) with no item of its own:
1. **Structure, where it is certain, in code.** Typed in an item's own box → that item (the
   API, before this module is asked). A reply to a card → the item that owns it (the answer
   route). `@item` → the item named. `@agent` → the agent's own item (the API). A short
   sentence when exactly one item has asked a question → that item.
2. **One judgement, the System One seam** (`judge.py`), over the roster of the open items
   (title, state, last line, what each touches; never their transcripts): answer here,
   continue an item, or a new item. Under a confidence it does not guess: it asks the person
   with the candidates as choices, and the answer routes the original sentence.
3. Every decision is a journal line in Home; a correction the person makes (a turn moved) is
   journaled too and shown to the judge the next time, so a misroute is counted and learned.
4. No name matching beyond the explicit `@`, no keyword rules: a rule here never reads meaning.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import urlsplit

from alpha import config
from alpha.config import settings
from alpha.runtime import judge
from alpha.world.store import Problem
from alpha.world.world import World

log = logging.getLogger(__name__)

CONFIDENT = settings.conversations.confident
NEW = "new item"
HERE = "answer here"
CONTINUE = "continue: "
FOCUS_KEY = "companion_focus"
ROSTER = 12
# Done items stay on the roster (and on Home) this long after their last turn: a follow-up
# ("make that watch check at 7") continues the item that did the work.
DONE_FOR_H = 24


def title_for(sentence: str) -> str:
    words = " ".join(sentence.split())
    if len(words) <= 60:
        return words[:1].upper() + words[1:]
    cut = words[:60].rsplit(" ", 1)[0]
    return cut[:1].upper() + cut[1:] + "…"


def home(world: World) -> dict[str, Any]:
    return world.modules.home_thread()


def open_item(world: World, sentence: str, module: str | None) -> dict[str, Any]:
    module_id = world.modules.get(module)["id"] if module else None
    return world.modules.open_thread(title_for(sentence), "work", module_id)


UNNAMED = "New conversation"


def rename(world: World, cid: str, title: str) -> dict[str, Any]:
    """The person's title for an item (13 Oct, slice 2 G1), kept from then on."""
    thread = world.modules.thread(cid)
    if thread["kind"] == "home":
        raise Problem("Home is Home; it has no other name.")
    clean = " ".join(title.split())
    if not clean:
        raise Problem("A work item needs a title.")
    if clean == thread["title"]:
        return world.modules.retitle(cid, clean, by_person=True)  # named now, even if the same
    renamed = world.modules.retitle(cid, clean[:120], by_person=True)
    world.journal.append("changed", f"You renamed {thread['title']} to {renamed['title']}.",
                         actor="person", thread=cid, module=thread["module"],
                         data={"conversation": cid, "before": thread["title"]})
    return renamed


def name_from_first(world: World, cid: str, sentence: str) -> None:
    """An item started unnamed (+ New) takes its first message's words as its title, unless
    the person named it."""
    thread = world.modules.thread(cid)
    if thread["kind"] == "work" and not thread.get("titled") and thread["title"] == UNNAMED:
        world.modules.retitle(cid, title_for(sentence), by_person=False)


def finish(world: World, cid: str, why: str = "done") -> dict[str, Any]:
    """An item is over (the person's Done): its state; its session and its turns stay."""
    thread = world.modules.thread(cid)
    if thread["kind"] == "home":
        raise Problem("Home never closes.")
    if thread["state"] in ("done", "stopped"):
        return thread
    world.modules.update_thread(cid, state="done")
    world.journal.append("changed", f"Closed \"{thread['title']}\" ({why}).",
                         actor="alpha" if why != "done" else "person",
                         data={"conversation": cid, "why": why}, thread=cid,
                         module=thread["module"])
    if focus(world) == cid:
        set_focus(world, None)
    return world.modules.thread(cid)


def reset_working(world: World) -> list[str]:
    """At the core's start no turn is running, so a thread left "working" by a core that died
    is open again: the panel was stuck polling it with Done hidden (found at the 3 Oct
    checkpoint)."""
    reset = [t["id"] for t in world.store.all(
        "SELECT id FROM threads WHERE state = 'working'")]
    for tid in reset:
        world.modules.update_thread(tid, state="open")
    if reset:
        n = len(reset)
        world.journal.append(
            "changed", f"Alpha's core started; {n} piece{'s' if n != 1 else ''} of work left"
            " mid-turn " + ("are" if n != 1 else "is") + " open again.",
            actor="alpha", data={"conversations": reset})
    return [str(t) for t in reset]


def settle(world: World, tid: str, *, ok: bool, stopped: bool, last_line: str) -> None:
    """A thread after a turn in it: Home is open again; an item is needs_you when a question
    or a yes waits in it, done when the turn ended well, stopped when it failed or the person
    stopped it; its card's line is the reply's first line or the failure."""
    thread = world.modules.thread(tid)
    if thread["kind"] == "home":
        world.modules.update_thread(tid, state="open", last_line=last_line)
        return
    waiting = any(a["thread"] == tid for a in world.journal.open_asks()) or bool(
        world.store.one("SELECT 1 AS x FROM actions WHERE thread = ? AND state = 'proposed'",
                        (tid,)))
    state = "needs_you" if waiting else "done" if ok else "stopped"
    del stopped  # a stop and a failure are one state; the line says which
    world.modules.update_thread(tid, state=state, last_line=last_line)


def first_line(reply: str) -> str:
    for line in reply.splitlines():
        words = " ".join(line.replace("*", "").replace("#", "").split())
        if words:
            return words[:200]
    return ""


# ---- the companion's focus: the item a sentence last went to ----


def focus(world: World) -> str | None:
    row = world.store.one("SELECT value FROM meta WHERE key = ?", (FOCUS_KEY,))
    if row is None:
        return None
    try:
        return world.modules.thread(row["value"])["id"] if row["value"] else None
    except Exception:
        return None


def set_focus(world: World, cid: str | None) -> None:
    with world.store.tx() as db:
        db.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)", (FOCUS_KEY, cid or ""))


# ---- the roster ----


def touches(world: World, tid: str) -> str:
    """What an item is about, from its own journal: its module, the tables, skills, sites and
    people its steps name. A short line for the roster and the card, never a transcript."""
    thread = world.modules.thread(tid)
    tables: dict[str, None] = {}
    skills: dict[str, None] = {}
    sites: dict[str, None] = {}
    people: dict[str, None] = {}
    for e in world.journal.recent(120, thread=tid):
        d = e.get("data") or {}
        for key in ("table", "collection"):
            if isinstance(d.get(key), str):
                tables[d[key]] = None
        for key in ("skill", "reader", "procedure"):
            if isinstance(d.get(key), str):
                skills[d[key]] = None
        if isinstance(d.get("site"), str):
            sites[d["site"]] = None
        if isinstance(d.get("url"), str):
            host = urlsplit(d["url"]).hostname
            if host:
                sites[host.removeprefix("www.")] = None
        for eid in e.get("entity_ids") or []:
            if len(people) < 4:
                try:
                    people[world.entities.get(eid)["name"]] = None
                except Exception:
                    continue
    parts = []
    if thread.get("module"):
        parts.append(world.modules.path_words(thread["module"]))
    if tables:
        parts.append("tables " + ", ".join(list(tables)[:4]))
    if skills:
        parts.append("skills " + ", ".join(list(skills)[:3]))
    if sites:
        parts.append(", ".join(list(sites)[:3]))
    if people:
        parts.append(", ".join(people))
    return "; ".join(parts)


def _open_question(world: World, cid: str) -> str | None:
    for a in world.journal.open_asks():
        if a["thread"] == cid:
            return str(a["text"])
    return None


def roster(world: World) -> list[dict[str, Any]]:
    """The open work items as the judge and the coordinator see them: the ones not over,
    and the ones done in the last day (a follow-up continues them); newest first."""
    since = (datetime.now(UTC) - timedelta(hours=DONE_FOR_H)).replace(microsecond=0).isoformat()
    out = []
    for t in world.modules.items(limit=ROSTER * 3):
        if t["state"] in ("done", "stopped") and t["updated_at"] < since:
            continue
        owner = world.agents.of_thread(t["id"])
        if owner and owner["kind"] != "custom":
            continue  # a built-in agent's own work lives on its page (§10), never here
        out.append({"id": t["id"], "title": t["title"], "state": t["state"],
                    "line": t.get("last_line") or "", "touches": touches(world, t["id"]),
                    "question": _open_question(world, t["id"]),
                    "agent": owner["name"] if owner else None, "module": t.get("module")})
        if len(out) >= ROSTER:
            break
    return out


def corrections(world: World, limit: int = 5) -> list[str]:
    """The last turns the person moved (a misroute corrected), as lines for the judge: what
    the sentence was and where it belonged."""
    out = []
    for e in reversed(world.journal.recent(40, kinds=["changed"])):
        d = e.get("data") or {}
        if d.get("misroute") and d.get("to"):
            try:
                to = world.modules.thread(str(d["to"]))["title"]
            except Problem:
                continue
            out.append(f'"{str(d.get("sentence") or "")[:100]}" belonged to {to}')
            if len(out) >= limit:
                break
    return out


def misroutes(world: World) -> int:
    """How many turns the person moved, ever: the measure of the judgement (design §7)."""
    row = world.store.one("SELECT COUNT(*) AS n FROM journal WHERE kind = 'changed'"
                          " AND json_extract(data, '$.misroute') IS NOT NULL")
    return int(row["n"]) if row else 0


# ---- routing ----


def named(world: World, sentence: str, items: list[dict[str, Any]]) -> dict[str, Any] | None:
    """`@<title>` at the start of a sentence names an item: the whole title, or a prefix only
    one item's title starts with (case-insensitive). Structure, not meaning."""
    words = sentence.strip()
    if not words.startswith("@"):
        return None
    rest = words[1:].strip().lower()
    hits = [i for i in items if rest.startswith(i["title"].lower())]
    if len(hits) == 1:
        return hits[0]
    prefix = [i for i in items if i["title"].lower().startswith(rest.split("\n")[0][:40])]
    return prefix[0] if len(prefix) == 1 and rest else None


def route(world: World, sentence: str, *, module: str | None = None, runner: Any = None,
          ask_when_unsure: bool = True) -> dict[str, Any]:
    """Where a sentence typed in Home (or on a module's page, `module`) goes. Returns
    {"thread": id, "by": …, "opened": bool} (Home's own id for an answer here) or, when the
    judge is unsure and asking is allowed, {"ask": journal id, "options": [...]}: the question
    carries the sentence, and the answer routes it."""
    home_row = home(world)
    items = roster(world)
    current = focus(world)
    # Structure first.
    hit = named(world, sentence, items)
    if hit:
        return _settled(world, sentence, hit["id"], "named", home_row)
    asking = [i for i in items if i["question"]]
    if len(asking) == 1 and len(sentence.split()) <= 12:
        return _settled(world, sentence, asking[0]["id"], "answers the open question", home_row)
    # Then one judgement, from the roster.
    labels: dict[str, str] = {}
    lines = []
    for i in items:
        label = f"{CONTINUE}{i['title']}"
        labels[label] = i["id"]
        marks = [i["state"].replace("_", " ")]
        if i["id"] == current:
            marks.append("the one in focus")
        if i["agent"]:
            marks.append(f"{i['agent']}'s own work")
        if i["question"]:
            marks.append(f"it asked: {i['question'][:160]}")
        lines.append(f"- {label} ({'; '.join(marks)})"
                     + (f"\n  last: {i['line'][:160]}" if i["line"] else "")
                     + (f"\n  touches: {i['touches'][:200]}" if i["touches"] else ""))
    where = (f" on the page of the module {world.modules.get(module)['name']}" if module
             else " in Home")
    state = f'The person said{where}: "{sentence}"\n\n'
    state += ("Open work items:\n" + "\n".join(lines)) if lines else "No work items are open."
    fixed = corrections(world)
    if fixed:
        state += "\n\nCorrections the person made lately: " + "; ".join(fixed)
    question = judge.Question(kind="choose", text=config.prompt("route_home"), state=state,
                              options=[HERE, *labels, NEW])
    kwargs: dict[str, Any] = {"world_path": world.path}
    if runner is not None:
        kwargs["runner"] = runner
    verdict = judge.ask(question, **kwargs)
    if verdict.confidence >= CONFIDENT and verdict.answer == HERE:
        return _settled(world, sentence, home_row["id"], "judge", home_row, verdict=verdict)
    if verdict.confidence >= CONFIDENT and verdict.answer == NEW:
        new = open_item(world, sentence, module)
        return _settled(world, sentence, new["id"], "judge", home_row, verdict=verdict,
                        opened=True)
    if verdict.confidence >= CONFIDENT and verdict.answer in labels:
        return _settled(world, sentence, labels[verdict.answer], "judge", home_row,
                        verdict=verdict)
    if not verdict.answer or not ask_when_unsure:
        # No answer at all (the judge did not run, or gave none): Home takes it, which has
        # every hand and makes what stands if the sentence turns out to need it (rule 11);
        # never a card for a question nobody asked.
        stay = not ask_when_unsure and current in {i["id"] for i in items}
        tid = str(current) if stay else str(home_row["id"])
        return _settled(world, sentence, tid, "unsure; stayed", home_row, verdict=verdict)
    # Unsure: ask, with the candidates as choices; the answer routes the sentence.
    options = [*labels, NEW, HERE]
    jid = world.journal.append(
        "asked", f"Which is this about? \"{sentence[:120]}\"", thread=home_row["id"],
        data={"options": options, "turn": None,
              "routing": {"text": sentence, "module": module,
                          "choices": {**labels, NEW: "", HERE: home_row["id"]}}})
    return {"ask": jid, "options": options, "confidence": verdict.confidence}


def _settled(world: World, sentence: str, tid: str, by: str, home_row: dict[str, Any], *,
             verdict: judge.Verdict | None = None, opened: bool = False) -> dict[str, Any]:
    """The decision, journaled in Home (every routing decision is a line there: a card under
    the sentence when it went to an item), and the focus moved."""
    here = tid == home_row["id"]
    title = world.modules.thread(tid)["title"]
    if opened:
        text = f"Started a work item for \"{sentence[:80]}\": {title}."
    elif here:
        text = f"Answering \"{sentence[:80]}\" here."
    else:
        text = f"Sent \"{sentence[:80]}\" to {title}."
    data: dict[str, Any] = {"routed": tid, "sentence": sentence, "opened": opened, "by": by}
    if verdict is not None:
        data.update({"confidence": verdict.confidence, "why": verdict.why})
    world.journal.append("did", text, actor="alpha", data=data, thread=home_row["id"])
    set_focus(world, None if here else tid)
    out = {"thread": tid, "by": by if verdict is None else f"judge: {verdict.why}",
           "opened": opened, "here": here}
    if verdict is not None:
        out["confidence"] = verdict.confidence
    return out


def routed_answer(world: World, ask: dict[str, Any], answer: str) -> dict[str, Any] | None:
    """The person's pick for a routing question: the thread to send the original sentence to
    (an item opened when they chose something new), and that sentence."""
    routing = (ask.get("data") or {}).get("routing")
    if not routing:
        return None
    chosen = next((k for k in routing["choices"] if k.lower() == answer.strip().lower()), None)
    if chosen is None:
        return None
    opened = not routing["choices"][chosen]
    tid = str(routing["choices"][chosen] or open_item(world, routing["text"],
                                                       routing.get("module"))["id"])
    _settled(world, routing["text"], tid, "card", home(world), opened=opened)
    return {"thread": tid, "text": routing["text"]}


def correct(world: World, sentence: str, *, said: str | None, to: str) -> None:
    """The person moved a sentence to another item: journaled as a correction, counted, and
    shown to the judge from then on."""
    title = world.modules.thread(to)["title"]
    world.journal.append("changed", f"Moved \"{sentence[:80]}\" to {title}.", actor="person",
                         data={"turn": said, "to": to, "misroute": True, "sentence": sentence})
    set_focus(world, to)
