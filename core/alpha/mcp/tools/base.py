"""What every tool shares: the decorator that turns a method into a tool the model may call
(problems come back as plain words), provenance words for records, and the base class bound to
one World with the gates every group of tools checks in code."""

from __future__ import annotations

import functools
import inspect
import logging
import os
from collections.abc import Callable
from typing import Any, Protocol, cast, overload

from alpha.world.journal import RUN
from alpha.world.store import Problem
from alpha.world.world import World

log = logging.getLogger("alpha.tools")
# Source statuses Alpha may set; working and broken come from the reader's runs.
ALPHA_SETS = ("not_built", "needs_signin", "blocked", "unavailable", "skipped")


def provenance_of(source: str, assumed: str | None, *, turn: str | None) -> dict[str, Any]:
    """What a record's values rest on. `source` is "stated" (the person gave them), "estimated"
    (worked out with nothing to read) or where they were looked up (a URL or a few words naming
    the page); `assumed` is what had to be assumed because it was unknown. Kept on the record so
    the table can show which numbers are known and which are guesses."""
    src = " ".join((source or "estimated").split()) or "estimated"
    kind = src.lower()
    prov: dict[str, Any] = {"by": "alpha", "turn": turn}
    if kind == "stated":
        prov["source"] = "stated"
        prov["estimated"] = False
    elif kind in ("estimated", "estimate", "guess", "guessed"):
        prov["source"] = "estimated"
        prov["estimated"] = True
    else:
        prov["source"] = src
        prov["estimated"] = False
    if assumed and assumed.strip():
        prov["assumed"] = " ".join(assumed.split())
    return prov


def _table_named(fn: Callable[..., Any], args: tuple[Any, ...],
                 kwargs: dict[str, Any]) -> str | None:
    """The table a records tool is about: its `collection` or `table` argument (`name` for the
    collection_* tools), however it was passed."""
    try:
        bound = inspect.signature(fn).bind_partial(None, *args, **kwargs).arguments
    except TypeError:
        return None
    for key in ("collection", "table"):
        if isinstance(bound.get(key), str):
            return str(bound[key])
    if fn.__name__.startswith("collection_") and isinstance(bound.get("name"), str):
        return str(bound["name"])
    return None


def counts_and_ids(result: dict[str, Any]) -> dict[str, Any]:
    """An upsert's counts for the journal, plus the ids it touched (capped) so the second
    opinion (runtime/check.py) can find the rows a turn wrote in bulk."""
    out = {k: v for k, v in result.items() if k != "ids"}
    out["records"] = list(result.get("ids") or [])[:500]
    return out


def provenance_words(prov: dict[str, Any]) -> str:
    """The bracket after "Added X to Y": (estimated), (from the label on ocado.com), (assumed
    the 330 ml bottle), or nothing when the person stated it all."""
    parts: list[str] = []
    source = prov.get("source")
    if prov.get("estimated"):
        parts.append("estimated")
    elif source and source != "stated":
        parts.append(f"from {source}")
    if prov.get("assumed"):
        parts.append(f"assumed {prov['assumed']}")
    return f" ({'; '.join(parts)})" if parts else ""


# What a tool may change, one word each: an agent's write list names these (Q50), and the
# wrapper refuses a write outside the list before the tool runs. Reads carry none.
WRITES = ("records", "notes", "facts", "goals", "asks", "proposals", "instructions", "skills",
          "agents", "modules", "threads", "files", "workflows", "actions", "connections",
          "decisions", "tasks")


class _Decorator(Protocol):
    def __call__[F: Callable[..., Any]](self, fn: F, /) -> F: ...


@overload
def tool[F: Callable[..., Any]](fn: F, /) -> F: ...
@overload
def tool(*, writes: str | None = None, served: bool = False) -> _Decorator: ...
def tool(fn: Callable[..., Any] | None = None, *, writes: str | None = None,
         served: bool = False) -> Any:
    """Turn a method into an operation of the world with a tool's manners: `writes` names what
    it changes (one of WRITES); an agent whose write list lacks it is refused in plain words;
    problems come back as plain words; a bug of ours says so and keeps the details in the log.
    Since the harness (slice 2b, 17 Oct 2026) the model sees only the `served` ones, the hands
    of `mcp/hands.py` (`@hand`); the rest are the operations they call, kept with the same
    manners so the tests and the hands read their results alike."""
    if writes is not None and writes not in WRITES:
        raise ValueError(f"a tool writes one of {WRITES}, not {writes!r}")

    def decorate[F: Callable[..., Any]](fn: F) -> F:
        @functools.wraps(fn)
        def wrapper(self: Base, *args: Any, **kwargs: Any) -> Any:
            # a call an agent's run made: what it journals is that run's (P2)
            bound = RUN.set(self.run) if self.run and RUN.get() != self.run else None
            try:
                if writes is not None:
                    refused = self._refused(writes, fn, args, kwargs)
                    if refused:
                        return refused
                return fn(self, *args, **kwargs)
            except Problem as e:
                return {"error": str(e)}
            except Exception as e:  # a bug of ours: say so plainly, keep the details in the log
                log.exception("tool %s failed", fn.__name__)
                return {"error": f"Alpha hit an internal problem in {fn.__name__}: {e}"}
            finally:
                if bound is not None:
                    RUN.reset(bound)

        wrapper.is_tool = True  # type: ignore[attr-defined]
        wrapper.writes = writes  # type: ignore[attr-defined]
        wrapper.served = served  # type: ignore[attr-defined]
        return cast(F, wrapper)

    return decorate(fn) if fn is not None else decorate


@overload
def hand[F: Callable[..., Any]](fn: F, /) -> F: ...
@overload
def hand(*, writes: str | None = None) -> _Decorator: ...
def hand(fn: Callable[..., Any] | None = None, *, writes: str | None = None) -> Any:
    """A tool the model sees (the harness design §4): one of the hands."""
    if fn is not None:
        return tool(served=True)(fn)
    return tool(writes=writes, served=True)



class Base:
    def __init__(
        self,
        world: World,
        *,
        turn: str | None = None,
        thread: str | None = None,
        module: str | None = None,
        actor: str | None = None,
        run: str | None = None,
    ) -> None:
        self.world = world
        # the agent run these tools serve, if one (P2): every line they journal carries it
        self.run = run if run is not None else os.environ.get("ALPHA_RUN") or None
        self.turn = turn if turn is not None else os.environ.get("ALPHA_TURN") or None
        self.thread = thread if thread is not None else os.environ.get("ALPHA_THREAD") or None
        self.module = module if module is not None else os.environ.get("ALPHA_MODULE") or None
        # Who is using the tools: "alpha" (a turn, Alpha's own run) or an agent's id, whose
        # steps are journaled under its name and whose hands are cut to its write list (Q50).
        self.actor = (actor if actor is not None else os.environ.get("ALPHA_ACTOR")) or "alpha"
        self._agent_row: dict[str, Any] | None = None

    def all(self) -> list[Callable[..., Any]]:
        """The tools the model sees, in name order: the hands."""
        return [
            getattr(self, name)
            for name in dir(self)
            if not name.startswith("_") and getattr(getattr(self, name), "served", False)
        ]

    def operations(self) -> list[Callable[..., Any]]:
        """Every operation with a tool's manners, served or not."""
        return [
            getattr(self, name)
            for name in dir(self)
            if not name.startswith("_") and getattr(getattr(self, name), "is_tool", False)
        ]

    def _did(self, kind: str, text: str, data: dict[str, Any], module: str | None = None) -> str:
        return self.world.journal.append(
            kind, text, actor=self.actor, data={**data, "turn": self.turn},
            module=module or self.module, thread=self.thread,
        )

    def _agent(self) -> dict[str, Any] | None:
        """The agent using the tools, if the actor is one (read once per server)."""
        if self.actor in ("alpha", "person"):
            return None
        if self._agent_row is None:
            self._agent_row = self.world.agents.get(self.actor)
        return self._agent_row

    def _in_run(self) -> bool:
        """A run nobody is watching: an agent's own turn, or any turn in an agent's thread (a
        repair runs there as Alpha). The walls that hold there: never act outward, reading is
        the steps', no table from a first look."""
        if self.actor not in ("alpha", "person"):
            return True
        if not self.thread:
            return False
        return self.world.store.one(
            "SELECT 1 FROM agents WHERE thread = ?", (self.thread,)) is not None

    def _staging(self) -> dict[str, Any] | None:
        """The person's agent whose run is using the tools: what it brings in from outside
        waits for the person's yes (P3 item 5). None for Alpha and the built-in agents."""
        agent = self._agent()
        if agent is None or agent["kind"] != "custom" or not self._in_run():
            return None
        return agent

    def _stages(self, table: str) -> dict[str, Any] | None:
        """The agent, when its file stages this table (its `stage:` line)."""
        agent = self._staging()
        if agent is None or not agent.get("stage"):
            return None
        try:
            name = self.world.collections.describe(table)["name"]
        except Problem:
            return None  # no such table: the write says so itself
        return agent if name in agent["stage"] or table in agent["stage"] else None

    def _refused(self, writes: str, fn: Callable[..., Any], args: tuple[Any, ...],
                 kwargs: dict[str, Any]) -> dict[str, Any] | None:
        """Why an agent may not make this write, in plain words, or None. Its write list is
        the wall; its records writes stay inside its own module's tables."""
        agent = self._agent()
        if agent is None:
            return None
        if writes not in agent["may"]:
            allowed = ", ".join(agent["may"]) or "nothing"
            return {"error": f"{agent['name']} may not change {writes}; it may change"
                    f" {allowed}. Say what the person could ask Alpha for instead."}
        if writes == "records" and agent.get("module"):
            table = _table_named(fn, args, kwargs)
            if table and not self._in_scope(table, agent["module"]):
                return {"error": f"{agent['name']} works inside its own module and may not"
                        f" change the table {table}."}
        return None

    def _in_scope(self, table: str, module: str) -> bool:
        try:
            owner = self.world.collections.describe(table).get("module")
        except Problem:
            return True  # no such table: the tool says so itself
        return owner is None or owner in self.world.modules.subtree(module)

    def _provenance(self, source: str, assumed: str | None) -> dict[str, Any]:
        prov = provenance_of(source, assumed, turn=self.turn)
        if self.actor not in ("alpha", "person"):
            prov["agent"] = self.actor  # an agent's run: what it makes is its own (Q91)
        return prov

    def _said_contains(self, quote: str) -> bool:
        """Whether a short reply ("continue", "go on") is in the person's message this turn."""
        said = self.world.journal.read(self.turn) if self.turn else None
        if not said or said["kind"] != "said" or said["actor"] != "person":
            return False
        return " ".join(quote.lower().split()) in " ".join(said["text"].lower().split())

    def _persons_words(self, quote: str) -> str | None:
        """None when `quote` is the person's own words in this turn; else why it isn't."""
        said = self.world.journal.read(self.turn) if self.turn else None
        if not said or said["kind"] != "said" or said["actor"] != "person":
            return "Only the person can change standing instructions, in their own message."
        squash = " ".join(quote.lower().split()).strip(" .!")
        whole = " ".join(said["text"].lower().split()).strip(" .!")
        if squash and squash == whole:
            # The whole message is the quote ("yes", "go ahead"): their words, however few
            # (3 Oct: a plain "yes" after a plan was refused three times for being short).
            return None
        if len(squash.split()) < 3 or squash not in whole:
            return ("quote must be the person's own words from this message (their whole"
                    " message, or at least three words of it, exactly as they said them).")
        return None
