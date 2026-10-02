"""The journal: the verbatim record of everything that happened, and the source of truth.

Every turn (what the person said, what Alpha replied), every source item as received, every
action Alpha took and every notice or proposal is one row. Rows are never removed; forgetting
one is a tombstone that blanks its text and data, so search and the model no longer see it.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from alpha.world.store import Problem, Store, dumps, fts_query, loads, new_id, now

KINDS = {
    "said",
    "replied",
    "did",
    "saw",
    "noticed",
    "asked",
    "answered",
    "proposed",
    "made",
    "changed",
    "failed",
    # Alpha's answer compared with an independent one (web search, no Alpha tools)
    "checked",
}


def entry(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "at": row["at"],
        "kind": row["kind"],
        "actor": row["actor"],
        "text": row["text"],
        "data": loads(row["data"], {}),
        "module": row["module"],
        "thread": row["thread"],
        "entity_ids": loads(row["entity_ids"], []),
        "source": row["source"],
    }


class Journal:
    def __init__(self, store: Store) -> None:
        self.store = store

    def append(
        self,
        kind: str,
        text: str,
        *,
        actor: str = "alpha",
        data: dict[str, Any] | None = None,
        module: str | None = None,
        thread: str | None = None,
        entity_ids: list[str] | None = None,
        source: str | None = None,
    ) -> str:
        if kind not in KINDS:
            raise Problem(f"'{kind}' is not a kind of journal entry; use one of {sorted(KINDS)}.")
        jid = new_id("j")
        with self.store.tx() as db:
            db.execute(
                "INSERT INTO journal (id, at, kind, actor, text, data, module, thread, entity_ids,"
                " source) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (
                    jid,
                    now(),
                    kind,
                    actor,
                    text,
                    dumps(data or {}),
                    module,
                    thread,
                    dumps(entity_ids or []),
                    source,
                ),
            )
        return jid

    def read(self, jid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM journal WHERE id = ? AND deleted_at IS NULL", (jid,))
        if row is None:
            raise Problem(f"There is no journal entry {jid}.")
        return entry(row)

    def recent(
        self,
        limit: int = 20,
        *,
        module: str | None = None,
        thread: str | None = None,
        stream: bool = False,
        kinds: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        """Newest last. `stream=True` keeps only turns outside any thread."""
        where = ["deleted_at IS NULL"]
        args: list[Any] = []
        if module is not None:
            where.append("module = ?")
            args.append(module)
        if thread is not None:
            where.append("thread = ?")
            args.append(thread)
        if stream:
            where.append("thread IS NULL")
        if kinds:
            where.append(f"kind IN ({','.join('?' * len(kinds))})")
            args.extend(kinds)
        rows = self.store.all(
            f"SELECT * FROM journal WHERE {' AND '.join(where)} ORDER BY at DESC, rowid DESC"
            " LIMIT ?",
            (*args, max(1, min(limit, 500))),
        )
        return [entry(r) for r in reversed(rows)]

    def search(self, text: str, limit: int = 10) -> list[dict[str, Any]]:
        """Full-text search over what happened, most relevant first, recent as tie-break."""
        query = fts_query(text)
        if query is None:
            return []
        rows = self.store.all(
            "SELECT j.*, snippet(journal_fts, 0, '[', ']', '…', 12) AS snip"
            " FROM journal_fts JOIN journal j ON j.rowid = journal_fts.rowid"
            " WHERE journal_fts MATCH ? AND j.deleted_at IS NULL"
            " ORDER BY bm25(journal_fts), j.at DESC LIMIT ?",
            (query, max(1, min(limit, 100))),
        )
        out = []
        for r in rows:
            e = entry(r)
            e["snippet"] = r["snip"]
            out.append(e)
        return out

    def forget(self, jid: str) -> None:
        """Tombstone: the row stays (so nothing that points to it breaks) but says nothing."""
        with self.store.tx() as db:
            cur = db.execute(
                "UPDATE journal SET text = '', data = '{}', deleted_at = ?"
                " WHERE id = ? AND deleted_at IS NULL",
                (now(), jid),
            )
            if cur.rowcount == 0:
                raise Problem(f"There is no journal entry {jid} to forget.")

    def open_asks(self) -> list[dict[str, Any]]:
        """Questions Alpha asked the person that have no answer yet."""
        rows = self.store.all(
            "SELECT * FROM journal a WHERE a.kind = 'asked' AND a.deleted_at IS NULL"
            " AND NOT EXISTS (SELECT 1 FROM journal b WHERE b.kind = 'answered'"
            " AND json_extract(b.data, '$.ask') = a.id) ORDER BY a.at"
        )
        return [entry(r) for r in rows]

    def keep_context(self, turn: str, context: str, rules: str) -> None:
        """What the model was given for a turn: the pre-pack, and which rules (by hash)."""
        with self.store.tx() as db:
            db.execute("INSERT OR REPLACE INTO turn_contexts (turn, at, context, rules)"
                       " VALUES (?,?,?,?)", (turn, now(), context, rules))

    def context(self, turn: str) -> dict[str, Any] | None:
        row = self.store.one("SELECT * FROM turn_contexts WHERE turn = ?", (turn,))
        return {k: row[k] for k in row.keys()} if row else None

    def removals(self) -> dict[str, str]:
        """Everything the person removed (modules, connections, their threads, automations and
        readers), by id or name, with a few words saying when."""
        gone: dict[str, str] = {}
        for r in self.store.all(
            "SELECT at, data FROM journal WHERE kind = 'changed'"
            " AND json_extract(data, '$.removed') IS NOT NULL"
        ):
            removed = loads(r["data"], {})["removed"]
            words = f"{removed['name']} was removed on {r['at'][:10]}"
            for key in [removed["id"], *removed.get("threads", []),
                        *removed.get("automations", []), *removed.get("readers", [])]:
                gone[key] = words
        return gone

    def mark_removed(self, entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
        """History stays, but an entry about something since removed says so (`removed`), so
        it is never read as something that still exists."""
        gone = self.removals()
        if not gone:
            return entries
        for e in entries:
            data = e.get("data") or {}
            if data.get("removed"):
                continue
            for key in (e.get("module"), e.get("thread"), data.get("connection"),
                        data.get("automation"), data.get("reader")):
                if key and key in gone:
                    e["removed"] = gone[key]
                    break
        return entries

    def close_ask(self, ask_id: str, words: str, *, actor: str = "person",
                  closed: str = "dismissed") -> str:
        """Close a question without answering it: the person dismissed it, or Alpha no longer
        needs it (`closed` says which)."""
        asked = self.read(ask_id)
        return self.append("answered", words, actor=actor, data={"ask": ask_id, "closed": closed},
                           module=asked["module"], thread=asked["thread"])

    def close_asks_about(self, connection: str, words: str, closed: str) -> int:
        """Close the open questions a connection asked (a sign-in that is done or asked again)."""
        open_ones = [a for a in self.open_asks() if a["data"].get("connection") == connection]
        for a in open_ones:
            self.close_ask(a["id"], words, actor="alpha", closed=closed)
        return len(open_ones)
