"""Tools for plans: the job, then a research pass that looks into how the thing is done and
proposes a plan of pieces (Q37); the build after the person's yes."""

from __future__ import annotations

from typing import Any

from alpha.context.prepack import when
from alpha.mcp.tools.base import Base, tool
from alpha.runtime import research as research_runtime


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
    def research_start(self, title: str, ask: str, job: str,
                       module: str | None = None) -> dict[str, Any]:
        """Start looking into how the thing the person asked for is done, before any plan.
        Call it once the job is known: ask (their words for what they want), job (who will use
        it, what decision or outcome it serves, what happens today, what already exists: a
        process, a scorecard, files, a module Alpha holds; from their answers and what Alpha
        already knows). The pass runs in the background for a few minutes: it looks at what the
        products in this space have, what the trade's practice says, what open data and tools
        exist and what their own world holds, checks the sources, and proposes the plan as a
        card of pieces in this conversation. Tell them in one or two lines what you will look
        at, that it takes a few minutes, and that they can stop it. module: an existing module
        it would extend."""
        if self._building() or self._researching() or self._in_automation():
            return {"error": "A research pass starts from the conversation, not from a build,"
                    " a pass or a run."}
        if not job or len(job.split()) < 4:
            return {"error": "Say the job first: who will use it, what decision or outcome it"
                    " serves, what happens today, what already exists. Ask the person what"
                    " isn't known (ask_person, with choices), then start the pass."}
        module_id = self.world.modules.get(module)["id"] if module else None
        conversation = self.thread if self.thread and self.world.modules.thread(
            self.thread)["kind"] == "chat" else None
        made = self.world.research.start(title, ask, job=job, conversation=conversation,
                                         module=module_id, turn=self.turn)
        self._did("did", f"Looking into how this is done: {title}.",
                  {"research": made["id"]}, module=module_id)
        return {"research": made["id"], "state": made["state"],
                "note": "It runs in the background now and proposes the plan here when done."}

    @tool
    def research_look(self, angle: str, questions: str) -> dict[str, Any]:
        """One look of a research pass: an independent run with web search reads the sources
        for this angle ("what site-selection products measure and show", "how car wash
        operators pick a site: thresholds and rules", "open data for traffic counts and
        demographics in the US") and answers your questions with findings, each a claim with
        the quote and the page it came from. The platform fetches every page and marks which
        answered; only those can be cited in a piece's evidence. Call several at once when
        they are independent."""
        research = self._researching()
        if not research:
            return {"error": "research_look works only inside a research pass"
                    " (research_start from the conversation)."}
        return research_runtime.look(self.world, research["id"], angle, questions,
                                     turn_id=self.turn)

    @tool
    def plan_propose(self, title: str, plan: str, trial: str, module: str | None = None,
                     replaces: str | None = None,
                     questions: list[dict[str, Any]] | None = None,
                     pieces: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        """Propose what you would set up, before anything is made; only inside a research
        pass (research_start from the conversation), or to revise a plan that came from one.
        plan (Markdown, short sections): what you understood they want and why; what you looked
        at (the kinds of sources) and what you found about the sources it would read (readable,
        needs a sign-in, stops automated reading); what you can't reach and what to do about it.
        pieces: what such a thing could have, each {"title", "what" (plain words), "why" (for
        their job), "evidence": [finding ids from research_look] or "known": what in their own
        world it rests on, "build": how it would be built here (tables, where each value comes
        from, what runs on its own), "can": "now" | "needs" | "not_yet", "needs": what (a
        sign-in, a file, a key, their figures; or what Alpha cannot do yet), "recommend": "keep"
        | "defer" | "skip", "kind": "kept" (table stakes, the lean core) | "choice" (their
        call, three to five) | "wont" (named, not now)}. questions: only what the looking
        could not settle and that depends on them, at most six, each {"text", "options": 2 to
        4 short choices, "default": your pick}; they tap a choice on the card, so put nothing
        of this in the text. trial: their job in their own words, the first thing they will
        do with it, with a checkable answer: the finished build tries it and checks it against
        an independent answer. module: an existing module it extends. replaces: the plan this
        revises. Nothing is built until they say yes."""
        research = self._researching()
        revising: dict[str, Any] | None = None
        if replaces:
            revising = self.world.plans.get(replaces)
            if not revising.get("research"):
                revising = None
        if research:
            rid = str(research["id"])
        elif revising:
            rid = str(revising["research"])
        else:
            return {"error": "A plan comes out of a research pass: ask the job (who it is for,"
                    " what it decides, what happens today, what exists already), then"
                    " research_start; the pass looks into how this is done and proposes the"
                    " plan here. Never write the plan yourself in the conversation."}
        if not trial or len(trial.split()) < 2:
            return {"error": "A plan needs a trial: the first thing the person will do with it,"
                    " in their words, so the build can be checked against an independent"
                    " answer."}
        for q in questions or []:
            if isinstance(q, dict) and q.get("options") and not str(q.get("default") or "").strip():
                return {"error": f"The question \"{str(q.get('text', ''))[:80]}\" has choices"
                        " but no default: give the one you'd take if the person just says"
                        " build it (they see it selected and can change it)."}
        if not pieces and not (revising and revising.get("pieces")):
            return {"error": "A researched plan is a menu of pieces: kept (the lean core), choice"
                    " (their call) and wont (named, not now), each with its evidence from"
                    " research_look or `known`. Give the pieces."}
        module_id = self.world.modules.get(module)["id"] if module else None
        made = self.world.plans.propose(
            title, plan, module=module_id, turn=self.turn, replaces=replaces, trial=trial,
            questions=questions, pieces=pieces or (revising or {}).get("pieces"),
            research=rid, citable=self.world.research.citable(rid))
        # The card goes to the conversation that asked, not to the pass's own thread.
        conversation = (research or {}).get("conversation") if research else self.thread
        jid = self.world.journal.append(
            "proposed", f"Plan: {title}",
            data={"plan": made["id"], "why": plan.strip()[:400], "turn": self.turn,
                  "research": rid},
            module=module_id, thread=conversation,
        )
        self.world.plans.set_proposal(made["id"], jid)
        if research:
            self.world.research.set_plan(rid, made["id"])
        if replaces:
            old = self.world.plans.get(replaces)
            if old.get("proposal"):
                self.world.journal.answer_proposal(old["proposal"], None, actor="alpha",
                                                   words="Replaced by a revised plan.",
                                                   plan=replaces, replaced=True)
        return {"plan": made["id"], "state": made["state"],
                "pieces": [p["id"] for p in made["pieces"]]}

    @tool
    def plan_approve(self, plan: str, quote: str, answers: str | None = None,
                     pieces: dict[str, str] | None = None) -> dict[str, Any]:
        """The person said yes to a plan you proposed earlier: quote their words from this
        message, put their answers to your questions in answers, and what they said about the
        plan's pieces in pieces ({piece id: "keep" | "skip" | "defer"}; a piece they didn't
        mention stands on Alpha's recommendation). The build then runs in the background, in
        its own thread, and reports in this conversation; tell them so in one line. Only for a
        plan proposed before this message. A plan they already approved (in the app, or in an
        earlier message) comes back with its state: say so, never ask them to approve again."""
        current = self.world.plans.get(plan)
        if current["state"] != "proposed":
            return {"plan": plan, "state": current["state"], "note": plan_words(current)}
        problem = self._persons_words(quote)
        if problem:
            return {"error": problem}
        if current["turn"] == self.turn:
            return {"error": "A plan is approved by the person's reply to it, not in the turn"
                    " that proposed it."}
        if pieces:
            self.world.plans.decide_pieces(plan, pieces)
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
