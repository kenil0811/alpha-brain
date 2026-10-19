"""Kits (harness §15, Q53, slice 5): a module's directory with no data in it, installed in
another world; a newer version replaces what nobody changed and keeps the person's."""

from __future__ import annotations

from pathlib import Path

import pytest
import yaml
from conftest import building

from alpha.world.store import Problem
from alpha.world.world import World


def jobs_module(world: World) -> str:
    t = building(world)
    module = str(t.module_create("Jobs", goal="find a back-end role")["id"])
    t.collection_create("remote_job", "Job listings", [
        {"name": "title", "kind": "text", "required": True}, {"name": "url", "kind": "url"}],
        module=module, title_field="title")
    world.views.save("remote_job", "Applied", {"filters": []})
    world.skills.save("wwr_backend_jobs", "read", description="WWR back-end", module=module,
                      url="https://weworkremotely.com/x", script="return rows",
                      site="weworkremotely.com")
    t.agent_create("Daily jobs", "daily 07:00", steps=[{"read": "wwr_backend_jobs",
                                                         "into": "remote_job", "key": "url"},
                                                        {"tell": "remote_job"}], module="Jobs",
                                                        name="Daily jobs")
    world.knowledge.write_note("module:Jobs", "Jobs", "A back-end role by Q1; UK only.")
    world.collections.add("remote_job", {"title": "A role", "url": "https://x/1"}, {"by": "alpha"})
    return module


def test_a_kit_installs_the_module_empty_in_another_world(tmp_path: Path, world: World) -> None:
    module = jobs_module(world)
    out = world.kits.export("Jobs", to=tmp_path / "out")
    kit = Path(out["kit"])
    assert kit.name == "jobs.alphakit" and out["version"] == 1 and out["crosses"] == []
    head = yaml.safe_load((kit / "kit.yaml").read_text())
    assert head["kit"] == "Jobs" and head["version"] == 1 and head["made_in"]
    assert (kit / "skills" / "wwr_backend_jobs" / "SKILL.md").is_file()
    assert (kit / "agents").is_dir() and (kit / "NOTES.md").is_file()
    assert not (kit / "skills" / ".git").exists() and "files.sha" in {p.name for p in kit.iterdir()}
    # nothing of the data travels
    assert "A role" not in "".join(p.read_text() for p in kit.rglob("*") if p.is_file())
    other = World(tmp_path / "other" / "w.sqlite")
    got = other.kits.install(kit)
    # two skills: the reader and the agent's own run skill, which the agent keeps (no second one)
    assert got["tables"] == 1 and got["skills"] == 2 and got["agents"] == 1 and got["lists"] == 1
    assert got["words"].startswith(
        "Installed the kit Jobs (v1): 1 table, 1 list, 2 skills, 1 agent.")
    assert len(other.skills.all("run")) == 1
    assert "paused until you turn them on" in got["words"]
    assert other.collections.describe("remote_job")["records"] == 0
    assert [v["title"] for v in other.views.for_table("remote_job")] == ["Applied"]
    agent = other.agents.all()[0]
    assert agent["name"] == "Daily jobs" and not agent["on"] and agent["steps"][0]["read"] == \
        "wwr_backend_jobs"
    installed_skill = other.skills.get("wwr_backend_jobs")
    assert installed_skill["script"] == "return rows"
    assert installed_skill["module"] == got["module"]  # this module's now, not the old id
    assert [s["name"] for s in other.skills.index() if s["module"] == got["module"]] == [
        "run_daily_jobs", "wwr_backend_jobs"] or len(
        [s for s in other.skills.index() if s["module"] == got["module"]]) == 2
    page = other.knowledge.find_note("module:Jobs", "Jobs")
    assert page and "UK only" in page["body"]
    assert other.kits.installed()[0]["version"] == 1
    # the same kit a second time, nothing changed: an update that changes nothing
    again = other.kits.install(kit)
    assert again["words"].startswith("Updated the kit Jobs (v1)") and again["kept"] == []
    # a module of that name already there, not from a kit: refused in words
    third = World(tmp_path / "third" / "w.sqlite")
    third.modules.create("Jobs")
    with pytest.raises(Problem):
        third.kits.install(kit)
    other.close()
    third.close()
    del module


def test_a_newer_kit_replaces_what_nobody_changed_and_keeps_the_persons(tmp_path: Path,
                                                                      world: World) -> None:
    jobs_module(world)
    kit = Path(world.kits.export("Jobs", to=tmp_path / "out")["kit"])
    other = World(tmp_path / "other" / "w.sqlite")
    other.kits.install(kit)
    # the person changes the skill in their Alpha; the author ships v2 with a new note and a
    # new skill script
    other.skills.save("wwr_backend_jobs", "read", description="WWR back-end, mine",
                      module=other.modules.get("Jobs")["id"], url="https://weworkremotely.com/x",
                      script="return myRows", site="weworkremotely.com")
    world.skills.save("wwr_backend_jobs", "read", description="WWR back-end v2",
                      module=world.modules.get("Jobs")["id"], url="https://weworkremotely.com/x",
                      script="return rows2", site="weworkremotely.com")
    world.knowledge.write_note("module:Jobs", "Jobs", "A back-end role by Q1; UK only; remote.")
    kit2 = Path(world.kits.export("Jobs", to=tmp_path / "out2")["kit"])
    assert yaml.safe_load((kit2 / "kit.yaml").read_text())["version"] == 2
    got = other.kits.install(kit2)
    assert got["version"] == 2
    assert got["kept"] == ["skills/wwr_backend_jobs"]
    assert "Kept your versions of skills/wwr_backend_jobs." in got["words"]
    assert other.skills.get("wwr_backend_jobs")["script"] == "return myRows"  # theirs
    page = other.knowledge.find_note("module:Jobs", "Jobs")
    assert page and "remote." in page["body"]  # untouched: replaced
    other.close()


def test_the_export_names_what_reaches_outside_the_module(tmp_path: Path, world: World) -> None:
    jobs_module(world)
    t = building(world)
    t.collection_create("contacts", "Contacts", [{"name": "name", "kind": "text"}])
    world.agents.update(world.agents.all()[0]["id"],
                        steps=[{"read": "wwr_backend_jobs", "into": "remote_job", "key": "url"},
                               {"tell": "contacts"}])
    out = world.kits.export("Jobs", to=tmp_path / "out")
    assert out["crosses"] == ["the agent Daily jobs reaches the table contacts (no module)"]
    assert "crosses" in yaml.safe_load((Path(out["kit"]) / "kit.yaml").read_text())


def test_kits_shipped_in_the_bundle_install_once_per_version(tmp_path: Path, world: World) -> None:
    jobs_module(world)
    kit = Path(world.kits.export("Jobs", to=tmp_path / "bundle" / "kits")["kit"])
    other = World(tmp_path / "other" / "w.sqlite")
    done = other.kits.install_shipped(kit.parent)
    assert [d["name"] for d in done] == ["Jobs"] and done[0]["version"] == 1
    assert other.kits.install_shipped(kit.parent) == []  # the same version: nothing
    world.knowledge.write_note("module:Jobs", "Jobs", "v2 notes.")
    world.kits.export("Jobs", to=tmp_path / "bundle" / "kits")
    again = other.kits.install_shipped(kit.parent)
    assert [d["version"] for d in again] == [2]
    other.close()
