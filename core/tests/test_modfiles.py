"""A module as a directory (harness §5, slice 5): module.yaml from the world, NOTES.md and the
agents' files both ways, ALPHA.md for the standing instructions."""

from __future__ import annotations

import os
import time
from pathlib import Path

import yaml
from conftest import building

from alpha.world.skills import slug
from alpha.world.world import World


def later(path: Path) -> None:
    """A file edited after the world's last write: its mtime a little in the future."""
    future = time.time() + 5
    os.utime(path, (future, future))


def test_a_modules_directory_holds_its_shape_notes_and_agents(world: World) -> None:
    t = building(world)
    module = t.module_create("Jobs", goal="find a back-end role")["id"]
    t.collection_create("remote_job", "Job listings", [
        {"name": "title", "kind": "text", "required": True}, {"name": "url", "kind": "url"}],
        module=module, title_field="title")
    world.views.save("remote_job", "Applied", {"filters": []})
    auto = t.agent_create("Daily jobs", "daily 07:00", brief="read the boards and tell me",
                          module="Jobs", name="Daily jobs")
    world.knowledge.write_note("module:Jobs", "Jobs", "What this is for: a back-end role by Q1.")
    world.files.sync()
    folder = Path(world.path).parent / "modules" / module
    shape = yaml.safe_load((folder / "module.yaml").read_text())
    assert shape["module"] == "Jobs" and shape["goal"] == "find a back-end role"
    assert [tb["name"] for tb in shape["tables"]] == ["remote_job"]
    assert shape["tables"][0]["title_field"] == "title"
    assert [f["name"] for f in shape["tables"][0]["fields"]] == ["title", "url"]
    assert shape["tables"][0]["lists"][0]["title"] == "Applied"
    assert shape["agents"] == ["Daily jobs"]
    assert (folder / "NOTES.md").read_text().startswith("What this is for")
    agent_file = folder / "agents" / f"{slug('Daily jobs')}.md"
    text = agent_file.read_text()
    assert text.startswith("---\nagent: Daily jobs\n") and "schedule: daily 07:00" in text
    assert text.rstrip().endswith("read the boards and tell me")
    # a second sync writes nothing
    assert world.files.sync() == {"written": 0, "read": 0}
    # the page edited as a file, newer than the world: read in
    (folder / "NOTES.md").write_text("What this is for: a back-end role by Q1.\nDecided: UK only.\n"
                                     )
    later(folder / "NOTES.md")
    assert world.files.sync()["read"] == 1
    page = world.knowledge.find_note("module:Jobs", "Jobs")
    assert page and "Decided: UK only." in page["body"]
    # the agent's file edited: its schedule and brief follow, journaled
    agent_file.write_text(text.replace("schedule: daily 07:00", "schedule: daily 08:30")
                          .replace("read the boards and tell me", "read the boards; UK only"))
    later(agent_file)
    assert world.files.sync()["read"] == 1
    again = world.agents.get(auto["id"])
    assert again["schedule"] == "daily 08:30"
    brief = world.knowledge.find_note(f"agent:{auto['id']}", "Brief")
    assert brief and brief["body"] == "read the boards; UK only"
    assert world.journal.recent(1, kinds=["changed"])[-1]["text"] == (
        "The agent Daily jobs was changed in its file.")
    # the world changed: the file follows
    world.agents.update(auto["id"], state="paused")
    world.files.sync()
    assert "state: paused" in agent_file.read_text()


def test_the_standing_instructions_are_a_file_both_ways(world: World) -> None:
    world.knowledge.add_instruction("Always answer in British English.", "j_1")
    world.files.sync()
    path = Path(world.path).parent / "ALPHA.md"
    assert "British English" in path.read_text()
    path.write_text(path.read_text() + "- Never log food after 22:00.\n")
    later(path)
    world.files.sync()
    assert "Never log food after 22:00." in "\n".join(world.knowledge.instructions())
