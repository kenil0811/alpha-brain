"""Entities: the people, organisations, places, documents, messages and calendar events that
recur across sources. They are the join keys of the world (the Priya on LinkedIn is the Priya who
emailed), so resolution is careful: hard keys (an email address, a LinkedIn URL, a phone number,
a file path, a calendar UID) merge with no model call; a name alone never merges, it is returned
as a "maybe" for the person or a later judgement to decide. A merge is undoable.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from alpha.world.store import Problem, Store, dumps, loads, new_id, now

KINDS = {"person", "organisation", "place", "document", "message", "event"}
KEYS = {"email", "linkedin", "phone", "url", "path", "uid", "domain"}


def _norm(key: str, value: str) -> str:
    value = value.strip()
    if key in {"email", "domain"}:
        return value.lower()
    if key in {"linkedin", "url"}:
        return value.lower().rstrip("/").removeprefix("https://").removeprefix("http://").removeprefix("www.")
    if key == "phone":
        return "".join(ch for ch in value if ch.isdigit() or ch == "+")
    return value


def _view(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "kind": row["kind"],
        "name": row["canonical"],
        "aliases": loads(row["aliases"], []),
        "keys": loads(row["keys"], {}),
        "merged_into": row["merged_into"],
        "source": row["source"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


class Entities:
    def __init__(self, store: Store) -> None:
        self.store = store

    def get(self, eid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM entities WHERE id = ?", (eid,))
        if row is None:
            raise Problem(f"There is no entity {eid}.")
        if row["merged_into"]:
            return self.get(row["merged_into"])
        return _view(row)

    def _by_keys(self, keys: dict[str, list[str]]) -> str | None:
        for key, values in keys.items():
            for value in values:
                row = self.store.one(
                    "SELECT entity_id FROM entity_keys WHERE key = ? AND value = ?", (key, value)
                )
                if row:
                    return str(self.get(row["entity_id"])["id"])
        return None

    @staticmethod
    def _clean_keys(keys: dict[str, Any] | None) -> dict[str, list[str]]:
        out: dict[str, list[str]] = {}
        for key, raw in (keys or {}).items():
            if key not in KEYS:
                raise Problem(f"'{key}' is not an identifying key; use one of {sorted(KEYS)}.")
            values = raw if isinstance(raw, list) else [raw]
            clean = [_norm(key, str(v)) for v in values if str(v).strip()]
            if clean:
                out[key] = clean
        return out

    def find(
        self,
        *,
        name: str | None = None,
        kind: str | None = None,
        keys: dict[str, Any] | None = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        clean = self._clean_keys(keys)
        if clean:
            hit = self._by_keys(clean)
            return [self.get(hit)] if hit else []
        where = ["merged_into IS NULL"]
        args: list[Any] = []
        if kind:
            where.append("kind = ?")
            args.append(kind)
        if name:
            where.append("(LOWER(canonical) LIKE ? OR LOWER(aliases) LIKE ?)")
            args.extend([f"%{name.lower()}%", f"%{name.lower()}%"])
        rows = self.store.all(
            f"SELECT * FROM entities WHERE {' AND '.join(where)} ORDER BY updated_at DESC LIMIT ?",
            (*args, limit),
        )
        return [_view(r) for r in rows]

    def resolve(
        self, kind: str, name: str, keys: dict[str, Any] | None = None,
        source: str | None = None,
    ) -> dict[str, Any]:
        """The entity these details identify: an existing one when a hard key matches (its keys
        and aliases grow), else a new one. Same-name entities without a shared key come back as
        `maybe`, never merged."""
        if kind not in KINDS:
            raise Problem(f"'{kind}' is not an entity kind; use one of {sorted(KINDS)}.")
        name = name.strip()
        if not name:
            raise Problem("An entity needs a name.")
        clean = self._clean_keys(keys)
        hit = self._by_keys(clean) if clean else None
        stamp = now()
        if hit:
            current = self.get(hit)
            merged_keys: dict[str, list[str]] = current["keys"]
            for key, values in clean.items():
                merged_keys[key] = sorted(set(merged_keys.get(key, [])) | set(values))
            aliases = current["aliases"]
            if name != current["name"] and name not in aliases:
                aliases.append(name)
            with self.store.tx() as db:
                db.execute(
                    "UPDATE entities SET keys = ?, aliases = ?, updated_at = ? WHERE id = ?",
                    (dumps(merged_keys), dumps(aliases), stamp, hit),
                )
                self._index(db, hit, clean)
            return {"entity": self.get(hit), "created": False, "maybe": []}
        maybe = [e for e in self.find(name=name, kind=kind) if e["name"].lower() == name.lower()]
        eid = new_id("e")
        with self.store.tx() as db:
            db.execute(
                "INSERT INTO entities (id, kind, canonical, keys, source, created_at,"
                " updated_at) VALUES (?,?,?,?,?,?,?)",
                (eid, kind, name, dumps(clean), source, stamp, stamp),
            )
            self._index(db, eid, clean)
        return {"entity": self.get(eid), "created": True, "maybe": maybe}

    @staticmethod
    def _index(db: sqlite3.Connection, eid: str, keys: dict[str, list[str]]) -> None:
        for key, values in keys.items():
            for value in values:
                db.execute(
                    "INSERT OR IGNORE INTO entity_keys (key, value, entity_id) VALUES (?,?,?)",
                    (key, value, eid),
                )

    def merge(self, keep: str, into_it: str) -> dict[str, Any]:
        """`into_it` becomes part of `keep`. Its keys point at `keep`; its row stays so the merge
        can be undone."""
        a, b = self.get(keep), self.get(into_it)
        if a["id"] == b["id"]:
            raise Problem("Those are already the same entity.")
        keys: dict[str, list[str]] = a["keys"]
        for key, values in b["keys"].items():
            keys[key] = sorted(set(keys.get(key, [])) | set(values))
        aliases = sorted(set(a["aliases"]) | set(b["aliases"]) | {b["name"]} - {a["name"]})
        stamp = now()
        with self.store.tx() as db:
            db.execute(
                "UPDATE entities SET keys = ?, aliases = ?, updated_at = ? WHERE id = ?",
                (dumps(keys), dumps(aliases), stamp, a["id"]),
            )
            db.execute(
                "UPDATE entities SET merged_into = ?, updated_at = ? WHERE id = ?",
                (a["id"], stamp, b["id"]),
            )
            db.execute(
                "UPDATE entity_keys SET entity_id = ? WHERE entity_id = ?", (a["id"], b["id"])
            )
        return self.get(a["id"])

    def unmerge(self, eid: str) -> dict[str, Any]:
        """Undo a merge: the entity stands alone again with the keys it had."""
        row = self.store.one("SELECT * FROM entities WHERE id = ?", (eid,))
        if row is None or not row["merged_into"]:
            raise Problem(f"{eid} is not merged into anything.")
        own = loads(row["keys"], {})
        stamp = now()
        with self.store.tx() as db:
            db.execute(
                "UPDATE entities SET merged_into = NULL, updated_at = ? WHERE id = ?", (stamp, eid)
            )
            for key, values in own.items():
                for value in values:
                    db.execute(
                        "UPDATE entity_keys SET entity_id = ? WHERE key = ? AND value = ?",
                        (eid, key, value),
                    )
        return self.get(eid)
