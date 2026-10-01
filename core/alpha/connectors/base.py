"""Connectors: how Alpha reaches the outside world.

A connector is a directory under `connectors/<name>/` holding `connector.yaml` (the machine
contract: identity, transport, auth, tools with their effect, triggers) and `SKILL.md` (how the
agent should use it), plus any scripts. The Python side lives in `alpha.connectors.<name>`.

A *connection* is one use of a connector the person set up: a watched folder, a site they signed
into, their calendar. Connections are rows in the world, so Intelligence › Connections can show
each one as "connected / needs your OK / broken" with what it reaches.
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path
from typing import Any

import yaml

from alpha.world.store import Problem, Store, dumps, loads, new_id, now

STATUSES = {"connected", "needs_ok", "broken", "off"}


def connectors_dir() -> Path:
    configured = os.environ.get("ALPHA_CONNECTORS")
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[3] / "connectors"


def manifest(name: str) -> dict[str, Any]:
    path = connectors_dir() / name / "connector.yaml"
    if not path.exists():
        raise Problem(f"There is no connector '{name}'.")
    data: dict[str, Any] = yaml.safe_load(path.read_text())
    return data


def manifests() -> list[dict[str, Any]]:
    root = connectors_dir()
    if not root.exists():
        return []
    return [yaml.safe_load(p.read_text()) for p in sorted(root.glob("*/connector.yaml"))]


def skills_text() -> str:
    """How to use each connector (its SKILL.md without the front matter), for the model."""
    parts = []
    root = connectors_dir()
    for path in sorted(root.glob("*/SKILL.md")) if root.exists() else []:
        text = path.read_text()
        if text.startswith("---"):
            text = text.split("---", 2)[2]
        parts.append(text.strip())
    return "\n\n".join(parts)


def _row(row: sqlite3.Row) -> dict[str, Any]:
    out = {k: row[k] for k in row.keys()}
    out["config"] = loads(row["config"], {})
    return out


class Connections:
    def __init__(self, store: Store) -> None:
        self.store = store

    def upsert(
        self,
        connector: str,
        target: str,
        *,
        status: str = "connected",
        config: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if status not in STATUSES:
            raise Problem(f"A connection is {sorted(STATUSES)}; got '{status}'.")
        stamp = now()
        existing = self.store.one(
            "SELECT id FROM connections WHERE connector = ? AND target = ?", (connector, target)
        )
        with self.store.tx() as db:
            if existing:
                db.execute(
                    "UPDATE connections SET status = ?, config = ?, updated_at = ? WHERE id = ?",
                    (status, dumps(config or {}), stamp, existing["id"]),
                )
                cid = existing["id"]
            else:
                cid = new_id("c")
                db.execute(
                    "INSERT INTO connections (id, connector, target, status, config, created_at,"
                    " updated_at) VALUES (?,?,?,?,?,?,?)",
                    (cid, connector, target, status, dumps(config or {}), stamp, stamp),
                )
        return self.get(cid)

    def get(self, cid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM connections WHERE id = ?", (cid,))
        if row is None:
            raise Problem(f"There is no connection {cid}.")
        return _row(row)

    def find(self, connector: str, target: str) -> dict[str, Any] | None:
        row = self.store.one(
            "SELECT * FROM connections WHERE connector = ? AND target = ?", (connector, target)
        )
        return _row(row) if row else None

    def all(self, connector: str | None = None) -> list[dict[str, Any]]:
        if connector:
            rows = self.store.all(
                "SELECT * FROM connections WHERE connector = ? ORDER BY target", (connector,)
            )
        else:
            rows = self.store.all("SELECT * FROM connections ORDER BY connector, target")
        return [_row(r) for r in rows]

    def synced(self, cid: str, error: str | None = None) -> None:
        with self.store.tx() as db:
            db.execute(
                "UPDATE connections SET last_sync = ?, last_error = ?, status = ?, updated_at = ?"
                " WHERE id = ?",
                (now(), error, "broken" if error else "connected", now(), cid),
            )

    def remove(self, cid: str) -> None:
        with self.store.tx() as db:
            db.execute("UPDATE connections SET status = 'off', updated_at = ? WHERE id = ?",
                       (now(), cid))
