"""Tools for a module as the person's workflow (design §12): the page Alpha drafts from the
interview, revises from the conversation, and the person's yes on it."""

from __future__ import annotations

from typing import Any

from alpha.mcp.tools.base import Base, hand


class WorkflowTools(Base):
    @hand(writes="workflows")
    def workflow_draft(self, title: str, workflow: dict[str, Any], words: str) -> dict[str, Any]:
        """Write "Your workflow", the page that says what Alpha will build for the person,
        from the interview and their documents; only once the job is known (who it is for,
        what decision it serves, what happens today). title: the task in their words.
        workflow: {"purpose": what it is for; "steps": [{"title", "what" (plain words), "who":
        "alpha" | "you" | "both" (Alpha prepares, they decide), "takes", "gives", "reaches":
        [the sources or systems it reads, each with its host when it is on the web, e.g.
        "Census ACS (api.census.gov)", "TxDOT counts (gis.traviscountytx.gov)", "the broker's
        email"; the build reaches exactly those hosts], "outward":
        true when it sends, posts or changes something outside Alpha (it will always ask),
        "when": "when a site arrives" | "when asked" | "every Monday" | "after <step>"}];
        "keeps": [{"thing", "what", "fields": [{"name", "kind", "unit"}], "relates_to":
        [thing]}] normalized, several related things rather than one wide one; "documents":
        [{"name", "from", "for"}]; "settings": [{"key", "label", "value", "unit", "origin":
        "you" | "your document" | "the trade" | "Alpha's default", "why"}] every threshold and
        assumption that could be otherwise; "assumptions": [...] what you had to assume;
        "suggestions": [{"title", "what", "why", "sources": [urls]}] what a person who does this
        work would add, three or so, with the source behind each kept (shown only on ask);
        "questions": [{"text", "options", "default"}] only what cannot be known and changes the
        shape}. words: the page as prose in their words, short sections, the steps as a
        numbered list, no tool names. Nothing is built until they say yes to the page; they
        change it by telling you in chat (workflow_revise), never by editing it."""
        conversation = self.thread if self.thread and self.world.modules.thread(
            self.thread)["kind"] == "chat" else None
        made = self.world.workflows.draft(title, workflow, conversation=conversation,
                                         turn=self.turn, words=words)
        self._did("proposed", f"Your workflow: {title}",
                  {"workflow": made["id"], "why": made["body"]["purpose"][:400]})
        return {"workflow": made["id"], "version": made["version"], "state": made["state"],
                "note": "The page is on its card; the person says yes there or in words."}

    @hand(writes="workflows")
    def workflow_revise(self, workflow: str, change: str, new_workflow: dict[str, Any],
                        words: str | None = None) -> dict[str, Any]:
        """The person said what is different ("add a lot-size check", "the memo should open
        with the verdict", "we also get sites from LoopNet"): write the whole workflow again
        with the change made and everything else kept, as a new version; the one before is
        kept. change: their words. Decisions they made on suggestions and answers to
        questions carry over."""
        made = self.world.workflows.revise(workflow, new_workflow, turn=self.turn, words=words,
                                           why=change)
        dropped = made.get("dropped") or []
        took = (" It also removed " + ", ".join(dropped) + ".") if dropped else ""
        self._did("changed", f"Changed your workflow ({made['title']}, version"
                  f" {made['version']}): {change[:200]}{took}",
                  {"workflow": workflow, "version": made["version"], "dropped": dropped})
        return {"workflow": workflow, "version": made["version"], "state": made["state"],
                **({"removed": dropped, "note": "Say so to the person if that was not what"
                    " they asked; revise again to put them back."} if dropped else {})}

    @hand(writes="workflows")
    def workflow_agree(self, workflow: str, quote: str,
                       suggestions: dict[str, str] | None = None,
                       answers: str | None = None) -> dict[str, Any]:
        """The person said yes to their workflow page: quote their words from this message;
        suggestions: what they said about each ({suggestion id: "accept" | "skip"}); answers:
        their answers to the questions, if any. Then do the work in this same turn, with the
        tools, as one piece, and report what it holds. Only for a page drafted before this
        message (or one that stopped: a yes again picks it up)."""
        current = self.world.workflows.get(workflow)
        if current["state"] not in ("drafted", "stopped"):
            return {"workflow": workflow, "state": current["state"],
                    "note": f"It is already {current['state']}; nothing to agree again."}
        problem = self._persons_words(quote)
        if problem:
            return {"error": problem}
        if current["turn"] == self.turn:
            return {"error": "A workflow is agreed by the person's reply to it, not in the"
                    " turn that drafted it."}
        for sid, decision in (suggestions or {}).items():
            self.world.workflows.decide_suggestion(workflow, sid, decision)
        agreed = self.world.workflows.agree(
            workflow, f"\"{quote}\"" + (f"\nTheir answers: {answers}" if answers else ""))
        said = self._did("did", f"You agreed your workflow: {agreed['title']}.",
                         {"workflow": workflow})
        # The person decided, at the plan: the page and each suggestion on it (Q44, Q50).
        about = {"workflow": workflow, "module": agreed.get("module") or self.module}
        self.world.decisions.record(
            by="person", what=f"Build the workflow: {agreed['title']}", why=quote,
            evidence={"workflow": workflow, "version": agreed.get("version"), "turn": said},
            about=about)
        for sg in (agreed.get("body") or {}).get("suggestions") or []:
            if sg.get("decision") in ("accept", "skip"):
                self.world.decisions.record(
                    by="person",
                    what=f"{'Accepted' if sg['decision'] == 'accept' else 'Skipped'}"
                         f" the suggestion: {sg['title']}",
                    why=sg.get("why"), evidence={"workflow": workflow,
                                                 "suggestion": sg.get("id"), "turn": said},
                    about={**about, "suggestion": sg.get("id")})
        return {"workflow": workflow, "state": agreed["state"],
                "note": "Agreed. Do the work now, in this turn: make what the page says, run it"
                        " once, and report what it holds."}

    @hand(writes="workflows")
    def workflow_decline(self, workflow: str) -> dict[str, Any]:
        """The person doesn't want this workflow built."""
        declined = self.world.workflows.decline(workflow)
        self._did("did", f"Set aside the workflow {declined['title']}.", {"workflow": workflow})
        return {"workflow": workflow, "state": declined["state"]}
