"""Tools for modules and threads, and speaking to the person: a question, a proposal."""

from __future__ import annotations

from typing import Any

from alpha.mcp.tools.base import Base, tool


class Modules(Base):
    @tool
    def modules_list(self) -> list[dict[str, Any]]:
        """The person's modules, each with its tables."""
        tables = self.world.collections.overview()
        return [
            {**m, "tables": [t for t in tables if t["module"] == m["id"]]}
            for m in self.world.modules.all()
        ]

    @tool
    def module_create(self, name: str, goal: str | None = None) -> dict[str, Any]:
        """Make a module: a named place for a topic the person keeps coming back to (Food, Job
        search, Cold calls). Name it the way the person would; goal in their words."""
        refused = self._gate("Making a module")
        if refused:
            return refused
        module = self.world.modules.create(name, goal)
        plan = self._building()
        if plan and not plan["module"]:
            self.world.plans.set_module(plan["id"], module["id"])
        self._did("made", f"Made the module {name}.", {"module": module["id"]}, module["id"])
        return module

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
