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
from alpha.runtime import conversations, desk, running
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
        # Where this turn lives (section C, Q107): the desk, Home's session kept open, the one
        # voice. Two cases by structure stay: "@Name …" from the person reaches that agent in
        # its own item (as Q44), and a sentence for an agent's own thread stays its (A10).
        # Everything else is the desk's, with no routing before it.
        conversation: str | None = None
        addressed = self.world.agents.by_mention(body.text) if actor == "person" else None
        given = body.conversation or body.thread
        if given:
            row = self.world.modules.thread(str(given))
            if self.world.agents.of_thread(row["id"]) is not None:
                conversation = row["id"]
        if conversation is None and addressed and not given:
            conversation = self._agents_item(addressed[0])
            conversations.mentioned(self.world, body.text, conversation)
        else:
            addressed = None
        home = self.world.modules.home_thread()["id"]
        conversation = conversation or home
        key = secrets.token_hex(6)
        self._evict()
        with self.lock:
            self.state[key] = {"id": key, "state": "running",
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
                thread = conversation
                kwargs: dict[str, Any] = {"module": body.module, "thread": thread,
                                          "on_said": said, "actor": actor,
                                          "journal_as": journal_as, "conversation": True}
                if self.runner is not None:
                    kwargs["runner"] = self.runner
                elif conversation == home:
                    kwargs["runner"] = desk.of(self.world).run
                assert thread is not None
                # One turn at a time in a thread: a sentence typed into a busy item waits for
                # the running turn and is read after it (an addition, never a cut; §7).
                with self._lock_of(thread):
                    self.world.modules.update_thread(thread, state="working")
                    if addressed and not given:
                        # the agent answers in its own item, as itself (Q44)
                        agent, rest = addressed
                        out = agent_runner.mention(
                            self.world, agent, body.text, rest=rest, thread=thread,
                            module=body.module, on_said=said,
                            **({"runner": self.runner} if self.runner else {}))
                    else:
                        out = turns.ask(self.world, body.text, **kwargs)
                    conversations.settle(self.world, thread, ok=out.ok,
                                         stopped=out.result.stopped,
                                         last_line=conversations.first_line(out.reply)
                                         or out.reply[:200])
                result = {"state": "done" if out.ok else "failed", "reply": out.reply,
                          "said": out.said, "replied": out.replied,
                          "duration_ms": out.result.duration_ms}
            except Problem as e:
                result = {"state": "failed", "reply": str(e)}
                self._open_again(conversation, str(e))
            except Exception:
                log.exception("turn failed")
                result = {"state": "failed", "reply": "Alpha hit a problem it couldn't recover"
                          " from; the details are in its log."}
                self._open_again(conversation)
            with self.lock:
                self.state[key].update(result)
            if self.after is not None:
                # A workflow page agreed in this turn starts building now, not at the next tick.
                try:
                    self.after()
                except Exception:
                    log.exception("after the turn")

        threading.Thread(target=work, daemon=True, name=f"turn-{key}").start()
        return self.state[key]

    def _agents_item(self, agent: dict[str, Any]) -> str:
        """An agent's own work item (opened when it has none yet)."""
        if agent.get("thread"):
            return str(agent["thread"])
        thread = self.world.modules.open_thread(agent["name"], "work", agent.get("module"))
        self.world.agents.set_thread(agent["id"], thread["id"])
        return str(thread["id"])

    def _lock_of(self, thread: str) -> threading.RLock:
        return running.lock_of(thread)

    def _open_again(self, thread: str | None, why: str = "") -> None:
        """A turn that could not run: Home is open again; an item is stopped, saying why."""
        if not thread:
            return
        try:
            kind = self.world.modules.thread(thread)["kind"]
            if kind == "home":
                self.world.modules.update_thread(thread, state="open")
            else:
                self.world.modules.update_thread(thread, state="stopped",
                                                 last_line=why or "That didn't work.")
        except Exception:
            log.exception("thread state")

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
        out["live"] = running.LIVE.progress_for(said)
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
            running.LIVE.stop(said)
        return self.get(key)
