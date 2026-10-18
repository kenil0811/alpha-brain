"""A module as a directory the model owns (harness design §5, slice 5, 18 October 2026).

The world stays the truth for data; the directory is the module's shape, readable and editable
as files, and what a kit copies:

    modules/<id>/module.yaml      the shape, written from the world (name, goal, parent, tables
                                  with their fields and identity, saved lists, skills, agents)
    modules/<id>/NOTES.md         the module's page, both ways
    modules/<id>/agents/<name>.md each agent, both ways: YAML front matter (schedule, state,
                                  steps, what it may write), the brief as the body
    modules/<id>/skills/          as since 2b (world/skills.py)
    modules/<id>/pages/<name>.html the pages the model draws (world/pages.py; slice 7)
    ALPHA.md                      the standing instructions, both ways

"Both ways" by content: a file newer than the world's row whose text differs is read into the
world; otherwise the world is written to the file. Nothing is deleted here; removal is
`purge.py`'s. `sync()` runs when a world opens and after every turn; it is cheap and
idempotent. Kenil, 18 Oct: every component isolated and standalone, so a module's directory
holds everything it is.
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING, Any

import yaml

from alpha.world.knowledge import INSTRUCTIONS
from alpha.world.skills import slug
from alpha.world.store import Problem

if TYPE_CHECKING:
    from alpha.world.world import World

log = logging.getLogger(__name__)

FRONT = re.compile(r"\A---\n(.*?)\n---\n?(.*)\Z", re.S)
# What an agent file may set; the rest (its runs, its cursor, its id) is the world's alone.
AGENT_KEYS = ("title", "schedule", "state", "steps", "may", "goal")


def _stamp(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, UTC).replace(microsecond=0).isoformat()


def _dump(data: dict[str, Any]) -> str:
    return yaml.safe_dump(data, sort_keys=False, allow_unicode=True, width=100)


def split_front(text: str) -> tuple[dict[str, Any], str]:
    """A file's YAML front matter and its body; a file without one is all body."""
    m = FRONT.match(text)
    if not m:
        return {}, text
    try:
        head = yaml.safe_load(m.group(1)) or {}
    except yaml.YAMLError as e:
        raise Problem(f"The front matter is not valid YAML: {e}") from e
    return (head if isinstance(head, dict) else {}), m.group(2)


class ModuleFiles:
    def __init__(self, world: World, home: Path | None = None) -> None:
        self.world = world
        self.home = home if home is not None else Path(world.path).parent

    def dir_of(self, module_id: str) -> Path:
        return self.home / "modules" / module_id

    # ---- the whole sync ----

    def sync(self) -> dict[str, int]:
        """Every module's directory and ALPHA.md brought in line with the world, both ways.
        Returns how many files were written and how many read in."""
        counts = {"written": 0, "read": 0}
        try:
            for m in self.world.modules.all():
                self.sync_module(m, counts)
            self.sync_instructions(counts)
        except Exception:  # a sync never fails a turn; the log says what went wrong
            log.exception("module files")
        return counts

    def sync_module(self, m: dict[str, Any], counts: dict[str, int] | None = None) -> None:
        counts = counts if counts is not None else {"written": 0, "read": 0}
        folder = self.dir_of(m["id"])
        folder.mkdir(parents=True, exist_ok=True)
        self._write_if_changed(folder / "module.yaml", self.module_yaml(m), counts)
        self._sync_notes(m, folder, counts)
        self._sync_agents(m, folder, counts)

    # ---- module.yaml ----

    def module_yaml(self, m: dict[str, Any]) -> str:
        world = self.world
        tables = []
        for t in world.collections.overview(m["id"]):
            desc = world.collections.describe(t["name"])
            table: dict[str, Any] = {"name": t["name"], "title": desc.get("title") or t["name"],
                                     "fields": desc["fields"]}
            if desc.get("title_field"):
                table["title_field"] = desc["title_field"]
            if desc.get("identity"):
                table["identity"] = desc["identity"]
            lists = [{"title": v["title"], **({"config": v["config"]} if v.get("config") else {})}
                     for v in world.views.for_table(t["name"])]
            if lists:
                table["lists"] = lists
            tables.append(table)
        parent = world.modules.get(m["parent"])["name"] if m.get("parent") else None
        data: dict[str, Any] = {"module": m["name"], "id": m["id"]}
        if m.get("goal"):
            data["goal"] = m["goal"]
        if parent:
            data["parent"] = parent
        data["tables"] = tables
        data["skills"] = sorted(s["name"] for s in world.skills.index()
                                if s.get("module") == m["id"])
        data["agents"] = sorted(a["name"] for a in world.agents.all(m["id"]))
        pages = world.pages.names(m["id"])
        if pages:
            data["pages"] = pages
        return _dump(data)

    # ---- NOTES.md ----

    def _page(self, m: dict[str, Any]) -> dict[str, Any] | None:
        return self.world.knowledge.find_note(f"module:{m['name']}", m["name"])

    def _sync_notes(self, m: dict[str, Any], folder: Path, counts: dict[str, int]) -> None:
        path = folder / "NOTES.md"
        page = self._page(m)
        body = page["body"] if page else ""
        if path.exists():
            text = path.read_text()
            if text.strip() != body.strip():
                newer = _stamp(path) > (page["updated_at"] if page else "")
                if newer and text.strip():
                    self.world.knowledge.write_note(f"module:{m['name']}", m["name"], text.strip(),
                                                    source="file:NOTES.md")
                    counts["read"] += 1
                    path.write_text(text.strip() + "\n")  # canonical, and dated now
                    return
        if body.strip():
            self._write_if_changed(path, body.rstrip("\n") + "\n", counts)

    # ---- agents/<name>.md ----

    def agent_text(self, a: dict[str, Any]) -> str:
        brief = self.world.knowledge.find_note(f"agent:{a['id']}", "Brief")
        head: dict[str, Any] = {"agent": a["name"], "id": a["id"], "title": a["description"]}
        if a.get("schedule"):
            head["schedule"] = a["schedule"]
        head["state"] = a["state"]
        if a.get("steps"):
            head["steps"] = a["steps"]
        if a.get("skill"):
            head["skill"] = a["skill"]  # the run skill that holds the steps
        if a.get("may"):
            head["may"] = a["may"]
        if a.get("goal"):
            head["goal"] = a["goal"]
        body = (brief["body"].strip() + "\n") if brief and brief["body"].strip() else ""
        return f"---\n{_dump(head)}---\n{body}"

    def _sync_agents(self, m: dict[str, Any], folder: Path, counts: dict[str, int]) -> None:
        agents = [a for a in self.world.agents.all(m["id"]) if a["kind"] == "custom"]
        if not agents:
            return
        (folder / "agents").mkdir(exist_ok=True)
        for a in agents:
            path = folder / "agents" / f"{slug(a['name'])}.md"
            wanted = self.agent_text(a)
            if path.exists():
                text = path.read_text()
                if text.strip() != wanted.strip():
                    brief = self.world.knowledge.find_note(f"agent:{a['id']}", "Brief")
                    stamp = max(a["updated_at"], brief["updated_at"] if brief else "")
                    if _stamp(path) > stamp:
                        self._read_agent(a, text)
                        counts["read"] += 1
                        # written back in its canonical form, dated now: the next change in
                        # the world is newer than the file and wins
                        path.write_text(self.agent_text(self.world.agents.get(a["id"])))
                        continue
            self._write_if_changed(path, wanted, counts)

    def read_agent_text(self, a: dict[str, Any], text: str) -> None:
        """An agent's text as the window saved it: taken like an edited file, and the file
        written canonical."""
        self._read_agent(a, text)
        folder = self.dir_of(a["module"]) if a.get("module") else None
        if folder is not None:
            (folder / "agents").mkdir(parents=True, exist_ok=True)
            (folder / "agents" / f"{slug(a['name'])}.md").write_text(
                self.agent_text(self.world.agents.get(a["id"])))

    def _read_agent(self, a: dict[str, Any], text: str) -> None:
        """An agent file the person or the model edited: its front matter sets what it may,
        its body is the brief."""
        head, body = split_front(text)
        changes: dict[str, Any] = {}
        for key in AGENT_KEYS:
            if key in head and head[key] != a.get("description" if key == "title" else key):
                changes["description" if key == "title" else key] = head[key]
        if changes:
            try:
                self.world.agents.update(a["id"], **changes)
            except Problem as e:
                log.warning("agent file %s not taken: %s", a["name"], e)
                return
        brief = self.world.knowledge.find_note(f"agent:{a['id']}", "Brief")
        if body.strip() != ((brief["body"].strip()) if brief else ""):
            if body.strip():
                self.world.knowledge.write_note(f"agent:{a['id']}", "Brief", body.strip(),
                                                source="file:agent")
        self.world.journal.append("changed", f"The agent {a['name']} was changed in its file.",
                                  actor="person", data={"agent": a["id"], "file": True},
                                  module=a.get("module"))

    # ---- ALPHA.md ----

    def sync_instructions(self, counts: dict[str, int] | None = None) -> None:
        counts = counts if counts is not None else {"written": 0, "read": 0}
        path = self.home / "ALPHA.md"
        note = self.world.knowledge.find_note("person", INSTRUCTIONS)
        body = note["body"] if note else ""
        if path.exists():
            text = path.read_text()
            if text.strip() != body.strip():
                if _stamp(path) > (note["updated_at"] if note else ""):
                    self.world.knowledge.write_note("person", INSTRUCTIONS, text.strip(),
                                                    source="file:ALPHA.md")
                    counts["read"] += 1
                    path.write_text(text.strip() + "\n")  # canonical, and dated now
                    return
        if body.strip():
            self._write_if_changed(path, body.rstrip("\n") + "\n", counts)

    # ---- helpers ----

    @staticmethod
    def _write_if_changed(path: Path, text: str, counts: dict[str, int]) -> None:
        if path.exists() and path.read_text() == text:
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        counts["written"] += 1
