"""Kits: a module's directory with no data in it, copied into another person's Alpha (harness
design §15, Q53, slice 5, 18 October 2026).

A kit is a folder `<Name>.alphakit/`: `kit.yaml` (name, version, the world it was made in, when,
and what crosses out of the module), `module.yaml`, `NOTES.md`, `skills/`, `agents/`, and
`files.sha`, every file's hash. Never the tables' rows, never documents, never sign-ins.

Install makes the module with its tables empty from `module.yaml`, copies the skills and the
agents (paused until the person turns them on), and remembers what it installed: the kit's
version and each file's hash. Installing a newer version replaces the files nobody changed
since (their hash is still the installed one) and keeps the ones the person or Alpha changed,
naming them: Q53's ownership rule. Kenil, 18 Oct: every component standalone, so the export
names what a kit's skills and agents reach outside its module (`crosses`).
"""

from __future__ import annotations

import hashlib
import os
import shutil
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

import yaml

from alpha.world.modfiles import split_front
from alpha.world.skills import _ensure_repo, _git, slug
from alpha.world.store import Problem, dumps, loads

if TYPE_CHECKING:
    from alpha.world.world import World

KIT_FILES = ("module.yaml", "NOTES.md")


def shipped_kits_dir() -> Path | None:
    """Where the app's bundle keeps its kits: beside the connectors it ships
    (`ALPHA_CONNECTORS`, set by the host); none in development."""
    connectors = os.environ.get("ALPHA_CONNECTORS")
    if not connectors:
        return None
    return Path(connectors).parent / "kits"
KIT_DIRS = ("skills", "agents")
SUFFIX = ".alphakit"


def _sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()[:16]


def _files_of(folder: Path) -> list[Path]:
    out = []
    for name in KIT_FILES:
        if (folder / name).is_file():
            out.append(folder / name)
    for name in KIT_DIRS:
        sub = folder / name
        if sub.is_dir():
            out += sorted(p for p in sub.rglob("*") if p.is_file() and ".git" not in p.parts)
    return out


def _hashes(folder: Path) -> dict[str, str]:
    return {p.relative_to(folder).as_posix(): _sha(p) for p in _files_of(folder)}


class Kits:
    def __init__(self, world: World) -> None:
        self.world = world
        self.home = Path(world.path).parent

    # ---- what crosses out of a module ----

    def crossings(self, module_id: str) -> list[str]:
        """What the module's skills and agents reach outside it: a table of another module (or
        of none) in a read or tell step. A kit carries them as a warning; a standalone module
        has none."""
        world = self.world
        own = {t["name"] for t in world.collections.overview(module_id)}
        where: dict[str, str] = {}
        for t in world.collections.overview():
            if t["module"]:
                try:
                    where[t["name"]] = world.modules.get(t["module"])["name"]
                except Problem:
                    where[t["name"]] = str(t["module"])
            else:
                where[t["name"]] = "no module"
        out: list[str] = []

        def look(owner: str, steps: list[dict[str, Any]]) -> None:
            for s in steps:
                table = s.get("into") or s.get("tell")
                if table and table not in own:
                    out.append(f"{owner} reaches the table {table} ({where.get(table, 'unknown')})")

        agents = world.agents.all(module_id)
        owned = {a.get("skill") for a in agents if a.get("skill")}
        for sk in world.skills.index():
            if sk.get("module") == module_id and sk.get("kind") == "run" \
                    and sk["name"] not in owned:
                look(f"the skill {sk['name']}", list(world.skills.get(sk["name"])["steps"] or []))
        for a in agents:
            look(f"the agent {a['name']}", list(a.get("steps") or []))
        return sorted(set(out))

    # ---- export ----

    def export(self, module_ref: str, *, to: Path | None = None, version: int | None = None,
               zip_it: bool = False) -> dict[str, Any]:
        world = self.world
        m = world.modules.get(module_ref)
        world.files.sync_module(m)
        src = world.files.dir_of(m["id"])
        name = slug(m["name"]) or m["id"]
        folder = (to if to is not None else self.home / "kits") / f"{name}{SUFFIX}"
        if folder.exists():
            shutil.rmtree(folder)
        folder.mkdir(parents=True)
        for file in KIT_FILES:
            if (src / file).is_file():
                shutil.copy2(src / file, folder / file)
        for sub in KIT_DIRS:
            if (src / sub).is_dir():
                shutil.copytree(src / sub, folder / sub, ignore=shutil.ignore_patterns(".git"))
        world_id = world.store.one("SELECT value FROM meta WHERE key = 'world_id'")
        crosses = self.crossings(m["id"])
        head: dict[str, Any] = {
            "kit": m["name"], "version": int(version or self._next_version(name)),
            "module": m["name"], "made_in": world_id["value"] if world_id else None,
            "made_at": datetime.now(UTC).replace(microsecond=0).isoformat()}
        if crosses:
            head["crosses"] = crosses
        (folder / "kit.yaml").write_text(yaml.safe_dump(head, sort_keys=False))
        hashes = _hashes(folder)
        (folder / "files.sha").write_text("".join(f"{h}  {p}\n" for p, h in hashes.items()))
        out: dict[str, Any] = {"kit": str(folder), "name": m["name"], "version": head["version"],
                               "files": len(hashes), "crosses": crosses}
        if zip_it:
            out["zip"] = shutil.make_archive(str(folder), "zip", root_dir=folder.parent,
                                             base_dir=folder.name)
        world.journal.append("made", f"Exported the kit {m['name']} (v{head['version']}):"
                             f" {len(hashes)} files" + (f"; it reaches outside the module:"
                                                        f" {'; '.join(crosses)}" if crosses else "")
                             + ".", actor="person", module=m["id"],
                             data={"kit": out["kit"], "version": head["version"],
                                   "crosses": crosses})
        return out

    def _next_version(self, name: str) -> int:
        row = self.world.store.one("SELECT value FROM meta WHERE key = ?", (f"kit_made:{name}",))
        n = int(loads(row["value"], 0) or 0) + 1 if row else 1
        with self.world.store.tx() as db:
            db.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
                       (f"kit_made:{name}", dumps(n)))
        return n

    # ---- kits shipped inside the app ----

    def install_shipped(self, folder: Path | None = None) -> list[dict[str, Any]]:
        """The kits bundled with the app (`<bundle>/kits/*.alphakit`, beside its connectors):
        each installed on the first open of a world, and again when the bundle carries a
        newer version (Q53). Returns what was installed or updated."""
        folder = folder if folder is not None else shipped_kits_dir()
        if folder is None or not folder.is_dir():
            return []
        done: list[dict[str, Any]] = []
        have = {slug(str(k["kit"])): int(k.get("version") or 0) for k in self.installed()}
        for kit in sorted(p for p in folder.iterdir() if p.is_dir() and p.suffix == SUFFIX):
            try:
                head = self._head(kit)
            except Problem:
                continue
            key = slug(str(head["kit"]))
            if key in have and have[key] >= int(head.get("version") or 1):
                continue
            try:
                done.append(self.install(kit))
            except Problem as e:
                self.world.journal.append("failed", f"The kit {head['kit']} could not be"
                                          f" installed: {e}", actor="alpha",
                                          data={"kit": str(kit)})
        return done

    # ---- install and update ----

    def installed(self) -> list[dict[str, Any]]:
        rows = self.world.store.all("SELECT key, value FROM meta WHERE key LIKE 'kit:%'")
        return [loads(r["value"], {}) for r in rows]

    def install(self, folder: Path) -> dict[str, Any]:
        folder = Path(folder)
        if folder.suffix == ".zip" and folder.is_file():
            unpacked = folder.with_suffix("")
            shutil.unpack_archive(folder, unpacked.parent)
            folder = unpacked if unpacked.is_dir() else next(unpacked.parent.glob(f"*{SUFFIX}"))
        head = self._head(folder)
        shape = yaml.safe_load((folder / "module.yaml").read_text()) or {}
        key = f"kit:{slug(str(head['kit']))}"
        row = self.world.store.one("SELECT value FROM meta WHERE key = ?", (key,))
        before = loads(row["value"], {}) if row else None
        if before and self._module_exists(before.get("module")):
            return self._update(folder, head, shape, before, key)
        return self._fresh(folder, head, shape, key)

    def _head(self, folder: Path) -> dict[str, Any]:
        if not (folder / "kit.yaml").is_file() or not (folder / "module.yaml").is_file():
            raise Problem(f"{folder} is not a kit: it needs kit.yaml and module.yaml.")
        head = yaml.safe_load((folder / "kit.yaml").read_text()) or {}
        if not isinstance(head, dict) or not head.get("kit"):
            raise Problem("kit.yaml names no kit.")
        return head

    def _module_exists(self, module_id: Any) -> bool:
        try:
            return bool(module_id) and not self.world.modules.get(str(module_id)).get("removed_at")
        except Problem:
            return False

    def _fresh(self, folder: Path, head: dict[str, Any], shape: dict[str, Any],
               key: str) -> dict[str, Any]:
        world = self.world
        name = str(shape.get("module") or head["kit"])
        try:
            world.modules.get(name)
            raise Problem(f"There is a module called '{name}' already; remove it first, or this"
                          " kit is not the one it came from.")
        except Problem as e:
            if "already" in str(e):
                raise
        m = world.modules.create(name, goal=shape.get("goal"))
        made = {"tables": 0, "lists": 0, "skills": 0, "agents": 0}
        self._tables(m, shape, made)
        self._notes(m, folder)
        made["skills"] = self._skills(m, folder)
        made["agents"] = self._agents(m, folder)
        world.files.sync_module(m)
        # what was installed, as this world wrote it (its own ids in module.yaml and the
        # agents' files): "unchanged since the install" is measured against this
        hashes = _hashes(world.files.dir_of(m["id"]))
        record = {"kit": head["kit"], "version": int(head.get("version") or 1),
                  "module": m["id"], "installed_at": datetime.now(UTC).replace(microsecond=0)
                  .isoformat(), "hashes": hashes, "made_in": head.get("made_in")}
        with world.store.tx() as db:
            db.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
                       (key, dumps(record)))
        words = self._words(head, made)
        world.journal.append("made", words, actor="alpha", module=m["id"],
                             data={"kit": head["kit"], "version": record["version"],
                                   "module": m["id"], **made})
        return {"module": m["id"], "name": name, "version": record["version"], **made,
                "words": words, "kept": []}

    def _words(self, head: dict[str, Any], made: dict[str, int], kept: list[str] | None = None
               ) -> str:
        parts = [f"{n} {k[:-1] if n == 1 else k}" for k, n in made.items() if n]
        words = f"Installed the kit {head['kit']} (v{head.get('version') or 1}): " \
                + (", ".join(parts) or "nothing new") + "."
        if made.get("agents"):
            words += (" Its agents are paused until you turn them on; a reader of a site needs"
                      " your sign-in there first.")
        if kept:
            words += " Kept your versions of " + ", ".join(kept) + "."
        return words

    def _tables(self, m: dict[str, Any], shape: dict[str, Any], made: dict[str, int]) -> None:
        world = self.world
        for t in shape.get("tables") or []:
            name = str(t["name"])
            try:
                desc = world.collections.describe(name)
            except Problem:
                desc = None
            if desc is None:
                world.collections.create(name, str(t.get("title") or name), list(t["fields"]),
                                         module=m["id"], title_field=t.get("title_field"),
                                         identity=t.get("identity"))
                made["tables"] += 1
            else:
                have = {f["name"] for f in desc["fields"]}
                missing = [f for f in t["fields"] if f["name"] not in have]
                if missing:
                    world.collections.add_fields(name, missing)
            titles = {v["title"] for v in world.views.for_table(name)}
            for v in t.get("lists") or []:
                if v["title"] not in titles:
                    try:
                        world.views.save(name, v["title"], dict(v.get("config") or {}),
                                         source="kit")
                        made["lists"] += 1
                    except Problem:
                        continue

    def _notes(self, m: dict[str, Any], folder: Path) -> None:
        notes = folder / "NOTES.md"
        if notes.is_file() and notes.read_text().strip():
            self.world.knowledge.write_note(f"module:{m['name']}", m["name"],
                                            notes.read_text().strip(), source="kit")

    def _skills(self, m: dict[str, Any], folder: Path, only: set[str] | None = None) -> int:
        src = folder / "skills"
        if not src.is_dir():
            return 0
        root = self.world.skills.root_for(m["id"])
        repo = self.world.files.dir_of(m["id"])
        _ensure_repo(repo)
        n = 0
        for skill in sorted(p for p in src.iterdir() if p.is_dir()):
            if only is not None and skill.name not in only:
                continue
            dst = root / skill.name
            if dst.exists():
                shutil.rmtree(dst)
            shutil.copytree(skill, dst)
            # the skill is this module's now: its front matter names the module it came
            # from (another world's id) until rewritten
            md = dst / "SKILL.md"
            if md.is_file():
                text = md.read_text()
                head, body = split_front(text)
                head["module"] = m["id"]
                md.write_text("---\n" + yaml.safe_dump(head, sort_keys=False, allow_unicode=True)
                              + "---\n" + body)
            n += 1
        if n:
            _git(repo, "add", "-A", "--", "skills")
            _git(repo, "commit", "-q", "--allow-empty", "-m", f"kit: {n} skills installed")
        return n

    def _agents(self, m: dict[str, Any], folder: Path, only: set[str] | None = None) -> int:
        src = folder / "agents"
        if not src.is_dir():
            return 0
        world = self.world
        have = {a["name"]: a for a in world.agents.all(m["id"])}
        n = 0
        for path in sorted(src.glob("*.md")):
            if only is not None and path.name not in only:
                continue
            head, body = split_front(path.read_text())
            name = str(head.get("agent") or path.stem)
            run_skill = str(head.get("skill") or "")
            copied = bool(run_skill) and world.skills.path_of(run_skill) is not None
            fields: dict[str, Any] = {"schedule": head.get("schedule"),
                                      "steps": None if copied else (head.get("steps") or None),
                                      "goal": head.get("goal"), "may": head.get("may")}
            if name in have:
                world.agents.update(have[name]["id"], description=str(head.get("title") or name),
                                    **{k: v for k, v in fields.items() if v is not None})
                agent = have[name]
            else:
                agent = world.agents.create(str(head.get("title") or name), name=name,
                                            module=m["id"], **fields)
                world.agents.update(agent["id"], state="paused")  # until the person turns it on
            if copied and agent.get("skill") != run_skill:
                world.agents.attach_skill(agent["id"], run_skill)  # its steps, copied beside it
            if body.strip():
                world.knowledge.write_note(f"agent:{agent['id']}", "Brief", body.strip(),
                                           source="kit")
            n += 1
        return n

    def _update(self, folder: Path, head: dict[str, Any], shape: dict[str, Any],
                before: dict[str, Any], key: str) -> dict[str, Any]:
        """A newer kit over an installed one: files whose installed hash is still their hash
        are replaced; the others are the person's and stay, named."""
        world = self.world
        m = world.modules.get(str(before["module"]))
        world.files.sync_module(m)
        current = _hashes(world.files.dir_of(m["id"]))
        installed = before.get("hashes") or {}
        fresh = _hashes(folder)
        kept_files: list[str] = []
        take: set[str] = set()
        for rel in fresh:
            if rel == "module.yaml":
                continue  # the shape is written from the world, never taken as a file
            was = installed.get(rel)
            now_ = current.get(rel)
            if was is None or now_ is None or now_ == was:
                take.add(rel)  # new, gone, or untouched since the install
            else:
                kept_files.append(rel)
        # named by what the person would call them: a skill, an agent, the notes
        kept = sorted({"/".join(rel.split("/")[:2]) if "/" in rel else rel for rel in kept_files})
        made = {"tables": 0, "lists": 0, "skills": 0, "agents": 0}
        self._tables(m, shape, made)  # fields are only ever added
        if "NOTES.md" in take:
            self._notes(m, folder)
        made["skills"] = self._skills(m, folder, only={
            rel.split("/")[1] for rel in take if rel.startswith("skills/")})
        made["agents"] = self._agents(m, folder, only={
            rel.split("/")[1] for rel in take if rel.startswith("agents/")})
        world.files.sync_module(m)
        after = _hashes(world.files.dir_of(m["id"]))
        record = {**before, "version": int(head.get("version") or 1),
                  "updated_at": datetime.now(UTC).replace(microsecond=0).isoformat(),
                  "hashes": {**installed, **{rel: after[rel] for rel in take if rel in after}}}
        with world.store.tx() as db:
            db.execute("INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
                       (key, dumps(record)))
        words = self._words(head, made, kept).replace("Installed", "Updated", 1)
        world.journal.append("made", words, actor="alpha", module=m["id"],
                             data={"kit": head["kit"], "version": record["version"],
                                   "module": m["id"], "kept": kept, **made})
        return {"module": m["id"], "name": m["name"], "version": record["version"], **made,
                "words": words, "kept": kept}
