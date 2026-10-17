"""Tools for the person's agents: what works for them on its own (design Q44, Q50)."""

from __future__ import annotations

from typing import Any

from alpha.mcp.tools.base import Base, tool
from alpha.runtime import pipeline
from alpha.world.store import Problem


class AgentTools(Base):
    @tool(writes="agents")
    def agent_create(
        self, title: str, schedule: str, brief: str = "",
        steps: list[dict[str, Any]] | None = None, module: str | None = None,
        goal: str | None = None, name: str | None = None,
    ) -> dict[str, Any]:
        """Make an agent that works on its own from now on. title: the sentence the person
        reads, e.g. "Every morning at 08:00, read the listings and tell you what's new".
        schedule: "every 6h", "every 30m", "daily 08:00" or "weekly mon 08:00" (local time).
        steps (the default, run with no model): [{"read": reader, "into": table, "key": field,
        "keep": [fields the person edits], "map": {field: {site's word: table's word}}}, …,
        {"tell": table, "where": {filter for what matters}}, {"run": another agent's run
        skill, to reuse its steps}]; a tell step reports what is new, changed and gone since
        the last run. The steps are kept as a run skill named after the title. You are called
        only if a step breaks.
        brief: its page (Markdown), which the person reads and edits and the agent reads on
        every run: what it is for, what to do each run (only for work that needs judgement
        on every run, with exact instructions; do the first run yourself now, before creating
        it), what a good run looks like, what to do when a source needs a sign-in or stops
        reading, what to tell. Only things that read and update Alpha's own tables; never
        anything that sends, posts or submits.
        goal: what it is for, in the person's words. name: a short name for it (the title
        when not given); the person can rename it."""
        clean = pipeline.check_steps(self.world, steps) if steps else None
        if not clean and not brief.strip():
            raise Problem("Give the agent steps (or, for judgement work, a brief).")
        module_id = self.world.modules.get(module)["id"] if module else self.module
        # The agent's work is the work item that made it (harness §7: "a watch with its runs"
        # is one item): its runs go under it. Made from Home or from another agent's own
        # item, it gets an item of its own.
        here = self.world.modules.thread(self.thread) if self.thread else None
        if (here and here["kind"] == "work" and self.world.agents.of_thread(here["id"]) is None):
            thread = here
        else:
            thread = self.world.modules.open_thread((name or title).strip(), "work", module_id)
            self.world.modules.update_thread(thread["id"], state="done")
        agent = self.world.agents.create(title, name=name, schedule=schedule, module=module_id,
                                         thread=thread["id"], steps=clean, goal=goal)
        if brief.strip():
            self.world.knowledge.write_note(f"agent:{agent['id']}", "Brief", brief,
                                            source=self.turn)
        self._did("made", f"Set up the agent {agent['name']}: {title} ({agent['when']}).",
                  {"agent": agent["id"]}, module_id)
        return agent

    @tool
    def agents_list(self) -> list[dict[str, Any]]:
        """Every agent, with when it works next and how its last run went (its verdict,
        judged by code: succeeded, partial or failed, and why)."""
        out = []
        for a in self.world.agents.all():
            last = self.world.runs.last(a["id"])
            out.append({**a, "last_verdict": last["verdict"] if last else None,
                        "last_why": last["why"] if last else None})
        return out

    @tool(writes="agents")
    def agent_update(self, id: str, state: str | None = None,
                     schedule: str | None = None, brief: str | None = None,
                     title: str | None = None, name: str | None = None,
                     steps: list[dict[str, Any]] | None = None,
                     goal: str | None = None) -> dict[str, Any]:
        """Change an agent: pause it (state "paused") or set it going ("on"), change when it
        works or what it does; steps turn it into (or change) a pipeline run with no model;
        brief replaces its page; title, name and goal as in agent_create."""
        clean = pipeline.check_steps(self.world, steps) if steps else None
        agent = self.world.agents.update(id, state=state, schedule=schedule, description=title,
                                         name=name, steps=clean, goal=goal)
        if brief and brief.strip():
            self.world.knowledge.write_note(f"agent:{agent['id']}", "Brief", brief,
                                            source=self.turn)
        self._did("changed", f"Changed the agent {agent['name']} ({agent['state']},"
                  f" {agent['when']}).", {"agent": id}, agent["module"])
        return agent
