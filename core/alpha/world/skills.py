"""Skills: the one unit of know-how Alpha writes for itself (design §3.7, point 7; files since
the harness, slice 2b, 17 October 2026).

A skill is a directory the model writes and the person can read (the Agent Skills shape):

    skills/<name>/SKILL.md      the frontmatter (name, kind, site, url, module, form, …) and the
                                words: what it does, when to use it
    skills/<name>/scripts/read.js   a read skill's page script
    skills/<name>/steps.yaml        an act skill's steps, checks and fields; a run skill's steps

It lives under its module's directory (`modules/<id>/skills/`) or, with no module, under
`skills/` beside the world. Each skills root is a git repository: every save is a commit, so a
skill's versions are its history and a repair can be undone (Q49). What happened to a skill
(its health, its last run, its counts) is not know-how and stays in the world, in
`skill_state`.

Three kinds, as before: **read** (a page script for one list on one site, run by `reader_run`
and by pipelines, health-checked, repaired by Doc), **act** (the steps that do one task on one
site in the person's session, run through an action the person approves) and **run** (a
pipeline of steps the scheduler runs with no model, owned by an agent). The index (every skill
in one line) is in every turn's context, so Alpha reuses before it writes; `find` searches the
words and matches sites. The platform never writes a skill's script or steps; it keeps them,
runs them and keeps their health.
"""

from __future__ import annotations

import logging
import shutil
import sqlite3
import subprocess
from pathlib import Path
from typing import Any

import yaml

from alpha.world.names import check_name
from alpha.world.store import FUNCTION_WORDS, Problem, Store, dumps, loads, now

log = logging.getLogger(__name__)

KINDS = ("read", "act", "run")
# The form of a skill (harness design §6.1): a read or act skill is code that runs the same
# way every time; a run skill is a pipeline of such steps with no model at all.
FORMS = {"read": "by script", "act": "by script", "run": "pipeline"}
# What the frontmatter carries, in this order; the rest of a skill is its files.
FRONT = ("name", "kind", "description", "site", "url", "module", "when_to_use", "form",
         "to_end", "whole", "effect", "source", "version", "created_at", "updated_at", "page")
GIT = shutil.which("git") or "/usr/bin/git"

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


# ---- the files ----


def _split_front(text: str) -> tuple[dict[str, Any], str]:
    """The YAML frontmatter and the body of a SKILL.md."""
    if not text.startswith("---\n"):
        return {}, text
    end = text.find("\n---", 4)
    if end < 0:
        return {}, text
    front = yaml.safe_load(text[4:end]) or {}
    body = text[end + 4:].lstrip("\n")
    return (front if isinstance(front, dict) else {}), body


def _join_front(front: dict[str, Any], body: str) -> str:
    head = yaml.safe_dump({k: v for k, v in front.items() if v is not None}, sort_keys=False,
                          allow_unicode=True, width=100).rstrip("\n")
    return f"---\n{head}\n---\n\n{body.rstrip()}\n"


def _body_of(description: str, when_to_use: str | None, kind: str) -> str:
    lines = [description.strip(), ""]
    if when_to_use:
        lines += ["## When to use it", "", when_to_use.strip(), ""]
    what = {"read": "`scripts/read.js` reads the page into rows; `reader_run` runs it.",
            "act": "`steps.yaml` holds the steps the browser replays on the site; an action the"
                   " person approves runs them.",
            "run": "`steps.yaml` holds the steps the scheduler runs with no model."}[kind]
    lines += ["## How it runs", "", what]
    return "\n".join(lines)


def _git(root: Path, *args: str) -> str:
    out = subprocess.run([GIT, "-C", str(root), "-c", "user.name=Alpha",
                          "-c", "user.email=alpha@local", "-c", "commit.gpgsign=false", *args],
                         capture_output=True, text=True, check=False)
    if out.returncode != 0:
        raise Problem(f"git {args[0]} failed in {root.name}: {out.stderr.strip()[:300]}")
    return out.stdout


def _commit(repo: Path, rel: str, by: str, name: str, version: int, stamp: str) -> None:
    """One save, one commit: who, which version, when (the world's own stamp, so a version's
    time is the same wherever it is read)."""
    _git(repo, "add", "-A", "--", rel)
    _git(repo, "commit", "-q", "--allow-empty", "-m", f"{by}: {name} v{version} @{stamp}")


def _ensure_repo(root: Path) -> None:
    root.mkdir(parents=True, exist_ok=True)
    if not (root / ".git").is_dir():
        _git(root, "init", "-q")
        (root / ".gitignore").write_text("*.lock\n__pycache__/\n")


class Skills:
    def __init__(self, store: Store, root: Path | None = None) -> None:
        self.store = store
        # The skills live beside the world: the app's home, a journey's scratch home, a test's
        # tmp_path; never the real home for a world that is elsewhere.
        self.home = Path(root) if root is not None else Path(store.path).parent
        self._cache: dict[Path, tuple[float, dict[str, Any]]] = {}

    # ---- where ----

    def root_for(self, module: str | None) -> Path:
        return (self.home / "modules" / module / "skills") if module else (self.home / "skills")

    def repo_of(self, folder: Path) -> Path:
        """The git repository a skill's folder is kept in: its module's directory (the project
        the model owns), or the home's `skills/` for a skill with no module."""
        parent = folder.parent
        return parent.parent if parent.parent.parent == self.home / "modules" else parent

    def _roots(self) -> list[Path]:
        roots = [self.home / "skills"]
        modules = self.home / "modules"
        if modules.is_dir():
            roots += sorted(p / "skills" for p in modules.iterdir()
                            if p.is_dir() and (p / "skills").is_dir())
        return [r for r in roots if r.is_dir()]

    def path_of(self, name: str) -> Path | None:
        for root in self._roots():
            if (root / name / "SKILL.md").is_file():
                return root / name
        return None

    # ---- reading ----

    def _load(self, folder: Path) -> dict[str, Any]:
        md = folder / "SKILL.md"
        stamp = md.stat().st_mtime
        cached = self._cache.get(folder)
        if cached and cached[0] == stamp:
            return dict(cached[1])
        front, body = _split_front(md.read_text())
        out: dict[str, Any] = {k: front.get(k) for k in FRONT}
        out["name"] = out["name"] or folder.name
        out["kind"] = out["kind"] or "read"
        out["description"] = str(out["description"] or "").strip()
        out["to_end"] = bool(out.get("to_end"))
        out["whole"] = True if out.get("whole") is None else bool(out["whole"])
        out["version"] = int(out.get("version") or 1)
        out["form"] = out.get("form") or FORMS.get(out["kind"], "by script")
        out["body"] = body
        out["path"] = str(folder)
        script = folder / "scripts" / "read.js"
        out["script"] = script.read_text() if script.is_file() else None
        detail = folder / "scripts" / "detail.js"
        out["detail"] = detail.read_text() if detail.is_file() else None
        steps = folder / "steps.yaml"
        extra = yaml.safe_load(steps.read_text()) if steps.is_file() else {}
        extra = extra if isinstance(extra, dict) else {}
        out["steps"] = list(extra.get("steps") or [])
        out["verify"] = list(extra.get("verify") or [])
        out["fields"] = list(extra.get("fields") or [])
        # a send's way to throw away what a dry run or a failed run typed (Q95)
        out["discard"] = list(extra.get("discard") or [])
        self._cache[folder] = (stamp, dict(out))
        return out

    def _state(self, name: str) -> dict[str, Any]:
        row = self.store.one("SELECT * FROM skill_state WHERE name = ?", (name,))
        if row is None:
            return {"health": "untried", "last_problem": None, "last_run_at": None,
                    "last_count": None, "last_ok_count": None}
        return {k: row[k] for k in ("health", "last_problem", "last_run_at", "last_count",
                                    "last_ok_count")}

    def _view(self, folder: Path) -> dict[str, Any]:
        out = self._load(folder)
        out.update(self._state(out["name"]))
        return out

    def get(self, name: str, kind: str | None = None) -> dict[str, Any]:
        folder = self.path_of(name)
        out = self._view(folder) if folder else None
        if out is None or (kind and out["kind"] != kind):
            what = {"read": "reader", "act": "procedure", "run": "pipeline"}.get(kind or "",
                                                                                   "skill")
            raise Problem(f"There is no {what} '{name}'. "
                          f"{what.capitalize()}s: {self.names(kind)}.")
        return out

    def names(self, kind: str | None = None) -> list[str]:
        return sorted(s["name"] for s in self.all(kind))

    def all(self, kind: str | None = None) -> list[dict[str, Any]]:
        out = []
        for root in self._roots():
            for folder in sorted(p for p in root.iterdir() if (p / "SKILL.md").is_file()):
                s = self._view(folder)
                if kind is None or s["kind"] == kind:
                    out.append(s)
        return sorted(out, key=lambda s: (s["kind"], s["site"] or "", s["name"]))

    def index(self) -> list[dict[str, Any]]:
        """Every skill in one line's worth: what the start layer carries."""
        return [{k: s.get(k) for k in ("name", "kind", "site", "module", "description",
                                        "when_to_use", "effect", "health", "version",
                                        "last_run_at", "last_count", "form")}
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

    def text(self, name: str) -> str:
        """The SKILL.md as it is, for the person to read and edit."""
        folder = self.path_of(name)
        if folder is None:
            raise Problem(f"There is no skill '{name}'.")
        return (folder / "SKILL.md").read_text()

    # ---- writing (each kind's adapter calls these) ----

    def save(self, name: str, kind: str, *, description: str, site: str | None = None,
             url: str | None = None, module: str | None = None, when_to_use: str | None = None,
             source: str | None = None, health: str | None = None, by: str | None = None,
             version: int | None = None, **fields: Any) -> dict[str, Any]:
        """Create or replace a skill (its version goes up when it exists; the version before is
        the commit before, with `by`: who saved the new one, so a repair can be undone).
        `version` is only for the migration, which keeps the numbers the rows had."""
        if kind not in KINDS:
            raise Problem(f"A skill's kind is one of {KINDS}.")
        check_name(name, "skill", "linkedin_connections")
        if not description.strip():
            raise Problem("A skill needs a description: what it does, in a sentence.")
        prior_folder = self.path_of(name)
        prior = self._load(prior_folder) if prior_folder else None
        if prior and prior["kind"] != kind:
            raise Problem(f"'{name}' is already a {prior['kind']} skill; pick another name.")
        stamp = now()
        module = module if module is not None else (prior or {}).get("module")
        folder = prior_folder or (self.root_for(module) / name)
        repo = self.repo_of(folder)
        _ensure_repo(repo)
        folder.mkdir(parents=True, exist_ok=True)
        rel = str(folder.relative_to(repo))
        front: dict[str, Any] = {
            "name": name, "kind": kind, "description": description.strip(), "site": site,
            "url": url, "module": module,
            "when_to_use": (when_to_use or "").strip() or None, "form": FORMS[kind],
            "to_end": bool(fields.get("to_end", (prior or {}).get("to_end", False))),
            "whole": bool(fields.get("whole", (prior or {}).get("whole", True))),
            "effect": fields.get("effect", (prior or {}).get("effect")),
            "source": source or (prior or {}).get("source"),
            # a reader's rows: the field holding each item's own page (P14)
            "page": fields.get("page", (prior or {}).get("page")) if kind == "read" else None,
            "version": version if version else ((prior["version"] + 1) if prior else 1),
            "created_at": (prior or {}).get("created_at") or stamp, "updated_at": stamp,
        }
        (folder / "SKILL.md").write_text(
            _join_front(front, _body_of(description, when_to_use, kind)))
        if kind == "read":
            script = fields.get("script", (prior or {}).get("script"))
            (folder / "scripts").mkdir(exist_ok=True)
            (folder / "scripts" / "read.js").write_text(str(script or ""))
            # the script for one item's own page (P14): kept beside the list's
            detail = fields.get("detail", (prior or {}).get("detail"))
            if detail:
                (folder / "scripts" / "detail.js").write_text(str(detail))
            elif (folder / "scripts" / "detail.js").is_file():
                (folder / "scripts" / "detail.js").unlink()
        else:
            extra = {k: fields.get(k, (prior or {}).get(k))
                     for k in ("steps", "verify", "fields", "discard")}
            extra = {k: list(v) for k, v in extra.items() if v}
            (folder / "steps.yaml").write_text(
                yaml.safe_dump(extra, sort_keys=False, allow_unicode=True, width=100))
        _commit(repo, rel, by or "alpha", name, front["version"], stamp)
        self._cache.pop(folder, None)
        state: dict[str, Any] = {}
        if health:
            state["health"] = health
        for key in ("last_count", "last_ok_count", "last_run_at", "last_problem"):
            if key in fields:
                state[key] = fields[key]
        if state or not prior:
            self._set_state(name, **({"health": "untried"} | state))
        return self.get(name)

    def _set_state(self, name: str, **values: Any) -> None:
        stamp = now()
        with self.store.tx() as db:
            db.execute("INSERT INTO skill_state (name, updated_at) VALUES (?, ?)"
                       " ON CONFLICT(name) DO NOTHING", (name, stamp))
            if values:
                sets = ", ".join(f"{k} = ?" for k in values)
                db.execute(f"UPDATE skill_state SET {sets}, updated_at = ? WHERE name = ?",
                           (*values.values(), stamp, name))

    def ran(self, name: str, *, problem: str | None, count: int | None = None) -> dict[str, Any]:
        stamp = now()
        with self.store.tx() as db:
            db.execute("INSERT INTO skill_state (name, updated_at) VALUES (?, ?)"
                       " ON CONFLICT(name) DO NOTHING", (name, stamp))
            if problem:
                db.execute("UPDATE skill_state SET health = 'broken', last_problem = ?,"
                           " last_run_at = ?, last_count = COALESCE(?, last_count),"
                           " updated_at = ? WHERE name = ?", (problem, stamp, count, stamp, name))
            else:
                db.execute("UPDATE skill_state SET health = 'ok', last_problem = NULL,"
                           " last_run_at = ?, last_count = COALESCE(?, last_count),"
                           " last_ok_count = COALESCE(?, last_ok_count), updated_at = ?"
                           " WHERE name = ?", (stamp, count, count, stamp, name))
        return self.get(name)

    def _rel(self, folder: Path) -> str:
        return str(folder.relative_to(self.repo_of(folder)))

    def _history(self, folder: Path) -> list[dict[str, Any]]:
        """Every save of a skill, newest first: the commit, who, the version, when."""
        repo = self.repo_of(folder)
        rel = str(folder.relative_to(repo))
        lines = _git(repo, "log", "--format=%H%x1f%s", "--", rel).splitlines()
        out: list[dict[str, Any]] = []
        for line in lines:
            commit, _, subject = line.partition("\x1f")
            by, _, rest = subject.partition(": ")
            body, _, stamp = rest.partition(" @")
            version = body.rsplit(" v", 1)[-1] if " v" in body else ""
            try:
                v = int(version)
            except ValueError:
                v = 0
            out.append({"commit": commit, "by": by or "alpha", "version": v, "at": stamp or None})
        return out

    def versions(self, name: str) -> list[dict[str, Any]]:
        """The versions a skill had before its current one, newest first: when each was
        replaced and by whom (alpha, the person, or an agent such as Doc), from its history."""
        folder = self.path_of(name)
        if folder is None:
            return []
        history = [h for h in self._history(folder) if h["version"]]
        out: list[dict[str, Any]] = []
        for later, earlier in zip(history, history[1:], strict=False):
            out.append({"version": earlier["version"], "saved_at": later["at"],
                        "replaced_by": later["by"],
                        "description": self._description_at(folder, earlier["commit"])})
        return out

    def _description_at(self, folder: Path, commit: str) -> str | None:
        try:
            text = _git(self.repo_of(folder), "show", f"{commit}:{self._rel(folder)}/SKILL.md")
        except Problem:
            return None
        front, _ = _split_front(text)
        return str(front.get("description") or "") or None

    def restore(self, name: str, version: int, *, by: str = "person") -> dict[str, Any]:
        """Bring back an earlier version of a skill as a new version (Q49: "Undo this
        repair"); the one it replaces stays in the history, so an undo can itself be undone."""
        folder = self.path_of(name)
        if folder is None:
            raise Problem(f"There is no skill '{name}'.")
        current = self._load(folder)
        match = [h for h in self._history(folder)
                 if h["version"] == int(version) and h["version"] != current["version"]]
        if not match:
            raise Problem(f"{name} has no version {version} to go back to.")
        commit = match[0]["commit"]
        repo, rel = self.repo_of(folder), self._rel(folder)
        text = _git(repo, "show", f"{commit}:{rel}/SKILL.md")
        front, _ = _split_front(text)
        fields: dict[str, Any] = {"health": "untried", "last_problem": None}
        if front.get("kind") == "read":
            try:
                fields["script"] = _git(repo, "show", f"{commit}:{rel}/scripts/read.js")
            except Problem:
                fields["script"] = current.get("script")
        else:
            try:
                extra = yaml.safe_load(_git(repo, "show", f"{commit}:{rel}/steps.yaml")) or {}
            except Problem:
                extra = {}
            for k in ("steps", "verify", "fields", "discard"):
                fields[k] = list(extra.get(k) or []) or None
        for k in ("to_end", "whole", "effect"):
            if front.get(k) is not None:
                fields[k] = front[k]
        return self.save(name, str(front.get("kind") or current["kind"]),
                         description=str(front.get("description") or current["description"]),
                         site=front.get("site"), url=front.get("url"),
                         module=current.get("module"), when_to_use=front.get("when_to_use"),
                         by=by, **fields)

    def write_text(self, name: str, text: str, *, by: str = "person") -> dict[str, Any]:
        """The person's edit of a SKILL.md, as a new version; the frontmatter must still name
        the skill and its kind."""
        folder = self.path_of(name)
        if folder is None:
            raise Problem(f"There is no skill '{name}'.")
        front, _ = _split_front(text)
        if front.get("name") != name or front.get("kind") not in KINDS:
            raise Problem("The top of the file must keep the skill's name and kind.")
        current = self._load(folder)
        front["version"] = current["version"] + 1
        front["updated_at"] = now()
        _, body = _split_front(text)
        (folder / "SKILL.md").write_text(_join_front(front, body))
        _commit(self.repo_of(folder), self._rel(folder), by, name, int(front["version"]),
                str(front["updated_at"]))
        self._cache.pop(folder, None)
        return self.get(name)

    def delete(self, db: sqlite3.Connection, name: str) -> int:
        """Remove a skill for good: its files, its history line, its state; the journal keeps
        the record. Called inside a removal's transaction (`db`), as before."""
        db.execute("DELETE FROM skill_state WHERE name = ?", (name,))
        folder = self.path_of(name)
        if folder is None:
            return 0
        repo, rel = self.repo_of(folder), self._rel(folder)
        shutil.rmtree(folder, ignore_errors=True)
        try:
            _commit(repo, rel, "removed", name, 0, now())
        except Problem:
            log.exception("the removal of %s was not committed", name)
        self._cache.pop(folder, None)
        return 1

    # ---- the migration from the tables (17 Oct 2026) ----

    def migrate_from_tables(self) -> int:
        """Write every skill the world kept as rows (`skills`, `skill_versions`) out as files,
        its versions as commits in order, its state into `skill_state`; once, marked in `meta`.
        Returns how many skills were written."""
        have = {str(r["name"]) for r in self.store.all(
            "SELECT name FROM sqlite_master WHERE type = 'table'")}
        if "skills" not in have:
            return 0
        if self.store.one("SELECT value FROM meta WHERE key = 'skills_in_files'"):
            self._drop_tables()
            return 0
        rows = self.store.all("SELECT * FROM skills ORDER BY created_at")
        written = 0
        for row in rows:
            r = {k: row[k] for k in row.keys()}
            if self.path_of(r["name"]):
                continue
            olds = self.store.all("SELECT * FROM skill_versions WHERE name = ? ORDER BY version",
                                  (r["name"],))
            for old in [{k: o[k] for k in o.keys()} for o in olds] + [r]:
                self._write_version(old, module=r.get("module"), state=False)
            self._set_state(r["name"], health=r.get("health") or "untried",
                            last_problem=r.get("last_problem"), last_run_at=r.get("last_run_at"),
                            last_count=r.get("last_count"), last_ok_count=r.get("last_ok_count"))
            written += 1
        with self.store.tx() as db:
            db.execute("INSERT OR REPLACE INTO meta (key, value) VALUES ('skills_in_files', ?)",
                       (dumps({"at": now(), "skills": written}),))
        self._drop_tables()
        return written

    def _drop_tables(self) -> None:
        """The rows are files now: the tables go (18 Oct 2026, 2b step 4)."""
        with self.store.tx() as db:
            db.execute("DROP TABLE IF EXISTS skill_versions")
            db.execute("DROP TABLE IF EXISTS skills")

    def _write_version(self, r: dict[str, Any], *, module: str | None, state: bool) -> None:
        fields: dict[str, Any] = {"to_end": bool(r.get("to_end")), "whole": bool(r.get("whole", 1)),
                                  "effect": r.get("effect")}
        if r["kind"] == "read":
            fields["script"] = r.get("script")
        else:
            for k in ("steps", "verify", "fields"):
                fields[k] = loads(r.get(k), []) if r.get(k) else None
        self.save(r["name"], r["kind"], description=r["description"], site=r.get("site"),
                  url=r.get("url"), module=module, when_to_use=r.get("when_to_use"),
                  source=r.get("source"), by=r.get("replaced_by") or "alpha",
                  version=int(r.get("version") or 0) or None, **fields)

