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
from alpha.runtime import check, claude_cli, conversations, noticing
from alpha.runtime import turn as turns
from alpha.world.store import Problem
from alpha.world.world import World

log = logging.getLogger("alpha.api")


class Turns:
    """Turns run in the background; the window polls for the answer."""

    def __init__(self, world: World, runner: turns.Runner | None = None,
                 after: Callable[[], None] | None = None, checks: bool = True) -> None:
        self.world = world
        self.runner = runner
        self.after = after
        # After a turn in which Alpha wrote values it worked out itself, an independent answer
        # checks them in the background and Alpha corrects itself in the conversation.
        self.checks = checks
        self.state: dict[str, dict[str, Any]] = {}
        self.lock = threading.Lock()

    def start(self, body: AskBody, *, actor: str = "person",
              journal_as: str | None = None) -> dict[str, Any]:
        # Where this turn lives. A build or automation thread stays as given; a person's turn
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
                # A plan approved in this turn starts building now, not at the next tick.
                try:
                    self.after()
                except Exception:
                    log.exception("after the turn")
            said_id = result.get("said")
            if self.checks and result["state"] == "done" and said_id:
                self.check(str(said_id))
                if actor == "person":
                    self.notice(str(said_id))

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

    def notice(self, said: str) -> None:
        """After a person's turn: what was said worth keeping, beside the verbatim (§3.7)."""
        if not noticing.worth_noticing(self.world, said):
            return

        def work() -> None:
            try:
                kwargs: dict[str, Any] = {}
                if self.runner is not None:
                    kwargs["runner"] = self.runner
                noticing.notice(self.world, said, **kwargs)
            except Exception:
                log.exception("noticing failed")

        threading.Thread(target=work, daemon=True, name=f"notice-{said}").start()

    def check(self, said: str) -> None:
        if not check.worth_checking(self.world, said):
            return

        def work() -> None:
            try:
                kwargs: dict[str, Any] = {}
                if self.runner is not None:
                    kwargs["runner"] = self.runner
                check.check(self.world, said, **kwargs)
            except Exception:
                log.exception("check failed")

        threading.Thread(target=work, daemon=True, name=f"check-{said}").start()

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
