"""Tools for the wiki's pages, standing instructions, goals, facts, and the people and organisations
Alpha knows."""

from __future__ import annotations

from typing import Any

from alpha.mcp.tools.base import Base, tool
from alpha.world.knowledge import GATED_NOTES


class Knowledge(Base):
    @tool
    def notes_list(self, scope: str | None = None) -> list[dict[str, Any]]:
        """Alpha's notes, optionally for one scope: person, module:<name> or topic:<slug>."""
        return self.world.knowledge.notes(scope)

    @tool
    def note_read(self, id: str) -> dict[str, Any]:
        """One note in full."""
        return self.world.knowledge.read_note(id)

    @tool
    def note_write(self, scope: str, title: str, body: str,
                   summary: str | None = None) -> dict[str, Any]:
        """Create or replace a page of Alpha's wiki (Markdown). Scopes: person (title 'Profile':
        a short portrait); module:<name> (the module's name as title: what it is for, what it
        holds, what was tried, what is open); entity:<id> (a person or company: who they are to
        the person, how they know them, what is going on); topic:<slug> (anything else);
        skill:<name> (site notes for one of your skills: what the page is like, what broke and
        why, what to watch; skill_read shows them).
        summary: the page's one line in the always-loaded index. Write only what the person
        said or what you verified. Standing instructions are not written here: see
        instruction_add."""
        if scope == "person" and title in GATED_NOTES:
            return {"error": f"'{title}' changes only on the person's own words: use"
                    " instruction_add with their words from this turn, or instruction_propose."}
        note = self.world.knowledge.write_note(scope, title, body, source=self.turn,
                                               summary=summary)
        self._did("changed", f"Updated the note {title} ({scope}).", {"note": note["id"]})
        return note

    @tool
    def instruction_add(self, sentence: str, quote: str) -> dict[str, Any]:
        """Add a standing instruction (how the person always wants something done) when they
        say it: "always…", "never…", "from now on…". sentence: the instruction, short and
        clear. quote: their exact words from this message that say it. Anything else that
        should become an instruction goes through instruction_propose."""
        problem = self._persons_words(quote)
        if problem:
            return {"error": problem}
        note = self.world.knowledge.add_instruction(sentence, str(self.turn))
        self._did("changed", f"Added a standing instruction: {sentence}",
                  {"note": note["id"], "quote": quote})
        return {"instructions": self.world.knowledge.instructions()}

    @tool
    def instruction_remove(self, sentence: str, quote: str) -> dict[str, Any]:
        """Drop a standing instruction when the person says so. quote: their exact words."""
        problem = self._persons_words(quote)
        if problem:
            return {"error": problem}
        note = self.world.knowledge.remove_instruction(sentence, str(self.turn))
        self._did("changed", f"Dropped the standing instruction: {sentence}",
                  {"note": note["id"], "quote": quote})
        return {"instructions": self.world.knowledge.instructions()}

    @tool
    def instruction_propose(self, sentence: str, why: str) -> dict[str, Any]:
        """Suggest a standing instruction the person didn't state (a pattern you noticed, a
        lesson from a run). It becomes one only on their yes."""
        jid = self.world.journal.append(
            "proposed", f"Make this a standing instruction: {sentence}",
            data={"instruction": sentence, "why": why, "turn": self.turn},
            module=self.module, thread=self.thread,
        )
        return {"proposed": jid}

    @tool
    def goals_list(self, state: str = "active") -> list[dict[str, Any]]:
        """The person's goals: active, done or dropped."""
        return self.world.knowledge.goals(state)

    @tool
    def goal_set(self, text: str, module: str | None = None) -> dict[str, Any]:
        """Record a goal the person stated ("under 2,000 kcal on weekdays", "a backend role by
        December"). Only goals they said, never ones you imagine for them."""
        module_id = self.world.modules.get(module)["id"] if module else None
        goal = self.world.knowledge.set_goal(text, module_id)
        self._did("made", f"Noted the goal: {text}", {"goal": goal["id"]}, module_id)
        return goal

    @tool
    def goal_update(self, id: str, state: str) -> dict[str, Any]:
        """Mark a goal done or dropped (or active again)."""
        return self.world.knowledge.update_goal(id, state)

    @tool
    def facts_get(self, subject: str = "person") -> list[dict[str, Any]]:
        """Current facts about the person ('person') or an entity ('entity:<id>')."""
        return self.world.knowledge.facts(subject)

    @tool
    def fact_record(
        self,
        subject: str,
        predicate: str,
        value: str,
        stated: bool = False,
        why: str | None = None,
    ) -> dict[str, Any]:
        """Remember a fact. subject 'person' or 'entity:<id>'; predicate snake_case, e.g.
        height_cm, weight_kg, diet, works_at. stated: true only when the person said it
        themselves in this conversation (it is then accepted and replaces the old value);
        otherwise it waits as a suggestion for their yes. why: the words it came from."""
        fact = self.world.knowledge.record_fact(
            subject, predicate, value,
            source=f"turn:{self.turn}" if self.turn else "alpha",
            state="accepted" if stated else "suggested",
            confidence=0.95 if stated else 0.6,
            why=why,
        )
        self._did(
            "noticed",
            f"{'Remembered' if stated else 'Suggested remembering'} {predicate} = {value}.",
            {"fact": fact["id"], "subject": subject},
        )
        return fact

    @tool
    def entities_find(
        self,
        name: str | None = None,
        kind: str | None = None,
        email: str | None = None,
        url: str | None = None,
    ) -> list[dict[str, Any]]:
        """Find people, organisations, places, documents, messages or events Alpha knows, by
        name (partial) or exactly by email or URL."""
        keys: dict[str, Any] = {}
        if email:
            keys["email"] = email
        if url:
            keys["url"] = url
        return self.world.entities.find(name=name, kind=kind, keys=keys or None)

    @tool
    def entity_resolve(
        self, kind: str, name: str, keys: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        """The one entity these details identify, creating it when new. kind: person,
        organisation, place, document, message, event. keys: {email, url (a profile or page
        address), phone, path, uid, domain}. A matching key finds the existing entity; a name
        alone never merges, and same-name entities come back under 'maybe' for the person to
        decide."""
        result = self.world.entities.resolve(kind, name, keys)
        if result["created"]:
            self._did("saw", f"Started keeping {name} ({kind}).",
                      {"entity": result["entity"]["id"]})
        return result

    @tool
    def entity_read(self, id: str) -> dict[str, Any]:
        """An entity with its current facts and the rows, in any table, that are it."""
        entity = self.world.entities.get(id)
        entity["facts"] = self.world.knowledge.facts(f"entity:{entity['id']}")
        entity["rows"] = self.world.collections.linked_to(entity["id"])
        return entity
