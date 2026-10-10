"""A program module's own tables (Q38), read-only, as the app's table views see them.

The module's build keeps the tables the person opens in `module.duckdb` in its workspace. The
core lists them beside the module's world tables under a qualified name, `<module id>:<table>`,
describes their columns as fields (kinds mapped from the column types) and reads their rows
with a stable id (the primary key column when there is one, else the row number). Nothing
here writes: the module's code owns its data; the person changes it through the module's
settings and the next run.
"""

from __future__ import annotations

import logging
from decimal import Decimal
from pathlib import Path
from typing import Any

from alpha.world.store import Problem

log = logging.getLogger("alpha.modtables")
MOST_ROWS = 5000
KINDS = {"VARCHAR": "text", "BOOLEAN": "bool", "DATE": "date", "TIMESTAMP": "date",
         "TIMESTAMP WITH TIME ZONE": "date", "JSON": "text"}


def is_qualified(name: str) -> bool:
    return ":" in name and not name.startswith(("http:", "https:"))


def split(name: str) -> tuple[str, str]:
    module, _, table = name.partition(":")
    if not module or not table:
        raise Problem(f"'{name}' is not a module's table.")
    return module, table


def _kind(duck_type: str) -> str:
    t = duck_type.upper()
    if t in KINDS:
        return KINDS[t]
    if any(k in t for k in ("INT", "DOUBLE", "FLOAT", "DECIMAL", "NUMERIC", "HUGEINT")):
        return "number"
    if t.startswith("GEOMETRY"):
        return "text"
    return "text"


class ModuleTables:
    def __init__(self, world: Any) -> None:
        self.world = world

    def _db(self, module_id: str) -> Path | None:
        module = self.world.modules.get(module_id)
        ws = module.get("workspace")
        if not ws:
            return None
        path = Path(ws) / "module.duckdb"
        return path if path.exists() else None

    def _connect(self, module_id: str) -> Any:
        path = self._db(module_id)
        if path is None:
            raise Problem("This module has no tables of its own yet.")
        import duckdb

        try:
            return duckdb.connect(str(path), read_only=True)
        except duckdb.Error as e:  # a build holds the lock: say so, never guess
            raise Problem("The module's tables are being written right now; try again in a"
                          f" moment ({str(e)[:80]}).") from e

    def overview(self, module_id: str) -> list[dict[str, Any]]:
        if self._db(module_id) is None:
            return []
        try:
            con = self._connect(module_id)
        except Problem:
            return []
        try:
            rows = con.execute(
                "SELECT table_name, estimated_size FROM duckdb_tables()"
                " WHERE NOT internal ORDER BY table_name").fetchall()
            out = []
            for name, size in rows:
                try:
                    n = int(con.execute(f'SELECT COUNT(*) FROM "{name}"').fetchone()[0])
                except Exception:
                    n = int(size or 0)
                out.append({"name": f"{module_id}:{name}", "title": _title(name),
                            "module": module_id, "records": n, "readonly": True})
            return out
        finally:
            con.close()

    def describe(self, qualified: str) -> dict[str, Any]:
        module_id, table = split(qualified)
        con = self._connect(module_id)
        try:
            cols = con.execute(
                "SELECT column_name, data_type FROM information_schema.columns"
                " WHERE table_name = ? ORDER BY ordinal_position", [table]).fetchall()
            if not cols:
                raise Problem(f"The module has no table '{table}'.")
            n = int(con.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0])
        finally:
            con.close()
        fields = [{"name": c, "kind": _kind(t), "label": _title(c)} for c, t in cols]
        title_field = next((f["name"] for f in fields if f["kind"] == "text"), None)
        return {"name": qualified, "title": _title(table), "module": module_id,
                "title_field": title_field, "fields": fields, "records": n, "readonly": True}

    def query(self, qualified: str, limit: int | None = None) -> list[dict[str, Any]]:
        module_id, table = split(qualified)
        desc = self.describe(qualified)
        key = next((f["name"] for f in desc["fields"] if f["name"].lower() in ("id", "key")),
                   None)
        con = self._connect(module_id)
        try:
            n = min(int(limit or MOST_ROWS), MOST_ROWS)
            cols = ", ".join(f'"{f["name"]}"' for f in desc["fields"])
            order = f'ORDER BY "{key}"' if key else ""
            rows = con.execute(f'SELECT {cols} FROM "{table}" {order} LIMIT {n}').fetchall()
        finally:
            con.close()
        out = []
        for i, row in enumerate(rows):
            values = {f["name"]: _plain(v) for f, v in zip(desc["fields"], row, strict=True)}
            rid = str(values[key]) if key and values.get(key) is not None else f"row-{i + 1}"
            out.append({**values, "id": rid, "revision": 0, "created_at": None,
                        "updated_at": None,
                        "_provenance": {"by": "module", "source": "module.duckdb"}})
        return out

    def get(self, qualified: str, rid: str) -> dict[str, Any]:
        for row in self.query(qualified):
            if row["id"] == rid:
                return row
        raise Problem(f"There is no row {rid} in {qualified}.")


def _title(name: str) -> str:
    return name.replace("_", " ").strip().capitalize()


def _plain(v: Any) -> Any:
    if v is None or isinstance(v, (int, float, str, bool)):
        return v
    if isinstance(v, Decimal):
        return float(v)
    return str(v)
