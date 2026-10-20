"""Tools for modules and threads, and speaking to the person: a question, a proposal."""

from __future__ import annotations

from typing import Any

from alpha.mcp.tools.base import Base, hand, tool
from alpha.runtime import engine
from alpha.world.store import Problem


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

    @tool(writes="modules")
    def module_create(self, name: str, goal: str | None = None,
                      parent: str | None = None) -> dict[str, Any]:
        """Make a module: a named place for a topic the person keeps coming back to (Food, Job
        search, Cold calls). Name it the way the person would; goal in their words. parent: the
        module it sits inside, when the person's area has parts (Job holds Search and Resume);
        a parent's page and conversation reach everything inside it."""
        module = self.world.modules.create(name, goal, parent=parent)
        where = f" inside {self.world.modules.path_words(module['parent'])}" \
            if module.get("parent") else ""
        self._did("made", f"Made the module {name}{where}.", {"module": module["id"]},
                  module["id"])
        return module

    @tool(writes="modules")
    def module_move(self, module: str, parent: str | None = None) -> dict[str, Any]:
        """Put a module inside another (parent: its id or name), or at the top (no parent),
        when the person asks; everything in it moves with it. Never inside itself or inside
        something it holds."""
        moved = self.world.modules.move(module, parent)
        where = self.world.modules.path_words(moved["parent"]) if moved.get("parent") \
            else "the top"
        self._did("changed", f"Moved the module {moved['name']} under {where}.",
                  {"module": moved["id"]}, moved["id"])
        return {**moved, "path": self.world.modules.path_words(moved["id"])}

    @tool
    def threads_list(self, state: str | None = None) -> list[dict[str, Any]]:
        """Open pieces of work (builds, agents running, topics)."""
        return self.world.modules.threads(state)

    @tool(writes="threads")
    def thread_open(self, title: str, module: str | None = None) -> dict[str, Any]:
        """Open a thread for a topic that will take more than this turn or a long to-and-fro.
        The person sees it as a card; its conversation stays out of the main stream. (A build
        thread comes only with a workflow's build, an agent's with the agent.)"""
        module_id = self.world.modules.get(module)["id"] if module else None
        thread = self.world.modules.open_thread(title, "work", module_id)
        self._did("made", f"Opened the thread {title}.", {"thread": thread["id"]}, module_id)
        return thread

    @tool(writes="threads")
    def thread_update(self, id: str, state: str | None = None,
                      note: str | None = None) -> dict[str, Any]:
        """Move a thread to working, waiting or done, with an optional one-line note."""
        thread = self.world.modules.update_thread(id, state=state)
        if note:
            self.world.journal.append("did", note, data={"turn": self.turn}, thread=id,
                                      module=thread["module"])
        return thread

    @tool(writes="notes")
    def thread_brief(self, brief: str, id: str | None = None) -> dict[str, Any]:
        """Write this thread's brief (the agent's, in a run): what the work is for, what was
        decided and why, what didn't work and why, what is open, what comes next. Every later
        run starts from it, so keep it short, current and true; replace it, don't append."""
        tid = id or self.thread
        if not tid:
            return {"error": "This turn isn't in a thread; there is no brief to write."}
        thread = self.world.modules.set_brief(tid, brief)
        self._did("changed", f"Updated the brief of {thread['title']}.", {"thread": tid})
        return thread

    @hand(writes="asks", card=True)
    def ask_person(self, question: str, options: list[str] | None = None,
                   kind: str = "one", hint: str | None = None) -> dict[str, Any]:
        """Record a question for the person that must be answered before something can be
        done well (it shows on Home until answered). Ask in the reply too. A question left in
        the reply is one the person cannot answer on a card: when they must choose, or say
        something you cannot find out, ask it here. Only ask what you
        cannot find out and what changes the result. `kind` is "one" (they pick one option) or
        "several" (they may tick more than one); `hint` says what a free answer should be when
        there are no options ("a number of days", "a date", "the person's name")."""
        if kind not in ("one", "several"):
            raise Problem('kind is "one" or "several".')
        # asked as whoever uses the tools: an agent's run asks as the agent, and the answer
        # goes back to it (Q92)
        jid = self.world.journal.append(
            "asked", question, data={"options": options or [], "turn": self.turn, "kind": kind,
                                     "hint": hint or None},
            actor=self.actor, module=self.module, thread=self.thread,
        )
        return {"asked": jid}

    @hand(writes="asks", card=True)
    def card_answer(self, card: str, option: str, words: str) -> dict[str, Any]:
        """Answer an open yes card (a removal, a host a script reaches) on the person's words,
        when they said yes or no to it here ("go ahead", "no, keep it"): `card` is its id
        (among the cards open in the conversation), `option` one of its own options, `words`
        what the person said. A yes in general ("go ahead") says yes to every host's card open
        at that moment: answer each. Only the conversation itself answers a card this way; a
        piece of work or an agent never does."""
        home = self.world.modules.home_thread()["id"]
        if self.actor != "alpha" or self.thread != home:
            raise Problem("Only the conversation answers a card on the person's words; a"
                          " piece of work or an agent never does.")
        asked = self.world.journal.read(card)
        if asked["kind"] != "asked" or not asked["data"].get("permission"):
            raise Problem("That is no yes card: only a card asking the person's yes (a"
                          " removal, a host) is answered this way; a question is answered on"
                          " its card.")
        if card not in {a["id"] for a in self.world.journal.open_asks()}:
            raise Problem("That card is no longer open.")
        options = [str(o) for o in asked["data"].get("options") or []]
        if option not in options:
            raise Problem(f"Answer with one of its options: {'; '.join(options)}.")
        # the person's answer, given in words at the desk (Q75's audit rule in its section C
        # form: by the card's button, its own reply, or the desk on the person's words)
        jid = self.world.journal.append(
            "answered", option, actor="person",
            data={"ask": card, "in_words": words, "turn": self.turn},
            module=asked["module"], thread=asked["thread"])
        if asked["data"].get("permission") == "network":
            # a host's card holds nothing (Q109): a yes lists it, and you run again what
            # needed it
            host = engine.host_answered(self.world, asked, option)
            return {"answered": jid, "allowed": host,
                    **({"note": "Run again what needed it."} if host else {})}
        carried_on = engine.answer_permission(card, option)
        return {"answered": jid, "carried_on": carried_on,
                **({} if carried_on else {"note": "Nothing was waiting on it any more."})}

    @tool(writes="proposals")
    def propose(self, text: str, why: str) -> dict[str, Any]:
        """Propose something the person did not ask for (a target, a new field, a follow-up),
        with the evidence in why. It waits for their yes."""
        # proposed as whoever uses the tools: an agent's run drafts as the agent (P3)
        jid = self.world.journal.append(
            "proposed", text, data={"why": why, "turn": self.turn},
            actor=self.actor, module=self.module, thread=self.thread,
        )
        return {"proposed": jid}
