"""Sherlock, the researcher (design Q45; built on Q50's substrate, 16 Oct 2026).

Sherlock looks into how others do something before Alpha builds it for the person: their own
world first, tools that do the job, open source, common practice with its pitfalls, public
data. It brings back a few suggestions, each with a source and a reason naming the person's
situation, and the questions worth asking; it only reads, and writes only its findings page,
the suggestions on the workflow page (marked as its own), its questions and proposals.

A fixed frame, a free method. Fixed, by code: when it is warranted (never for a plain action, a
question or a small change, which never draft a page; for a drafted workflow page, or for an
interview that has begun in a conversation with no page yet, one small judgement says none, a
quick look at the open parts or a full look, recorded as Sherlock's decision; the person's
words win, "no research" or Skip is a decision of theirs that holds); what comes back (each
suggestion needs a source that resolves and a reason naming the page, else it is dropped and
logged; at most a few; never one the person skipped before on this workflow); its walls (reads
only; writes through its list); where things land (the page as a new version marked Sherlock's,
or a proposal when the person already said yes; questions as cards with its pick first; a
findings page per look). Free: which searches and pages, how deep per lens, when it has enough.
No time promises: the run shows what it is reading, with Stop.

Before 16 Oct the interview did a few lookups inside the person's turn (turn rule 6b, which
stays), and the research pass of 9 Oct (Q37) was removed for its menu and its "a few minutes".
"""

from __future__ import annotations

import json
import logging
import re
import urllib.error
import urllib.request
from datetime import datetime
from typing import Any

from alpha import config
from alpha.config import settings
from alpha.runtime import route, turn
from alpha.runtime.agents import Outcome, Work, journal_rowid, register, since_cursor, starting
from alpha.runtime.claude_cli import RunResult, TurnRequest
from alpha.world.store import Problem
from alpha.world.world import World

log = logging.getLogger("alpha.agents.sherlock")

KIND = "sherlock"
NAME = "Sherlock"
DESCRIPTION = ("Sherlock looks into how others do something before Alpha builds it for you:"
               " tools, open-source projects, common practice and public data. It brings back"
               " what's worth having, with where it found it. It only reads; it never builds"
               " or changes anything.")
MAY = ["notes", "workflows", "asks", "proposals"]
LENSES = {"world": "your own world", "tools": "tools that do the job",
          "open_source": "open source", "practice": "common practice and its pitfalls",
          "public_data": "public data"}
LOOKS = ("none", "quick", "full")
NO_RESEARCH = re.compile(r"\b(no research|don'?t research|just build it|skip the research"
                         r"|no need to look into it)\b", re.I)
SMALL_WORDS = {"the", "and", "for", "with", "from", "that", "this", "into", "each", "what",
               "when", "your", "their", "them", "they", "will", "then", "than", "have", "has",
               "are", "was", "were", "its", "one", "two", "all", "any", "per", "via", "also"}


def sherlock_agent(world: World) -> dict[str, Any] | None:
    return next((a for a in world.agents.all() if a["kind"] == KIND), None)


def _json(text: str) -> Any:
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group(0))
    except json.JSONDecodeError:
        return None


def _slug(text: str) -> str:
    out = "".join(c if c.isalnum() else "_" for c in text.lower()).strip("_")
    while "__" in out:
        out = out.replace("__", "_")
    return out[:60].rstrip("_") or "research"


def url_alive(url: str) -> bool:
    """Whether a source resolves, by code (deep-research agents dead-link about one in ten).
    A page that answers at all counts; a site that refuses a plain request still exists."""
    if not re.match(r"^https?://", url or "", re.I):
        return False
    req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "Alpha/Sherlock"})
    try:
        with urllib.request.urlopen(req, timeout=10):  # noqa: S310  (an http(s) URL, checked)
            return True
    except urllib.error.HTTPError as e:
        return e.code < 500 and e.code != 404
    except (urllib.error.URLError, ValueError, OSError, TimeoutError):
        return False


# ---- what a look is about ----


def subject_of_workflow(world: World, wf: dict[str, Any]) -> dict[str, Any]:
    body = wf["body"]
    reaches = sorted({r for st in body.get("steps") or [] for r in st.get("reaches") or []})
    return {"title": wf["title"], "workflow": wf["id"], "conversation": wf.get("conversation"),
            "words": wf.get("words") or body.get("purpose") or wf["title"],
            "steps": [st["title"] for st in body.get("steps") or []],
            "keeps": [k["thing"] for k in body.get("keeps") or []],
            "settings": [st["label"] for st in body.get("settings") or []],
            "reaches": reaches, "purpose": body.get("purpose") or "",
            "skipped": [s["title"] for s in body.get("suggestions") or []
                        if s.get("decision") == "skip"]}


def subject_of_conversation(world: World, cid: str) -> dict[str, Any]:
    """An interview under way: the person's own sentences so far (theirs, not Alpha's)."""
    thread = world.modules.thread(cid)
    saids = [e["text"] for e in world.journal.recent(20, thread=cid, kinds=["said"])
             if e["actor"] == "person"]
    return {"title": thread["title"], "conversation": cid, "workflow": None,
            "words": "\n".join(f"- {t[:400]}" for t in saids), "steps": [], "keeps": [],
            "settings": [], "reaches": [], "purpose": saids[0] if saids else "", "skipped": []}


def persons_words(world: World, cid: str | None) -> str:
    if not cid:
        return ""
    return " ".join(e["text"] for e in world.journal.recent(20, thread=cid, kinds=["said"])
                    if e["actor"] == "person")


def no_research_said(world: World, subject: dict[str, Any]) -> bool:
    """The person's words win: "no research", "just build it", or Skip earlier (a binding
    decision of theirs about this workflow or conversation)."""
    if NO_RESEARCH.search(persons_words(world, subject.get("conversation"))):
        return True
    for key in ("workflow", "conversation"):
        if subject.get(key) and any(
                d["about"].get("no_research") for d in world.decisions.about(key, subject[key])
                if d["by"] == "person" and d["state"] == "binding"):
            return True
    return False


def judged_before(world: World, agent: dict[str, Any], subject: dict[str, Any]) -> bool:
    for key in ("workflow", "conversation"):
        if subject.get(key) and any(d["by"] == agent["id"] and d["about"].get("look")
                                    for d in world.decisions.about(key, subject[key])):
            return True
    return False


# ---- the judgement: is a look warranted, and how deep ----


def _knows(world: World, agent: dict[str, Any]) -> str:
    page = world.knowledge.find_note(f"agent:{agent['id']}", "Notes")
    notes = (page["body"][:1500] if page else "") or "(nothing yet)"
    modules = ", ".join(m["name"] for m in world.modules.all()[:20]) or "(none)"
    return f"Sherlock's notes (what it learned per kind of work):\n{notes}\n\nModules Alpha" \
           f" already has for this person: {modules}"


def judge_look(world: World, agent: dict[str, Any], subject: dict[str, Any], *,
               runner: turn.Runner = route.run, model: str | None = None) -> dict[str, Any]:
    """One small run: none, a quick look at the open parts, or a full look; the kind of work
    named. {"look", "kind", "open": [...], "why", "answered"}."""
    if no_research_said(world, subject):
        return {"look": "none", "kind": "", "open": [], "why": "you said no research",
                "answered": True}
    state = (f"The task: {subject['title']}\n\nWhat is known of it:\n{subject['words'][:3000]}\n\n"
             f"Steps: {', '.join(subject['steps']) or '(none yet)'}\nIt reaches:"
             f" {', '.join(subject['reaches']) or '(nothing named yet)'}\nIt keeps:"
             f" {', '.join(subject['keeps']) or '(nothing yet)'}\n\n{_knows(world, agent)}\n\n"
             f"The person's words in the conversation: "
             f"{persons_words(world, subject.get('conversation'))[:1500] or '(none)'}")
    result = runner(TurnRequest(sentence=state, system=config.prompt("sherlock_look"),
                                world_path=world.path, turn_id=f"sherlock:{agent['id']}",
                                kind="judge", model=model or config.model_for("judge")))
    if not result.ok:
        return {"look": "none", "kind": "", "open": [], "answered": False,
                "why": f"no judgement came back: {result.error or 'nothing'}"}
    data = _json(result.reply)
    if not isinstance(data, dict):
        return {"look": "none", "kind": "", "open": [], "answered": False,
                "why": "the judgement wasn't readable"}
    look = str(data.get("look") or "").strip().lower()
    if look not in LOOKS:
        look = "none"
    return {"look": look, "kind": " ".join(str(data.get("kind_of_work") or "").split())[:80],
            "open": [str(o)[:120] for o in (data.get("open") or []) if str(o).strip()][:6],
            "why": " ".join(str(data.get("why") or "").split())[:200], "answered": True}


# ---- the look, and the checks on what comes back ----


def _names_the_page(why: str, subject: dict[str, Any]) -> bool:
    """A reason names the person's situation when it shares a real word with the page: a
    step, a thing kept, a setting, the purpose, the title."""
    text = " ".join([subject["title"], subject.get("purpose") or "", *subject["steps"],
                     *subject["keeps"], *subject["settings"], *subject["reaches"]])
    page_words = {w for w in re.findall(r"[a-z][a-z0-9'-]{3,}", text.lower())
                  if w not in SMALL_WORDS}
    why_words = {w for w in re.findall(r"[a-z][a-z0-9'-]{3,}", (why or "").lower())
                 if w not in SMALL_WORDS}
    return bool(page_words & why_words)


def check_findings(data: Any, subject: dict[str, Any], *,
                   alive: Any = None) -> dict[str, Any]:
    """What code keeps of a look: suggestions with a live source and a reason naming the page
    (else dropped, with why), at most a few, never one skipped before; questions with 2 to 4
    options and Sherlock's pick first; the lenses as covered or skipped; what does not apply."""
    alive = alive or url_alive
    data = data if isinstance(data, dict) else {}
    kept: list[dict[str, Any]] = []
    dropped: list[str] = []
    skipped_before = {t.lower() for t in subject.get("skipped") or []}
    for sg in data.get("suggestions") or []:
        if not isinstance(sg, dict):
            continue
        title = " ".join(str(sg.get("title") or "").split())[:120]
        why = " ".join(str(sg.get("why") or "").split())[:300]
        what = " ".join(str(sg.get("what") or "").split())[:300]
        sources = [str(u).strip() for u in (sg.get("sources") or []) if str(u).strip()]
        if not title or not what:
            continue
        if title.lower() in skipped_before:
            dropped.append(f"{title}: you skipped it before")
            continue
        live = [u for u in sources[:4] if alive(u)]
        if not live:
            dropped.append(f"{title}: no source that resolves")
            continue
        if not _names_the_page(why, subject):
            dropped.append(f"{title}: its reason names nothing of yours")
            continue
        kept.append({"title": title, "what": what, "why": why, "sources": live,
                     "lens": str(sg.get("lens") or "")[:20]})
        if len(kept) >= settings.sherlock.most_suggestions:
            break
    questions: list[dict[str, Any]] = []
    for q in (data.get("questions") or [])[:3]:
        if not isinstance(q, dict):
            continue
        text = " ".join(str(q.get("text") or "").split())[:300]
        options = [str(o).strip()[:90] for o in (q.get("options") or []) if str(o).strip()][:4]
        pick = " ".join(str(q.get("pick") or "").split())[:90]
        if not text or len(options) < 2:
            continue
        if pick and pick in options:
            options = [pick] + [o for o in options if o != pick]
        questions.append({"text": text, "options": options, "pick": pick or options[0]})
    lenses: dict[str, str] = {}
    raw_lenses = data.get("lenses") if isinstance(data.get("lenses"), dict) else {}
    for key in LENSES:
        value = raw_lenses.get(key) if isinstance(raw_lenses, dict) else None
        lenses[key] = " ".join(str(value or "skipped: not covered").split())[:600]
    not_applicable = [" ".join(str(n).split())[:200] for n in (data.get("not_applicable") or [])
                      if str(n).strip()][:6]
    return {"suggestions": kept, "dropped": dropped, "questions": questions, "lenses": lenses,
            "not_applicable": not_applicable}


def look_into(world: World, agent: dict[str, Any], subject: dict[str, Any], *,
              depth: str, open_parts: list[str], runner: turn.Runner = route.run,
              alive: Any = None, thread: str | None = None) -> dict[str, Any]:
    """The look itself: one turn under Sherlock's name in its own thread, with web search,
    Alpha's read tools and pages through existing connections; the method is the model's,
    what comes back is checked by code. {"ok", "stopped", "findings", "words", "model_ms"}."""
    lenses = ("Lenses to cover, each with findings or a skip with its reason: "
              + "; ".join(f"{k} ({v})" for k, v in LENSES.items()))
    if depth == "quick":
        lenses = ("A quick look only, at what the page leaves open: "
                  + "; ".join(open_parts or ["the sources it reaches"]) + ". Skip the rest.")
    prompt = (f"Look into how others do this before Alpha builds it: {subject['title']}.\n\n"
              f"What is known of it:\n{subject['words'][:4000]}\n\n"
              f"Steps so far: {', '.join(subject['steps']) or '(none yet)'}\n"
              f"It reaches: {', '.join(subject['reaches']) or '(nothing named yet)'}\n"
              f"It keeps: {', '.join(subject['keeps']) or '(nothing yet)'}\n\n{lenses}\n\n"
              + (f"Suggestions the person skipped before (never again): "
                 f"{', '.join(subject['skipped'])}\n\n" if subject.get("skipped") else "")
              + _knows(world, agent))
    outcome = turn.ask(world, prompt, thread=thread or agent["thread"], runner=runner,
                       rules=config.prompt("sherlock_research", name=agent["name"]),
                       actor=agent["id"], agent=agent["id"],
                       journal_as=f"Sherlock looks into how others do {subject['title']}.")
    model_ms = int(outcome.result.duration_ms or 0)
    if not outcome.ok:
        return {"ok": False, "stopped": bool(outcome.result.stopped),
                "why": outcome.result.error or outcome.reply, "model_ms": model_ms}
    findings = check_findings(_json(outcome.reply), subject, alive=alive)
    return {"ok": True, "stopped": False, "findings": findings,
            "words": " ".join(outcome.reply.split())[:600], "model_ms": model_ms}


# ---- where it lands ----


def _findings_page(world: World, agent: dict[str, Any], subject: dict[str, Any],
                   findings: dict[str, Any]) -> dict[str, Any]:
    """The findings page, written by code from what came back: per lens, the suggestions
    with their sources, the questions, what does not apply."""
    day = datetime.now().astimezone().strftime("%-d %b %Y")
    lines = [f"# Research: {subject['title']}", "",
             f"Sherlock looked into how others do this on {day}.", ""]
    for key, name in LENSES.items():
        lines += [f"## {name[:1].upper()}{name[1:]}", findings["lenses"].get(key, ""), ""]
    if findings["suggestions"]:
        lines.append("## Worth having")
        for sg in findings["suggestions"]:
            lines.append(f"- **{sg['title']}** — {sg['what']} {sg['why']} Sources: "
                         + ", ".join(sg["sources"]))
        lines.append("")
    if findings["questions"]:
        lines.append("## Worth asking")
        lines += [f"- {q['text']} (Sherlock's pick: {q['pick']})" for q in findings["questions"]]
        lines.append("")
    if findings["not_applicable"]:
        lines.append("## Does not apply here")
        lines += [f"- {n}" for n in findings["not_applicable"]]
        lines.append("")
    if findings["dropped"]:
        lines.append("## Left out (checked by code)")
        lines += [f"- {d}" for d in findings["dropped"]]
    scope = f"topic:{_slug(subject['title'])}"
    return world.knowledge.write_note(scope, f"Research: {subject['title']}", "\n".join(lines),
                                      source=f"agent:{agent['id']}")


def land(world: World, agent: dict[str, Any], subject: dict[str, Any],
         findings: dict[str, Any]) -> dict[str, Any]:
    """Where a look's findings go: the findings page always; the suggestions onto the
    workflow page as a new version marked Sherlock's while it is a draft, and nowhere else
    (nothing lands after the person's yes, harness 2a); the questions as cards in the
    conversation, Sherlock's pick first."""
    page = _findings_page(world, agent, subject, findings)
    out: dict[str, Any] = {"page": page["id"], "landed": "page", "suggestions": 0,
                           "questions": 0}
    wf = world.workflows.get(subject["workflow"]) if subject.get("workflow") else None
    cid = subject.get("conversation") or (wf.get("conversation") if wf else None)
    for q in findings["questions"]:
        world.journal.append("asked", q["text"], actor=agent["id"],
                             data={"options": q["options"], "pick": q["pick"],
                                   "agent": agent["id"], "workflow": subject.get("workflow")},
                             thread=cid)
        out["questions"] += 1
    if not findings["suggestions"]:
        return out
    if wf is not None and wf["state"] == "drafted":
        world.workflows.add_suggestions(wf["id"], findings["suggestions"], by=agent["id"],
                                        by_name=agent["name"])
        world.journal.append("changed", f"Sherlock added {len(findings['suggestions'])}"
                             f" suggestions to your workflow {wf['title']}.", actor=agent["id"],
                             thread=cid, data={"agent": agent["id"], "workflow": wf["id"]})
        out["landed"] = "page"
    else:
        # No page to land on, or the person already said yes (harness 2a: nothing lands after
        # a yes): the findings stay on their page, a line in Activity, nothing in the
        # conversation.
        world.journal.append("did", f"Sherlock kept {len(findings['suggestions'])} suggestions"
                             f" for \"{subject['title']}\" on its findings page.",
                             actor=agent["id"], thread=agent.get("thread"),
                             data={"agent": agent["id"], "conversation": cid, "page": page["id"],
                                   "sherlock_findings": findings})
        out["landed"] = "findings"
    out["suggestions"] = len(findings["suggestions"])
    return out


# ---- the frame: look, run, mention ----


def look(world: World, agent: dict[str, Any]) -> Work | None:
    """Since Sherlock's cursor: a workflow page drafted (a look, or findings kept for it
    landing now), and an interview begun in a conversation with no page yet (Alpha asked
    cards there)."""
    entries = since_cursor(world, agent, kinds=["proposed", "asked"])
    upto = journal_rowid(world)
    workflows: list[str] = []
    conversations: list[str] = []
    for e in entries:
        d = e["data"]
        # Since the harness (17 Oct, 2a) a drafted page no longer starts a look of its own:
        # nothing lands after the person's yes. Sherlock looks when asked (@Sherlock), and at
        # an interview begun in a conversation with no page yet.
        if e["kind"] == "asked" and e["thread"] and e["actor"] != agent["id"] \
                and not d.get("columbo") and not d.get("routing"):
            cid = str(e["thread"])
            if cid in conversations:
                continue
            try:
                if world.modules.thread(cid)["kind"] != "chat":
                    continue
            except Problem:
                continue
            conversations.append(cid)
    about: dict[str, Any] = {}
    if workflows:
        about["workflows"] = workflows
    if conversations:
        about["conversations"] = conversations
    return Work(upto, about)


def run(world: World, agent: dict[str, Any], work: Work | None, *,
        runner: turn.Runner = route.run) -> Outcome:
    """Sherlock's run: for each page or interview, the judgement (none, quick, full), the look
    when one is warranted, the checks, the landing; the verdict by what came back (stopped
    when the person stopped it)."""
    if work is None:
        work = look(world, agent) or Work(journal_rowid(world))
    about = work.about
    looked = 0
    brought = {"suggestions": 0, "questions": 0}
    none: list[str] = []
    failed: list[str] = []
    unjudged: list[str] = []
    stopped = False
    model_ms = 0
    subjects: list[dict[str, Any]] = []
    for cid in about.get("conversations") or []:
        try:
            subjects.append(subject_of_conversation(world, cid))
        except Problem:
            continue
    for subject in subjects:
        if judged_before(world, agent, subject):
            continue
        verdict = judge_look(world, agent, subject, runner=runner)
        about_key = "workflow" if subject.get("workflow") else "conversation"
        if not verdict["answered"]:
            unjudged.append(subject["title"])
            continue
        world.decisions.record(
            by=agent["id"], what=f"{verdict['look'].capitalize()} look at how others do"
                                 f" {subject['title']}" if verdict["look"] != "none" else
            f"No look at how others do {subject['title']}",
            why=verdict["why"] or None,
            about={"agent": agent["id"], about_key: subject[about_key],
                   "look": verdict["look"], "kind": verdict["kind"]}, state="open")
        if verdict["look"] == "none":
            none.append(subject["title"])
            continue
        looked += 1
        starting(world, agent, f"Looking into how others do {subject['title']} ({verdict['look']}"
                               f" look; a deeper look takes longer).",
                 **{about_key: subject[about_key]})
        out = look_into(world, agent, subject, depth=verdict["look"], open_parts=verdict["open"],
                        runner=runner)
        model_ms += int(out.get("model_ms") or 0)
        if not out["ok"]:
            if out.get("stopped"):
                stopped = True
                break
            failed.append(f"{subject['title']} ({out.get('why')})")
            continue
        landed = land(world, agent, subject, out["findings"])
        brought["suggestions"] += landed["suggestions"]
        brought["questions"] += landed["questions"]
        _note(world, agent, verdict["kind"] or subject["title"],
              f"looked ({verdict['look']}): {len(out['findings']['suggestions'])} suggestions"
              f" kept, {len(out['findings']['dropped'])} dropped by the checks"
              + _sources_words(out["findings"]["suggestions"]))
    parts = []
    if brought["suggestions"] or brought["questions"]:
        parts.append("brought back " + " and ".join(
            f"{n} {w}{'s' if n != 1 else ''}" for w, n in
            (("suggestion", brought["suggestions"]), ("question", brought["questions"])) if n))
    elif looked:
        parts.append("found nothing worth adding")
    if none:
        parts.append(f"no look needed for {', '.join(none)}")
    line = ("; ".join(parts) or "nothing to look into")
    line = line[0].upper() + line[1:] + "."
    if stopped:
        return Outcome("stopped", "you stopped it", line, model_ms, upto=work.upto)
    if failed and not looked - len(failed):
        return Outcome("failed", "; ".join(failed)[:300], line, model_ms, upto=work.upto)
    if failed or unjudged:
        return Outcome("partial", "; ".join(failed + [f"no judgement for {u}" for u in unjudged])
                       [:300], line, model_ms, upto=work.upto)
    return Outcome("succeeded", None, line, model_ms, upto=work.upto)


def _sources_words(suggestions: list[dict[str, Any]]) -> str:
    hosts = sorted({_host(u) for sg in suggestions for u in sg["sources"]})
    return f"; sources: {', '.join(hosts)}" if hosts else ""


def _host(url: str) -> str:
    from urllib.parse import urlparse

    return urlparse(url).netloc.removeprefix("www.") or url[:40]


def _note(world: World, agent: dict[str, Any], heading: str, line: str) -> None:
    day = datetime.now().astimezone().strftime("%-d %b %Y")
    try:
        world.knowledge.append_to_page(f"agent:{agent['id']}", "Notes", heading[:60],
                                       f"{day}: {line}"[:400])
    except Exception:
        log.exception("sherlock: note under %s", heading)


def mention(world: World, agent: dict[str, Any], sentence: str, *, thread: str | None,
            module: str | None = None, runner: turn.Runner = route.run,
            on_said: Any = None, rest: str | None = None) -> turn.TurnOutcome | None:
    """"@Sherlock <question>": a full look into the question, in the conversation it was
    asked in (one card, with the live steps; its own thread only when asked from the stream,
    and closed after), its findings on a page the person keeps, the gist said there."""
    agent_row = world.agents.get(agent["id"])
    if not agent_row.get("thread"):
        t = world.modules.open_thread(agent["name"], "job", agent.get("module"))["id"]
        world.agents.set_thread(agent["id"], t)
        agent_row = world.agents.get(agent["id"])
    question = (rest or "").strip(" ,:") or sentence
    said = world.journal.append("said", sentence, actor="person", module=module, thread=thread)
    if on_said is not None:
        on_said(said)
    run_id = world.runs.start(agent["id"], trigger="mention")
    subject: dict[str, Any] = {"title": question[:120], "workflow": None, "conversation": thread,
               "words": question, "steps": [], "keeps": [], "settings": [], "reaches": [],
               "purpose": question, "skipped": []}
    out = look_into(world, agent_row, subject, depth="full", open_parts=[], runner=runner,
                    thread=thread)
    if not thread:
        world.modules.update_thread(str(agent_row["thread"]), state="done")
    if not out["ok"]:
        reply = ("You stopped it." if out.get("stopped")
                 else f"I couldn't look into it: {out.get('why')}")
        verdict = "stopped" if out.get("stopped") else "failed"
    else:
        page = _findings_page(world, agent_row, subject, out["findings"])
        found = out["findings"]["suggestions"]
        reply = (out["words"] or "Looked into it.") + (
            f" The page \"Research: {subject['title']}\" keeps what I found"
            + (f": {len(found)} things worth having, with their sources." if found else "."))
        for q in out["findings"]["questions"]:
            world.journal.append("asked", q["text"], actor=agent["id"], thread=thread,
                                 data={"options": q["options"], "pick": q["pick"],
                                       "agent": agent["id"], "turn": said})
        verdict = "succeeded"
        _note(world, agent_row, str(subject["title"]),
              f"asked by you; {len(found)} kept on the page {page['title']}")
    replied = world.journal.append("replied", reply, actor=agent["id"],
                                   data={"turn": said}, module=module, thread=thread)
    world.runs.finish(run_id, verdict=verdict, why=None if verdict == "succeeded" else reply,
                      line=reply[:2000], model_ms=out.get("model_ms") or 0)
    return turn.TurnOutcome(reply=reply, ok=out["ok"], said=said, replied=replied,
                            result=RunResult(reply=reply, ok=out["ok"]))


register(KIND, look, run, mention, words={
    "works": "when Alpha drafts your workflow page, or earlier when an interview for a new kind"
             " of work begins; a small judgement first says whether a look is warranted and how"
             " deep, and your words win (\"no research\", Skip); and when you @-mention it with"
             " a question",
    "good_run": "its look came back and what passed the checks landed (suggestions with a live"
                " source and a reason naming your page, the questions as cards); stopped when"
                " you stopped it; failed when no look came back"})
