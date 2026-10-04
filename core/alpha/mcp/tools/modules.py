"""Tools for modules (projects on screen) and threads, making a project on its page, and
speaking to the person: a question, a proposal."""

from __future__ import annotations

from typing import Any

from alpha.mcp.tools.base import Base, tool
from alpha.world.modules import CREATION_STAGES, ICONS, UNTITLED
from alpha.world.store import Problem, now


class Modules(Base):
    @tool
    def modules_list(self) -> list[dict[str, Any]]:
        """The person's modules, each with its tables, its parent (the module it sits inside,
        if any) and its path (Job › Search)."""
        tables = self.world.collections.overview()
        return [
            {**m, "tables": [t for t in tables if t["module"] == m["id"]],
             "path": self.world.modules.path_words(m["id"])}
            for m in self.world.modules.all()
        ]

    @tool
    def module_create(self, name: str, goal: str | None = None,
                      parent: str | None = None, icon: str | None = None) -> dict[str, Any]:
        """Make a project: a named place for a topic the person keeps coming back to (Food, Job
        search, Cold calls). Name it the way the person would; goal in their words. parent: the
        project it sits inside, when the person's area has parts (Job holds Search and Resume);
        a parent's page and conversation reach everything inside it. icon: the one that fits,
        from: book-open, boxes, briefcase, calendar, chart-line, code, dumbbell, folder,
        graduation-cap, heart-pulse, house, list-checks, mail, megaphone, notebook-pen, plane,
        shopping-cart, sparkles, sticky-note, target, users, utensils, wallet."""
        refused = self._gate("Making a project")
        if refused:
            return refused
        module = self.world.modules.create(name, goal, parent=parent)
        if icon:
            module = self.world.modules.update(module["id"], icon=icon)
        plan = self._building()
        if plan and not plan["module"]:
            self.world.plans.set_module(plan["id"], module["id"])
        where = f" inside {self.world.modules.path_words(module['parent'])}" \
            if module.get("parent") else ""
        self._did("made", f"Made the project {name}{where}.", {"module": module["id"]},
                  module["id"])
        return module

    @tool
    def module_move(self, module: str, parent: str | None = None) -> dict[str, Any]:
        """Put a module inside another (parent: its id or name), or at the top (no parent),
        when the person asks; everything in it moves with it. Never inside itself or inside
        something it holds."""
        moved = self.world.modules.move(module, parent)
        where = self.world.modules.path_words(moved["parent"]) if moved.get("parent") \
            else "the top"
        self._did("changed", f"Moved the project {moved['name']} under {where}.",
                  {"module": moved["id"]}, moved["id"])
        return {**moved, "path": self.world.modules.path_words(moved["id"])}

    @tool
    def module_update(self, ref: str, name: str | None = None, icon: str | None = None,
                      goal: str | None = None) -> dict[str, Any]:
        """Change a project: rename it, or give it another icon (one of the project icons) or
        goal. To put it inside another project, use module_move."""
        before = self.world.modules.get(ref)
        module = self.world.modules.update(ref, name=name, icon=icon, goal=goal)
        what = []
        if module["name"] != before["name"]:
            what.append(f"renamed {before['name']} to {module['name']}")
        if module["icon"] != before["icon"]:
            what.append("changed its icon")
        if module["goal"] != before["goal"]:
            what.append("changed its goal")
        if what:
            self._did("changed", f"{module['name']}: {', '.join(what)}.", {"module": module["id"]},
                      module["id"])
        return module

    @tool
    def creation_show(
        self,
        stage: str,
        questions: list[dict[str, Any]] | None = None,
        intro: str | None = None,
        findings: list[str] | None = None,
        options: list[dict[str, Any]] | None = None,
        default: str | None = None,
        evidence: list[dict[str, Any]] | None = None,
        assumptions: list[dict[str, Any]] | None = None,
        plan: str | None = None,
        project_name: str | None = None,
        project_icon: str | None = None,
    ) -> dict[str, Any]:
        """While making a new project: show the person where it stands ON THE PROJECT'S PAGE
        (never in your reply, which is one short line pointing there). stage: asking |
        researching | proposing | planned | building | done.
        asking: questions [{id, question, options (3-6 concrete ones), why_it_matters (<= 8
        words)}], at most 4, ids role, outcomes, tools, cadence.
        proposing: intro (one sentence); findings (<= 3, <= 15 words each, each naming its
        source kind); options [{id, title, summary, why (<= 12 words)}], 2 or 3; default (the
        option id you would build); questions (decisions only, <= 3, 2-5 options each);
        evidence [{title, url, note, kind}] for everything you read.
        planned: plan, the plan in Markdown (kept as the project's note "Plan").
        assumptions: [{text, source}] with source "default", "you chose" or "you corrected".
        project_name (2-4 words, Title Case, <= 40) and project_icon (one of:
        book-open, boxes, briefcase, calendar, chart-line, code, dumbbell, folder,
        graduation-cap, heart-pulse, house, list-checks, mail, megaphone, notebook-pen, plane,
        shopping-cart, sparkles, sticky-note, target, users, utensils, wallet)
        name a project still called "Untitled project"."""
        making = self.world.modules.making(self.thread)
        if making is None:
            raise Problem("creation_show is only for a project being made, in its own thread.")
        current = (making["creation"] or {}).get("stage", "new")
        if stage not in CREATION_STAGES or stage == "new":
            raise Problem(f"stage is one of {', '.join(CREATION_STAGES[1:])}; got '{stage}'.")
        order = CREATION_STAGES.index
        if current == "done" or (order(current) >= order("building") and order(stage) <
                                 order("building")):
            raise Problem(f"Making this project is at '{current}' already; it can't go back to"
                          f" '{stage}'.")
        patch: dict[str, Any] = {"stage": stage, "at": now(), "error": None, "timed_out": None}
        if stage == "asking":
            patch["questions"] = _questions(questions, most=4, fewest_options=3, most_options=6)
            if not patch["questions"]:
                raise Problem("asking needs at least one question.")
        if stage == "proposing":
            opts = [_clean(o, ("id", "title", "summary", "why")) for o in options or []]
            if not 2 <= len(opts) <= 3 or any(not o.get("id") or not o.get("title")
                                               for o in opts):
                raise Problem("proposing needs two or three options, each with an id and a"
                              " title.")
            ids = [o["id"] for o in opts]
            if len(findings or []) > 3:
                raise Problem("At most three findings.")
            patch["proposal"] = {
                "intro": " ".join((intro or "").split()),
                "findings": [" ".join(str(f).split()) for f in findings or []],
                "options": opts,
                "default": default if default in ids else ids[0],
                "questions": _questions(questions, most=3, fewest_options=2, most_options=5),
                "evidence": [_clean(e, ("title", "url", "note", "kind"))
                             for e in (evidence or [])][:16],
            }
        if stage == "planned":
            if not (plan or "").strip():
                raise Problem("planned needs the plan, in Markdown.")
            self.world.knowledge.write_note(f"module:{making['name']}", "Plan", plan or "")
        if stage == "building":
            patch["turn"] = self.turn
        if assumptions is not None:
            patch["assumptions"] = [_clean(a, ("text", "source")) for a in assumptions][:12]
        renamed = None
        if making["name"].startswith(UNTITLED) and (project_name or "").strip():
            name = " ".join((project_name or "").split())[:40]
            icon = project_icon if project_icon in ICONS else "folder"
            try:
                making = self.world.modules.update(making["id"], name=name, icon=icon)
                renamed = making["name"]
            except Problem:
                pass  # taken: the turn's fallback names it from the person's words
        self.world.modules.set_creation(making["id"], patch)
        self._did("did", SHOWN[stage], {"creation": stage, "renamed": renamed}, making["id"])
        return {"shown": stage, "project": making["name"],
                "note": "It is on the project's page. Reply with one short line pointing there."}

    @tool
    def threads_list(self, state: str | None = None) -> list[dict[str, Any]]:
        """Open pieces of work (builds, research, automations running, topics)."""
        return self.world.modules.threads(state)

    @tool
    def thread_open(self, title: str, kind: str, module: str | None = None) -> dict[str, Any]:
        """Open a thread for work that will take more than this turn or a long to-and-fro:
        kind build, research, job or topic. The person sees it as a card; its
        conversation stays out of the main stream."""
        module_id = self.world.modules.get(module)["id"] if module else None
        thread = self.world.modules.open_thread(title, kind, module_id)
        self._did("made", f"Opened the thread {title}.", {"thread": thread["id"]}, module_id)
        return thread

    @tool
    def thread_update(self, id: str, state: str | None = None,
                      note: str | None = None) -> dict[str, Any]:
        """Move a thread to working, waiting or done, with an optional one-line note."""
        thread = self.world.modules.update_thread(id, state=state)
        if note:
            self.world.journal.append("did", note, data={"turn": self.turn}, thread=id,
                                      module=thread["module"])
        return thread

    @tool
    def thread_brief(self, brief: str, id: str | None = None) -> dict[str, Any]:
        """Write this thread's brief (the automation's, in a run): what the work is for, what was
        decided and why, what didn't work and why, what is open, what comes next. Every later
        run starts from it, so keep it short, current and true; replace it, don't append."""
        tid = id or self.thread
        if not tid:
            return {"error": "This turn isn't in a thread; there is no brief to write."}
        thread = self.world.modules.set_brief(tid, brief)
        self._did("changed", f"Updated the brief of {thread['title']}.", {"thread": tid})
        return thread

    @tool
    def ask_person(self, question: str, options: list[str] | None = None) -> dict[str, Any]:
        """Record a question for the person that must be answered before something can be
        done well (it shows on Home until answered). Ask in the reply too. Only ask what you
        cannot find out and what changes the result."""
        making = self.world.modules.making(self.thread)
        if making and (making["creation"] or {}).get("stage") != "done":
            raise Problem("While a project is being made, its questions go on its page: use"
                          " creation_show(stage=\"asking\").")
        jid = self.world.journal.append(
            "asked", question, data={"options": options or [], "turn": self.turn},
            module=self.module, thread=self.thread,
        )
        return {"asked": jid}

    @tool
    def propose(self, text: str, why: str) -> dict[str, Any]:
        """Propose something the person did not ask for (a target, a new field, a follow-up),
        with the evidence in why. It waits for their yes."""
        jid = self.world.journal.append(
            "proposed", text, data={"why": why, "turn": self.turn},
            module=self.module, thread=self.thread,
        )
        return {"proposed": jid}


SHOWN = {
    "asking": "Showed a few questions on the project's page.",
    "researching": "Looking around: how this is usually done, and what their tools connect to.",
    "proposing": "Showed the options on the project's page.",
    "planned": "Wrote the plan on the project's page.",
    "building": "Building it from the plan.",
    "done": "Finished making the project.",
}
OUTCOMES_OPEN = "Not sure yet: show me what's possible"


def _clean(item: Any, keys: tuple[str, ...]) -> dict[str, str]:
    item = item if isinstance(item, dict) else {}
    return {k: " ".join(str(item[k]).split()) for k in keys if item.get(k) not in (None, "")}


def _questions(raw: list[dict[str, Any]] | None, *, most: int, fewest_options: int,
               most_options: int) -> list[dict[str, Any]]:
    """Questions as the page shows them: an id, the question, its options and why it matters.
    The outcomes question always ends with the open option (research then looks for what is
    possible)."""
    out = []
    for q in (raw or [])[:most]:
        q = q if isinstance(q, dict) else {}
        qid, text = str(q.get("id") or "").strip(), " ".join(str(q.get("question") or "").split())
        opts = [" ".join(str(o).split()) for o in q.get("options") or [] if str(o).strip()]
        if not qid or not text:
            raise Problem("Each question needs an id and the question.")
        if qid == "outcomes" and OUTCOMES_OPEN not in opts:
            opts = opts[:most_options] + [OUTCOMES_OPEN]
        elif not fewest_options <= len(opts) <= most_options:
            raise Problem(f"'{text}' needs {fewest_options} to {most_options} options.")
        out.append({"id": qid, "question": text, "options": opts,
                    "why_it_matters": " ".join(str(q.get("why_it_matters") or "").split())})
    return out
