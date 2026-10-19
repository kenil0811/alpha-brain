"""What every run of the model shares (since the harness, 17 October 2026): the request and
the result, the runs in progress the window watches and the person can stop (`LIVE`), the
counts of tool calls, the result's words, and the plain words the window shows for a step.
The engine (`engine.py`, the Claude Agent SDK) and the ChatGPT route (`codex_cli.py`) both
run a `TurnRequest` into a `RunResult`; `claude -p` as a route of its own went with 2b, step 4.
"""

from __future__ import annotations

import logging
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from alpha.config import settings

ALLOWED = ["mcp__alpha", "WebSearch", "WebFetch"]  # the engine lists the hands itself
DENIED = ["Bash", "Edit", "Write", "NotebookEdit", "Read", "Glob", "Grep", "Task"]


SIGNED_OUT = "Claude isn't signed in on this Mac: sign in from Settings."
OUT_OF_STEPS = "It reached the most steps Claude Code takes in one run."
log = logging.getLogger(__name__)

STOPPED = "You stopped it."
# A run that has said nothing for this long is not slow, it is dead: no stream event (a thought,
# a tool call, a result) in ten minutes means the CLI or the model hung, and a hung run can hold
# a thread, a browser profile or the scheduler for ever. This is a judgement of silence, not a
# limit on how long work may take (Q18): a run that keeps working is never cut.
SILENCE_S = settings.runs.silence_s
STALLED = "No answer came back: the model's run went silent and was ended."
NO_ANSWER = "No answer came back from the model."
# Found 8 Oct: a route that refused every tool call still produced text, and the text claimed a
# build was approved. A run whose tool calls all failed is not an answer, whatever it says.
TOOLS_DOWN = "Alpha's tools didn't answer in this run"


class Live:
    """Runs in progress, so the person can stop any of them: there is no limit on how long a run
    may take, and stopping is how work that isn't going anywhere ends. Each run is known by its
    turn (the journal entry that started it) and its thread; a handle per run stops it."""

    def __init__(self) -> None:
        self.lock = threading.Lock()
        # A handle per run that stops it (the engine interrupts its session), and the keys the
        # person stopped.
        self.handles: dict[str, Callable[[], None]] = {}
        self.stopped_keys: set[str] = set()
        # What each run is doing right now, in plain words, for the window.
        self.progress: dict[str, dict[str, Any]] = {}

    def add_handle(self, keys: list[str], stop: Callable[[], None]) -> None:
        with self.lock:
            for key in keys:
                self.handles[key] = stop

    def remove_handle(self, keys: list[str]) -> bool:
        """Forget a finished session run; True when the person stopped it."""
        with self.lock:
            was = any(key in self.stopped_keys for key in keys)
            for key in keys:
                self.handles.pop(key, None)
                self.progress.pop(key, None)
                self.stopped_keys.discard(key)
            return was

    def note(self, keys: list[str], **what: Any) -> None:
        with self.lock:
            for key in keys:
                current = self.progress.setdefault(key, self._fresh())
                current.update({k: v for k, v in what.items() if v is not None})
                if what.get("partial") == "":
                    current["written"] = 0
                current["at"] = time.time()

    @staticmethod
    def _fresh() -> dict[str, Any]:
        return {"thought": None, "doing": None, "tools": 0, "at": None, "partial": None,
                "first_text_at": None,
                # Every character written so far, so the events stream sends exact deltas even
                # past the `partial_chars` the core keeps (the conversation, slice 1).
                "written": 0}

    def add_text(self, keys: list[str], text: str) -> None:
        """A piece of the reply as the model writes it: the window shows it growing."""
        with self.lock:
            for key in keys:
                current = self.progress.setdefault(key, self._fresh())
                current["partial"] = ((current.get("partial") or "") + text)[-PARTIAL_CHARS:]
                current["written"] = int(current.get("written") or 0) + len(text)
                if current.get("first_text_at") is None:
                    current["first_text_at"] = time.time()
                current["at"] = time.time()

    def progress_for(self, key: str | None) -> dict[str, Any] | None:
        if not key:
            return None
        with self.lock:
            found = self.progress.get(key)
            return dict(found) if found else None

    def running(self, key: str) -> bool:
        with self.lock:
            return key in self.handles

    def stop(self, key: str) -> bool:
        """Stop the run known by `key` (and everything it started); False when none is running."""
        with self.lock:
            handle = self.handles.get(key)
            if handle is None:
                return False
            for k, h in self.handles.items():
                if h is handle:
                    self.stopped_keys.add(k)
        try:
            handle()
        except Exception:
            log.exception("stopping a session run")
        return True

LIVE = Live()
# The most of a reply kept while it is written (the whole reply lands in the journal after).
PARTIAL_CHARS = settings.runs.partial_chars


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
    # When the first words of the reply appeared, from the run's start (the person's wait).
    first_text_ms: int | None = None
    # The run ended before its work did (Claude Code's own step ceiling), not because of a
    # problem: work can carry on from where it got to.
    cut_off: bool = False
    # The person stopped it.
    stopped: bool = False
    # How many tool calls the run made, and how many of them failed at the transport (the tool
    # server not there, the call refused), as against a tool answering with a plain problem.
    tools_called: int = 0
    tools_failed: int = 0


def tools_verdict(result: RunResult, called: int, failed: int, first: str) -> RunResult:
    """The result with its tool counts; when every call failed, a failed result whose error
    says so, and the model's words are not an answer."""
    result.tools_called, result.tools_failed = called, failed
    if called and failed >= called:
        result.ok = False
        result.error = (f"{TOOLS_DOWN} ({failed} of {called} call{'s' if called != 1 else ''}"
                        f" failed: {first or 'no reason given'}); nothing it said counts.")
    return result


def _blocks(event: dict[str, Any]) -> list[dict[str, Any]]:
    """The content blocks of a stream event's message, the ones that are objects. The CLI also
    sends events whose `message` is text (14 Oct 2026: one after a page was read stopped a
    build on `'str' object has no attribute 'get'`); those have no blocks."""
    message = event.get("message")
    content = message.get("content") if isinstance(message, dict) else None
    return [b for b in content if isinstance(b, dict)] if isinstance(content, list) else []


def _inputs(block: dict[str, Any]) -> dict[str, Any]:
    raw = block.get("input")
    return raw if isinstance(raw, dict) else {}


def count_tools(event: dict[str, Any], tools: dict[str, Any]) -> None:
    """Keep count of the tool calls a stream made and the results that came back as errors."""
    for block in _blocks(event):
        if event.get("type") == "assistant" and block.get("type") == "tool_use":
            tools["called"] += 1
        elif event.get("type") == "user" and block.get("type") == "tool_result" \
                and block.get("is_error"):
            tools["failed"] += 1
            if not tools["first"]:
                body = block.get("content")
                if isinstance(body, list):
                    body = " ".join(str(b.get("text", "")) for b in body if isinstance(b, dict))
                tools["first"] = " ".join(str(body or "").split())[:160]


@dataclass
class TurnRequest:
    sentence: str
    system: str
    world_path: Path
    turn_id: str
    thread_id: str | None = None
    module_id: str | None = None
    model: str | None = None
    # the agent run this turn belongs to, if one (P2): its tools journal under it
    run: str | None = None
    # Who does this turn: "alpha", or an agent's id (its steps and reply are journaled under
    # it, and the tools cut its hands to its write list, Q50).
    actor: str = "alpha"
    # What kind of run this is: "turn" (Alpha with its world and tools), "independent" (the same
    # model with web search only and no Alpha, for a second opinion) or "judge" (no tools at
    # all: compares two answers) or "look" (Read only: a page's image judged). Fake runners
    # in tests tell them apart by it.
    kind: str = "turn"
    # A live conversation resumes its own session (`resume`) and keeps it (`persist`); every
    # other run is stateless, as Q21 decided.
    resume: str | None = None
    persist: bool = False
    # Told of every step the model takes, in plain words, when a run's steps are journaled.
    on_step: Callable[[str], Any] | None = None
    # What rides on the sentence, never in the system prompt (section B, Q99): the start layer
    # when the session is made (no `resume`) and again after a compaction, the turn layer with
    # every sentence. `injected` says what was given, for the record of what the model saw.
    start_layer: str = ""
    turn_layer: str = ""
    injected: list[str] = field(default_factory=list)


def tools_allowed(req: TurnRequest) -> list[str]:
    if req.kind == "independent":
        return ["WebSearch", "WebFetch"]
    if req.kind == "judge":
        return []
    if req.kind == "look":
        return ["Read"]  # the image of a page it is asked to look at, nothing else
    return ALLOWED


TOOL_WORDS = {
    # the SDK's own look-up of a hand's full description (tool search, A8)
    "ToolSearch": "Finding the right tool",
    # the hands (harness 2b)
    "world_query": "Reading the tables", "world_write": "Writing rows",
    "world_change": "Changing a row", "world_shape": "Shaping a table",
    "world_file": "Reading a document", "world_remember": "Remembering something",
    "world_search": "Searching what Alpha holds", "tell_person": "Noting it for you",
    "skill_keep": "Keeping a skill", "skill_run": "Running a skill",
    "skill_find": "Looking at the skills", "agent_keep": "Setting up the agent",
    "act_outward": "Preparing it for your yes", "browser_read": "Reading a page",
    "browser_script": "Looking closely at a page", "connect": "Connecting",
    # the operations behind them
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
    "procedure_save": "Keeping the steps", "action_propose": "Preparing it for your yes",
    "agent_create": "Setting up the agent", "ask_person": "Asking you",
    "entity_resolve": "Linking a person", "thread_brief": "Updating the brief",
    "source_add": "Noting a source", "goal_set": "Keeping a goal",
}


def plain_tool(name: str, inputs: dict[str, Any]) -> str:
    short = name.removeprefix("mcp__alpha__")
    if short == "ToolSearch":
        return "Finding the right tool"
    if short == "Bash":
        cmd = " ".join(str(inputs.get("command", "")).split())
        return f"Running: {cmd[:90]}".rstrip() if cmd else "Running a command"
    if short in ("Write", "Edit", "MultiEdit"):
        path = str(inputs.get("file_path", "")).rsplit("/modules/", 1)[-1].split("/", 1)[-1]
        return f"{'Writing' if short == 'Write' else 'Changing'} {path[:80]}".rstrip()
    if short in ("Read", "Glob", "Grep"):
        path = str(inputs.get("file_path") or inputs.get("pattern") or "")
        path = path.rsplit("/modules/", 1)[-1].split("/", 1)[-1]
        return f"Reading {path[:80]}".rstrip() if path else "Reading the workspace"
    if short == "WebSearch":
        return f"Searching the web for {str(inputs.get('query', ''))[:60]}".rstrip()
    if short == "WebFetch":
        return f"Reading {str(inputs.get('url', ''))[:70]}".rstrip()
    words = TOOL_WORDS.get(short, short.replace("_", " ").capitalize())
    target = inputs.get("url") or inputs.get("collection") or inputs.get("table") \
        or inputs.get("name") or inputs.get("title") or inputs.get("question") \
        or inputs.get("target")
    if short == "world_query":
        sql = " ".join(str(inputs.get("sql", "")).split())
        return f"Reading the tables: {sql[:70]}".rstrip(": ") if sql else words
    if isinstance(target, str) and target and short not in ("ask_person",):
        return f"{words}: {target[:70]}"
    return words


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
