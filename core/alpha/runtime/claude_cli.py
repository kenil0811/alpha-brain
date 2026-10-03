"""Run one model turn through the Claude Code CLI on the person's subscription.

`claude -p` gets the sentence, Alpha's rules and the pre-pack as an appended system prompt, and
the world as an MCP server. Nothing else of the person's Claude Code setup applies (no user
settings, CLAUDE.md or hooks; no other MCP servers), and only Alpha's tools plus web search and
fetch are allowed: anything that would ask for permission is refused.

Headless runs need the default config home (a private CLAUDE_CONFIG_DIR is not logged in) and
USER in the environment.
"""

from __future__ import annotations

import getpass
import json
import os
import signal
import subprocess
import sys
import tempfile
import threading
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from alpha.runtime import claude_account

DEFAULT_MODEL = "sonnet"
ALLOWED = ["mcp__alpha", "WebSearch", "WebFetch"]
DENIED = ["Bash", "Edit", "Write", "NotebookEdit", "Read", "Glob", "Grep", "Task"]


SIGNED_OUT = "Claude isn't signed in on this Mac: sign in from Settings."
OUT_OF_STEPS = "It reached the most steps Claude Code takes in one run."
STOPPED = "You stopped it."


class Live:
    """Runs in progress, so the person can stop any of them: there is no limit on how long a run
    or a build may take, and stopping is how work that isn't going anywhere ends. Each run is
    known by its turn (the journal entry that started it) and its thread."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.procs: dict[str, subprocess.Popen[str]] = {}
        self.stopped: set[int] = set()
        # What each run is doing right now, in plain words, for the window.
        self.progress: dict[str, dict[str, Any]] = {}

    def note(self, keys: list[str], **what: Any) -> None:
        with self.lock:
            for key in keys:
                current = self.progress.setdefault(key, {"thought": None, "doing": None,
                                                         "tools": 0, "at": None})
                current.update({k: v for k, v in what.items() if v is not None})
                current["at"] = time.time()

    def progress_for(self, key: str | None) -> dict[str, Any] | None:
        if not key:
            return None
        with self.lock:
            found = self.progress.get(key)
            return dict(found) if found else None

    def add(self, keys: list[str], proc: subprocess.Popen[str]) -> None:
        with self.lock:
            for key in keys:
                self.procs[key] = proc

    def remove(self, keys: list[str], proc: subprocess.Popen[str]) -> bool:
        """Forget a finished run; True when the person stopped it."""
        with self.lock:
            for key in keys:
                if self.procs.get(key) is proc:
                    del self.procs[key]
                self.progress.pop(key, None)
            was = proc.pid in self.stopped
            self.stopped.discard(proc.pid)
            return was

    def running(self, key: str) -> bool:
        with self.lock:
            return key in self.procs

    def stop(self, key: str) -> bool:
        """Stop the run known by `key` (and everything it started); False when none is running."""
        with self.lock:
            proc = self.procs.get(key)
            if proc is None:
                return False
            self.stopped.add(proc.pid)
        try:
            os.killpg(proc.pid, signal.SIGTERM)
        except (ProcessLookupError, PermissionError):
            return True

        def finish() -> None:
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try:
                    os.killpg(proc.pid, signal.SIGKILL)
                except (ProcessLookupError, PermissionError):
                    pass

        threading.Thread(target=finish, daemon=True).start()
        return True


LIVE = Live()


@dataclass
class RunResult:
    reply: str
    ok: bool
    session_id: str | None = None
    num_turns: int | None = None
    duration_ms: int | None = None
    cost_estimate: float | None = None
    error: str | None = None
    raw: dict[str, Any] = field(default_factory=dict)
    # The run ended before its work did (Claude Code's own step ceiling), not because of a
    # problem: work can carry on from where it got to.
    cut_off: bool = False
    # The person stopped it.
    stopped: bool = False


@dataclass
class TurnRequest:
    sentence: str
    system: str
    world_path: Path
    turn_id: str
    thread_id: str | None = None
    module_id: str | None = None
    model: str | None = None
    # What kind of run this is: "turn" (Alpha with its world and tools), "independent" (the same
    # model with web search only and no Alpha, for a second opinion) or "judge" (no tools at
    # all: compares two answers). Fake runners in tests tell them apart by it.
    kind: str = "turn"
    # A live conversation resumes its own session (`resume`) and keeps it (`persist`); every
    # other run is stateless, as Q21 decided.
    resume: str | None = None
    persist: bool = False


def tools_allowed(req: TurnRequest) -> list[str]:
    if req.kind == "independent":
        return ["WebSearch", "WebFetch"]
    if req.kind == "judge":
        return []
    return ALLOWED


def mcp_config(req: TurnRequest) -> dict[str, Any]:
    env = {
        "ALPHA_WORLD": str(req.world_path),
        "ALPHA_TURN": req.turn_id,
        "ALPHA_THREAD": req.thread_id or "",
        "ALPHA_MODULE": req.module_id or "",
    }
    return {
        "mcpServers": {
            "alpha": {"command": sys.executable, "args": ["-m", "alpha.mcp.server"], "env": env}
        }
    }


def argv(req: TurnRequest, config_path: Path, binary: str = "claude") -> list[str]:
    allowed = tools_allowed(req)
    denied = DENIED + ([] if allowed else ["WebSearch", "WebFetch"])
    args = [
        binary,
        "-p",
        req.sentence,
        "--output-format",
        "stream-json",  # events as they happen: the person watches, not waits
        "--verbose",
        "--append-system-prompt",
        req.system,
    ]
    if req.kind == "turn":
        # Alpha's world as an MCP server; an independent or judging run never sees it.
        args += ["--mcp-config", str(config_path), "--strict-mcp-config"]
    if allowed:
        args += ["--allowedTools", *allowed]
    args += [
        "--disallowedTools",
        *denied,
        # dontAsk: anything not in --allowedTools is refused rather than prompted for.
        "--permission-mode",
        "dontAsk",
        "--permission-prompts",
        "none",
        "--setting-sources",
        "",
        "--model",
        req.model or os.environ.get("ALPHA_MODEL") or DEFAULT_MODEL,
    ]
    if req.resume:
        args += ["--resume", req.resume]
    if not req.persist:
        # Stateless: the pre-pack carries the context, the journal the history. A remembered
        # model session would bring back whatever it once believed. Live conversations are the
        # one exception (design §3.7): their session is kept while they are live.
        args += ["--no-session-persistence"]
    return args


def run(req: TurnRequest, *, binary: str | None = None) -> RunResult:
    """Run one turn to its end, however long it takes; the person can stop it (LIVE.stop with
    the turn or its thread)."""
    env = dict(os.environ)
    env.setdefault("USER", getpass.getuser())
    env.pop("CLAUDE_CONFIG_DIR", None)
    # Alpha's tools are the whole point of a run: put every schema in context up front rather
    # than behind Claude Code's tool search, which cost a "find the tool" step on every turn.
    env.setdefault("ENABLE_TOOL_SEARCH", "false")
    keys = [k for k in (req.turn_id, req.thread_id) if k]
    with tempfile.TemporaryDirectory(prefix="alpha-turn-") as tmp:
        config_path = Path(tmp) / "mcp.json"
        config_path.write_text(json.dumps(mcp_config(req)))
        try:
            proc = subprocess.Popen(
                argv(req, config_path, binary or claude_account.binary() or "claude"),
                stdout=subprocess.PIPE, stderr=subprocess.PIPE, stdin=subprocess.DEVNULL,
                text=True, env=env, cwd=tmp, start_new_session=True,
            )
        except FileNotFoundError:
            return RunResult(reply="", ok=False, error="Claude Code isn't on this Mac yet:"
                             " connect Claude in Settings.")
        LIVE.add(keys, proc)
        errors: list[str] = []

        def drain() -> None:
            assert proc.stderr is not None
            errors.append(proc.stderr.read())

        reader = threading.Thread(target=drain, daemon=True)
        reader.start()
        final: dict[str, Any] = {}
        tail: list[str] = []
        try:
            assert proc.stdout is not None
            for line in proc.stdout:
                tail = (tail + [line])[-3:]
                event = _event(line)
                if event is None:
                    continue
                if event.get("type") == "result" or "result" in event and "is_error" in event:
                    final = event
                else:
                    _watch(keys, event)
            proc.wait()
        finally:
            stopped = LIVE.remove(keys, proc)
        reader.join(timeout=2)
    if stopped:
        return RunResult(reply="", ok=False, error=STOPPED, stopped=True)
    return parse_result(final, "".join(errors) or "".join(tail), proc.returncode)


def _event(line: str) -> dict[str, Any] | None:
    line = line.strip()
    if not line.startswith("{"):
        return None
    try:
        data = json.loads(line)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def _watch(keys: list[str], event: dict[str, Any]) -> None:
    """Turn a stream event into what the run is doing, in plain words."""
    if event.get("type") != "assistant":
        return
    for block in (event.get("message") or {}).get("content") or []:
        if block.get("type") == "text" and str(block.get("text", "")).strip():
            LIVE.note(keys, thought=str(block["text"]).strip()[:400])
        elif block.get("type") == "tool_use":
            LIVE.note(keys, doing=plain_tool(str(block.get("name", "")),
                                             block.get("input") or {}),
                      tools=(LIVE.progress_for(keys[0]) or {}).get("tools", 0) + 1)


TOOL_WORDS = {
    "search": "Searching what Alpha holds", "journal_recent": "Looking back at what happened",
    "journal_read": "Reading an earlier entry", "collections_list": "Looking at the tables",
    "collection_describe": "Looking at a table", "collection_create": "Making a table",
    "records_add": "Adding a row", "records_update": "Changing a row",
    "records_upsert": "Updating rows", "records_query": "Reading rows",
    "records_aggregate": "Adding things up", "table_start": "Starting a table",
    "page_read": "Reading a page", "page_script": "Looking closely at a page",
    "page_to_table": "Reading a list from a page", "page_download": "Fetching a file",
    "reader_save": "Keeping a reader", "reader_run": "Running a reader",
    "browser_signin": "Opening a sign-in window", "document_read": "Reading a document",
    "documents_list": "Looking at the documents", "folder_watch": "Starting to read a folder",
    "calendar_events": "Looking at the calendar", "fact_record": "Remembering something",
    "note_write": "Writing a note", "instruction_add": "Keeping an instruction",
    "plan_propose": "Writing the plan", "plan_approve": "Taking the yes",
    "procedure_save": "Keeping the steps", "action_propose": "Preparing it for your yes",
    "automation_create": "Setting up the automation", "ask_person": "Asking you",
    "entity_resolve": "Linking a person", "thread_brief": "Updating the brief",
    "source_add": "Noting a source", "goal_set": "Keeping a goal",
}


def plain_tool(name: str, inputs: dict[str, Any]) -> str:
    short = name.removeprefix("mcp__alpha__")
    if short == "ToolSearch":
        return "Finding the right tool"
    if short == "WebSearch":
        return f"Searching the web for {str(inputs.get('query', ''))[:60]}".rstrip()
    if short == "WebFetch":
        return f"Reading {str(inputs.get('url', ''))[:70]}".rstrip()
    words = TOOL_WORDS.get(short, short.replace("_", " ").capitalize())
    target = inputs.get("url") or inputs.get("collection") or inputs.get("name") \
        or inputs.get("title") or inputs.get("question")
    if isinstance(target, str) and target and short not in ("ask_person",):
        return f"{words}: {target[:70]}"
    return words


def parse(stdout: str, stderr: str, code: int) -> RunResult:
    """The result of a finished run from its output: the `result` event of a stream, or the one
    JSON object of a plain `json` run."""
    data: dict[str, Any] = {}
    for line in reversed(stdout.strip().splitlines()):
        event = _event(line)
        if event and (event.get("type") == "result" or "result" in event):
            data = event
            break
    return parse_result(data, stderr, code)


def parse_result(data: dict[str, Any], stderr: str, code: int) -> RunResult:
    if not data:
        tail = (stderr or "").strip()[-400:] or f"exit code {code}"
        return RunResult(reply="", ok=False, error=f"No answer from the model: {tail}")
    is_error = bool(data.get("is_error")) or data.get("subtype") not in (None, "success")
    reply = str(data.get("result") or "")
    if is_error and "not logged in" in reply.lower():
        reply = SIGNED_OUT
    if data.get("subtype") == "error_max_turns":
        return RunResult(reply="", ok=False, error=OUT_OF_STEPS, cut_off=True,
                         session_id=data.get("session_id"), num_turns=data.get("num_turns"),
                         duration_ms=data.get("duration_ms"),
                         cost_estimate=data.get("total_cost_usd"), raw=data)
    return RunResult(
        reply=reply,
        ok=not is_error and bool(reply),
        session_id=data.get("session_id"),
        num_turns=data.get("num_turns"),
        duration_ms=data.get("duration_ms"),
        cost_estimate=data.get("total_cost_usd"),
        error=None if not is_error else (reply or str(data.get("subtype"))),
        raw=data,
    )
