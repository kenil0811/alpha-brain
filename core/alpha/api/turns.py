"""Turns run in the background; the window polls for the answer."""

from __future__ import annotations

import logging
import secrets
import threading
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

from alpha.api.bodies import AskBody
from alpha.api.views import conversation_view
from alpha.runtime import claude_cli, conversations
from alpha.runtime import turn as turns
from alpha.runtime.agents import runner as agent_runner
from alpha.world.store import Problem
from alpha.world.world import World

log = logging.getLogger("alpha.api")


class Turns:
    """Turns run in the background; the window polls for the answer."""

    def __init__(self, world: World, runner: turns.Runner | None = None,
                 after: Callable[[], None] | None = None) -> None:
        self.world = world
        self.runner = runner
        # What a turn starts at once (the scheduler's kick): a workflow agreed in it, a row
        # that arrived, and the agents whose kinds look at what it left in the journal (Watson
        # notices, Columbo checks the reply's numbers; Q50, Q46, Q47).
        self.after = after
        self.state: dict[str, dict[str, Any]] = {}
        self.lock = threading.Lock()

    def start(self, body: AskBody, *, actor: str = "person",
              journal_as: str | None = None) -> dict[str, Any]:
        # Where this turn lives. A build or agent thread stays as given; a person's turn
        # with no conversation goes to the scope's live conversation (the panel on a page) or
        # is routed (the companion), which may come back as a question instead of a turn.
        conversation: str | None = None
        routing = False
        if body.conversation:
            conversation = self.world.modules.thread(body.conversation)["id"]
        elif body.thread:
            kind = self.world.modules.thread(body.thread)["kind"]
            conversation = body.thread if kind == "chat" else None
        elif actor == "person" and body.module:
            conversation = conversations.ensure(self.world, body.text, body.module)["id"]
        elif actor == "person":
            # The companion's sentence: routed in the worker (the judge is a model run, and a
            # request never waits on one), so the turn comes back at once as "routing".
            routing = True
        key = secrets.token_hex(6)
        self._evict()
        with self.lock:
            self.state[key] = {"id": key, "state": "routing" if routing else "running",
                               "text": body.text,
                               "started_at": datetime.now(UTC).isoformat(),
                               "conversation": conversation_view(self.world, conversation)
                               if conversation else None}

        def work() -> None:
            def said(jid: str) -> None:
                with self.lock:
                    self.state[key]["said"] = jid

            nonlocal conversation
            try:
                if routing:
                    routed = conversations.route(self.world, body.text,
                                                 runner=self.runner if self.runner else None)
                    if "ask" in routed:
                        with self.lock:
                            self.state[key].update({"state": "asked", "ask": routed["ask"],
                                                    "options": routed["options"]})
                        return
                    conversation = routed["conversation"]
                    with self.lock:
                        self.state[key].update({
                            "state": "running",
                            "conversation": conversation_view(self.world, conversation)})
                thread = conversation or body.thread
                kwargs: dict[str, Any] = {"module": body.module, "thread": thread,
                                          "on_said": said, "actor": actor,
                                          "journal_as": journal_as,
                                          "conversation": bool(conversation)}
                if conversation:
                    self.world.modules.update_thread(conversation, state="working")
                if self.runner is not None:
                    kwargs["runner"] = self.runner
                # "@Name …" from the person: that agent answers, as itself, in this
                # conversation (Q44; by structure, the name exactly, never a guess).
                addressed = (self.world.agents.by_mention(body.text)
                             if actor == "person" else None)
                if addressed:
                    agent, rest = addressed
                    out = agent_runner.mention(
                        self.world, agent, body.text, rest=rest, thread=thread,
                        module=body.module, on_said=said,
                        **({"runner": self.runner} if self.runner else {}))
                else:
                    out = turns.ask(self.world, body.text, **kwargs)
                result = {"state": "done" if out.ok else "failed", "reply": out.reply,
                          "said": out.said, "replied": out.replied,
                          "duration_ms": out.result.duration_ms}
            except Problem as e:
                result = {"state": "failed", "reply": str(e)}
            except Exception:
                log.exception("turn failed")
                result = {"state": "failed", "reply": "Alpha hit a problem it couldn't recover"
                          " from; the details are in its log."}
            with self.lock:
                self.state[key].update(result)
            if conversation:
                try:
                    waiting = any(a["thread"] == conversation
                                  for a in self.world.journal.open_asks())
                    self.world.modules.update_thread(conversation,
                                                     state="waiting" if waiting else "open")
                except Exception:
                    log.exception("conversation state")
            if self.after is not None:
                # A workflow page agreed in this turn starts building now, not at the next tick.
                try:
                    self.after()
                except Exception:
                    log.exception("after the turn")

        threading.Thread(target=work, daemon=True, name=f"turn-{key}").start()
        return self.state[key]

    def _evict(self, keep_s: int = 3600) -> None:
        """Finished turns older than an hour leave the table; it never grows without end."""
        cutoff = (datetime.now(UTC) - timedelta(seconds=keep_s)).isoformat()
        with self.lock:
            gone = [k for k, v in self.state.items()
                    if v["state"] in ("done", "failed", "asked") and v["started_at"] < cutoff]
            for k in gone:
                del self.state[k]

    def get(self, key: str) -> dict[str, Any]:
        with self.lock:
            if key not in self.state:
                raise Problem(f"There is no turn {key}.")
            out = dict(self.state[key])
        said = out.get("said")
        out["steps"] = [
            {"at": e["at"], "kind": e["kind"], "text": e["text"]}
            for e in self.world.journal.recent(200)
            if said and e["data"].get("turn") == said and e["kind"] != "replied"
        ]
        out["live"] = claude_cli.LIVE.progress_for(said)
        return out

    def running(self) -> list[dict[str, Any]]:
        with self.lock:
            return [dict(v) for v in self.state.values()
                    if v["state"] in ("running", "routing")]

    def stop(self, key: str) -> dict[str, Any]:
        """Stop a turn that is still working; it ends with "You stopped it."."""
        with self.lock:
            if key not in self.state:
                raise Problem(f"There is no turn {key}.")
            said = self.state[key].get("said")
        if said:
            claude_cli.LIVE.stop(said)
        return self.get(key)
