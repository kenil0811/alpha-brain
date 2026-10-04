"""Run one model turn through the Claude Code CLI on the person's subscription.

`claude -p` gets the sentence, Alpha's rules and the pre-pack as an appended system prompt, and
the world as an MCP server. Nothing else of the person's Claude Code setup applies (no user
settings, CLAUDE.md or hooks; no other MCP servers), and only Alpha's tools plus web search and
fetch are allowed: anything that would ask for permission is refused. Web search and fetch pass
a gate first (a PreToolUse hook, `alpha.world.taint`): once the run has read private or
third-party material they are refused, so nothing of it can leave in a query or an address.

The claude process gets only the environment it needs (`claude_account.child_env`), not
Alpha's: headless runs need the default config home (a private CLAUDE_CONFIG_DIR is not logged
in) and USER.
"""

from __future__ import annotations

import json
import logging
import os
import shlex
import signal
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from alpha.runtime import claude_account

DEFAULT_MODEL = "sonnet"
ALLOWED = ["mcp__alpha", "WebSearch", "WebFetch"]
DENIED = ["Bash", "Edit", "Write", "NotebookEdit", "Read", "Glob", "Grep", "Task"]


SIGNED_OUT = "Claude isn't signed in on this Mac: sign in from Settings."
OUT_OF_STEPS = "It reached the most steps Claude Code takes in one run."
log = logging.getLogger(__name__)

STOPPED = "You stopped it."
log = logging.getLogger(__name__)
# A run that has said nothing for this long is not slow, it is dead: no stream event (a thought,
# a tool call, a result) in ten minutes means the CLI or the model hung, and a hung run can hold
# a thread, a browser profile or the scheduler for ever. This is a judgement of silence, not a
# limit on how long work may take (Q18): a run that keeps working is never cut.
SILENCE_S = 600
STALLED = "No answer came back: the model's run went silent and was ended."
NO_ANSWER = "No answer came back from the model."
# A run that has said nothing for this long is not slow, it is dead: no stream event (a thought,
# a tool call, a result) in ten minutes means the CLI or the model hung, and a hung run can hold
# a thread, a browser profile or the scheduler for ever. This is a judgement of silence, not a
# limit on how long work may take (Q18): a run that keeps working is never cut.
SILENCE_S = 600
STALLED = "No answer came back: the model's run went silent and was ended."
NO_ANSWER = "No answer came back from the model."


@dataclass
class _Run:
    proc: subprocess.Popen[str] | None = None
    stopped: bool = False


class Live:
    """Runs in progress, so the person can stop any of them: there is no limit on how long a run
    or a build may take, and stopping is how work that isn't going anywhere ends. Each run is
    known by its turn (the journal entry that started it) and its thread. A run on a model's
    API has no process: it checks `stopped` before each call."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        self.runs: dict[str, _Run] = {}
        # Turns stopped before their run began (turn ids are never reused).
        # ponytail: kept for the life of the core, a few bytes each; prune if a core runs for
        # months.
        self.early: set[str] = set()
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

    def begin(self, keys: list[str]) -> _Run:
        with self.lock:
            run = _Run(stopped=any(k in self.early for k in keys))
            for key in keys:
                self.runs[key] = run
            return run

    def attach(self, run: _Run, proc: subprocess.Popen[str]) -> None:
        with self.lock:
            run.proc = proc
            stop = run.stopped
        if stop:
            _kill(proc)

    def end(self, keys: list[str], run: _Run) -> bool:
        """Forget a finished run; True when the person stopped it."""
        with self.lock:
            for key in keys:
                if self.runs.get(key) is run:
                    del self.runs[key]
                self.progress.pop(key, None)
            return run.stopped

    def running(self, key: str) -> bool:
        with self.lock:
            return key in self.runs

    def stop(self, key: str, *, before_start: bool = False) -> bool:
        """Stop the run known by `key` (and everything it started); False when none is running.
        `before_start` (a turn's id only): a turn whose run hasn't begun yet never does."""
        with self.lock:
            run = self.runs.get(key)
            if run is None:
                if before_start:
                    self.early.add(key)
                return False
            run.stopped = True
            proc = run.proc
        if proc is not None:
            _kill(proc)
        return True


def _kill(proc: subprocess.Popen[str]) -> None:
    """End a run's whole process group: SIGTERM now, SIGKILL if it hasn't gone in 5 s."""
    try:
        os.killpg(proc.pid, signal.SIGTERM)
    except (ProcessLookupError, PermissionError):
        return

    def finish() -> None:
        try:
            proc.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError):
                pass

    threading.Thread(target=finish, daemon=True).start()


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
    # How long Claude thinks (Settings -> Models -> How long it thinks); None or "default"
    # leaves it to Claude Code.
    effort: str | None = None
    # What kind of run this is: "turn" (Alpha with its world and tools), "independent" (the same
    # model with web search only and no Alpha, for a second opinion) or "judge" (no tools at
    # all: compares two answers). Fake runners in tests tell them apart by it.
    kind: str = "turn"
    # Only a check (Settings -> Models) sets a limit; a run has none, the person stops it.
    timeout: int | None = None
    # A live conversation resumes its own session (`resume`) and keeps it (`persist`); every
    # other run is stateless, as Q21 decided.
    resume: str | None = None
    persist: bool = False


# What the MCP server needs from Alpha's own environment (the claude process has none of it).
PASSED_TO_TOOLS = ("ALPHA_HOME", "ALPHA_NODE", "ALPHA_CONNECTORS")


def tools_allowed(req: TurnRequest) -> list[str]:
    if req.kind == "independent":
        return ["WebSearch", "WebFetch"]
    if req.kind == "judge":
        return []
    return ALLOWED


def mcp_config(req: TurnRequest) -> dict[str, Any]:
    if req.kind != "turn":
        return {"mcpServers": {}}
    env = {
        **{k: os.environ[k] for k in PASSED_TO_TOOLS if k in os.environ},
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


def gate_settings(req: TurnRequest) -> dict[str, Any]:
    """The web gate as Claude Code settings. `|| exit 2`: a gate that fails to run refuses."""
    command = " ".join(shlex.quote(a) for a in [
        sys.executable, "-m", "alpha.world.taint", "--world", str(req.world_path),
        "--turn", req.turn_id, "--thread", req.thread_id or ""]) + " || exit 2"
    return {"hooks": {"PreToolUse": [{"matcher": "WebSearch|WebFetch", "hooks": [
        {"type": "command", "command": command}]}]}}


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
    # Alpha's world as an MCP server for a turn; an independent or judging run gets an empty
    # config. Strict either way: nothing from the person's own MCP configuration loads.
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
        "--settings",
        json.dumps(gate_settings(req)),
        "--model",
        req.model or os.environ.get("ALPHA_MODEL") or DEFAULT_MODEL,
    ]
    if req.effort and req.effort != "default":
        args += ["--effort", req.effort]
    if req.resume:
        args += ["--resume", req.resume]
    if not req.persist:
        # Stateless: the pre-pack carries the context, the journal the history. A remembered
        # model session would bring back whatever it once believed. Live conversations are the
        # one exception (design §3.7): their session is kept while they are live.
        args += ["--no-session-persistence"]
    return args


class Stopped(Exception):
    """The person stopped this run (`LIVE.stop`)."""


class Stalled(Exception):
    """The run said nothing for `silence` seconds and was ended."""


def call(args: list[str], *, keys: list[str], env: dict[str, str], cwd: str,
         timeout: int | None = None,
         on_line: Callable[[str], None] | None = None,
         silence: float | None = None) -> tuple[str, str, int]:
    """`subprocess.run`, except that `LIVE.stop` with any of `keys` can stop it from another
    thread. The process gets its own session so stopping it also stops the MCP server it
    started. Only a check (Settings) passes `timeout`; a run has no time limit, but one that
    prints nothing for `silence` seconds is ended (Stalled)."""
    run = LIVE.begin(keys)
    try:
        if run.stopped:
            raise Stopped
        proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                env=env, cwd=cwd, stdin=subprocess.DEVNULL,
                                start_new_session=True)
        LIVE.attach(run, proc)
        errors: list[str] = []
        stderr = proc.stderr
        assert stderr is not None
        reader = threading.Thread(target=lambda: errors.append(stderr.read()), daemon=True)
        reader.start()
        timed_out = threading.Event()

        def expire() -> None:
            timed_out.set()
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError):
                pass

        timer = threading.Timer(timeout, expire) if timeout else None
        if timer:
            timer.start()
        last_seen = [time.monotonic()]
        done = threading.Event()
        stalled = threading.Event()

        def watch_silence(limit: float) -> None:
            while not done.wait(min(15.0, limit / 4)):
                if time.monotonic() - last_seen[0] > limit:
                    stalled.set()
                    try:
                        os.killpg(proc.pid, signal.SIGKILL)
                    except (ProcessLookupError, PermissionError):
                        pass
                    return

        if silence:
            threading.Thread(target=watch_silence, args=(silence,), daemon=True,
                             name="run-silence").start()
        lines: list[str] = []
        try:
            assert proc.stdout is not None
            for line in proc.stdout:  # streamed, so `on_line` sees each event as it happens
                last_seen[0] = time.monotonic()
                lines.append(line)
                if on_line:
                    on_line(line)
            proc.wait()
        finally:
            done.set()
            if timer:
                timer.cancel()
        reader.join(timeout=2)
        out, err = "".join(lines), "".join(errors)
    finally:
        stopped = LIVE.end(keys, run)
    if stopped:
        raise Stopped
    if timed_out.is_set():
        raise subprocess.TimeoutExpired(args, timeout or 0)
    if stalled.is_set():
        raise Stalled(out, err, proc.returncode)
    return out, err, proc.returncode


def keys(req: TurnRequest) -> list[str]:
    """What a run is known by: a turn by its turn and its thread; an independent or judging run
    by a key of its own, so it never takes over (or stops with) the turn it checks."""
    if req.kind == "turn":
        return [k for k in (req.turn_id, req.thread_id) if k]
    return [f"{req.kind}:{req.turn_id}:{uuid.uuid4().hex[:8]}"]


def stopped_result() -> RunResult:
    return RunResult(reply="", ok=False, error=STOPPED, stopped=True,
                     raw={"cancelled": True, "plain": True})


def run(req: TurnRequest, *, binary: str | None = None,
        extra_env: dict[str, str] | None = None) -> RunResult:
    """Run one turn to its end, however long it takes; the person can stop it (LIVE.stop with
    the turn or its thread). `extra_env` carries the sign-in Alpha holds
    (CLAUDE_CODE_OAUTH_TOKEN), when it holds one."""
    # Only the allowlisted environment, plus the sign-in Alpha holds (if any).
    env = {**claude_account.child_env(), **(extra_env or {})}
    # Alpha's tools are the whole point of a run: put every schema in context up front rather
    # than behind Claude Code's tool search, which cost a "find the tool" step on every turn.
    env.setdefault("ENABLE_TOOL_SEARCH", "false")
    k = keys(req)
    with tempfile.TemporaryDirectory(prefix="alpha-turn-") as tmp:
        config_path = Path(tmp) / "mcp.json"
        config_path.write_text(json.dumps(mcp_config(req)))
        try:
            stdout, stderr, code = call(
                argv(req, config_path, binary or claude_account.binary() or "claude"),
                keys=k, env=env, cwd=tmp, timeout=req.timeout,
                on_line=lambda line: _watch(k, _event(line)), silence=SILENCE_S)
        except Stopped:
            return stopped_result()
        except Stalled as e:
            stdout, stderr, code = e.args
            if not parse(stdout, stderr, code).raw:
                log.warning("run %s went silent for %ss and was ended", req.turn_id, SILENCE_S)
                return RunResult(reply="", ok=False, error=STALLED)
        except subprocess.TimeoutExpired:
            return RunResult(reply="", ok=False,
                             error=f"The model took longer than {req.timeout} s.",
                             raw={"timeout": True})
        except FileNotFoundError:
            return RunResult(reply="", ok=False, error="Claude Code isn't on this Mac yet:"
                             " connect Claude in Settings.", raw={"cli_missing": True})
    return parse(stdout, stderr, code)


def _event(line: str) -> dict[str, Any] | None:
    line = line.strip()
    if not line.startswith("{"):
        return None
    try:
        data = json.loads(line)
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, dict) else None


def _watch(keys: list[str], event: dict[str, Any] | None) -> None:
    """Turn a stream event into what the run is doing, in plain words."""
    if event is None or event.get("type") != "assistant":
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
        log.warning("no result from the model run (exit %s): %s", code, tail)
        signed_out = "not logged in" in tail.lower()
        return RunResult(reply="", ok=False, error=SIGNED_OUT if signed_out else NO_ANSWER)
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
