"""The world as tools for the model.

Each tool is a plain method on `Tools`, bound to one World, so it can be tested without a model
or a server. Docstrings are what the model reads; they say when to use the tool, not how it is
built. Problems come back as `{"error": "..."}` in plain words so the model can correct itself.
Every change Alpha makes is journaled, and records carry the journal entry that made them, so
Activity can show what was done, because of which turn, and undo it later.

The tools are grouped by what they touch, one module each (`finding`, `tables`, `knowledge`,
`modules`, `reading`, `automating`, `acting`, `planning`); `Tools` is all of them on one World,
and `all()` lists them in name order for the MCP server. `base` holds what they share.
"""

from __future__ import annotations

from alpha.mcp.tools.acting import Acting
from alpha.mcp.tools.automating import Automating
from alpha.mcp.tools.base import (
    ALPHA_SETS,
    Base,
    counts_and_ids,
    log,
    provenance_of,
    provenance_words,
    tool,
)
from alpha.mcp.tools.finding import Finding
from alpha.mcp.tools.knowledge import Knowledge
from alpha.mcp.tools.modules import Modules
from alpha.mcp.tools.planning import Planning
from alpha.mcp.tools.reading import Reading
from alpha.mcp.tools.tables import Tables


class Tools(Finding, Tables, Knowledge, Modules, Reading, Automating, Acting, Planning):
    """Every tool of the world, bound to one World (and the turn, thread and module it runs
    in)."""


__all__ = ["ALPHA_SETS", "Base", "Tools", "counts_and_ids", "log", "provenance_of",
           "provenance_words", "tool"]
