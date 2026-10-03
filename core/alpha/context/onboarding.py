# ruff: noqa: E501
"""The first conversation: five short questions, then a proposed first shape (Alpha's own).

The answers become accepted facts about the person (they said so), and one model run proposes
two or three projects to start with, each a sentence the person can send as-is. Nothing is built
until they pick one. Done (answered or skipped) is kept in `meta onboarding`.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from alpha.runtime.claude_cli import TurnRequest
from alpha.world.person_skills import meta_get, meta_put
from alpha.world.store import Problem

if TYPE_CHECKING:
    from alpha.runtime.turn import Runner
    from alpha.world.world import World

QUESTIONS: tuple[dict[str, str], ...] = (
    {"id": "occupation", "label": "What do you do?", "hint": "Work, study, a hobby or two."},
    {"id": "week", "label": "What fills your week?", "hint": "Where most of your week goes."},
    {"id": "goal", "label": "What are you trying to get better at right now?", "hint": "A job hunt, a habit, a course."},
    {"id": "tools", "label": "Where does your work live?", "hint": "Email, Notion, spreadsheets…"},
    {"id": "begin", "label": "Where would you like Alpha to begin?", "hint": "Anything. Alpha suggests a start."},
)
FACT_FIELDS = {
    "occupation": "occupation",
    "week": "week_focus",
    "goal": "current_goal",
    "tools": "work_tools",
    "begin": "wants_to_begin_with",
}
FALLBACK = {"intro": "Thanks. Describe anything you want to keep track of and Alpha builds it.", "options": []}

ONBOARD_SYSTEM = """A person just told Alpha, in five short answers, what they do, what fills their week, what they want to get better at, where their work lives, and where they would like to begin. Alpha builds small personal projects on their Mac: trackers, lists, watchers of web pages, summaries, things that run on a schedule.

Propose two or three projects to start with, in the order they should be made. Each: a short title, one sentence the person could send as a request ("Keep a list of the courses I am taking with assignments and due dates"), and one line on why it fits what they said. Prefer what serves their stated goal; the first one should be usable the same day. When the person already has projects (listed), propose what adds to them, not the same again. intro is at most 50 words, warm, specific, no technical words. Use no tools and build nothing.

Reply with only one JSON object: {"intro": "...", "options": [{"title": "...", "request": "...", "why": "..."}]}"""


def status(world: World) -> dict[str, Any]:
    done = meta_get(world.store, "onboarding")
    return {"done": done is not None, "questions": list(QUESTIONS), "proposal": done}


def skip(world: World) -> dict[str, Any]:
    meta_put(world.store, "onboarding", {"skipped": True, "intro": "", "options": []})
    return status(world)


def _proposal(reply: str) -> dict[str, Any]:
    start = reply.find("{")
    while start != -1:
        try:
            obj, _ = json.JSONDecoder().raw_decode(reply[start:])
        except ValueError:
            start = reply.find("{", start + 1)
            continue
        if isinstance(obj, dict) and isinstance(obj.get("options"), list):
            options = [{"title": str(o.get("title", ""))[:80], "request": str(o.get("request", ""))[:300],
                        "why": str(o.get("why", ""))[:200]}
                       for o in obj["options"] if isinstance(o, dict) and o.get("request")][:3]
            return {"intro": str(obj.get("intro") or "")[:400], "options": options}
        start = reply.find("{", start + 1)
    return dict(FALLBACK)


def answer(world: World, answers: dict[str, str], runner: Runner) -> dict[str, Any]:
    clean = {k: str(v).strip() for k, v in answers.items() if k in FACT_FIELDS and str(v).strip()}
    if not clean:
        raise Problem("Answer at least one question.")
    for key, value in clean.items():
        world.knowledge.record_fact("person", FACT_FIELDS[key], value[:1000], source="person",
                                    state="accepted", confidence=1.0)
    lines = [f"- {q['label']} {clean[q['id']]}" for q in QUESTIONS if q["id"] in clean]
    projects = [m["name"] for m in world.modules.all()]
    prompt = "THE PERSON'S ANSWERS:\n" + "\n".join(lines)
    if projects:
        prompt += "\n\nPROJECTS THEY ALREADY HAVE: " + ", ".join(projects)
    did = world.journal.append("did", "Proposed where to begin from your first answers.")
    try:
        result = runner(TurnRequest(sentence=prompt, system=ONBOARD_SYSTEM, world_path=world.path,
                                    turn_id=did))
        proposal = _proposal(result.reply) if result.ok else dict(FALLBACK)
    except Exception:  # no model connected, or it failed: Alpha's own fallback words
        proposal = dict(FALLBACK)
    meta_put(world.store, "onboarding", proposal)
    return status(world)
