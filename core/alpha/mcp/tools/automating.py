"""Tools for what runs on its own."""

from __future__ import annotations

from typing import Any

from alpha.mcp.tools.base import Base, tool
from alpha.runtime import pipeline
from alpha.world.store import Problem


class Automating(Base):
    @tool
    def automation_create(
        self, title: str, schedule: str, procedure: str = "",
        steps: list[dict[str, Any]] | None = None, module: str | None = None,
    ) -> dict[str, Any]:
        """Make something run on its own from now on. title: the sentence the person reads,
        e.g. "Every morning at 08:00, read the listings and tell you what's new". schedule:
        "every 6h", "every 30m", "daily 08:00" or "weekly mon 08:00" (local time).
        steps (the default, run with no model): [{"read": reader, "into": table, "key": field,
        "keep": [fields the person edits], "map": {field: {site's word: table's word}}}, …,
        {"tell": table, "where": {filter for what matters}}, {"run": another automation's run
        skill, to reuse its steps}]; a tell step reports what is new, changed and gone since
        the last run. The steps are kept as a run skill named after the title. You are called
        only if a step breaks.
        procedure: only for work that needs judgement on every run: exact instructions you
        will follow. Do the first run yourself now, before creating it. Only things that read
        and update Alpha's own tables; never anything that sends, posts or submits."""
        refused = self._gate("Setting up an automation")
        if refused:
            return refused
        clean = pipeline.check_steps(self.world, steps) if steps else None
        if not clean and not procedure.strip():
            raise Problem("Give the automation steps (or, for judgement work, a procedure).")
        module_id = self.world.modules.get(module)["id"] if module else self.module
        thread = self.world.modules.open_thread(title, "job", module_id)
        self.world.modules.update_thread(thread["id"], state="done")
        auto = self.world.automations.create(title, schedule, procedure, module=module_id,
                                             thread=thread["id"], steps=clean)
        self._did("made", f"Set up: {title} ({auto['when']}).", {"automation": auto["id"]},
                  module_id)
        return auto

    @tool
    def automations_list(self) -> list[dict[str, Any]]:
        """Everything that runs on its own, with when it runs next and how its last run went."""
        return self.world.automations.all()

    @tool
    def automation_update(self, id: str, enabled: bool | None = None,
                          schedule: str | None = None, procedure: str | None = None,
                          title: str | None = None,
                          steps: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        """Change an automation: switch it off or on, change when it runs or what it does;
        steps turn it into (or change) a pipeline run with no model."""
        clean = pipeline.check_steps(self.world, steps) if steps else None
        auto = self.world.automations.update(id, enabled=enabled, schedule=schedule,
                                             procedure=procedure, title=title, steps=clean)
        self._did("changed", f"Changed: {auto['title']} ({'on' if auto['enabled'] else 'off'},"
                  f" {auto['when']}).", {"automation": id}, auto["module"])
        return auto
