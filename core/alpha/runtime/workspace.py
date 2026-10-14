"""A module's workspace (design §6.4 kept by §12): the folder Alpha codes in, the walls
around a build run, and a sandboxed way to run the workspace's own scripts.

    modules/<module id>/
      WORKFLOW.md, workflow.json   the agreed page (runtime/workflow_build.py)
      PROGRESS.md       append-only: what each session did, decided and left
      inputs/           the person's own files, read-only
      parts.yaml parts/ documents/ .venv/ …   Alpha's build

The build run is Claude Code with its file and shell tools inside Claude Code's own sandbox,
driven by the settings `sandbox_settings` returns: deny-default, writes only in the workspace,
reads denied for the person's secrets and Alpha's world file, network only to the hosts the
page names (plus what a Python build needs: PyPI and DuckDB's extensions). A script the core
runs itself (a part) runs under `sandbox-exec` with Alpha's proxy as the one road out.
"""

from __future__ import annotations

import os
import shlex
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any

from alpha.runtime.proxy import Proxy
from alpha.world.store import Problem
from alpha.world.workspaces import path_of, remove, root
from alpha.world.world import alpha_home

# where a workspace lives is the world's (world/workspaces.py); the runtime offers it as before
__all__ = ["path_of", "remove", "root"]

# What any Python build needs to reach, beyond the design's own hosts.
BUILD_HOSTS = ["pypi.org", "files.pythonhosted.org", "extensions.duckdb.org",
               "community-extensions.duckdb.org"]
SECRET_PATHS = ["~/.ssh", "~/.aws", "~/.gnupg", "~/.config/gcloud", "~/.netrc",
                "~/Library/Keychains", "~/.claude", "~/.codex"]
SCRIPT_TIMEOUT_S = 1800


def _git(workspace: Path, *args: str) -> str:
    out = subprocess.run(["git", *args], cwd=workspace, capture_output=True, text=True,
                         env={**os.environ, "GIT_AUTHOR_NAME": "Alpha",
                              "GIT_AUTHOR_EMAIL": "alpha@local", "GIT_COMMITTER_NAME": "Alpha",
                              "GIT_COMMITTER_EMAIL": "alpha@local"})
    if out.returncode != 0:
        raise Problem(f"git {args[0]} failed in the workspace: {out.stderr.strip()[:300]}")
    return out.stdout


def hosts_for(hosts: list[str]) -> list[str]:
    """The hosts a build or a part may reach: what the page or the part names, and what a
    Python build needs."""
    seen = dict.fromkeys(BUILD_HOSTS + [str(h).strip().lower() for h in hosts or []])
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
                              str(workspace / "inputs")],
                "denyRead": [*secrets, world_dir],
            },
            "network": {"allowedDomains": hosts, "strictAllowlist": True,
                        "allowLocalBinding": False, "allowUnixSockets": []},
            "credentials": {"envVars": {"deny": ["*TOKEN*", "*SECRET*", "*KEY*", "*PASSWORD*"]}},
        },
        "permissions": {
            "blockReadsOutsideWorkingDirectories": True,
            "deny": [f"Read({p})" for p in [*secrets, world_dir]]
            + [f"Edit({workspace / 'inputs'}/**)", f"Write({workspace / 'inputs'}/**)"],
        },
    }


# ---- running a workspace's own script, with no network ----


def _profile(workspace: Path, tmp: Path, proxy_port: int | None = None) -> str:
    """A deny-default Seatbelt profile: read anywhere but the person's secrets and Alpha's
    world, write only in the workspace and a scratch dir, no network except, when a proxy
    port is given, the loopback to Alpha's own proxy (runtime/proxy.py)."""
    def sub(p: str) -> str:
        return f'(subpath "{os.path.realpath(os.path.expanduser(p))}")'
    roots = [os.path.realpath(os.path.expanduser(p)) for p in SECRET_PATHS + [str(alpha_home())]
             if os.path.exists(os.path.expanduser(p))]
    denied = " ".join(f'(subpath "{r}")' for r in roots)
    # The workspace lives inside Alpha's home, which is denied: a path lookup through the
    # home (a venv's python resolving its own symlink with realpath, found 11 Oct) needs
    # the metadata of the directories above the workspace, never their contents.
    real_ws = os.path.realpath(str(workspace))
    above = " ".join(f'(literal "{a}")' for a in _ancestors(real_ws)
                     if any(a == r or a.startswith(r + "/") for r in roots))
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
{f'(allow file-read-metadata {above})' if above else ''}
(allow file-read* {sub(str(workspace))})
(allow file-write* {sub(str(workspace))} {sub(str(tmp))} (literal "/dev/null")
  (regex #"^/dev/tty"))
{f'(allow network-outbound (remote ip "localhost:{proxy_port}"))' if proxy_port else ''}
"""


def _ancestors(path: str) -> list[str]:
    """The directories above a path, nearest first, up to but not including the root."""
    out: list[str] = []
    parent = os.path.dirname(path)
    while parent and parent != "/" and parent != path:
        out.append(parent)
        path, parent = parent, os.path.dirname(parent)
    return out


def run_script(workspace: Path, argv: list[str], *, timeout_s: float = SCRIPT_TIMEOUT_S,
               env: dict[str, str] | None = None, hosts: list[str] | None = None,
               stdin: str | None = None) -> tuple[int, str]:
    """Run a command in the workspace under the profile; the exit code and the output's tail.
    With `hosts`, the script reaches those hosts and nothing else, through Alpha's own proxy,
    and the output ends with what was reached and refused. The workspace's own `.venv` python
    is used when `python` is asked for."""
    if not argv:
        raise Problem("Nothing to run.")
    ws = Path(workspace).resolve()
    if argv[0] == "python":
        venv = ws / ".venv" / "bin" / "python"
        argv = [str(venv) if venv.exists() else sys.executable, *argv[1:]]
    tmp = Path(tempfile.mkdtemp(prefix="alpha-script-"))
    full_env = {**os.environ, **(env or {}), "TMPDIR": str(tmp), "HOME": str(ws),
                "PYTHONDONTWRITEBYTECODE": "1"}
    for key in list(full_env):
        if key.upper() in ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY"):
            full_env.pop(key)
    proxy = None
    if hosts:
        proxy = Proxy(hosts).start()
        url = f"http://127.0.0.1:{proxy.port}"
        full_env.update({"HTTP_PROXY": url, "HTTPS_PROXY": url, "http_proxy": url,
                         "https_proxy": url, "ALPHA_PROXY": url})
    profile = _profile(ws, tmp, proxy.port if proxy else None)
    try:
        proc = subprocess.run(["/usr/bin/sandbox-exec", "-p", profile, *argv], cwd=ws,
                              capture_output=True, text=True, timeout=timeout_s, env=full_env,
                              input=stdin)
        out = (proc.stdout + proc.stderr)[-4000:]
        code = proc.returncode
    except subprocess.TimeoutExpired:
        code, out = 124, f"Timed out after {int(timeout_s)} s: {shlex.join(argv)}"
    except FileNotFoundError:
        code, out = 127, "sandbox-exec is not on this Mac."
    finally:
        if proxy:
            proxy.stop()
    if proxy:
        out = f"{out}\n[network: {proxy.words()}]"
    return code, out
