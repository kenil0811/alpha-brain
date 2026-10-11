"""Workflows: a module as the person's own workflow (design §12, Q39), kept as one page in
their words that Alpha writes and changes only through the conversation.

    drafted → agreed → building → built
            ↘ declined          ↘ (changed again: a new version, the old one kept)

The body is structured so the build can follow it and a change can be traced: the purpose,
the steps (each with who does it, what it takes and gives, what it reaches, whether it acts
outward, when it runs), what it keeps (things with fields and relations), documents, settings
with their origin, assumptions, Alpha's suggestions with the person's decision, and the
questions the person decides. Nothing about the steps is fixed by the platform; the words
`who`, `when` and `outward` are what it needs to run a step safely.
"""

from __future__ import annotations

import json
import sqlite3
from typing import Any

from alpha.world.plans import clean_questions
from alpha.world.store import Problem, Store, new_id, now

STATES = ("drafted", "agreed", "building", "built", "declined", "removed")
WHO = ("alpha", "you", "both")
ORIGINS = ("you", "your document", "the trade", "Alpha's default")
DECISIONS = ("accept", "skip")
MOST_CHARS = 600


def _words(v: Any, most: int = MOST_CHARS) -> str:
    return " ".join(str(v or "").split())[:most]


def _slug(text: str, fallback: str) -> str:
    out = "".join(c if c.isalnum() else "_" for c in text.lower()).strip("_")
    while "__" in out:
        out = out.replace("__", "_")
    return out[:60].rstrip("_") or fallback


def clean_body(body: Any, previous: dict[str, Any] | None = None) -> dict[str, Any]:
    """The workflow as the model gave it, checked. On a revision (`previous` given): decisions
    on suggestions and answers to questions carry over by title; suggestions and questions
    left out altogether carry over whole (an omission, not a removal: the first real revision
    dropped them all while adding one check); things kept, steps and settings that vanished
    are listed in `dropped`, so the journal says what the change took away."""
    if not isinstance(body, dict):
        raise Problem("A workflow is {purpose, steps, keeps, documents, settings,"
                      " assumptions, suggestions, questions}.")
    purpose = _words(body.get("purpose"))
    if not purpose:
        raise Problem("A workflow needs its purpose: what it is for, the decision it serves,"
                      " in the person's words.")
    steps: list[dict[str, Any]] = []
    seen: set[str] = set()
    for i, s in enumerate(body.get("steps") or []):
        if not isinstance(s, dict):
            raise Problem("Each step is {title, what, who, takes, gives, reaches, outward, when}.")
        title = _words(s.get("title"), 120)
        what = _words(s.get("what"))
        if not title or not what:
            raise Problem(f"Step {i + 1} needs a title and what happens in it.")
        who = str(s.get("who") or "").strip().lower()
        if who not in WHO:
            raise Problem(f"The step \"{title}\" needs who does it: alpha, you or both"
                          " (Alpha prepares, the person decides).")
        sid = _slug(str(s.get("id") or title), f"step_{i + 1}")
        if sid in seen:
            sid = f"step_{i + 1}"
        seen.add(sid)
        reaches = [_words(r, 200) for r in (s.get("reaches") or []) if _words(r, 200)]
        steps.append({"id": sid, "title": title, "what": what, "who": who,
                      "takes": _words(s.get("takes"), 300) or None,
                      "gives": _words(s.get("gives"), 300) or None,
                      "reaches": reaches, "outward": bool(s.get("outward")),
                      "when": _words(s.get("when"), 120) or "when asked"})
    if not steps:
        raise Problem("A workflow needs its steps, in the person's words, in order.")
    keeps: list[dict[str, Any]] = []
    names: set[str] = set()
    for k in body.get("keeps") or []:
        if not isinstance(k, dict) or not _words(k.get("thing"), 80):
            raise Problem("Each thing kept is {thing, fields: [{name, kind, unit?}],"
                          " relates_to: [thing]}.")
        thing = _words(k.get("thing"), 80)
        key = _slug(thing, f"thing_{len(keeps) + 1}")
        if key in names:
            raise Problem(f"The thing \"{thing}\" is listed twice.")
        names.add(key)
        fields = []
        for f in k.get("fields") or []:
            if isinstance(f, dict) and _words(f.get("name"), 60):
                fields.append({"name": _slug(_words(f["name"], 60), "field"),
                               "label": _words(f.get("label") or f["name"], 60),
                               "kind": _words(f.get("kind") or "text", 20).lower(),
                               "unit": _words(f.get("unit"), 20) or None})
            elif isinstance(f, str) and f.strip():
                fields.append({"name": _slug(f, "field"), "label": _words(f, 60),
                               "kind": "text", "unit": None})
        keeps.append({"key": key, "thing": thing, "fields": fields,
                      "relates_to": [_slug(_words(r, 80), "") for r in (k.get("relates_to") or [])
                                     if _words(r, 80)],
                      "what": _words(k.get("what"), 300) or None})
    for k in keeps:
        bad = [r for r in k["relates_to"] if r not in names]
        if bad:
            raise Problem(f"\"{k['thing']}\" relates to {', '.join(bad)}, which is not among the"
                          " things kept.")
    documents = []
    for d in body.get("documents") or []:
        if isinstance(d, dict) and _words(d.get("name"), 80):
            documents.append({"name": _words(d["name"], 80), "from": _words(d.get("from"), 300),
                              "for": _words(d.get("for"), 120) or None,
                              "what": _words(d.get("what"), 300) or None})
    settings = []
    for st in body.get("settings") or []:
        if not isinstance(st, dict) or not _words(st.get("label") or st.get("key"), 80):
            continue
        origin = str(st.get("origin") or "Alpha's default").strip()
        if origin not in ORIGINS:
            raise Problem(f"The setting \"{st.get('label') or st.get('key')}\" needs its origin:"
                          f" {', '.join(ORIGINS)}.")
        settings.append({"key": _slug(_words(st.get("key") or st.get("label"), 60), "setting"),
                         "label": _words(st.get("label") or st.get("key"), 80),
                         "value": st.get("value"), "unit": _words(st.get("unit"), 20) or None,
                         "origin": origin, "why": _words(st.get("why"), 300) or None})
    assumptions = [_words(a, 300) for a in (body.get("assumptions") or []) if _words(a, 300)]
    earlier = {s["title"].lower(): s for s in (previous or {}).get("suggestions") or []}
    suggestions: list[dict[str, Any]] = []
    for sg in body.get("suggestions") or []:
        if not isinstance(sg, dict) or not _words(sg.get("title"), 120):
            continue
        title = _words(sg["title"], 120)
        decision = str(sg.get("decision") or "").strip().lower() or None
        if decision not in (None, *DECISIONS):
            decision = None
        if decision is None and title.lower() in earlier:
            decision = earlier[title.lower()].get("decision")
        suggestions.append({"id": _slug(title, f"suggest_{len(suggestions) + 1}"),
                            "title": title, "what": _words(sg.get("what"), 300),
                            "why": _words(sg.get("why"), 300) or None,
                            "sources": [_words(u, 300) for u in (sg.get("sources") or [])
                                        if _words(u, 300)],
                            "decision": decision})
    questions = clean_questions(body.get("questions"))
    before = {q["text"]: q for q in (previous or {}).get("questions") or []}
    for q in questions:
        if not q.get("answer") and q["text"] in before:
            q["answer"] = before[q["text"]].get("answer")
    dropped: list[str] = []
    if previous:
        if not suggestions and previous.get("suggestions"):
            suggestions = [dict(sg) for sg in previous["suggestions"]]
        if not questions and previous.get("questions"):
            questions = [dict(q) for q in previous["questions"]]
        gone_things = [k["thing"] for k in previous.get("keeps") or [] if k["key"] not in names]
        step_titles = {st["title"].lower() for st in steps}
        gone_steps = [st["title"] for st in previous.get("steps") or []
                      if st["title"].lower() not in step_titles]
        setting_keys = {st["key"] for st in settings}
        gone_settings = [st["label"] for st in previous.get("settings") or []
                         if st["key"] not in setting_keys]
        dropped = ([f"the thing {t}" for t in gone_things] + [f"the step {t}" for t in gone_steps]
                   + [f"the setting {t}" for t in gone_settings])
    return {"purpose": purpose, "steps": steps, "keeps": keeps, "documents": documents,
            "settings": settings, "assumptions": assumptions, "suggestions": suggestions,
            "questions": questions, "dropped": dropped}


def _view(row: sqlite3.Row) -> dict[str, Any]:
    out = {k: row[k] for k in row.keys()}
    try:
        out["body"] = json.loads(out["body"]) if out.get("body") else {}
    except ValueError:
        out["body"] = {}
    return out


class Workflows:
    def __init__(self, store: Store) -> None:
        self.store = store

    def draft(self, title: str, body: Any, *, conversation: str | None = None,
              module: str | None = None, turn: str | None = None,
              words: str | None = None) -> dict[str, Any]:
        if not _words(title, 120):
            raise Problem("A workflow needs a title: the task, in the person's words.")
        clean = clean_body(body)
        clean.pop("dropped", None)
        wid = new_id("wf")
        stamp = now()
        with self.store.tx() as db:
            db.execute(
                "INSERT INTO workflows (id, title, body, words, state, version, conversation,"
                " module, turn, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                (wid, _words(title, 120), json.dumps(clean), _words(words, 4000) or None,
                 "drafted", 1, conversation, module, turn, stamp, stamp))
        return self.get(wid)

    def revise(self, wid: str, body: Any, *, turn: str | None = None,
               words: str | None = None, why: str | None = None) -> dict[str, Any]:
        """A new version from the conversation; the one before is kept (versions)."""
        current = self.get(wid)
        if current["state"] in ("declined", "removed"):
            raise Problem(f"The workflow '{current['title']}' is {current['state']}.")
        clean = clean_body(body, previous=current["body"])
        dropped = clean.pop("dropped", [])
        stamp = now()
        with self.store.tx() as db:
            db.execute(
                "INSERT INTO workflow_versions (workflow, version, body, words, state, why, at)"
                " VALUES (?,?,?,?,?,?,?)",
                (wid, current["version"], json.dumps(current["body"]), current.get("words"),
                 current["state"], _words(why, 300) or None, stamp))
            db.execute(
                "UPDATE workflows SET body = ?, words = COALESCE(?, words), version = version + 1,"
                " turn = COALESCE(?, turn), updated_at = ? WHERE id = ?",
                (json.dumps(clean), _words(words, 4000) or None, turn, stamp, wid))
        out = self.get(wid)
        out["dropped"] = dropped
        return out

    def decide_suggestion(self, wid: str, sid: str, decision: str) -> dict[str, Any]:
        wf = self.get(wid)
        if decision not in DECISIONS:
            raise Problem(f"A suggestion is decided with one of {', '.join(DECISIONS)}.")
        body = wf["body"]
        hit = next((s for s in body["suggestions"] if s["id"] == sid), None)
        if hit is None:
            raise Problem(f"There is no suggestion {sid} on this workflow.")
        hit["decision"] = decision
        with self.store.tx() as db:
            db.execute("UPDATE workflows SET body = ?, updated_at = ? WHERE id = ?",
                       (json.dumps(body), now(), wid))
        return self.get(wid)

    def answer(self, wid: str, answers: dict[str, str]) -> dict[str, Any]:
        wf = self.get(wid)
        questions = wf["body"]["questions"]
        for key, words in (answers or {}).items():
            try:
                i = int(key)
            except (TypeError, ValueError) as e:
                raise Problem("Answers go by the question's number.") from e
            if 0 <= i < len(questions) and str(words).strip():
                questions[i]["answer"] = str(words).strip()[:180]
        with self.store.tx() as db:
            db.execute("UPDATE workflows SET body = ?, updated_at = ? WHERE id = ?",
                       (json.dumps(wf["body"]), now(), wid))
        return self.get(wid)

    def _move(self, wid: str, to: str, *, when: tuple[str, ...], **fields: Any) -> dict[str, Any]:
        sets = ", ".join(f"{k} = ?" for k in fields)
        marks = ", ".join("?" * len(when))
        with self.store.tx() as db:
            moved = db.execute(
                f"UPDATE workflows SET state = ?{', ' + sets if sets else ''}, updated_at = ?"
                f" WHERE id = ? AND state IN ({marks})",
                (to, *fields.values(), now(), wid, *when)).rowcount
        if not moved:
            wf = self.get(wid)
            raise Problem(f"The workflow '{wf['title']}' is {wf['state']}, not"
                          f" {' or '.join(when)}.")
        return self.get(wid)

    def agree(self, wid: str, words: str) -> dict[str, Any]:
        return self._move(wid, "agreed", when=("drafted",), agreement=_words(words, 600))

    def decline(self, wid: str) -> dict[str, Any]:
        return self._move(wid, "declined", when=("drafted", "agreed"))

    def start_build(self, wid: str, thread: str) -> dict[str, Any]:
        return self._move(wid, "building", when=("agreed", "building"), thread=thread)

    def built(self, wid: str, module: str) -> dict[str, Any]:
        return self._move(wid, "built", when=("building",), module=module)

    def set_module(self, wid: str, module: str) -> None:
        with self.store.tx() as db:
            db.execute("UPDATE workflows SET module = ? WHERE id = ?", (module, wid))

    def get(self, wid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM workflows WHERE id = ?", (wid,))
        if row is None:
            raise Problem(f"There is no workflow {wid}.")
        return _view(row)

    def all(self, states: tuple[str, ...] | None = None) -> list[dict[str, Any]]:
        if states:
            marks = ",".join("?" * len(states))
            rows = self.store.all(f"SELECT * FROM workflows WHERE state IN ({marks})"
                                  " ORDER BY created_at", states)
        else:
            rows = self.store.all("SELECT * FROM workflows ORDER BY created_at")
        return [_view(r) for r in rows]

    def recent(self) -> list[dict[str, Any]]:
        """Workflows the person may still act on or is watching: drafted, agreed, building."""
        return self.all(("drafted", "agreed", "building"))

    def of_module(self, module: str) -> dict[str, Any] | None:
        row = self.store.one("SELECT * FROM workflows WHERE module = ? AND state != 'removed'"
                             " ORDER BY created_at DESC LIMIT 1", (module,))
        return _view(row) if row else None

    def versions(self, wid: str) -> list[dict[str, Any]]:
        rows = self.store.all("SELECT * FROM workflow_versions WHERE workflow = ?"
                              " ORDER BY version", (wid,))
        out = []
        for r in rows:
            d = {k: r[k] for k in r.keys()}
            try:
                d["body"] = json.loads(d["body"])
            except ValueError:
                d["body"] = {}
            out.append(d)
        return out

    def remove_module(self, db: Any, module: str) -> int:
        return int(db.execute("UPDATE workflows SET state = 'removed', updated_at = ?"
                              " WHERE module = ? AND state != 'removed'",
                              (now(), module)).rowcount)
