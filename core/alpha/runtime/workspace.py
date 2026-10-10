"""A module's workspace (design §6.4, Q38): the folder Alpha codes in, the three artifacts, the
walls around a build run, and a sandboxed way to run the workspace's own scripts.

    modules/<module id>/
      DESIGN.md         the agreed design, frozen per milestone
      milestones.json   what the build delivers, each with its checks; `passes` only the
                        evaluator flips (runtime/milestones.py)
      PROGRESS.md       append-only: what each session did, decided and left
      inputs/           the person's own files, read-only
      .venv/ data/ module.duckdb pipeline.py selftest.py settings.json …  Alpha's build

The build run is Claude Code with its file and shell tools inside Claude Code's own sandbox,
driven by the settings `sandbox_settings` returns: deny-default, writes only in the workspace,
reads denied for the person's secrets and Alpha's world file, network only to the hosts the
design names (plus what a Python build needs: PyPI and DuckDB's extensions). A script the core
runs itself (the self-test) runs under `sandbox-exec` with no network at all.
"""

from __future__ import annotations

import json
import os
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from alpha.world.store import Problem, now
from alpha.world.world import World, alpha_home

# What any Python build needs to reach, beyond the design's own hosts.
BUILD_HOSTS = ["pypi.org", "files.pythonhosted.org", "extensions.duckdb.org",
               "community-extensions.duckdb.org"]
SECRET_PATHS = ["~/.ssh", "~/.aws", "~/.gnupg", "~/.config/gcloud", "~/.netrc",
                "~/Library/Keychains", "~/.claude", "~/.codex"]
SCRIPT_TIMEOUT_S = 1800


def root() -> Path:
    return alpha_home() / "modules"


def path_of(module_id: str) -> Path:
    return root() / module_id


def _git(workspace: Path, *args: str) -> str:
    out = subprocess.run(["git", *args], cwd=workspace, capture_output=True, text=True,
                         env={**os.environ, "GIT_AUTHOR_NAME": "Alpha",
                              "GIT_AUTHOR_EMAIL": "alpha@local", "GIT_COMMITTER_NAME": "Alpha",
                              "GIT_COMMITTER_EMAIL": "alpha@local"})
    if out.returncode != 0:
        raise Problem(f"git {args[0]} failed in the workspace: {out.stderr.strip()[:300]}")
    return out.stdout


def make(world: World, plan: dict[str, Any], module_id: str) -> Path:
    """Create the workspace for a plan's module with its three artifacts, under git."""
    from alpha.world import plans as plans_module

    ws = path_of(module_id)
    if (ws / "DESIGN.md").exists():
        return ws
    ws.mkdir(parents=True, exist_ok=True)
    (ws / "inputs").mkdir(exist_ok=True)
    decided = plans_module.decided_words(plan)
    (ws / "DESIGN.md").write_text(
        f"# {plan['title']}\n\n{plan['body'].strip()}\n\n"
        + (f"## Decided before the build\n{decided}\n\n" if decided else "")
        + (f"## Trial\n{plan['trial']}\n" if plan.get("trial") else ""))
    (ws / "milestones.json").write_text(json.dumps(plan.get("milestones") or [], indent=1))
    (ws / "PROGRESS.md").write_text(
        f"# Progress\n\nAppend-only. Each session adds what it did, decided and left.\n\n"
        f"## {now()} — workspace made\n- The design and the milestones are in place."
        " Nothing built yet.\n")
    (ws / ".gitignore").write_text(".venv/\n*.tmp\n__pycache__/\n.DS_Store\n")
    if not (ws / ".git").exists():
        _git(ws, "init", "-q")
    _git(ws, "add", "-A")
    _git(ws, "commit", "-q", "-m", "The design and the milestones", "--allow-empty")
    world.modules.set_workspace(module_id, str(ws))
    return ws


def remove(module_id: str) -> bool:
    """Delete a module's workspace for good (removal, §7); the journal keeps the record."""
    import shutil

    ws = path_of(module_id)
    if ws.is_dir() and ws.resolve().is_relative_to(root().resolve()):
        shutil.rmtree(ws, ignore_errors=True)
        return True
    return False


def hosts_for(plan: dict[str, Any]) -> list[str]:
    seen = dict.fromkeys(BUILD_HOSTS + [str(h).strip().lower() for h in (plan.get("hosts") or [])])
    return [h for h in seen if h]


def sandbox_settings(workspace: Path, hosts: list[str], world_path: Path) -> dict[str, Any]:
    """Claude Code's settings for a build run: its own sandbox (deny-default, verified on
    this Mac with the flags Alpha passes), and the policy walls for the non-shell tools."""
    secrets = [os.path.expanduser(p) for p in SECRET_PATHS]
    world_dir = str(Path(world_path).parent)
    return {
        "sandbox": {
            "enabled": True,
            "autoAllowBashIfSandboxed": True,
            "allowUnsandboxedCommands": False,
            "failIfUnavailable": True,
            "filesystem": {
                "allowWrite": [str(workspace)],
                "denyWrite": [str(workspace / ".git" / "hooks"), str(workspace / ".git" / "config"),
                              str(workspace / "milestones.json"), str(workspace / "inputs")],
                "denyRead": [*secrets, world_dir],
            },
            "network": {"allowedDomains": hosts, "strictAllowlist": True,
                        "allowLocalBinding": False, "allowUnixSockets": []},
            "credentials": {"envVars": {"deny": ["*TOKEN*", "*SECRET*", "*KEY*", "*PASSWORD*"]}},
        },
        "permissions": {
            "blockReadsOutsideWorkingDirectories": True,
            "deny": [f"Read({p})" for p in [*secrets, world_dir]]
            + [f"Edit({workspace / 'milestones.json'})", f"Write({workspace / 'milestones.json'})",
               f"Edit({workspace / 'inputs'}/**)", f"Write({workspace / 'inputs'}/**)"],
        },
    }


# ---- running a workspace's own script, with no network ----


def _profile(workspace: Path, tmp: Path) -> str:
    """A deny-default Seatbelt profile: read anywhere but the person's secrets and Alpha's
    world, write only in the workspace and a scratch dir, no network."""
    def sub(p: str) -> str:
        return f'(subpath "{os.path.realpath(os.path.expanduser(p))}")'
    denied = " ".join(sub(p) for p in SECRET_PATHS + [str(alpha_home())]
                      if os.path.exists(os.path.expanduser(p)))
    return f"""(version 1)
(deny default)
(allow process-exec*)
(allow process-fork)
(allow process-info*)
(allow signal (target same-sandbox))
(allow sysctl-read)
(allow mach-lookup)
(allow ipc-posix*)
(allow file-ioctl)
(allow file-read*)
{f'(deny file-read* {denied})' if denied else ''}
(allow file-read* {sub(str(workspace))})
(allow file-write* {sub(str(workspace))} {sub(str(tmp))} (literal "/dev/null")
  (regex #"^/dev/tty"))
"""


def run_script(workspace: Path, argv: list[str], *, timeout_s: float = SCRIPT_TIMEOUT_S,
               env: dict[str, str] | None = None) -> tuple[int, str]:
    """Run a command in the workspace under the no-network profile; the exit code and the
    output's tail. The workspace's own `.venv` python is used when `python` is asked for."""
    if not argv:
        raise Problem("Nothing to run.")
    ws = Path(workspace).resolve()
    if argv[0] == "python":
        venv = ws / ".venv" / "bin" / "python"
        argv = [str(venv) if venv.exists() else sys.executable, *argv[1:]]
    tmp = Path(tempfile.mkdtemp(prefix="alpha-script-"))
    profile = _profile(ws, tmp)
    full_env = {**os.environ, **(env or {}), "TMPDIR": str(tmp), "HOME": str(ws),
                "PYTHONDONTWRITEBYTECODE": "1"}
    try:
        proc = subprocess.run(["/usr/bin/sandbox-exec", "-p", profile, *argv], cwd=ws,
                              capture_output=True, text=True, timeout=timeout_s, env=full_env)
        out = (proc.stdout + proc.stderr)[-4000:]
        return proc.returncode, out
    except subprocess.TimeoutExpired:
        return 124, f"Timed out after {int(timeout_s)} s: {shlex.join(argv)}"
    except FileNotFoundError:
        return 127, "sandbox-exec is not on this Mac."
