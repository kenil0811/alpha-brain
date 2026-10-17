"""The world as tools for the model.

Each tool is a plain method on `Tools`, bound to one World, so it can be tested without a model
or a server. Docstrings are what the model reads; they say when to use the tool, not how it is
built. Problems come back as `{"error": "..."}` in plain words so the model can correct itself.
Every change Alpha makes is journaled, and records carry the journal entry that made them, so
Activity can show what was done, because of which turn, and undo it later.

The operations are grouped by what they touch, one module each (`finding`, `tables`,
`knowledge`, `modules`, `reading`, `agents`, `acting`, `workflows`); the model sees the hands
over them (`hands.py`, the harness design §4, since 17 Oct 2026) and the four workflow tools as
plan mode; `Tools` is all of them on one World, and `all()` lists what the model sees in name
order for the server. `base` holds what they share.
"""

from __future__ import annotations

from alpha.mcp import inprocess
from alpha.mcp.tools.base import provenance_of, provenance_words
from alpha.mcp.tools.hands import Hands


class Tools(Hands):
    """Every operation of the world, bound to one World (and the turn, thread, module and actor
    it runs for); the model sees the hands (`all()`), the code calls what it needs."""


# The SDK engine serves these tools in-process to every turn it runs (harness slice 1).
inprocess.install(Tools)


__all__ = ["Tools", "provenance_of", "provenance_words"]
