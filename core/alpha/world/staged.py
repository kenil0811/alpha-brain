"""Staged writes (P3 item 5 of `tasks-and-cards-proposal.md`, Q86, Q91; 19 Oct 2026): what an
agent's run brings in from outside waits for the person before it lands. That is rows for the
tables its file names under `stage:`, and every file it fetches. One card holds the batch; a
run that brings more of the same into the same place adds to it.

Yes lands it where the card says, with its source and the card in its provenance. Edit, then yes,
lands what the person ticked with their changes; a file may go to another module, kept a
document. No stores nothing, and a held file is deleted; the journal keeps that it was offered.
After the same agent's writes into the same place were said yes to unchanged a few times in a
row (`limits.toml`, staging.always_after), the card offers "Always": a standing permission for
that agent and that place, from which its writes land at once, as allowed."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import TYPE_CHECKING, Any

from alpha.config import settings
from alpha.world.store import Problem, dumps, loads, new_id, now

if TYPE_CHECKING:
    from alpha.world.world import World

HELD, LANDED, DROPPED = "held", "landed", "dropped"


def view(row: Any) -> dict[str, Any]:
    out = {k: row[k] for k in row.keys()}
    out["rows"] = loads(row["rows"], [])
    out["keep"] = loads(row["keep"], []) if row["keep"] else []
    out["landed"] = loads(row["landed"], None) if row["landed"] else None
    return out


class Staged:
    def __init__(self, world: World) -> None:
        self.world = world
        self.store = world.store

    # ---- holding ----

    def held_for(self, drafter: str, kind: str, target: str) -> dict[str, Any] | None:
        row = self.store.one("SELECT * FROM staged WHERE drafter = ? AND kind = ? AND target = ?"
                             " AND state = 'held' ORDER BY created_at DESC LIMIT 1",
                             (drafter, kind, target))
        return view(row) if row else None

    def hold_rows(self, *, table: str, rows: list[dict[str, Any]], source: str,
                  assumed: str | None, key: str | None, keep: list[str] | None, drafter: str,
                  run: str | None, module: str | None, thread: str | None,
                  turn: str | None,
                  fields: list[dict[str, Any]] | None = None) -> dict[str, Any]:
        """Rows for a staged table: added to the agent's held batch for it, or a new batch with
        its card; `fields`, each row's own sources per field (P5). Returns the batch."""
        title = self.world.collections.describe(table).get("title") or table
        new = [{"values": r, "source": source, "assumed": assumed,
                **({"fields": fields[i]} if fields and i < len(fields) and fields[i] else {})}
               for i, r in enumerate(rows)]
        held = self.held_for(drafter, "rows", table)
        if held is not None:
            batch = held["rows"] + new
            with self.store.tx() as db:
                db.execute("UPDATE staged SET rows = ? WHERE id = ?", (dumps(batch), held["id"]))
                db.execute("UPDATE cards SET text = ? WHERE id = ?",
                           (self._rows_words(len(batch), title), held["card"]))
            return self.get(held["id"])
        sid = new_id("stg")
        with self.store.tx() as db:
            db.execute(
                "INSERT INTO staged (id, kind, target, rows, upsert_key, keep, drafter, run,"
                " module, thread, turn, state, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (sid, "rows", table, dumps(new), key, dumps(keep or []), drafter, run, module,
                 thread, turn, HELD, now()))
        card = self.world.journal.append(
            "proposed", self._rows_words(len(new), title), actor=drafter,
            data={"staged": sid, "why": f"from {source}" if source else None, "turn": turn},
            module=module, thread=thread)
        with self.store.tx() as db:
            db.execute("UPDATE staged SET card = ? WHERE id = ?", (card, sid))
        return self.get(sid)

    def hold_file(self, *, path: Path, held: Path, origin: str, module: str | None,
                  drafter: str, run: str | None, thread: str | None,
                  turn: str | None, duplicate_of: dict[str, Any] | None = None) -> dict[str, Any]:
        """A file a run fetched: moved aside into `held` (a folder of its own, out of the
        module's files) until the yes."""
        sid = new_id("stg")
        folder = held / sid
        folder.mkdir(parents=True, exist_ok=True)
        dest = folder / path.name
        shutil.move(str(path), dest)
        place = self.world.modules.get(module)["name"] if module else "your files"
        with self.store.tx() as db:
            db.execute(
                "INSERT INTO staged (id, kind, target, path, name, size, origin, drafter, run,"
                " module, thread, turn, state, created_at, duplicate_of)"
                " VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (sid, "file", module or "", str(dest), path.name, dest.stat().st_size, origin,
                 drafter, run, module, thread, turn, HELD, now(),
                 duplicate_of["id"] if duplicate_of else None))
        twin = f": you have this already ({duplicate_of['title']})" if duplicate_of else ""
        card = self.world.journal.append(
            "proposed", f"File \"{path.name}\" into {place}{twin}", actor=drafter,
            data={"staged": sid, "why": f"fetched from {origin}", "turn": turn},
            module=module, thread=thread)
        with self.store.tx() as db:
            db.execute("UPDATE staged SET card = ? WHERE id = ?", (card, sid))
        return self.get(sid)

    @staticmethod
    def _rows_words(n: int, title: str) -> str:
        return f"Add {n} row{'s' if n != 1 else ''} to {title}"

    # ---- reading ----

    def get(self, sid: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM staged WHERE id = ?", (sid,))
        if row is None:
            raise Problem(f"There is nothing staged as {sid}.")
        return view(row)

    def unchanged_yeses(self, drafter: str, kind: str, target: str) -> int:
        """How many of the agent's writes into this place in a row were said yes to unchanged:
        a No or an edit starts the count again."""
        n = 0
        for r in self.store.all(
                "SELECT c.state FROM staged s JOIN cards c ON c.id = s.card WHERE s.drafter = ?"
                " AND s.kind = ? AND s.target = ? AND s.state != 'held' ORDER BY s.decided_at"
                " DESC", (drafter, kind, target)):
            if r["state"] != "yes":
                break
            n += 1
        return n

    def offers_always(self, sid: str) -> bool:
        """The card offers "Always" when the agent's last writes into this place were said yes
        to unchanged often enough in a row (a named judgement in limits.toml)."""
        s = self.get(sid)
        if self.world.permissions.for_staging(s["drafter"], s["target"]):
            return False
        return (self.unchanged_yeses(s["drafter"], s["kind"], s["target"])
                >= settings.staging.always_after)

    # ---- deciding ----

    def land_rows(self, sid: str, *, ticks: list[int] | None = None,
                  edits: dict[int, dict[str, Any]] | None = None) -> dict[str, Any]:
        """The yes to rows: what was ticked (all when none said), with the person's changes,
        lands in its table with its source and the card in its provenance; the table's own
        rules check it. Returns the batch with the rows it became."""
        s = self._held(sid)
        chosen = [i for i in range(len(s["rows"])) if ticks is None or i in ticks]
        made: list[str] = []
        for i in chosen:
            row = s["rows"][i]
            changed = {k: v for k, v in ((edits or {}).get(i) or {}).items()
                       if row["values"].get(k) != v}
            values = {**row["values"], **changed}
            # what the person changed on the card is theirs (P5); the rest keeps its source
            fields = {**{k: e for k, e in (row.get("fields") or {}).items() if k not in changed},
                      **{k: {"kind": "stated", "source": "you", "fetched_at": now()}
                         for k in changed}}
            prov = {"source": row.get("source") or "stated", "card": s["card"],
                    "agent": s["drafter"], "staged": sid,
                    **({"assumed": row["assumed"]} if row.get("assumed") else {}),
                    **({"fields": fields} if fields else {})}
            if s.get("upsert_key") and values.get(s["upsert_key"]) is not None:
                out = self.world.collections.upsert(s["target"], s["upsert_key"], [values],
                                                    prov, fill_only=set(s["keep"]))
                made.extend(str(x.get("id") if isinstance(x, dict) else x)
                            for x in (out.get("ids") or []))
            else:
                made.append(str(self.world.collections.add(s["target"], values, prov)["id"]))
        return self.mark_landed(sid, made)

    def mark_landed(self, sid: str, landed: Any) -> dict[str, Any]:
        """What a yes made of the batch (a file: the document the caller kept it as)."""
        self._held(sid)
        with self.store.tx() as db:
            db.execute("UPDATE staged SET state = ?, landed = ?, decided_at = ? WHERE id = ?",
                       (LANDED, dumps(landed), now(), sid))
        return self.get(sid)

    def _held(self, sid: str) -> dict[str, Any]:
        s = self.get(sid)
        if s["state"] != HELD:
            raise Problem(f"That was decided already: it is {s['state']}.")
        return s

    def drop(self, sid: str) -> dict[str, Any]:
        """The No: nothing is stored, a held file is deleted; the journal keeps the offer."""
        s = self._held(sid)
        if s["kind"] == "file" and s.get("path"):
            shutil.rmtree(Path(s["path"]).parent, ignore_errors=True)
        with self.store.tx() as db:
            db.execute("UPDATE staged SET state = ?, rows = '[]', decided_at = ? WHERE id = ?",
                       (DROPPED, now(), sid))
        return self.get(sid)

    # ---- removal ----

    @staticmethod
    def remove_in(db: Any, *, drafter: str | None = None, module: str | None = None,
                  thread: str | None = None, tables: list[str] | None = None) -> int:
        """Inside a removal's transaction: what was held for what it removes goes, held files
        too (their cards are withdrawn by the cards' own removal)."""
        where, args = [], []
        for column, value in (("drafter", drafter), ("module", module), ("thread", thread)):
            if value:
                where.append(f"{column} = ?")
                args.append(value)
        if tables:
            where.append(f"(kind = 'rows' AND target IN ({','.join('?' * len(tables))}))")
            args.extend(tables)
        if not where:
            return 0
        clause = " OR ".join(where)
        for r in db.execute(f"SELECT path FROM staged WHERE state = 'held' AND kind = 'file'"
                            f" AND ({clause})", args).fetchall():
            if r["path"]:
                shutil.rmtree(Path(r["path"]).parent, ignore_errors=True)
        db.execute(f"UPDATE cards SET state = 'withdrawn', decided_at = ?, decided_by = 'alpha'"
                   f" WHERE state = 'waiting' AND id IN (SELECT card FROM staged WHERE"
                   f" state = 'held' AND ({clause}))", (now(), *args))
        return int(db.execute(f"DELETE FROM staged WHERE {clause}", args).rowcount)
