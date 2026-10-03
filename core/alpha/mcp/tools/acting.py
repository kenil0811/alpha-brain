"""Tools for acting outward: procedures Alpha writes, actions the person approves."""

from __future__ import annotations

from typing import Any

from alpha.mcp.tools.base import Base, tool
from alpha.runtime import claude_cli
from alpha.world.sites import site_of
from alpha.world.store import Problem


class Acting(Base):
    @tool
    def procedure_save(self, name: str, url: str, description: str, effect: str,
                       steps: list[dict[str, Any]], fields: list[str],
                       verify: list[dict[str, Any]] | None = None,
                       when_to_use: str | None = None) -> dict[str, Any]:
        """Keep the steps that do one task on one site, in the person's own session: your
        know-how for acting, like a reader is for reading. Write it from the real page (page_read,
        page_script to see the controls), then use it through action_propose; it is proven by the
        dry run and the run. name: e.g. gmail_draft. url: where the task starts. description:
        what it does, in a sentence ("Make a draft email in Gmail"). effect: "prepare" when the
        result stays in the person's account and reaches nobody (a draft, an unsent message),
        "send" when it reaches someone or something (sent, posted, submitted). steps, in order:
        {"click": css} · {"click_text": "Compose"} · {"fill": css, "value": "{to}"} ·
        {"type": css, "value": "{body}"} (keyboard, for rich editors) · {"press": "Enter"} ·
        {"wait": css} · {"wait_ms": 1500} · {"expect": css} · {"expect_text": "Draft saved"} ·
        {"goto": url}. fill and type take only a field of the payload, never words of your own;
        a {field} inside the url, a selector, a click_text or a goto is filled from the payload
        too (a profile slug, a subject to find), so one procedure serves every recipient; the
        last step is the commit (save, close, send): a dry run does everything before it.
        fields: the payload fields the steps use (e.g. ["to", "subject", "body"]). verify:
        read-only checks after the commit ({"expect_text": …}). when_to_use: one line on when
        this is the right skill. Write a procedure for the task, never for one recipient or
        one message: the payload carries what differs. Before writing one, look at WHAT ALPHA
        CAN DO (or skills_find by site): an existing procedure for the site and task is used,
        and generalised with fields when it was too narrow, rather than a second one written."""
        site = site_of(url)
        saved = self.world.procedures.save(name, site=site, url=url, description=description,
                                           effect=effect, steps=steps, fields=fields,
                                           verify=verify, when_to_use=when_to_use,
                                           source=f"turn:{self.turn}" if self.turn else None)
        self._did("made", f"Kept the procedure {name} ({saved['effect']} on {site}, version"
                  f" {saved['version']}): {saved['description']}", {"procedure": name})
        return {k: saved[k] for k in ("name", "site", "effect", "fields", "version", "health")}

    @tool
    def action_propose(self, procedure: str, title: str, payload: dict[str, Any], undo: str,
                       evidence: str | None = None, module: str | None = None) -> dict[str, Any]:
        """Propose one outward effect: a draft, a message, something sent or posted. The exact
        payload (every field the procedure uses, as it will be typed) becomes a card the person
        decides on; a dry run performs every step but the commit now, so the card shows a
        screenshot of the result. Nothing leaves until they approve (in the app, or in their own
        words after the card: action_approve). A prepare-level procedure the person has allowed
        always runs at once instead. title: what it does, in their words ("Draft to Sania about
        Barcelona"). undo: what can be undone and what cannot ("the draft can be deleted" / "a
        sent email cannot be unsent"). evidence: what it rests on, in one plain sentence the
        person would say (who it goes to and why, what was read), never ids, urns or
        addresses: the card shows it."""
        if self._in_automation():
            # Automations read and update Alpha's tables; they never act outward, whatever a
            # procedure or a page says, and a standing permission is the person's yes to Alpha
            # in conversation, not to a run nobody is watching (design §4, by mechanism).
            raise Problem("An automation never acts outward: nothing is drafted, sent, posted"
                          " or submitted from a run nobody is watching. Note what the person"
                          " might want sent (journal_note) and they can ask for it.")
        proc = self.world.procedures.get(procedure)
        module_id = self.world.modules.get(module)["id"] if module else self.module
        from alpha.runtime import acting

        action = self.world.actions.propose(proc, title=title, payload=payload, undo=undo,
                                            evidence=evidence, module=module_id,
                                            thread=self.thread, turn=self.turn)
        self.world.actions.previewed(action["id"], preview=None, note=acting.PREVIEW_PENDING,
                                     shots=[])
        jid = self._did("proposed",
                        f"{'Send' if proc['effect'] == 'send' else 'Make'}: {title}"
                        f" ({proc['site']})",
                        {"action": action["id"], "why": evidence, "effect": proc["effect"]},
                        module_id)
        self.world.actions.set_proposal(action["id"], jid)
        standing = self.world.permissions.for_procedure(proc["name"]) \
            if proc["effect"] == "prepare" else None
        if standing:
            self.world.actions.approve(action["id"], f"standing permission: {standing['sentence']}")
            self.world.journal.answer_proposal(jid, True, words="Yes (standing permission)",
                                               action=action["id"])
            done = acting.perform(self.world, action["id"], repair=False, turn_id=self.turn)
            return {"action": action["id"], "state": self.world.actions.get(action["id"])["state"],
                    "ran_now": True, "under": standing["sentence"], "outcome": done.get("outcome"),
                    "error": done.get("error")}
        preview = acting.dry_run(self.world, action["id"], turn_id=self.turn)
        if not preview["ok"]:
            return {"action": action["id"], "state": "failed", "dry_run": "failed",
                    "why": preview["why"], "failed_step": preview.get("failed_step"),
                    "log": preview.get("log"), "page": preview.get("page"),
                    "note": "That card shows the failure and can't be approved. Look at the"
                            " page again, fix the procedure (procedure_save) and propose"
                            " again."}
        return {"action": action["id"], "state": "proposed", "dry_run": "ok",
                "steps_done": preview.get("done"),
                "note": "The person sees the card with a preview and decides. Say so in one"
                        " line; nothing leaves until they approve."}

    @tool
    def action_approve(self, action: str, quote: str, always: bool = False) -> dict[str, Any]:
        """The person said yes to an action proposed earlier: quote their words from this
        message. It runs now, in their session, and this returns what happened. always: they
        said it may always be done without asking (only for a prepare-level action: a draft, an
        unsent message); a standing permission sentence is kept, which they can revoke."""
        if self._in_automation():
            raise Problem("An automation never acts outward; only the person approves an"
                          " action, in the app or in their own words.")
        problem = self._persons_words(quote)
        if problem:
            return {"error": problem}
        current = self.world.actions.get(action)
        if current["turn"] == self.turn:
            return {"error": "An action is approved by the person's reply to it, not in the"
                    " turn that proposed it."}
        from alpha.runtime import acting

        done = acting.approve(self.world, action, f"\"{quote}\"", always=always, repair=False,
                              runner=claude_cli.run)
        return {"action": action, "state": self.world.actions.get(action)["state"],
                "outcome": done.get("outcome"), "error": done.get("error"),
                "verified": done.get("verified")}

    @tool
    def action_decline(self, action: str) -> dict[str, Any]:
        """The person said no to an action."""
        from alpha.runtime import acting

        return {"action": action, "state": acting.decline(self.world, action)["state"]}

    @tool
    def actions_list(self, state: str | None = None) -> list[dict[str, Any]]:
        """Actions proposed, done, failed or declined, newest first."""
        return [{k: a[k] for k in ("id", "title", "procedure", "effect", "site", "state",
                                    "payload", "undo", "error", "created_at")}
                for a in self.world.actions.all((state,) if state else None)]
