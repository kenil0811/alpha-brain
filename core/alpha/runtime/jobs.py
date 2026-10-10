"""What a person can do with a program module (design §6.4): its jobs.

A module declares them in `jobs.yaml` in its workspace:

    jobs:
      - id: screen
        title: Screen an address
        what: Runs the three gates on one address and adds it to Sites.
        inputs:
          - {name: address, label: Address, kind: text, required: true}
        command: [".venv/bin/python", "run_screen.py", "{address}"]

The module's page shows each as a form; the core runs the command in the workspace under the
profile with the network walled to the plan's hosts through Alpha's proxy, journals what ran
and what it reached, and the module's tables show the result. The evaluator runs a job the
same way for a milestone's `job` check: a milestone passes only when what the person can do
works. Inputs go into the command as whole arguments, never through a shell.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

import yaml

from alpha.runtime import workspace as workspace_module
from alpha.world.store import Problem
from alpha.world.world import World

log = logging.getLogger("alpha.jobs")
JOB_TIMEOUT_S = 1800
INPUT_KINDS = ("text", "number")


def jobs_of(workspace: Path | str | None) -> list[dict[str, Any]]:
    """The declared jobs, cleaned; none when the file is missing or unreadable (the page
    says the module declares none yet)."""
    if not workspace:
        return []
    path = Path(workspace) / "jobs.yaml"
    if not path.exists():
        return []
    try:
        data = yaml.safe_load(path.read_text()) or {}
    except (yaml.YAMLError, OSError):
        return []
    out: list[dict[str, Any]] = []
    for j in data.get("jobs") or []:
        if not isinstance(j, dict) or not j.get("id") or not j.get("command"):
            continue
        command = j["command"] if isinstance(j["command"], list) else str(j["command"]).split()
        inputs = []
        for i in j.get("inputs") or []:
            if isinstance(i, dict) and i.get("name"):
                inputs.append({"name": str(i["name"]), "label": str(i.get("label") or i["name"]),
                               "kind": str(i.get("kind") or "text")
                               if str(i.get("kind") or "text") in INPUT_KINDS else "text",
                               "required": bool(i.get("required", True)),
                               "help": str(i.get("help") or "")})
        out.append({"id": str(j["id"]), "title": str(j.get("title") or j["id"]),
                    "what": str(j.get("what") or ""), "inputs": inputs,
                    "command": [str(c) for c in command]})
    return out


def _fill(command: list[str], inputs: dict[str, Any], declared: list[dict[str, Any]]
          ) -> list[str]:
    values: dict[str, str] = {}
    for d in declared:
        v = inputs.get(d["name"])
        if v is None or str(v).strip() == "":
            if d["required"]:
                raise Problem(f"{d['label']} is needed.")
            v = ""
        if d["kind"] == "number":
            try:
                float(str(v))
            except ValueError as e:
                raise Problem(f"{d['label']} must be a number.") from e
        values[d["name"]] = str(v).strip()
    out = []
    for part in command:
        for name, v in values.items():
            part = part.replace("{" + name + "}", v)
        out.append(part)
    return out


def hosts_for_module(world: World, module_id: str) -> list[str]:
    """The hosts the module's build may reach: from its latest plan with hosts."""
    for plan in reversed(world.plans.all()):
        if plan.get("module") == module_id and plan.get("hosts"):
            return workspace_module.hosts_for(plan)
    return workspace_module.hosts_for({})


def run_job(world: World, module_id: str, job_id: str, inputs: dict[str, Any] | None = None,
            *, thread: str | None = None) -> dict[str, Any]:
    module = world.modules.get(module_id)
    ws = module.get("workspace")
    jobs = jobs_of(ws)
    job = next((j for j in jobs if j["id"] == job_id), None)
    if not job or not ws:
        raise Problem(f"This module has no job '{job_id}'.")
    argv = _fill(job["command"], inputs or {}, job["inputs"])
    hosts = hosts_for_module(world, module["id"])
    code, out = workspace_module.run_script(Path(ws), argv, timeout_s=JOB_TIMEOUT_S, hosts=hosts)
    given = ", ".join(f"{d['label']} {inputs.get(d['name'])!r}" for d in job["inputs"]
                      if (inputs or {}).get(d["name"]) is not None) if inputs else ""
    tail = " ".join(out.strip().splitlines()[-2:])[:300]
    line = (f"Ran {job['title']}" + (f" ({given})" if given else "")
            + (": done." if code == 0 else f": it failed (exit {code})."))
    world.journal.append("did" if code == 0 else "failed", f"{line} {tail}", actor="alpha",
                         module=module["id"], thread=thread,
                         data={"job": job_id, "inputs": inputs or {}, "exit": code})
    return {"job": job_id, "ok": code == 0, "exit": code, "output": out[-2000:]}
