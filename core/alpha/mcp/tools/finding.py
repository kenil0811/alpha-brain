"""Tools for finding things: search, the journal."""

from __future__ import annotations

from typing import Any

from alpha.connectors.files import Files
from alpha.mcp.tools.base import Base, tool
from alpha.world.store import Problem


class Finding(Base):
    @tool
    def search(self, query: str, limit: int = 10) -> dict[str, Any]:
        """Search everything Alpha has seen or done (conversations, actions, pages read, notes
        of what happened), every record in every table and every document it has read, by
        words. Use it before answering anything
        about the past, and before creating a table, to find what already exists."""
        return {
            "records": self.world.collections.search(query, limit),
            "documents": Files(self.world).search(query, limit),
            "journal": [
                {"id": e["id"], "at": e["at"], "kind": e["kind"], "snippet": e["snippet"],
                 "module": e["module"], **({"removed": e["removed"]} if "removed" in e else {})}
                for e in self.world.journal.mark_removed(self.world.journal.search(query, limit))
            ],
        }

    @tool
    def journal_recent(
        self, limit: int = 20, module: str | None = None, thread: str | None = None
    ) -> list[dict[str, Any]]:
        """The latest entries of the journal (what was said, done, seen), oldest first,
        optionally for one module or one thread."""
        return self.world.journal.mark_removed(
            self.world.journal.recent(limit, module=module, thread=thread))

    @tool
    def journal_read(self, id: str) -> dict[str, Any]:
        """One journal entry in full, by id (ids appear in search results and the pre-pack)."""
        return self.world.journal.mark_removed([self.world.journal.read(id)])[0]

    @tool
    def journal_note(self, kind: str, text: str, data: dict[str, Any] | None = None,
                     module: str | None = None) -> dict[str, Any]:
        """Record something Alpha did or noticed that no other tool records, in one plain
        sentence. kind: did | noticed | saw | failed."""
        if kind not in {"did", "noticed", "saw", "failed"}:
            raise Problem("journal_note takes kind did, noticed, saw or failed.")
        module_id = self.world.modules.get(module)["id"] if module else None
        return {"id": self._did(kind, text, data or {}, module_id)}
