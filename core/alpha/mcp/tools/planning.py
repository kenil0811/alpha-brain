"""Tools for plans: understand and propose, then build after the person's yes."""

from __future__ import annotations

from typing import Any

from alpha.context.prepack import when
from alpha.mcp.tools.base import Base, tool


def plan_words(plan: dict[str, Any]) -> str:
    """What to tell the model about a plan that is past being proposed, so it says so instead
    of asking for a yes it already has (3 Oct: a plan approved on Home was asked about three
    more times in the conversation)."""
    at = when(plan["updated_at"])
    how = plan.get("approval") or "the person's yes"
    return {
        "approved": f"Already approved ({how}, {at}); its build starts on its own. Nothing to"
                    " approve again: tell the person it is on its way.",
        "building": f"Already approved ({how}) and being built now ({at}): tell the person it"
                    " is in progress; it reports in this conversation when done.",
        "done": f"Already approved ({how}) and built ({at}): tell the person it is done and"
                " what it made.",
        "declined": f"The person declined this plan ({at}); propose afresh if they want it.",
        "stopped": f"Its build stopped before it finished ({at}); plan_resume if they say to"
                   " carry on.",
    }.get(plan["state"], f"This plan is {plan['state']} ({at}).")


class Planning(Base):
    @tool
    def plan_propose(self, title: str, plan: str, trial: str, module: str | None = None,
                     replaces: str | None = None,
                     questions: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        """Propose what you would set up, before anything is made. plan (Markdown): what you
        understood they want and why; what you found (each source, and whether it is readable,
        needs a sign-in or stops automated reading); what you would set up and why (tables and
        their fields, where every value will come from and how it stays current, what you would
        tell them and when); what you can't reach and what to do about it. questions: what
        they must decide before you build, at most six, each {"text": the question, "options":
        2 to 4 short choices, "default": the one you'd take if they just say build it}; they
        tap a choice on the card, so put nothing of this in the plan text, and never ask what
        you can find out. trial: the first thing the person will do with it, as they
        would say it to Alpha ("log a For Goodness Shakes 35g protein shake", "which deals are
        new today"), with a checkable answer: the finished build tries it and checks the answer
        against an independent one before it counts as done. module: an existing module it
        extends. replaces: the plan this revises. Nothing is built until they say yes."""
        if not trial or len(trial.split()) < 2:
            return {"error": "A plan needs a trial: the first thing the person will do with it,"
                    " in their words, so the build can be checked against an independent"
                    " answer."}
        for q in questions or []:
            if isinstance(q, dict) and q.get("options") and not str(q.get("default") or "").strip():
                return {"error": f"The question \"{str(q.get('text', ''))[:80]}\" has choices"
                        " but no default: give the one you'd take if the person just says"
                        " build it (they see it selected and can change it)."}
        module_id = self.world.modules.get(module)["id"] if module else None
        made = self.world.plans.propose(title, plan, module=module_id, turn=self.turn,
                                        replaces=replaces, trial=trial, questions=questions)
        jid = self.world.journal.append(
            "proposed", f"Plan: {title}",
            data={"plan": made["id"], "why": plan.strip()[:400], "turn": self.turn},
            module=module_id, thread=self.thread,
        )
        self.world.plans.set_proposal(made["id"], jid)
        if replaces:
            old = self.world.plans.get(replaces)
            if old.get("proposal"):
                self.world.journal.answer_proposal(old["proposal"], None, actor="alpha",
                                                   words="Replaced by a revised plan.",
                                                   plan=replaces, replaced=True)
        return {"plan": made["id"], "state": made["state"]}

    @tool
    def plan_approve(self, plan: str, quote: str, answers: str | None = None) -> dict[str, Any]:
        """The person said yes to a plan you proposed earlier: quote their words from this
        message, and put their answers to your questions in answers. The build then runs in
        the background, in its own thread, and reports in this conversation; tell them so in
        one line. Only for a plan proposed before this message. A plan they already approved
        (in the app, or in an earlier message) comes back with its state: say so, never ask
        them to approve again."""
        current = self.world.plans.get(plan)
        if current["state"] != "proposed":
            return {"plan": plan, "state": current["state"], "note": plan_words(current)}
        problem = self._persons_words(quote)
        if problem:
            return {"error": problem}
        if current["turn"] == self.turn:
            return {"error": "A plan is approved by the person's reply to it, not in the turn"
                    " that proposed it."}
        approval = f"\"{quote}\"" + (f"\nTheir answers: {answers}" if answers else "")
        approved = self.world.plans.approve(plan, approval)
        if approved.get("proposal"):
            self.world.journal.answer_proposal(approved["proposal"], True, plan=plan,
                                               turn=self.turn)
        return {"plan": plan, "state": approved["state"],
                "note": "The build starts in the background now and reports here."}

    @tool
    def plan_resume(self, plan: str, quote: str) -> dict[str, Any]:
        """The person wants a build that stopped before it finished to carry on ("continue"):
        quote their words from this message. It picks up from its brief, in the background."""
        problem = self._persons_words(quote) if len(quote.split()) >= 3 else (
            None if self._said_contains(quote) else "quote must be the person's own words.")
        if problem:
            return {"error": problem}
        resumed = self.world.plans.resume(plan)
        return {"plan": plan, "state": resumed["state"],
                "note": "The build carries on in the background and reports here."}

    @tool
    def plan_decline(self, plan: str) -> dict[str, Any]:
        """The person doesn't want a plan you proposed, or a stopped build carried on."""
        declined = self.world.plans.decline(plan)
        if declined.get("proposal"):
            self.world.journal.answer_proposal(declined["proposal"], False, plan=plan,
                                               turn=self.turn)
        return {"plan": plan, "state": declined["state"]}
