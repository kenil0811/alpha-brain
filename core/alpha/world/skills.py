"""Skills: the one unit of know-how Alpha writes for itself (design §3.7, point 7).

A skill is of one of three kinds, in one table:

- **read**: a page script for one list on one site, tried on the real page, run by
  `reader_run` and by pipelines, health-checked against its own last good run, repaired by
  Alpha when it breaks (the `Readers` adapter in `readers.py` keeps that API);
- **act**: the steps that do one task on one site in the person's session, run through an
  action the person approves (the `Procedures` adapter in `actions.py`);
- **run**: a pipeline of steps the scheduler runs with no model (read steps, tell steps, and
  `{"run": skill}` steps that call another run skill), owned by an agent.

Every skill has a name, a site or a module, a description, when to use it, a version, a
health and how its last run went; site notes are a page of the wiki with scope `skill:<name>`.
The index (every skill in one line) is in every turn's context, so Alpha reuses before it
writes; `find` searches descriptions and matches sites. Promotion is by verified runs: a read
skill is kept only after a real run returned rows, an act skill's health is set by its runs.
The platform never writes a skill's script or steps; it runs them and keeps their health.
"""

from __future__ import annotations

import sqlite3
from typing import Any

from alpha.world.names import check_name
from alpha.world.store import FUNCTION_WORDS, Problem, Store, dumps, loads, now

KINDS = ("read", "act", "run")


def _view(row: sqlite3.Row) -> dict[str, Any]:
    out = {k: row[k] for k in row.keys()}
    out["to_end"] = bool(row["to_end"])
    out["whole"] = bool(row["whole"])
    out["steps"] = loads(row["steps"], []) if row["steps"] else []
    out["verify"] = loads(row["verify"], []) if row["verify"] else []
    out["fields"] = loads(row["fields"], []) if row["fields"] else []
    return out


# Words that say when or that something is done, not what the skill is about: a pipeline
# named from "Every day at 07:30, read founding-engineer listings from YC and Wellfound" is
# run_founding_engineer_listings_yc_wellfound, not run_every_day_at_07_30.
SCHEDULE_WORDS = frozenset("""
every day days daily weekly hourly hour hours week weeks morning evening night noon midnight
am pm read reads check checks tell tells flag flags update updates sync syncs keep keeps new
whats latest current
""".split())


def slug(text: str, prefix: str = "") -> str:
    """A name from a title: its words that carry meaning, at most five, within 40 characters."""
    words = [w for w in "".join(ch if ch.isalnum() else " " for ch in text.lower()).split()
             if len(w) >= 2]
    meaningful = [w for w in words if w not in FUNCTION_WORDS and w not in SCHEDULE_WORDS
                  and not w.isdigit()]
    name = prefix
    for w in (meaningful or words)[:5]:
        if len(name) + len(w) + (0 if name == prefix else 1) > 40:
            break
        name += ("" if name == prefix else "_") + w
    return name if name != prefix else (prefix + "skill").rstrip("_")


class Skills:
    def __init__(self, store: Store) -> None:
        self.store = store

    # ---- reading ----

    def get(self, name: str, kind: str | None = None) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM skills WHERE name = ?", (name,))
        if row is None or (kind and row["kind"] != kind):
            what = {"read": "reader", "act": "procedure", "run": "pipeline"}.get(kind or "",
                                                                                   "skill")
            raise Problem(f"There is no {what} '{name}'. "
                          f"{what.capitalize()}s: {self.names(kind)}.")
        return _view(row)

    def names(self, kind: str | None = None) -> list[str]:
        where, args = ("WHERE kind = ?", (kind,)) if kind else ("", ())
        return [r["name"] for r in self.store.all(
            f"SELECT name FROM skills {where} ORDER BY name", args)]

    def all(self, kind: str | None = None) -> list[dict[str, Any]]:
        where, args = ("WHERE kind = ?", (kind,)) if kind else ("", ())
        return [_view(r) for r in self.store.all(
            f"SELECT * FROM skills {where} ORDER BY kind, site, name", args)]

    def index(self) -> list[dict[str, Any]]:
        """Every skill in one line's worth: what the pre-pack carries."""
        return [{k: s[k] for k in ("name", "kind", "site", "module", "description",
                                    "when_to_use", "effect", "health", "version",
                                    "last_run_at", "last_count")}
                for s in self.all()]

    def find(self, text: str | None = None, *, site: str | None = None,
             kind: str | None = None, module: str | None = None) -> list[dict[str, Any]]:
        """Skills by words in their name, description or when-to-use, by site (a host, matched
        by suffix: gmail.com finds google.com's skills only when they share it), by kind, by
        module."""
        out = []
        words = [w for w in (text or "").lower().split() if len(w) >= 3]
        host = (site or "").lower().strip().removeprefix("www.")
        for s in self.all(kind):
            if module and s["module"] != module:
                continue
            if host:
                mine = (s["site"] or "").lower().removeprefix("www.")
                if not (mine == host or mine.endswith("." + host) or host.endswith("." + mine)):
                    continue
            if words:
                hay = " ".join(str(s.get(k) or "") for k in ("name", "description",
                                                              "when_to_use", "site")).lower()
                if not any(w in hay for w in words):
                    continue
            out.append(s)
        return out

    # ---- writing (each kind's adapter calls these) ----

    def save(self, name: str, kind: str, *, description: str, site: str | None = None,
             url: str | None = None, module: str | None = None, when_to_use: str | None = None,
             source: str | None = None, health: str | None = None, by: str | None = None,
             **fields: Any) -> dict[str, Any]:
        """Create or replace a skill (its version goes up when it exists; the version it
        replaces is kept in `skill_versions`, with `by`: who saved the new one, so a repair
        can be undone)."""
        if kind not in KINDS:
            raise Problem(f"A skill's kind is one of {KINDS}.")
        check_name(name, "skill", "linkedin_connections")
        if not description.strip():
            raise Problem("A skill needs a description: what it does, in a sentence.")
        prior = self.store.one("SELECT kind FROM skills WHERE name = ?", (name,))
        if prior and prior["kind"] != kind:
            raise Problem(f"'{name}' is already a {prior['kind']} skill; pick another name.")
        stamp = now()
        values: dict[str, Any] = {
            "site": site, "url": url, "module": module, "description": description.strip(),
            "when_to_use": (when_to_use or "").strip() or None,
        }
        for key in ("script", "to_end", "whole", "effect", "steps", "verify", "fields",
                    "last_count", "last_ok_count", "last_run_at", "last_problem"):
            if key in fields:
                v = fields[key]
                if key in ("steps", "verify", "fields") and v is not None:
                    v = dumps(v)
                if key in ("to_end", "whole") and v is not None:
                    v = int(bool(v))
                values[key] = v
        if source:
            values["source"] = source
        if health:
            values["health"] = health
        with self.store.tx() as db:
            if prior:
                db.execute(
                    "INSERT OR REPLACE INTO skill_versions (name, version, kind, site, url,"
                    " description, when_to_use, script, to_end, whole, effect, steps, verify,"
                    " fields, saved_at, replaced_by) SELECT name, version, kind, site, url,"
                    " description, when_to_use, script, to_end, whole, effect, steps, verify,"
                    " fields, ?, ? FROM skills WHERE name = ?", (stamp, by or "alpha", name))
                sets = ", ".join(f"{k} = ?" for k in values)
                db.execute(f"UPDATE skills SET {sets}, version = version + 1, updated_at = ?"
                           " WHERE name = ?", (*values.values(), stamp, name))
            else:
                cols = ["name", "kind", *values, "created_at", "updated_at"]
                db.execute(f"INSERT INTO skills ({', '.join(cols)}) VALUES"
                           f" ({', '.join('?' * len(cols))})",
                           (name, kind, *values.values(), stamp, stamp))
        return self.get(name)

    def ran(self, name: str, *, problem: str | None, count: int | None = None) -> dict[str, Any]:
        stamp = now()
        with self.store.tx() as db:
            if problem:
                db.execute("UPDATE skills SET health = 'broken', last_problem = ?, last_run_at"
                           " = ?, last_count = COALESCE(?, last_count), updated_at = ?"
                           " WHERE name = ?", (problem, stamp, count, stamp, name))
            else:
                db.execute("UPDATE skills SET health = 'ok', last_problem = NULL, last_run_at"
                           " = ?, last_count = COALESCE(?, last_count), last_ok_count ="
                           " COALESCE(?, last_ok_count), updated_at = ? WHERE name = ?",
                           (stamp, count, count, stamp, name))
        return self.get(name)

    def versions(self, name: str) -> list[dict[str, Any]]:
        """The versions a skill had before its current one, newest first: when each was
        replaced and by whom (alpha, the person, or an agent such as Doc)."""
        rows = self.store.all("SELECT version, saved_at, replaced_by, description FROM"
                              " skill_versions WHERE name = ? ORDER BY version DESC", (name,))
        return [{k: r[k] for k in r.keys()} for r in rows]

    def restore(self, name: str, version: int, *, by: str = "person") -> dict[str, Any]:
        """Bring back an earlier version of a skill as a new version (Q49: "Undo this
        repair"); the one it replaces is kept too, so an undo can itself be undone."""
        row = self.store.one("SELECT * FROM skill_versions WHERE name = ? AND version = ?",
                             (name, int(version)))
        if row is None:
            raise Problem(f"{name} has no version {version} to go back to.")
        current = self.get(name)
        fields: dict[str, Any] = {"script": row["script"], "to_end": bool(row["to_end"]),
                                  "whole": bool(row["whole"]), "effect": row["effect"],
                                  "steps": loads(row["steps"], []) if row["steps"] else None,
                                  "verify": loads(row["verify"], []) if row["verify"] else None,
                                  "fields": loads(row["fields"], []) if row["fields"] else None,
                                  "health": "untried", "last_problem": None}
        return self.save(name, row["kind"], description=row["description"], site=row["site"],
                         url=row["url"], module=current.get("module"),
                         when_to_use=row["when_to_use"], by=by, **fields)

    def delete(self, db: sqlite3.Connection, name: str) -> int:
        db.execute("DELETE FROM skill_versions WHERE name = ?", (name,))
        return db.execute("DELETE FROM skills WHERE name = ?", (name,)).rowcount
