"""What every tool shares: the decorator that turns a method into a tool the model may call
(problems come back as plain words), provenance words for records, and the base class bound to
one World with the gates every group of tools checks in code. Tools that read private or
third-party material taint the run (`alpha.world.taint`); after that, pages open only on sites
the run already knows. The conversation's access mode may hold a call for the person's yes
(`alpha.world.access`)."""

from __future__ import annotations

import functools
import logging
import os
import re
from collections.abc import Callable
from typing import Any, cast

from alpha.connectors.base import Connections
from alpha.connectors.browser import signin_sites
from alpha.world import access, taint
from alpha.world.sites import site_of
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


def counts_and_ids(result: dict[str, Any]) -> dict[str, Any]:
    """An upsert's counts for the journal, plus the ids it touched (capped) so a check or a
    trial can find the rows a turn wrote in bulk."""
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


def tool[F: Callable[..., Any]](fn: F) -> F:
    @functools.wraps(fn)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        try:
            # The conversation's access mode may make this call wait for the person's yes.
            held = access.hold(args[0], fn, args[1:], kwargs) if args else None
            return held if held is not None else fn(*args, **kwargs)
        except Problem as e:
            return {"error": str(e)}
        except Exception as e:  # a bug of ours: say so plainly, keep the details in the log
            log.exception("tool %s failed", fn.__name__)
            return {"error": f"Alpha hit an internal problem in {fn.__name__}: {e}"}
        finally:
            # Whatever it returned (or half-returned) is now in the model's context.
            if fn.__name__ in taint.READS and args:
                args[0]._taint(taint.READS[fn.__name__])

    wrapper.is_tool = True  # type: ignore[attr-defined]
    return cast(F, wrapper)



class Base:
    # True only for the one call the person approved (alpha.world.access.enable).
    approved = False

    def __init__(
        self,
        world: World,
        *,
        turn: str | None = None,
        thread: str | None = None,
        module: str | None = None,
    ) -> None:
        self.world = world
        self.turn = turn if turn is not None else os.environ.get("ALPHA_TURN") or None
        self.thread = thread if thread is not None else os.environ.get("ALPHA_THREAD") or None
        self.module = module if module is not None else os.environ.get("ALPHA_MODULE") or None
        self._tainted: str | None = None
        self._sites: set[str] = set()

    def all(self) -> list[Callable[..., Any]]:
        return [
            getattr(self, name)
            for name in dir(self)
            if not name.startswith("_") and getattr(getattr(self, name), "is_tool", False)
        ]

    def _taint(self, why: str) -> None:
        if self._tainted is None:
            self._tainted = why
            taint.mark(self.world.store, self.turn, self.thread, why)

    def _taint_reason(self) -> str | None:
        return self._tainted or taint.reason(self.world.store, self.turn, self.thread)

    def _page_read(self, out: dict[str, Any]) -> dict[str, Any]:
        if out.get("signed_in"):
            self._taint(taint.SIGNED_IN_PAGE)
        return out

    def _known_sites(self) -> set[str]:
        """Sites a tainted run may still open: those it read, those signed in to in Alpha's
        browser, and those named in the turn's own words."""
        known = set(self._sites)
        for conn in Connections(self.world.store).all("browser"):
            if conn["status"] == "connected":
                known.update(signin_sites(conn))
        if self.turn:
            try:
                words = self.world.journal.read(self.turn)["text"]
            except Problem:
                words = ""
            for host in re.findall(r"(?i)\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b", words):
                try:
                    known.add(site_of(host))
                except Problem:
                    continue
        return known

    def _open(self, url: str) -> None:
        """Before any page opens: once the run is tainted, a new site could be where private
        material is carried off (in the address), so only known sites open."""
        site = site_of(url)
        why = self._taint_reason()
        if why and site not in self._known_sites():
            raise Problem(f"Alpha won't open {site} in this run: it already {why}, and a new "
                          "site could carry that out. Read it in a new message first.")
        self._sites.add(site)

    def _did(self, kind: str, text: str, data: dict[str, Any], module: str | None = None) -> str:
        return self.world.journal.append(
            kind, text, data={**data, "turn": self.turn}, module=module or self.module,
            thread=self.thread,
        )

    def _in_automation(self) -> bool:
        if not self.thread:
            return False
        return self.world.store.one(
            "SELECT 1 FROM automations WHERE thread = ?", (self.thread,)) is not None

    def _building(self) -> dict[str, Any] | None:
        """The approved plan this turn is building, if it is one."""
        plan = self.world.plans.of_thread(self.thread)
        return plan if plan and plan["state"] == "building" else None

    def _approved_creation(self) -> bool:
        """A project being made on its page, after the person pressed Build there (the server
        records it; the model can't)."""
        making = self.world.modules.making(self.thread)
        return bool(making and (making["creation"] or {}).get("approved_at"))

    def _gate(self, what: str) -> dict[str, Any] | None:
        """Lasting things are made only in the build of a plan the person said yes to."""
        if self._building() or self._approved_creation():
            return None
        return {"error": f"{what} happens only in the build of a plan the person approved."
                " Understand what they want, look into it, and propose it with plan_propose;"
                " the build starts after their yes. For a plain log with nowhere to keep it,"
                " use table_start."}

    def _module_of(self, collection: str) -> str | None:
        module: str | None = self.world.collections.describe(collection)["module"]
        return module

    def _provenance(self, source: str, assumed: str | None) -> dict[str, Any]:
        return provenance_of(source, assumed, turn=self.turn)

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
