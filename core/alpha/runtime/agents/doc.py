"""Doc, the healer (design Q49; built on Q50's substrate, 16 Oct 2026).

Doc keeps what Alpha has built for the person working. It is the one fixer of Alpha's own
know-how: readers and procedures. The agent whose run broke calls it and waits; the Mac's own
failures it finds in the journal. Whose fault comes first, by code where the failure's shape tells
and by the model
where it does not: a passing failure is retried by its caller, as before; a fault of the
person's (a sign-in, a key, a setting) stays with the mechanisms that already ask once; a
fault in Alpha's know-how is repaired, in the thing's own place, then rerun and judged by
code; a fault of Alpha itself or the Mac (a hand that would not start, a missing library, a
crash in the core) is never touched: Doc writes a plain report. One repair of a thing at a
time, by a lock per thing; a second caller waits, then takes the fix. Every save keeps the
version before (`skill_versions`), so a repair can be undone; a repair "held" when the thing's
next real run succeeded, which the caller marks. Doc's notes, written by code, say per thing
what broke, what fixed it, and whether it held.

Before 16 Oct the reader repair lived in `pipeline._repair` and the procedure repair in
`acting._repair`, with nothing around them and no memory across runs."""

from __future__ import annotations

import logging
import re
import threading
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from alpha import config
from alpha.config import settings
from alpha.runtime import route, turn
from alpha.runtime.agents import Outcome, Work, journal_rowid, register, since_cursor
from alpha.world.store import Problem
from alpha.world.world import World

log = logging.getLogger("alpha.agents.doc")

KIND = "doc"
NAME = "Doc"
DESCRIPTION = ("Doc keeps what Alpha has built for you working. When a step breaks (a site"
               " changed its page, a script hit an error, the check after a send failed), Doc"
               " works out why, fixes Alpha's own part, and runs it again. When the fix is yours"
               " (a sign-in, a key, a payment), it tells you exactly what, once. It never changes"
               " your data, never sends anything, and never builds something new.")
MAY = ["skills", "notes", "proposals"]
FAULTS = ("passing", "yours", "know_how", "alpha")
# The hand or the core itself did not run: nothing of Alpha's know-how to fix.
ALPHA_SIGNS = re.compile(r"The browser didn't answer|no such file|dyld\[|Library not loaded|"
                         r"image not found|Alpha hit an internal problem|Traceback \(most recent"
                         r" call last\).*alpha/(?!.*parts/)", re.I | re.S)
# The network or a site that did not answer this once (the pipeline's own regex, kept in step).
PASSING_SIGNS = re.compile(r"net::ERR_|Timeout \d+ms exceeded|ERR_NETWORK|ERR_INTERNET"
                           r"|ERR_NAME_NOT_RESOLVED|ERR_CONNECTION|ERR_TIMED_OUT|couldn't be"
                           r" reached", re.I)
# Only the person can give these.
YOURS_SIGNS = re.compile(r"sign-in|sign in|signed out|bot check|stops automated reading|"
                         r"needs your", re.I)

_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _lock(thing: str) -> threading.Lock:
    with _locks_guard:
        return _locks.setdefault(thing, threading.Lock())


def doc_agent(world: World) -> dict[str, Any] | None:
    """Doc's row in this world, or None in a world that has none yet (then a repair runs as
    Alpha's own, as it did before Doc)."""
    return next((a for a in world.agents.all() if a["kind"] == KIND), None)


@dataclass
class Repair:
    """One repair Doc made or was asked for: the thing, its version before and after, Doc's
    run row (None when Doc isn't in this world), the model's time, whether the turn finished,
    and its one line."""
    kind: str
    thing: str
    before: int
    after: int
    run_id: str | None
    model_ms: int = 0
    ok: bool = False
    words: str = ""
    waited: bool = False  # another repair of the same thing finished while this one waited


# ---- whose fault ----


def diagnose(text: str) -> tuple[str, str]:
    """Whose fault a failure is, from its shape alone: alpha (the hand or the core did not
    run), passing (the network), yours (a sign-in, a bot check), else Alpha's know-how."""
    if ALPHA_SIGNS.search(text):
        return "alpha", "the program Alpha runs did not start or crashed; nothing in what Alpha" \
                        " wrote for you is wrong"
    if PASSING_SIGNS.search(text):
        return "passing", "the network or the site did not answer this once"
    if YOURS_SIGNS.search(text):
        return "yours", "it needs something only you can give"
    return "know_how", "a mistake in what Alpha wrote"


# ---- readers ----


def _notes_for(world: World, agent: dict[str, Any] | None, thing: str) -> str:
    if agent is None:
        return ""
    page = world.knowledge.find_note(f"agent:{agent['id']}", "Notes")
    if not page:
        return ""
    lines = [ln for ln in page["body"].splitlines() if thing in ln]
    return ("\n\nWhat Doc learned about this before:\n" + "\n".join(lines[-6:])) if lines else ""


def _note(world: World, agent: dict[str, Any] | None, thing: str, line: str) -> None:
    """Doc's notes, written by code: one dated line per event, under the thing's heading."""
    if agent is None:
        return
    day = datetime.now().astimezone().strftime("%-d %b %Y")
    try:
        world.knowledge.append_to_page(f"agent:{agent['id']}", "Notes", thing, f"{day}: {line}")
    except Exception:
        log.exception("doc: note for %s", thing)


def repair_reader(world: World, caller: dict[str, Any], reader: str, problem: str,
                  runner: turn.Runner = route.run, *, run_id: str | None = None,
                  attempt: int = 1) -> Repair:
    """Repair a reader for the agent whose run met it broken: one repair of a reader at a time
    (a second caller waits, then takes the fix), the turn in the caller's thread under Doc's
    name, with Doc's notes about the site in front of it. The caller reruns the step and
    `settle`s the outcome."""
    doc = doc_agent(world)
    before = int(world.skills.get(reader)["version"])
    lock = _lock(f"skill:{reader}")
    got = lock.acquire(timeout=settings.doc.wait_s)
    try:
        now_version = int(world.skills.get(reader)["version"])
        if now_version != before:
            return Repair("reader", reader, before, now_version, None, waited=True, ok=True,
                          words="another run had Doc fix it meanwhile")
        rid = world.runs.start(doc["id"], trigger="called", called_by=run_id) if doc else None
        page = world.knowledge.find_note(f"agent:{caller['id']}", "Brief")
        guidance = (f"\n\nThe agent's brief (what it is for, what to do when a source changes):"
                    f"\n{page['body'][:2000]}") if page and page["body"].strip() else ""
        tried = (f"\n\nThis is try {attempt} in this run: the fix before did not make the"
                 " reader return good rows, so do something different." if attempt > 1 else "")
        prompt = (f"The reader {reader} of the agent {caller['name']} is broken: {problem}."
                  f" Repair it and save it under the same name ({reader}).{guidance}{tried}"
                  f"{_notes_for(world, doc, reader)}")
        outcome = turn.ask(world, prompt, thread=caller["thread"], runner=runner,
                           rules=config.prompt("repair_reader"),
                           actor=doc["id"] if doc else "alpha", agent=doc["id"] if doc else None,
                           journal_as=f"Doc looks at the reader {reader}: {problem}")
        after = int(world.skills.get(reader)["version"])
        return Repair("reader", reader, before, after, rid,
                      model_ms=int(outcome.result.duration_ms or 0), ok=outcome.ok,
                      words=" ".join(outcome.reply.split())[:300])
    finally:
        if got:
            lock.release()


def settle(world: World, repair: Repair, *, ok: bool, why: str | None = None,
           caller: dict[str, Any] | None = None) -> None:
    """The caller reran the thing: how the repair went, judged by code. A repair that worked
    is one line in the run under Doc's name, with what it changed (so it can be undone);
    one that did not says so. Doc's run row and notes follow."""
    doc = doc_agent(world)
    if repair.waited:
        return
    thing_words = {"reader": "the reader", "procedure": "the procedure", "part": "the part"}
    what = f"{thing_words.get(repair.kind, repair.kind)} {repair.thing}"
    changed = repair.after != repair.before
    if ok and changed:
        line = f"Doc fixed {what}: {repair.words or 'repaired'}"
        world.journal.append(
            "changed", line, actor=doc["id"] if doc else "alpha",
            data={"agent": doc["id"] if doc else None, "repair": repair.run_id,
                  "skill" if repair.kind != "part" else "part": repair.thing,
                  "from": repair.before, "to": repair.after},
            module=caller.get("module") if caller else None,
            thread=caller.get("thread") if caller else None)
        _note(world, doc, repair.thing, f"broke; fixed ({repair.words[:140] or 'repaired'});"
                                        " held on the rerun, not yet confirmed by a later run")
        verdict, words = "succeeded", line
    elif ok:
        verdict, words = "succeeded", f"{what} came right again without a change"
    else:
        words = (f"Doc couldn't fix {what}: {why or repair.words or 'the rerun still failed'}")
        world.journal.append("did", words, actor=doc["id"] if doc else "alpha",
                             data={"agent": doc["id"] if doc else None, "repair": repair.run_id,
                                   "thing": repair.thing},
                             module=caller.get("module") if caller else None,
                             thread=caller.get("thread") if caller else None)
        _note(world, doc, repair.thing, f"broke; a fix did not take ({why or 'the rerun failed'})")
        verdict = "failed"
    if repair.run_id:
        world.runs.finish(repair.run_id, verdict=verdict, why=None if ok else (why or words),
                          line=words[:2000], model_ms=repair.model_ms, repairs=1)


def mark_held(world: World, skill: str) -> str | None:
    """The thing Doc repaired worked on a later real run: the repair held. Marked once per
    repair, as a `did` under Doc's name; Doc's page counts them."""
    doc = doc_agent(world)
    if doc is None:
        return None
    fixes = [e for e in world.journal.recent(50, kinds=["changed"])
             if e["actor"] == doc["id"] and e["data"].get("skill") == skill]
    if not fixes:
        return None
    last = fixes[-1]
    if any(e["data"].get("held") == last["id"]
           for e in world.journal.recent(50, kinds=["did"]) if e["actor"] == doc["id"]):
        return None
    jid = world.journal.append("did", f"Doc's repair of {skill} held on the next run.",
                               actor=doc["id"], data={"agent": doc["id"], "held": last["id"],
                                                      "skill": skill})
    _note(world, doc, skill, "the fix held on the next run")
    return jid


# ---- procedures ----


def repair_procedure(world: World, action: dict[str, Any], why: str,
                     runner: turn.Runner = route.run, *, redo: bool = True) -> Repair | None:
    """Repair a procedure after an approved action failed, under Doc's name: the steps, and the
    action proposed again for the person's yes; or only the check, when the action went
    through. One repair of a procedure at a time."""
    doc = doc_agent(world)
    name = str(action["procedure"])
    try:
        before = int(world.procedures.get(name)["version"])
    except Problem:
        return None
    lock = _lock(f"skill:{name}")
    got = lock.acquire(timeout=settings.doc.wait_s)
    try:
        if int(world.procedures.get(name)["version"]) != before:
            return Repair("procedure", name, before, before, None, waited=True, ok=True)
        if redo:
            prompt = (f"The action \"{action['title']}\" (procedure {name}, payload"
                      f" {action['payload']}) failed: {why}. Repair the procedure and propose the"
                      " action again.")
        else:
            prompt = (f"The action \"{action['title']}\" (procedure {name}) ran to its end, so it"
                      f" happened, but {why}. Repair only the procedure's verify steps (look at"
                      " the page as it is after the commit) and save it with skill_keep (kind act)."
                      " Do NOT propose the action again: it has been done once and must not be"
                      " repeated. Tell the person in one line that it went out and that the"
                      " check is fixed for next time.")
        rid = world.runs.start(doc["id"], trigger="called") if doc else None
        try:
            outcome = turn.ask(world, prompt + _notes_for(world, doc, name),
                               module=action["module"], thread=action["thread"], runner=runner,
                               rules=config.prompt("repair_procedure"),
                               actor=doc["id"] if doc else "alpha",
                               agent=doc["id"] if doc else None,
                               journal_as=f"Doc looks again at how to do \"{action['title']}\""
                                          f" on {action['site']}.")
        except Exception as e:
            log.exception("repair of %s failed", action["id"])
            if rid:
                world.runs.finish(rid, verdict="failed", why=str(e))
            return None
        after = int(world.procedures.get(name)["version"])
        repair = Repair("procedure", name, before, after, rid,
                        model_ms=int(outcome.result.duration_ms or 0), ok=outcome.ok,
                        words=" ".join(outcome.reply.split())[:300])
        # A procedure is judged when the action next performs (acting marks it held); here
        # the repair's own outcome: did Doc save a new version?
        settle(world, repair, ok=outcome.ok and after != before,
               why=None if after != before else "no new version was saved", caller=action)
        return repair
    finally:
        if got:
            lock.release()


# ---- causes ----


def _cause(text: str) -> str:
    """What a part's failure comes down to: the last line it printed."""
    tail = text.split("(exit", 1)[-1] if "(exit" in text else text
    lines = [ln.strip() for ln in tail.replace("): ", "):\n", 1).splitlines() if ln.strip()]
    return (lines[-1] if lines else text.strip())[:200]


# ---- reports ----


def report(world: World, doc: dict[str, Any], fault: str, why: str, about: str,
           entries: list[str]) -> str:
    """A failure that is not Alpha's know-how, said plainly once: whose it is and what, if
    anything, the person can do. Nothing is touched."""
    if fault == "alpha":
        words = (f"Doc: {about} failed because of Alpha itself or your Mac, not anything Alpha"
                 f" wrote for you: {why}. Nothing of yours needs changing; if it keeps failing,"
                 " the log says where.")
    elif fault == "yours":
        words = f"Doc: {about} needs something only you can give: {why}."
    else:
        words = f"Doc: {about} failed and should pass on its own: {why}."
    return world.journal.append("did", words, actor=doc["id"],
                                data={"agent": doc["id"], "fault": fault, "about": entries})


# ---- the frame: look and run ----


def look(world: World, agent: dict[str, Any]) -> Work | None:
    """Failures since Doc last looked that nobody called it for: an agent's run that failed
    because the hand or the Mac did not run."""
    entries = since_cursor(world, agent, kinds=["failed"])
    upto = journal_rowid(world)
    alpha: list[dict[str, Any]] = []
    for e in entries:
        d = e["data"]
        if d.get("run") and diagnose(e["text"])[0] == "alpha":
            alpha.append({"entry": e["id"], "agent": d.get("agent"), "text": e["text"]})
    about: dict[str, Any] = {}
    if alpha:
        about["alpha"] = alpha
    return Work(upto, about)


def run(world: World, agent: dict[str, Any], work: Work | None, *,
        runner: turn.Runner = route.run) -> Outcome:
    """Doc's own run over what `look` found: the Mac's failures reported, each once."""
    if work is None:
        work = look(world, agent) or Work(journal_rowid(world))
    about = work.about
    fixed: list[str] = []
    failed: list[str] = []
    reported = 0
    model_ms = 0
    if about.get("alpha"):
        by_cause: dict[str, list[dict[str, Any]]] = {}
        for item in about["alpha"]:
            by_cause.setdefault(_cause(item["text"]), []).append(item)
        for cause, items in by_cause.items():
            names = sorted({str(world.agents.get(i["agent"])["name"]) for i in items
                            if i.get("agent")} - {""}) or ["a run"]
            report(world, agent, "alpha", cause, " and ".join(names), [i["entry"] for i in items])
            reported += 1
    parts_words = []
    if fixed:
        parts_words.append(f"fixed {', '.join(fixed)}")
    if failed:
        parts_words.append(f"couldn't fix {', '.join(failed)}")
    if reported:
        parts_words.append(f"reported {reported} failure{'s' if reported != 1 else ''} that"
                           f" {'are' if reported != 1 else 'is'} not Alpha's know-how")
    line = "; ".join(parts_words) or "nothing to fix"
    line = line[0].upper() + line[1:] + "."
    if failed and not fixed:
        return Outcome("failed", f"the fix did not take for {', '.join(failed)}", line, model_ms,
                       upto=work.upto)
    if failed:
        return Outcome("partial", f"the fix did not take for {', '.join(failed)}", line,
                       model_ms, upto=work.upto)
    return Outcome("succeeded", None, line, model_ms, upto=work.upto)


register(KIND, look, run, words={
    "works": "when a run of another agent meets a broken reader or procedure (it is called"
             " and the run waits), and after a run fails the way the Mac fails",
    "good_run": "what it repaired worked on the rerun, or what it could not touch was"
                " reported; partial when a fix did not take beside one that did; failed when"
                " no fix took"})
