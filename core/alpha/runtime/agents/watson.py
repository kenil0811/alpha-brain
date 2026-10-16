"""Watson, the noticer (design Q46; built on Q50's substrate, 15 Oct 2026).

Watson keeps notes on what the person says and what Alpha reads: facts about them and the
people and companies in their life, what they promised and are owed, and what each
conversation decided. It files each note where it belongs, checked by code: a fact about the
person (their page), a fact about a person or company (theirs; never from a first name alone,
never when two share a name), a commitment with its date (`commitments`), a decision a
conversation reached (`decisions`, the person's and binding), and anything else stays in the
journal only. What the person states is accepted; what Watson infers waits as a suggestion.

It works from the journal (the event stream, Q50): the person's turns that have a reply, a
conversation that closed or went quiet (its checkpoint: what it decided, what is open), and a
document Alpha read or the person added. Readers' rows are never its business. The judgement
in each pass is a small no-tools run of the System One model (Haiku); the frame, the filing
and the verdict are code. On its first run it refiles the facts kept before it that are not
about the person (a setting, a request, a passing state), once, with a journal line each.

Before 15 Oct this was `runtime/noticing.py`, a pass after each turn with no agent around it.
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from typing import Any

from alpha import config
from alpha.connectors.files import Files
from alpha.context.prepack import entities_named
from alpha.runtime import route, turn
from alpha.runtime.agents import Outcome, Work, journal_rowid, register, since_cursor
from alpha.runtime.claude_cli import TurnRequest
from alpha.world.world import World

log = logging.getLogger("alpha.agents.watson")

KIND = "watson"
NAME = "Watson"
DESCRIPTION = ("Watson keeps notes on what you say and what Alpha reads: facts about you and the"
               " people and companies in your life, things you've promised and are owed, and"
               " what each conversation decided. It files each note where it belongs, so you"
               " never have to repeat yourself. It never changes your tables or acts for you.")
MAY = ["facts", "notes", "commitments", "decisions"]
SMALL = {"yes", "no", "ok", "okay", "thanks", "thank you", "sure", "go", "go ahead", "not now",
         "nope", "yep", "fine", "great", "cool", "hi", "hello"}
REFILED = "Refiled the facts kept before Watson"


def model_name(model: str | None = None) -> str:
    return model or config.model_for("judge")


# ---- the exchange pass (noticing) ----


def worth_noticing(world: World, turn_id: str) -> bool:
    """A person's turn with a reply, and more than a yes or a tap."""
    try:
        said = world.journal.read(turn_id)
    except Exception:
        return False
    if said["kind"] != "said" or said["actor"] != "person":
        return False
    words = " ".join(said["text"].lower().split())
    if words.strip("!. ") in SMALL or len(words.split()) < 4:
        return False
    return world.journal.reply_of(turn_id) is not None


def _named(world: World, *texts: str) -> list[dict[str, Any]]:
    seen: dict[str, dict[str, Any]] = {}
    for text in texts:
        for e in entities_named(world, text):
            seen.setdefault(e["id"], e)
    return list(seen.values())[:6]


def _known(world: World, named: list[dict[str, Any]], module: str | None) -> str:
    lines = ["About the person:"]
    for f in world.knowledge.facts("person")[:40]:
        lines.append(f"- {f['predicate']} = {f['value']} ({f['state']})")
    for c in world.commitments.of("person")[:10]:
        lines.append(f"- commitment: {c['what']}" + (f" by {c['due']}" if c["due"] else ""))
    for e in named:
        lines.append(f"About {e['name']} ({e['kind']}):")
        page = world.knowledge.find_note(f"entity:{e['id']}", e["name"])
        if page:
            lines.append(f"- page: {page['body'][:600]}")
        for f in world.knowledge.facts(f"entity:{e['id']}")[:20]:
            lines.append(f"- {f['predicate']} = {f['value']} ({f['state']})")
    if module:
        try:
            name = world.modules.get(module)["name"]
            page = world.knowledge.find_note(f"module:{name}", name)
            if page:
                lines.append(f"About the module {name}:\n- page: {page['body'][:600]}")
        except Exception:
            pass
    return "\n".join(lines)


def _state(world: World, said: dict[str, Any], reply: dict[str, Any],
           named: list[dict[str, Any]], module: str | None) -> str:
    stamp = datetime.fromisoformat(said["at"]).astimezone().strftime("%a %d %b %Y, %H:%M")
    names = ", ".join(e["name"] for e in named) or "(nobody Alpha keeps is named)"
    return (f"When: {stamp}\n\nThe person said: \"{said['text'][:2000]}\"\n\n"
            f"Alpha replied: \"{reply['text'][:2500]}\"\n\n"
            f"People and companies Alpha keeps that this exchange names: {names}\n\n"
            f"KNOWN (do not repeat):\n{_known(world, named, module)}")


def parse(reply: str) -> list[dict[str, Any]]:
    data = _json(reply)
    items = data.get("items") if isinstance(data, dict) else None
    return [i for i in items if isinstance(i, dict)] if isinstance(items, list) else []


def _json(reply: str) -> Any:
    m = re.search(r"\{.*\}", reply, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def _entity_for(world: World, about: Any, about_kind: str, named: list[dict[str, Any]],
                source: str) -> dict[str, Any] | None:
    """The one entity a name is about: a named one by exact name or alias; else, when the
    pass says what kind it is, a new one. Several of the same name: none (never guessed)."""
    about = " ".join(str(about or "").split())
    if not about or about.lower() in ("person", "module"):
        return None
    low = about.lower()
    hits = [e for e in named
            if e["name"].lower() == low
            or low in {str(a).lower() for a in e.get("aliases") or []}
            or (e["kind"] == "person" and e["name"].lower().split(" ")[0] == low)]
    if len(hits) == 1:
        return hits[0]
    if hits:
        return None  # several of that name: never guessed
    kind = str(about_kind or "").strip().lower()
    if kind not in ("person", "organisation"):
        return None
    same = [e for e in world.entities.find(name=about, kind=kind, limit=20)
            if e["name"].lower() == low]
    if len(same) == 1:
        return same[0]
    if same:
        return None
    if kind == "person" and len(about.split()) < 2:
        # A first name alone is not a person Alpha should start keeping on a hunch.
        return None
    made: dict[str, Any] = world.entities.resolve(kind, about, source=source)["entity"]
    return made


def _side(world: World, who: Any, named: list[dict[str, Any]], source: str,
          entity_ids: set[str]) -> str | None:
    """A commitment's side: "person", an entity, or None when it names nobody Alpha can keep."""
    if who is None:
        return None
    text = " ".join(str(who).split())
    if not text:
        return None
    if text.lower() in ("person", "you", "me", "i"):
        return "person"
    e = _entity_for(world, text, "person", named, source)
    if e is None:
        return None
    entity_ids.add(e["id"])
    return f"entity:{e['id']}"


def apply(world: World, source: str, items: list[dict[str, Any]], *,
          named: list[dict[str, Any]], module: str | None, thread: str | None,
          at: str, actor: str = "alpha", about: dict[str, Any] | None = None,
          person_may_state: bool = True) -> dict[str, Any]:
    """Keep what a pass proposed, each by its type: facts (accepted when stated, suggested
    otherwise), page lines, commitments, decisions; anything else is left in the journal.
    One `noticed` entry as the trail."""
    facts: list[dict[str, Any]] = []
    pages: list[str] = []
    commitments: list[dict[str, Any]] = []
    decisions: list[dict[str, Any]] = []
    entity_ids: set[str] = set()
    day = datetime.fromisoformat(at).astimezone().strftime("%-d %b %Y")
    for item in items[:12]:
        kind = str(item.get("kind", ""))
        if kind == "fact":
            predicate = str(item.get("predicate", "")).strip()
            value = str(item.get("value", "")).strip()
            if not predicate or not value:
                continue
            who = str(item.get("about", "person")).strip().lower()
            if who == "person":
                if not person_may_state:
                    continue
                subject = "person"
            else:
                e = _entity_for(world, item.get("about"), str(item.get("about_kind") or ""),
                                named, source)
                if e is None:
                    continue
                subject = f"entity:{e['id']}"
                entity_ids.add(e["id"])
            stated = bool(item.get("stated")) and person_may_state
            current = world.knowledge.facts(subject, states=("accepted",))
            if any(f["predicate"] == predicate.lower().replace(" ", "_") and f["value"] == value
                   for f in current):
                continue
            try:
                fact = world.knowledge.record_fact(
                    subject, predicate, value, source=source,
                    state="accepted" if stated else "suggested",
                    confidence=0.9 if stated else 0.6,
                    why=str(item.get("quote") or "")[:300] or None)
            except Exception:
                log.exception("watson: fact %s", item)
                continue
            facts.append(fact)
        elif kind == "note":
            line = " ".join(str(item.get("line", "")).split())
            if not line:
                continue
            who = str(item.get("about", "")).strip().lower()
            if who == "module":
                if not module:
                    continue
                try:
                    name = world.modules.get(module)["name"]
                except Exception:
                    continue
                scope, title = f"module:{name}", name
            else:
                e = _entity_for(world, item.get("about"), str(item.get("about_kind") or ""),
                                named, source)
                if e is None:
                    continue
                scope, title = f"entity:{e['id']}", e["name"]
                entity_ids.add(e["id"])
            try:
                world.knowledge.append_to_page(scope, title, "Noticed", f"{day}: {line}",
                                              source=source)
            except Exception:
                log.exception("watson: page %s", item)
                continue
            pages.append(f"{title}: {line}")
        elif kind == "commitment":
            what = " ".join(str(item.get("what", "")).split())
            maker = _side(world, item.get("who", "person"), named, source, entity_ids)
            if not what or maker is None:
                continue
            owed = _side(world, item.get("to"), named, source, entity_ids)
            due = item.get("due")
            try:
                c = world.commitments.record(maker, what, to_whom=owed,
                                             due=str(due) if due else None, source=source)
            except Exception:
                log.exception("watson: commitment %s", item)
                continue
            commitments.append(c)
        elif kind == "decision":
            what = " ".join(str(item.get("what", "")).split())
            if not what or not person_may_state:
                continue
            why = " ".join(str(item.get("why") or "").split()) or None
            quote = " ".join(str(item.get("quote") or "").split())
            if any(d["what"].lower() == what.lower()
                   for d in world.decisions.about("module", module or "")) and module:
                continue
            try:
                d = world.decisions.record(
                    by="person", what=what, why=why or quote or None,
                    evidence={"source": source, "quote": quote[:300]},
                    about={**(about or {}), **({"module": module} if module else {}),
                           **({"conversation": thread} if thread else {})})
            except Exception:
                log.exception("watson: decision %s", item)
                continue
            decisions.append(d)
        # "other" and anything unknown: the journal keeps the exchange; nothing is filed
    kept = bool(facts or pages or commitments or decisions)
    if not kept:
        return {"kept": False, "facts": [], "pages": [], "commitments": [], "decisions": []}
    parts = []
    for f in facts:
        who = "you" if f["subject"] == "person" else next(
            (e["name"] for e in named if f["subject"] == f"entity:{e['id']}"), f["subject"])
        parts.append(f"{who}: {f['predicate']} = {f['value']}"
                     f" ({'kept' if f['state'] == 'accepted' else 'to confirm'})")
    parts.extend(f"on the page of {p}" for p in pages)
    parts.extend(f"commitment: {c['what']}" + (f" by {c['due']}" if c["due"] else "")
                 for c in commitments)
    parts.extend(f"decided: {d['what']}" for d in decisions)
    jid = world.journal.append(
        "noticed", "Noticed: " + "; ".join(parts)[:900] + ".", actor=actor,
        data={"turn": source.removeprefix("turn:") if source.startswith("turn:") else None,
              "source": source, "facts": [f["id"] for f in facts], "pages": pages,
              "commitments": [c["id"] for c in commitments],
              "decisions": [d["id"] for d in decisions]},
        module=module, thread=thread, entity_ids=sorted(entity_ids) or None)
    return {"kept": True, "facts": facts, "pages": pages, "commitments": commitments,
            "decisions": decisions, "entry": jid}


def notice(world: World, turn_id: str, *, runner: turn.Runner = route.run,
           model: str | None = None, actor: str = "alpha") -> dict[str, Any]:
    """The pass over one exchange: ask the small model, keep what it proposed by type, leave
    the trail."""
    if not worth_noticing(world, turn_id):
        return {"kept": False, "why": "nothing to notice in a turn like this"}
    said = world.journal.read(turn_id)
    reply = world.journal.reply_of(turn_id)
    assert reply is not None
    named = _named(world, said["text"], reply["text"])
    module = said.get("module")
    result = runner(TurnRequest(
        sentence=_state(world, said, reply, named, module), system=config.prompt("watson_exchange"),
        world_path=world.path, turn_id=turn_id, kind="judge", model=model_name(model)))
    if not result.ok:
        log.warning("watson: no answer for %s: %s", turn_id, result.error)
        return {"kept": False, "why": f"no answer: {result.error or 'nothing came back'}"}
    items = parse(result.reply)
    return apply(world, f"turn:{turn_id}", items, named=named, module=module,
                 thread=said.get("thread"), at=said["at"], actor=actor)


# ---- a conversation's checkpoint ----


def checkpoint(world: World, cid: str, *, runner: turn.Runner = route.run,
               model: str | None = None, actor: str = "alpha") -> dict[str, Any]:
    """A conversation ended: what it decided (decisions of the person's) and what is open
    (one line on the module's page, or the person's)."""
    thread = world.modules.thread(cid)
    turns = world.journal.recent(60, thread=cid, kinds=["said", "replied"])  # oldest first
    exchanges = [t for t in turns if t["actor"] == "person" or t["kind"] == "replied"]
    if len([t for t in exchanges if t["kind"] == "said"]) < 1:
        return {"kept": False, "why": "nothing was said"}
    lines = "\n".join(f"{'Person' if t['kind'] == 'said' else 'Alpha'}: {t['text'][:800]}"
                      for t in exchanges)[-12_000:]
    result = runner(TurnRequest(
        sentence=f"The conversation \"{thread['title']}\":\n\n{lines}",
        system=config.prompt("watson_checkpoint"),
        world_path=world.path, turn_id=cid, kind="judge", model=model_name(model)))
    if not result.ok:
        return {"kept": False, "why": f"no answer: {result.error or 'nothing came back'}"}
    data = _json(result.reply)
    if not isinstance(data, dict):
        return {"kept": False, "why": "no answer Alpha could read"}
    items = [{"kind": "decision", **d} for d in data.get("decisions") or [] if isinstance(d, dict)]
    module = thread.get("module")
    out = apply(world, f"conversation:{cid}", items, named=[], module=module, thread=cid,
                at=now_iso(), actor=actor)
    open_line = " ".join(str(data.get("open") or "").split())
    if open_line:
        day = datetime.now().astimezone().strftime("%-d %b %Y")
        if module:
            name = world.modules.get(module)["name"]
            world.knowledge.append_to_page(f"module:{name}", name, "Open",
                                          f"{day}: {open_line}", source=cid)
        else:
            world.knowledge.append_to_page("person", "Profile", "Open", f"{day}: {open_line}",
                                          source=cid)
        out["open"] = open_line
        out["kept"] = True
    return out


def now_iso() -> str:
    from alpha.world.store import now

    return now()


# ---- a document Alpha read ----


def read_document(world: World, did: str, *, runner: turn.Runner = route.run,
                  model: str | None = None, actor: str = "alpha") -> dict[str, Any]:
    """The pass over a document's text, for the people and companies in it."""
    try:
        doc = Files(world).read(did, 0, 12_000)
    except Exception as e:
        return {"kept": False, "why": str(e)}
    text = str(doc.get("text") or "")
    if len(text.split()) < 20:
        return {"kept": False, "why": "too little to read"}
    named = _named(world, text[:6000])
    known = _known(world, named, doc.get("module"))
    result = runner(TurnRequest(
        sentence=f"The document \"{doc.get('title') or did}\":\n\n{text}\n\nPeople and companies"
                 f" Alpha keeps that it names: {', '.join(e['name'] for e in named) or '(none)'}"
                 f"\n\nKNOWN (do not repeat):\n{known}",
        system=config.prompt("watson_document"), world_path=world.path, turn_id=did, kind="judge",
        model=model_name(model)))
    if not result.ok:
        return {"kept": False, "why": f"no answer: {result.error or 'nothing came back'}"}
    return apply(world, f"document:{did}", parse(result.reply), named=named,
                 module=doc.get("module"), thread=None, at=now_iso(), actor=actor,
                 person_may_state=False)


# ---- the refiling, once ----


def refiled(world: World, agent: dict[str, Any]) -> bool:
    return any(d["what"].startswith(REFILED) for d in world.decisions.about("agent", agent["id"]))


def refile(world: World, agent: dict[str, Any], *, runner: turn.Runner = route.run,
           model: str | None = None) -> dict[str, Any]:
    """The facts kept about the person before Watson, each judged by the model and moved by
    code: a setting, a request or a passing state is forgotten as a fact, with a journal line
    saying where it lives instead. Once; recorded as Watson's decision."""
    facts = world.knowledge.facts("person", states=("accepted", "suggested"))
    moved: list[str] = []
    if facts:
        listing = "\n".join(f"- {f['id']}: {f['predicate']} = {f['value']}" for f in facts)
        # Judged once, by the turn's own model rather than the small one (15 Oct: Haiku
        # called the person's weight and job search "passing state"); a wrong move loses a
        # fact, so the judgement is worth the stronger model.
        result = runner(TurnRequest(sentence=f"The facts:\n{listing}",
                                    system=config.prompt("watson_refile"),
                                    world_path=world.path, turn_id=agent["id"], kind="judge",
                                    model=model or config.model_for("refile")))
        data = _json(result.reply) if result.ok else None
        verdicts = data.get("facts") if isinstance(data, dict) else None
        if not isinstance(verdicts, dict):
            return {"kept": False, "why": "no answer Alpha could read", "moved": []}
        words = {"setting": "a setting of a workflow, which lives on its page, not a fact about"
                            " you", "request": "something you asked for, which the journal keeps,"
                            " not a fact about you", "state": "what you were doing at the time,"
                            " not a fact about you"}
        for f in facts:
            verdict = str(verdicts.get(f["id"]) or "keep").strip().lower()
            if verdict not in words:
                continue
            world.knowledge.forget_fact(f["id"])
            world.journal.append(
                "changed", f"Watson refiled {f['predicate']} = {f['value']}: {words[verdict]}.",
                actor=agent["id"], data={"agent": agent["id"], "fact": f["id"],
                                         "refiled": verdict})
            moved.append(f["id"])
    world.decisions.record(
        by=agent["id"], what=f"{REFILED}: {len(moved)} of {len(facts)} moved",
        why="they were settings, requests or passing states, not facts about the person",
        evidence={"facts": moved}, about={"agent": agent["id"]}, state="binding")
    return {"kept": True, "moved": moved, "facts": len(facts)}


# ---- the frame: look and run ----


def look(world: World, agent: dict[str, Any]) -> Work | None:
    """What happened since Watson last looked: exchanges with a reply, conversations that
    closed, documents read or added. The cursor stops short of a turn still waiting for its
    reply, so nothing is missed."""
    entries = since_cursor(world, agent, kinds=["said", "changed", "saw", "did"])
    upto = journal_rowid(world)
    exchanges: list[str] = []
    closed: list[str] = []
    documents: list[str] = []
    for e in entries:
        if e["kind"] == "said" and e["actor"] == "person":
            if world.journal.reply_of(e["id"]) is None:
                upto = world.journal.rowid(e["id"]) - 1
                break
            if worth_noticing(world, e["id"]):
                exchanges.append(e["id"])
        elif e["kind"] == "changed" and e["data"].get("conversation") and e["data"].get("why") \
                and e["text"].startswith("Closed the conversation"):
            closed.append(str(e["data"]["conversation"]))
        elif e["data"].get("document") and "removed" not in e["text"] \
                and ("words read" in e["text"] or e["text"].startswith("Read ")):
            documents.append(str(e["data"]["document"]))
    about: dict[str, Any] = {}
    if exchanges:
        about["exchanges"] = exchanges
    if closed:
        about["closed"] = list(dict.fromkeys(closed))
    if documents:
        about["documents"] = list(dict.fromkeys(documents))
    if not refiled(world, agent):
        about["refile"] = True
    return Work(upto, about)


def run(world: World, agent: dict[str, Any], work: Work | None, *,
        runner: turn.Runner = route.run) -> Outcome:
    """Watson's run over what `look` found (or, on Run now and @, over what is new now)."""
    if work is None:
        work = look(world, agent) or Work(journal_rowid(world))
    about = work.about
    counts = {"facts": 0, "pages": 0, "commitments": 0, "decisions": 0, "to_confirm": 0}
    failed: list[str] = []
    moved = 0
    if about.get("refile"):
        out = refile(world, agent, runner=runner)
        moved = len(out.get("moved") or [])
        if not out.get("kept"):
            failed.append("the refiling")
    for tid in about.get("exchanges") or []:
        out = notice(world, tid, runner=runner, actor=agent["id"])
        _count(counts, out)
        if "why" in out and out["why"].startswith("no answer"):
            failed.append(f"the exchange {tid}")
    for cid in about.get("closed") or []:
        out = checkpoint(world, cid, runner=runner, actor=agent["id"])
        _count(counts, out)
        if "why" in out and out["why"].startswith("no answer"):
            failed.append(f"the conversation {cid}")
    for did in about.get("documents") or []:
        out = read_document(world, did, runner=runner, actor=agent["id"])
        _count(counts, out)
        if "why" in out and out["why"].startswith("no answer"):
            failed.append(f"the document {did}")
    parts = [f"{n} {name}" for name, n in (
        ("facts", counts["facts"]), ("page lines", counts["pages"]),
        ("commitments", counts["commitments"]), ("decisions", counts["decisions"])) if n]
    line = ("Kept " + ", ".join(parts) if parts else "Nothing new to keep")
    if counts["to_confirm"]:
        line += f"; {counts['to_confirm']} to confirm"
    if moved:
        line += f"; refiled {moved} facts that were not about you"
    line += "."
    looked = sum(len(about.get(k) or []) for k in ("exchanges", "closed", "documents"))
    if failed and len(failed) >= max(1, looked):
        return Outcome("failed", f"no answer came back for {', '.join(failed)}", line)
    if failed:
        return Outcome("partial", f"no answer came back for {', '.join(failed)}", line)
    return Outcome("succeeded", None, line)


def _count(counts: dict[str, int], out: dict[str, Any]) -> None:
    counts["facts"] += len(out.get("facts") or [])
    counts["pages"] += len(out.get("pages") or [])
    counts["commitments"] += len(out.get("commitments") or [])
    counts["decisions"] += len(out.get("decisions") or [])
    counts["to_confirm"] += sum(1 for f in out.get("facts") or [] if f["state"] == "suggested")


register(KIND, look, run, words={
    "works": "after each turn of yours that has a reply, when a conversation closes or goes"
             " quiet, and when Alpha reads a document or you add one",
    "good_run": "every pass it made got an answer from the model, whatever it kept; partial"
                " when some did not; failed when none did"})
