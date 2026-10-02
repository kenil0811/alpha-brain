"""The core's HTTP API, for the workspace and the companion: `alpha serve`.

Loopback only. When the app hosts the core it passes ALPHA_TOKEN and every request must carry
it as a bearer token; without one (a developer running `alpha serve`) requests are accepted
from this Mac only. One World is shared by every request; the store serialises writes.

What it serves follows the workspace: Home (what needs the person, modules), a module (its
tables, what Alpha did there, its threads), a table's records (read and edited in place by
the person), People & Companies with a cross-source timeline, Intelligence (skills,
automations, connections, knowledge), Activity, the conversation, and turns.
"""

from __future__ import annotations

import base64
import functools
import json
import logging
import os
import platform
import re
import secrets
import threading
from collections.abc import AsyncIterator, Callable
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from fastapi import Depends, FastAPI, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

import alpha
from alpha.api import brain
from alpha.bugs import bug_log
from alpha.connectors import files
from alpha.connectors.base import Connections, manifests
from alpha.connectors.browser import Browser
from alpha.connectors.calendar import Calendar
from alpha.connectors.files import Files
from alpha.context.summary import module_summary
from alpha.models import settings
from alpha.models.accounts import Accounts
from alpha.models.keychain import KeychainError
from alpha.runtime import acting, build, check, claude_cli, transcription
from alpha.runtime import turn as turns
from alpha.runtime.attachments import MAX_ATTACHMENTS, AttachmentIn
from alpha.runtime.automation import Scheduler
from alpha.runtime.route import Router
from alpha.world import access, backup, edits
from alpha.world.bundle import export_module, import_module
from alpha.world.pending import PendingActions
from alpha.world.purge import remove_connection, remove_module
from alpha.world.store import Problem, loads, now
from alpha.world.world import World

log = logging.getLogger("alpha.api")
CALENDAR_EVERY_S = 300


class AskBody(BaseModel):
    text: str
    module: str | None = None
    thread: str | None = None
    attachments: list[AttachmentIn] = Field(default_factory=list, max_length=MAX_ATTACHMENTS)


class SettingsBody(BaseModel):
    values: dict[str, Any]


class AccessBody(BaseModel):
    thread: str | None = None
    mode: str | None = None


class KeyBody(BaseModel):
    key: str = Field(min_length=1, max_length=400)


class CodeBody(BaseModel):
    code: str = Field(min_length=1, max_length=2000)


class ModelBody(BaseModel):
    model: str = Field(min_length=1, max_length=200)


class RouteBody(BaseModel):
    thread: str | None = None
    provider: str | None = None
    model: str | None = Field(default=None, max_length=200)


class RecordBody(BaseModel):
    values: dict[str, Any]
    revision: int | None = None


class ViewBody(BaseModel):
    title: str | None = None
    config: dict[str, Any] | None = None
    is_default: bool | None = None


class FieldChangeBody(BaseModel):
    kind: str | None = None
    label: str | None = None
    choices: list[str] | None = None
    relation: str | None = None


class FieldsBody(BaseModel):
    fields: list[dict[str, Any]]


class BulkBody(BaseModel):
    action: str
    items: list[dict[str, Any]]
    values: dict[str, Any] | None = None
class ExportBody(BaseModel):
    format: str = "csv"


class ActionEditBody(BaseModel):
    payload: dict[str, Any]


class ActionApproveBody(BaseModel):
    always: bool = False


class DecideBody(BaseModel):
    accept: bool


class AnswerBody(BaseModel):
    text: str


class FolderBody(BaseModel):
    path: str


class SiteBody(BaseModel):
    site: str


class SwitchBody(BaseModel):
    enabled: bool


class SpeechBody(BaseModel):
    audio_b64: str
    mime: str = "audio/webm"
    provider: str | None = None


class ModuleBody(BaseModel):
    name: str | None = None
    icon: str | None = None
    goal: str | None = None
    # The project it is filed under (sub project); null takes it out. Absent: left as it is.
    project: str | None = None


class NewModuleBody(BaseModel):
    name: str | None = Field(default=None, max_length=80)


class CreationAnswerBody(BaseModel):
    """What the person did on the project's page while it is being made: answered the
    questions, took the defaults, chose an option, asked to build, or tried again."""
    text: str | None = None
    answers: dict[str, str] | None = None
    choice: str | None = None
    use_defaults: bool = False
    build: bool = False
    carry_on: bool = False
    retry: bool = False
    start_over: bool = False


class ThreadBody(BaseModel):
    title: str | None = Field(default=None, max_length=400)
    module: str | None = None


class ThreadPatch(BaseModel):
    state: str | None = None
    title: str | None = Field(default=None, max_length=400)


class NoteBody(BaseModel):
    scope: str
    title: str
    body: str


class Turns:
    """Turns run in the background; the window polls for the answer."""

    def __init__(self, world: World, runner: turns.Runner | None = None,
                 accounts: Accounts | None = None, after: Callable[[], None] | None = None,
                 checks: bool = True) -> None:
        self.world = world
        self.runner = runner
        self.accounts = accounts
        self.after = after
        # After a turn in which Alpha wrote values it worked out itself, an independent answer
        # checks them in the background and Alpha corrects itself in the conversation.
        self.checks = checks
        self.state: dict[str, dict[str, Any]] = {}
        self.lock = threading.Lock()

    def start(self, body: AskBody, *, actor: str = "person",
              journal_as: str | None = None) -> dict[str, Any]:
        key = secrets.token_hex(6)
        if self.accounts is not None:
            # Nothing is said into the conversation until the model it goes to is connected:
            # the window connects it and sends the same words again.
            provider = str(self.accounts.route(body.thread)["provider"])
            if not self.accounts.connected(provider):
                return {"id": key, "state": "needs_connect", "text": body.text,
                        "provider": provider, "started_at": datetime.now(UTC).isoformat()}
        with self.lock:
            self.state[key] = {"id": key, "state": "running", "text": body.text,
                               "thread": body.thread,
                               "started_at": datetime.now(UTC).isoformat()}

        def work() -> None:
            def said(jid: str) -> None:
                with self.lock:
                    self.state[key]["said"] = jid
                    stopping = self.state[key].get("stopping")
                if stopping:  # stopped before the model started: it never does
                    claude_cli.LIVE.stop(jid, before_start=True)

            try:
                kwargs: dict[str, Any] = {"module": body.module, "thread": body.thread,
                                          "on_said": said, "actor": actor,
                                          "journal_as": journal_as}
                if body.attachments:
                    kwargs["attachments"] = body.attachments
                if self.runner is not None:
                    kwargs["runner"] = self.runner
                out = turns.ask(self.world, body.text, **kwargs)
                raw = out.result.raw
                result = {"state": "done" if out.ok else "failed", "reply": out.reply,
                          "said": out.said, "replied": out.replied,
                          "duration_ms": out.result.duration_ms,
                          "provider": raw.get("provider")}
                if not out.ok and raw.get("cancelled"):
                    result["state"] = "cancelled"
                elif not out.ok and raw.get("needs_connect"):
                    # The call itself showed a connection problem: the window shows the
                    # connect card for that row, and sends the words again once it's green.
                    result.update(state="needs_connect", provider=raw["needs_connect"],
                                  connect_kind=raw.get("connect_kind"))
            except Problem as e:
                result = {"state": "failed", "reply": str(e)}
            except Exception as e:
                log.exception("turn failed")
                bug_log(self.world).record("core", type(e).__name__, str(e))
                result = {"state": "failed", "reply": f"Alpha hit an internal problem: {e}"}
            with self.lock:
                self.state[key].update(result)
            if self.after is not None:
                # A plan approved in this turn starts building now, not at the next tick.
                self.after()
            said_id = result.get("said")
            if self.checks and result["state"] == "done" and said_id:
                self.check(str(said_id))

        threading.Thread(target=work, daemon=True, name=f"turn-{key}").start()
        return self.state[key]

    def check(self, said: str) -> None:
        if not check.worth_checking(self.world, said):
            return

        def work() -> None:
            try:
                kwargs: dict[str, Any] = {}
                if self.runner is not None:
                    kwargs["runner"] = self.runner
                check.check(self.world, said, **kwargs)
            except Exception:
                log.exception("check failed")

        threading.Thread(target=work, daemon=True, name=f"check-{said}").start()

    def get(self, key: str) -> dict[str, Any]:
        with self.lock:
            if key not in self.state:
                raise Problem(f"There is no turn {key}.")
            out = dict(self.state[key])
        said = out.get("said")
        out["steps"] = [
            {"at": e["at"], "kind": e["kind"], "text": e["text"]}
            for e in self.world.journal.recent(200)
            if said and e["data"].get("turn") == said and e["kind"] != "replied"
        ]
        out["live"] = claude_cli.LIVE.progress_for(said)
        return out

    def cancel(self, key: str) -> dict[str, Any]:
        with self.lock:
            if key not in self.state:
                raise Problem(f"There is no turn {key}.")
            entry = self.state[key]
            if entry["state"] != "running":
                return dict(entry)
            entry["stopping"] = True
            said = entry.get("said")
        if said:
            claude_cli.LIVE.stop(said, before_start=True)
        return self.get(key)

    def running(self) -> list[dict[str, Any]]:
        with self.lock:
            return [dict(v) for v in self.state.values() if v["state"] == "running"]



def _local_midnight_utc() -> str:
    local = datetime.now().astimezone()
    midnight = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight.astimezone(UTC).replace(microsecond=0).isoformat()


def _cell(value: Any) -> Any:
    if isinstance(value, list):
        return ", ".join(str(v) for v in value)
    return value


def needs_you(world: World) -> list[dict[str, Any]]:
    """Everything waiting on the person: questions, proposals, suggested facts, same-name
    people to confirm."""
    items: list[dict[str, Any]] = []
    for a in world.journal.open_asks():
        items.append({"kind": "ask", "id": a["id"], "text": a["text"], "at": a["at"],
                      "options": a["data"].get("options", []), "module": a["module"]})
    answered = {loads(r["data"], {}).get("proposal")
                for r in world.store.all("SELECT data FROM journal WHERE kind = 'answered'")}
    for p in world.journal.recent(50, kinds=["proposed"]):
        if p["id"] not in answered:
            items.append({"kind": "proposal", "id": p["id"], "text": p["text"],
                          "why": p["data"].get("why"), "at": p["at"], "module": p["module"],
                          "plan": p["data"].get("plan")})
    for f in world.knowledge.facts("person", states=("suggested",)):
        items.append({"kind": "fact", "id": f["id"], "text": f"{f['predicate']}: {f['value']}",
                      "why": f["why"], "at": f["recorded_at"]})
    for a in world.actions.all(("proposed",)):
        items.append({"kind": "action", "id": a["id"], "text": a["title"], "why": a["evidence"],
                      "at": a["created_at"], "module": a["module"], "action": action_view(a)})
    return [i for i in items if i["kind"] != "proposal" or not _is_action_proposal(world, i)]


def _is_action_proposal(world: World, item: dict[str, Any]) -> bool:
    """An action's own `proposed` journal entry is shown as its card, not as a plain proposal."""
    entry = world.journal.read(item["id"])
    return bool(entry["data"].get("action"))


_WORLD_FOR_VIEW: World | None = None


def action_view(a: dict[str, Any]) -> dict[str, Any]:
    """An action for the app: the card's contents, with screenshot names instead of paths."""
    shots = {Path(p).stem: Path(p).name for p in a.get("shots") or []}
    files: dict[str, dict[str, Any]] = {}
    try:
        from alpha.world.actions import file_fields

        proc = _WORLD_FOR_VIEW.procedures.get(a["procedure"]) if _WORLD_FOR_VIEW else None
        for field in file_fields(proc["steps"]) if proc else set():
            did = str(a["payload"].get(field, ""))
            row = _WORLD_FOR_VIEW.store.one("SELECT title, size FROM documents WHERE id = ?",
                                            (did,)) if _WORLD_FOR_VIEW else None
            if row is not None:
                files[field] = {"id": did, "name": row["title"], "size": row["size"]}
    except Exception:  # a view never fails the request
        pass
    return {"files": files,
            **{k: a[k] for k in ("id", "procedure", "title", "payload", "evidence", "undo",
                                 "effect", "site", "state", "module", "preview_note", "result",
                                 "error", "created_at", "updated_at")},
            "preview": Path(a["preview"]).name if a.get("preview") else None, "shots": shots}


def automation_views(world: World, scheduler: Scheduler,
                     module: str | None = None) -> list[dict[str, Any]]:
    """Automations with whether one is running now and, if so, what it has done so far."""
    out = []
    for a in world.automations.all(module):
        running = a["id"] in scheduler.running
        steps: list[dict[str, Any]] = []
        if running and a["thread"]:
            entries = world.journal.recent(80, thread=a["thread"])
            starts = [i for i, e in enumerate(entries) if e["kind"] == "did"
                      and e["text"].startswith("Run the automation")]
            current = entries[starts[-1] + 1:] if starts else entries
            steps = [{"at": e["at"], "kind": e["kind"], "text": e["text"]} for e in current
                     if e["kind"] in {"did", "saw", "made", "changed", "failed", "noticed"}]
        out.append({**a, "running": running, "steps": steps[-8:]})
    return out


STEP_KINDS = {"did", "saw", "made", "changed", "failed", "noticed", "asked", "checked"}


def thread_views(world: World) -> list[dict[str, Any]]:
    """Open threads with what Alpha has done in each lately, so a build is watched, not
    waited for: its last few journal entries, newest last (a prompt line is left out)."""
    out = []
    for t in world.modules.threads():
        entries = world.journal.recent(40, thread=t["id"])
        steps = [{"at": e["at"], "kind": e["kind"], "text": e["text"]} for e in entries
                 if e["kind"] in STEP_KINDS and not e["text"].startswith(("Build the approved",
                                                                          "Continue the build"))]
        out.append({**t, "steps": steps[-6:], "step_count": len(steps),
                    "last_at": entries[-1]["at"] if entries else t["updated_at"],
                    "live": claude_cli.LIVE.progress_for(t["id"])})
    return out


def module_card(world: World, m: dict[str, Any]) -> dict[str, Any]:
    tables = world.collections.overview(m["id"])
    last = world.store.one(
        "SELECT at, text FROM journal WHERE module = ? AND kind IN ('did','changed','made','saw')"
        " AND deleted_at IS NULL ORDER BY at DESC LIMIT 1", (m["id"],),
    )
    return {**m, "tables": tables, "records": sum(t["records"] for t in tables),
            "last_at": last["at"] if last else None, "last_text": last["text"] if last else None,
            "threads": [t for t in world.modules.threads() if t["module"] == m["id"]]}


def timeline(world: World, entity_id: str, limit: int = 100) -> list[dict[str, Any]]:
    rows = world.store.all(
        "SELECT j.* FROM journal j, json_each(j.entity_ids) e WHERE e.value = ?"
        " AND j.deleted_at IS NULL ORDER BY j.at DESC LIMIT ?", (entity_id, limit),
    )
    from alpha.world.journal import entry

    return [entry(r) for r in rows]


# The app's own pages, and Vite on any local port in development.
ORIGINS = ["tauri://localhost", "http://tauri.localhost"]
DEV_ORIGIN = r"^http://(localhost|127\.0\.0\.1):\d+$"

# What the companion window may do with its token: talk and listen. Approving, settings, keys
# and edits need the main window's token, so a script planted in the companion reaches none.
COMPANION = [("GET", r"/api/home"), ("GET", r"/api/conversation"), ("POST", r"/api/ask"),
             ("GET", r"/api/turns/[^/]+"), ("GET", r"/api/transcribe"),
             ("POST", r"/api/transcribe")]


def companion_may(method: str, path: str) -> bool:
    return any(method == m and re.fullmatch(p, path) for m, p in COMPANION)


def create_app(world: World | None = None, *, runner: turns.Runner | None = None,
               token: str | None = None, companion_token: str | None = None,
               live: bool = True) -> FastAPI:
    world = world or World()
    global _WORLD_FOR_VIEW
    _WORLD_FOR_VIEW = world
    token = token if token is not None else os.environ.get("ALPHA_TOKEN")
    if companion_token is None:
        companion_token = os.environ.get("ALPHA_COMPANION_TOKEN")
    accounts = Accounts(world.store)
    # An injected runner (tests) bypasses the model routes and their connection check.
    route = runner or Router(accounts)
    scheduler = Scheduler(world, route)
    runner_fn = route
    running = Turns(world, route, None if runner else accounts,
                    after=scheduler.builds if live else None, checks=live)
    stops: list[Callable[[], None]] = []

    @asynccontextmanager
    async def lifespan(_: FastAPI) -> AsyncIterator[None]:
        if live:
            stops.append(Files(world).observe())
            stop_calendar = threading.Event()

            def poll() -> None:
                while not stop_calendar.wait(CALENDAR_EVERY_S):
                    conn = Connections(world.store).find("calendar", "macos")
                    if conn and conn["status"] == "connected":
                        try:
                            Calendar(world).sync()
                        except Exception:
                            log.exception("calendar sync failed")

            threading.Thread(target=poll, daemon=True, name="calendar-poll").start()
            stops.append(stop_calendar.set)
            scheduler.start()
            stops.append(scheduler.stop)
        yield
        for stop in stops:
            stop()

    app = FastAPI(title="Alpha", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=ORIGINS,
        # The window in development: Vite on any local port (each worktree runs its own); the
        # token still guards when the app hosts the core.
        allow_origin_regex=DEV_ORIGIN,
        allow_methods=["*"], allow_headers=["*"],
    )

    def guard(request: Request) -> None:
        host = request.client.host if request.client else ""
        if host not in {"127.0.0.1", "::1", "localhost", "testclient"}:
            raise HTTPException(403, "Alpha only answers this Mac.")
        # CORS only hides the answer; a web page's simple POST still runs. Refuse any page
        # that isn't Alpha's own, which matters most for `alpha serve` without a token.
        origin = request.headers.get("origin")
        if origin and origin not in ORIGINS and not re.fullmatch(DEV_ORIGIN, origin):
            raise HTTPException(403, "Alpha only answers its own windows.")
        if not token:
            return
        sent = request.headers.get("authorization")
        if sent == f"Bearer {token}":
            return
        if companion_token and sent == f"Bearer {companion_token}":
            if companion_may(request.method, request.url.path):
                return
            raise HTTPException(403, "The companion can't do that; open the main window.")
        raise HTTPException(401, "This window isn't signed in to Alpha's core.")

    @app.exception_handler(Problem)
    async def problem(_: Request, exc: Problem) -> JSONResponse:
        return JSONResponse({"error": str(exc)}, status_code=400)

    @app.exception_handler(KeychainError)
    async def keychain_problem(_: Request, exc: KeychainError) -> JSONResponse:
        return JSONResponse({"error": f"The Keychain said no: {exc}"}, status_code=502)

    api = Depends(guard)

    @app.get("/api/health", dependencies=[api])
    def health() -> dict[str, Any]:
        return {"ok": True, "world": str(world.path), "running_turns": len(running.running()),
                "core_version": alpha.__version__,
                "core_commit": source_commit(),
                "python_version": platform.python_version()}

    # ---- Home ----

    @app.get("/api/home", dependencies=[api])
    def home() -> dict[str, Any]:
        since = _local_midnight_utc()
        ran = world.store.one(
            "SELECT COUNT(*) AS n FROM journal WHERE at >= ? AND actor = 'alpha'"
            " AND kind IN ('did','changed','made','saw') AND deleted_at IS NULL", (since,),
        )
        failed = world.store.one(
            "SELECT COUNT(*) AS n FROM journal WHERE at >= ? AND kind = 'failed'", (since,)
        )
        now = datetime.now(UTC)
        events = Calendar(world).between(now.isoformat(), (now + timedelta(hours=18)).isoformat())
        return {
            "date": datetime.now().astimezone().isoformat(),
            "needs_you": needs_you(world),
            "ran_today": ran["n"] if ran else 0,
            "failed_today": failed["n"] if failed else 0,
            "modules": [module_card(world, m) for m in world.modules.all()],
            "loose_tables": [t for t in world.collections.overview() if t["module"] is None],
            "coming_up": events[:6],
            "threads": thread_views(world),
            "brief": None,
        }

    pending_actions = PendingActions(world)

    @app.get("/api/pending", dependencies=[api])
    def pending() -> list[dict[str, Any]]:
        return pending_actions.pending()

    # The one approve path: these two, and an answer to a pending action's question, all end in
    # Actions.approve / reject, which runs the stored payload once.
    @app.post("/api/pending/{aid}/approve", dependencies=[api])
    def approve(aid: str) -> dict[str, Any]:
        return pending_actions.approve(aid, by="person")

    @app.post("/api/pending/{aid}/reject", dependencies=[api])
    def reject(aid: str) -> dict[str, Any]:
        return pending_actions.reject(aid, by="person")

    @app.post("/api/asks/{ask_id}/answer", dependencies=[api])
    def answer(ask_id: str, body: AnswerBody) -> dict[str, Any]:
        action = pending_actions.by_ask(ask_id)
        if action is not None:
            yes = body.text.strip().lower() in {"approve", "yes", "approved"}
            decide = pending_actions.approve if yes else pending_actions.reject
            decided = decide(action["id"], by="person")
            return {"pending_action": decided}
        asked = world.journal.read(ask_id)
        jid = world.journal.append("answered", body.text, actor="person", data={"ask": ask_id},
                                   module=asked["module"], thread=asked["thread"])
        # The answer is also the person's next message: Alpha carries on with it.
        started = running.start(AskBody(text=body.text, module=asked["module"],
                                        thread=asked["thread"]))
        return {"answered": jid, "turn": started}

    @app.post("/api/asks/{ask_id}/dismiss", dependencies=[api])
    def dismiss(ask_id: str) -> dict[str, Any]:
        # Closed without an answer: nothing runs (a pending action is rejected).
        action = pending_actions.by_ask(ask_id)
        if action is not None:
            return {"pending_action": pending_actions.reject(action["id"], by="person")}
        return {"dismissed": world.journal.close_ask(ask_id, "Dismissed.")}

    @app.post("/api/proposals/{pid}/decide", dependencies=[api])
    def decide_proposal(pid: str, body: DecideBody) -> dict[str, Any]:
        proposal = world.journal.read(pid)
        plan = proposal["data"].get("plan")
        if plan:
            # The state moves first: a refused decision (a plan already building, say) must
            # not leave an answer in the journal. A yes starts the build; a no closes it.
            if body.accept:
                world.plans.approve(plan, "Approved in the app")
            else:
                world.plans.decline(plan)
        answered = world.journal.append("answered", "Yes" if body.accept else "No",
                                        actor="person",
                                        data={"proposal": pid, "accept": body.accept},
                                        module=proposal["module"])
        if plan:
            if body.accept and live:
                scheduler.builds()
            return {"decided": pid, "turn": None, "plan": world.plans.get(plan)}
        instruction = proposal["data"].get("instruction")
        if instruction:
            # The person's yes is what makes it an instruction; nothing else needs to run.
            if body.accept:
                world.knowledge.add_instruction(instruction, answered)
                world.journal.append("changed", f"Added a standing instruction: {instruction}",
                                     actor="person", data={"proposal": pid})
            return {"decided": pid, "turn": None}
        started = running.start(AskBody(text=f"Yes, go ahead: {proposal['text']}",
                                        module=proposal["module"])) if body.accept else None
        return {"decided": pid, "turn": started}

    @app.get("/api/plans", dependencies=[api])
    def plans() -> list[dict[str, Any]]:
        return list(reversed(world.plans.all()))[:50]

    @app.post("/api/plans/{plan_id}/approve", dependencies=[api])
    def approve_plan(plan_id: str) -> dict[str, Any]:
        plan = world.plans.get(plan_id)
        if plan.get("proposal"):
            decide_proposal(plan["proposal"], DecideBody(accept=True))
            return world.plans.get(plan_id)
        world.plans.approve(plan_id, "Approved in the app")
        if live:
            scheduler.builds()
        return world.plans.get(plan_id)

    @app.post("/api/plans/{plan_id}/stop", dependencies=[api])
    def stop_plan(plan_id: str) -> dict[str, Any]:
        """Stop a build that isn't going anywhere: its run ends now and it says what it made."""
        plan = world.plans.get(plan_id)
        if plan["state"] not in ("approved", "building"):
            raise Problem(f"The build of {plan['title']} isn't running.")
        if not (plan["thread"] and claude_cli.LIVE.stop(plan["thread"])):
            build.stop(world, plan_id, None)
        return world.plans.get(plan_id)

    @app.post("/api/turns/{key}/stop", dependencies=[api])
    def stop_turn(key: str) -> dict[str, Any]:
        return running.cancel(key)

    @app.post("/api/plans/{plan_id}/resume", dependencies=[api])
    def resume_plan(plan_id: str) -> dict[str, Any]:
        plan = world.plans.resume(plan_id)
        if live:
            scheduler.builds()
        return plan

    @app.post("/api/plans/{plan_id}/decline", dependencies=[api])
    def decline_plan(plan_id: str) -> dict[str, Any]:
        plan = world.plans.get(plan_id)
        if plan.get("proposal"):
            decide_proposal(plan["proposal"], DecideBody(accept=False))
            return world.plans.get(plan_id)
        return world.plans.decline(plan_id)

    @app.post("/api/facts/{fid}/decide", dependencies=[api])
    def decide_fact(fid: str, body: DecideBody) -> dict[str, Any]:
        return world.knowledge.decide_fact(fid, body.accept)

    # ---- modules and tables ----

    @app.get("/api/modules", dependencies=[api])
    def modules() -> list[dict[str, Any]]:
        return [module_card(world, m) for m in world.modules.all()]

    @app.get("/api/modules/{ref}", dependencies=[api])
    def module(ref: str) -> dict[str, Any]:
        m = world.modules.get(ref)
        card = module_card(world, m)
        card["tables"] = [world.collections.describe(t["name"]) for t in card["tables"]]
        card["activity"] = list(reversed(world.journal.recent(500, module=m["id"])))
        card["note"] = world.knowledge.find_note(f"module:{m['name']}", m["name"])
        card["goals"] = [g for g in world.knowledge.goals() if g["module"] == m["id"]]
        card["automations"] = automation_views(world, scheduler, m["id"])
        card["plan"] = world.knowledge.find_note(f"module:{m['name']}", "Plan")
        card["sessions"] = world.modules.sessions(m["id"])
        card["sub_projects"] = [module_card(world, c) for c in world.modules.children(m["id"])]
        # Facts that hold only inside this project (world/knowledge.py).
        card["facts"] = world.knowledge.facts(f"module:{m['id']}")
        # The turn making it, while one runs (the page shows its clock and Stop).
        making = (m["creation"] or {}).get("thread")
        card["running"] = [t for t in running.running() if making and t.get("thread") == making]
        card["sources"] = world.sources.all(m["id"])
        return card

    @app.patch("/api/modules/{ref}", dependencies=[api])
    def edit_module(ref: str, body: ModuleBody) -> dict[str, Any]:
        kwargs: dict[str, Any] = {"name": body.name, "icon": body.icon, "goal": body.goal}
        if "project" in body.model_fields_set:
            kwargs["project"] = body.project
        return module_card(world, world.modules.update(ref, **kwargs))

    @app.delete("/api/modules/{ref}", dependencies=[api])
    def delete_module(ref: str) -> dict[str, Any]:
        return remove_module(world, ref)

    @app.get("/api/modules/{ref}/export", dependencies=[api])
    def export(ref: str, rows: bool = False) -> dict[str, Any]:
        return export_module(world, ref, rows=rows)

    @app.post("/api/modules/import", dependencies=[api])
    def import_(bundle: dict[str, Any]) -> dict[str, Any]:
        if set(bundle) == {"path"}:
            bundle = read_project_file(str(bundle["path"]))
        return module_card(world, import_module(world, bundle))

    @app.get("/api/modules/{ref}/summary", dependencies=[api])
    def summary(ref: str) -> dict[str, Any]:
        return module_summary(world, world.modules.get(ref)["id"])

    @app.get("/api/tables/{name}", dependencies=[api])
    def table(name: str, q: str | None = None, order: str | None = None,
              limit: int | None = None) -> dict[str, Any]:
        # Every row by default: the page filters, sorts and pages them itself.
        desc = world.collections.describe(name)
        records = world.collections.query(name, None, order, limit)
        if q:
            hits = {h["id"] for h in world.collections.search(q, 500) if h["collection"] == name}
            records = [r for r in records if r["id"] in hits]
        # A file field holds a document id; the page shows the file's name and opens it.
        file_fields = [f["name"] for f in desc["fields"] if f["kind"] == "file"]
        files: dict[str, dict[str, Any]] = {}
        if file_fields:
            ids = {str(r[f]) for r in records for f in file_fields if r.get(f)}
            for did in ids:
                row = world.store.one("SELECT * FROM documents WHERE id = ?", (did,))
                if row is not None:
                    files[did] = {"id": did, "name": row["title"], "path": row["path"],
                                  "size": row["size"], "kind": row["kind"]}
        last = edits.last_edit(world, name)
        return {"table": desc, "records": records, "files": files,
                "views": world.views.all(name),
                "last_edit": {"text": last["text"], "at": last["at"], "actor": last["actor"]}
                if last else None}

    @app.post("/api/tables/{name}/export", dependencies=[api])
    def export_table(name: str, body: ExportBody) -> dict[str, Any]:
        """The table as a CSV or Excel file in Alpha's exports folder, for the person to open
        or share; the app reveals it."""
        from alpha.connectors.files import unique_path
        from alpha.world.world import alpha_home

        desc = world.collections.describe(name)
        rows = world.collections.query(name, None, None, None)
        cols = [f["name"] for f in desc["fields"]]
        stamp = datetime.now().strftime("%Y-%m-%d %H.%M")
        folder = alpha_home() / "exports"
        if body.format == "xlsx":
            from openpyxl import Workbook

            wb = Workbook()
            ws = wb.create_sheet(desc["title"][:31] or "Table", 0)
            ws.append([f.get("label") or f["name"] for f in desc["fields"]])
            for r in rows:
                ws.append([_cell(r.get(c)) for c in cols])
            target = unique_path(folder, f"{desc['title']} {stamp}.xlsx")
            wb.save(str(target))
        else:
            import csv

            target = unique_path(folder, f"{desc['title']} {stamp}.csv")
            with open(target, "w", newline="", encoding="utf-8") as fh:
                w = csv.writer(fh)
                w.writerow([f.get("label") or f["name"] for f in desc["fields"]])
                for r in rows:
                    w.writerow([_cell(r.get(c)) for c in cols])
        world.journal.append("did", f"Exported {desc['title']} ({len(rows)} rows) to"
                             f" {target.name}.", actor="person",
                             data={"collection": name, "path": str(target)},
                             module=desc["module"])
        return {"path": str(target), "name": target.name, "rows": len(rows)}

    @app.get("/api/documents/{did}", dependencies=[api])
    def document(did: str) -> dict[str, Any]:
        return Files(world).document(did)

    @app.post("/api/files", dependencies=[api])
    async def add_files(files: list[UploadFile], module: str | None = Form(None),
                        table: str | None = Form(None), record: str | None = Form(None),
                        field: str | None = Form(None)) -> dict[str, Any]:
        """Files the person dropped onto a module or a row: kept in Alpha's folder for the
        module, made documents, and read by Alpha into the module's tables in a turn that
        follows. With table/record/field, the first file is put on that row's file field."""
        import tempfile

        taken = []
        module_id = world.modules.get(module)["id"] if module else None
        if table and not module_id:
            module_id = world.collections.describe(table)["module"]
        for up in files:
            with tempfile.NamedTemporaryFile(delete=False, suffix=Path(up.filename or "").suffix
                                             ) as tmp:
                tmp.write(await up.read())
            doc = Files(world).take(Path(tmp.name), module=module_id, origin="the person",
                                    name=up.filename or "file", move=True, by="person")
            taken.append(doc)
        if table and record and field and taken:
            current = world.collections.get(table, record)
            world.collections.update(table, record, {field: taken[0]["id"]},
                                     current["revision"], {"by": "person"})
            person_did("changed", f"Put {taken[0]['title']} on a row of {table}.", table,
                       {"record": record, "document": taken[0]["id"]})
        started = None
        if module_id and live and not (table and record):
            names = ", ".join(d["title"] for d in taken)
            started = running.start(AskBody(
                text=f"The person added {names} to this module. Read what Alpha can read of"
                     " it and put what belongs in the module's tables, saying where each value"
                     " came from (source=the file's name); keep the document's id on a file"
                     " field where a table has one. If the file isn't a kind Alpha reads, say"
                     " so in one line.", module=module_id), actor="alpha",
                journal_as=f"Read {names} the person added.")
        return {"documents": taken, "turn": started}

    def person_did(kind: str, text: str, collection: str, data: dict[str, Any]) -> None:
        world.journal.append(kind, text, actor="person", data={"collection": collection, **data},
                             module=world.collections.describe(collection)["module"])

    @app.post("/api/tables/{name}/records", dependencies=[api])
    def add_record(name: str, body: RecordBody) -> dict[str, Any]:
        rec = world.collections.add(name, body.values, {"by": "person"})
        person_did("did", f"You added a row to {world.collections.describe(name)['title']}.",
                   name, {"record": rec["id"]})
        return rec

    @app.patch("/api/tables/{name}/records/{rid}", dependencies=[api])
    def edit_record(name: str, rid: str, body: RecordBody) -> dict[str, Any]:
        if body.revision is None:
            raise Problem("An edit needs the record's revision.")
        before = world.collections.get(name, rid)
        rec = world.collections.update(name, rid, body.values, body.revision, {"by": "person"})
        person_did("changed", f"You changed {', '.join(body.values)} in "
                   f"{world.collections.describe(name)['title']}.", name,
                   {"record": rid, "before": {k: before.get(k) for k in body.values},
                    "after": body.values})
        return rec

    @app.delete("/api/tables/{name}/records/{rid}", dependencies=[api])
    def delete_record(name: str, rid: str, revision: int) -> dict[str, Any]:
        before = world.collections.get(name, rid)
        world.collections.delete(name, rid, revision)
        title = world.collections.describe(name)["title"]
        person_did("changed", f"You removed a row from {title}.", name,
                   {"record": rid, "removed": before})
        return {"removed": rid}

    @app.post("/api/tables/{name}/records/bulk", dependencies=[api])
    def bulk_records(name: str, body: BulkBody) -> dict[str, Any]:
        return edits.bulk(world, name, body.action, body.items, body.values, actor="person",
                          provenance={"by": "person"})

    @app.get("/api/tables/{name}/records/{rid}/history", dependencies=[api])
    def record_history(name: str, rid: str) -> list[dict[str, Any]]:
        return edits.history(world, name, rid)

    @app.post("/api/tables/{name}/undo", dependencies=[api])
    def undo_edit(name: str) -> dict[str, Any]:
        return edits.undo(world, name, actor="person", provenance={"by": "person"})

    @app.post("/api/tables/{name}/fields", dependencies=[api])
    def add_fields(name: str, body: FieldsBody) -> dict[str, Any]:
        desc = world.collections.add_fields(name, body.fields)
        person_did("changed", f"You added {', '.join(str(f.get('name')) for f in body.fields)}"
                   f" to {desc['title']}.", name, {})
        return desc

    @app.patch("/api/tables/{name}/fields/{field}", dependencies=[api])
    def change_field(name: str, field: str, body: FieldChangeBody) -> dict[str, Any]:
        return edits.change_field(world, name, field, actor="person",
                                  **body.model_dump(exclude_none=True))

    # ---- saved views ----

    @app.get("/api/tables/{name}/views", dependencies=[api])
    def views(name: str) -> list[dict[str, Any]]:
        world.collections.describe(name)
        return world.views.all(name)

    @app.post("/api/tables/{name}/views", dependencies=[api])
    def save_view(name: str, body: ViewBody) -> dict[str, Any]:
        view = world.views.create(name, body.title or "", body.config or {}, by="person",
                                  is_default=bool(body.is_default))
        person_did("made", f"You saved the view {view['title']} on "
                   f"{world.collections.describe(name)['title']}.", name, {"view": view["id"]})
        return view

    @app.patch("/api/views/{vid}", dependencies=[api])
    def update_view(vid: str, body: ViewBody) -> dict[str, Any]:
        view = world.views.update(vid, title=body.title, config=body.config,
                                  is_default=body.is_default)
        person_did("changed", f"You updated the view {view['title']}.", view["collection"],
                   {"view": vid})
        return view

    @app.delete("/api/views/{vid}", dependencies=[api])
    def delete_view(vid: str) -> dict[str, Any]:
        view = world.views.delete(vid)
        person_did("changed", f"You deleted the view {view['title']}.", view["collection"],
                   {"view": vid, "view_config": view["config"]})
        return {"deleted": vid}

    # ---- people and companies ----

    @app.get("/api/people", dependencies=[api])
    def people(kind: str | None = None, q: str | None = None) -> list[dict[str, Any]]:
        kinds = [kind] if kind else ["person", "organisation"]
        out = []
        for k in kinds:
            for e in world.entities.find(name=q, kind=k, limit=500):
                last = world.store.one(
                    "SELECT j.at, j.text FROM journal j, json_each(j.entity_ids) x WHERE x.value ="
                    " ? AND j.deleted_at IS NULL ORDER BY j.at DESC LIMIT 1", (e["id"],),
                )
                out.append({**e, "last_at": last["at"] if last else None,
                            "last_text": last["text"] if last else None})
        return sorted(out, key=lambda e: e["last_at"] or "", reverse=True)

    @app.get("/api/entities/{eid}", dependencies=[api])
    def entity(eid: str) -> dict[str, Any]:
        e = world.entities.get(eid)
        same_name = [x for x in world.entities.find(name=e["name"], kind=e["kind"])
                     if x["id"] != e["id"] and x["name"].lower() == e["name"].lower()]
        return {**e, "facts": world.knowledge.facts(f"entity:{e['id']}"),
                "timeline": timeline(world, e["id"]), "maybe_same": same_name}

    @app.post("/api/entities/{keep}/merge/{other}", dependencies=[api])
    def merge(keep: str, other: str) -> dict[str, Any]:
        merged = world.entities.merge(keep, other)
        world.journal.append("changed", f"You said these are the same: {merged['name']}.",
                             actor="person", entity_ids=[keep, other])
        return merged

    # ---- Intelligence ----

    @app.get("/api/intelligence", dependencies=[api])
    def intelligence() -> dict[str, Any]:
        return {
            "skills": [{"name": m["name"], "title": m.get("title", m["name"]),
                        "description": m.get("description"), "tools": m.get("tools", []),
                        "origin": m.get("origin")} for m in manifests()],
            "automations": automation_views(world, scheduler),
            "readers": world.readers.all(),
            "connections": Connections(world.store).all(),
            "knowledge": {
                "facts": world.knowledge.facts("person"),
                "notes": world.knowledge.notes(),
                "goals": world.knowledge.goals(None),
                "permissions": world.permissions.live(),
            },
            "procedures": world.procedures.all(),
        }

    @app.post("/api/permissions/{pid}/revoke", dependencies=[api])
    def revoke_permission(pid: str) -> dict[str, Any]:
        revoked = world.permissions.revoke(pid)
        world.journal.append("changed", f"Revoked a standing permission: {revoked['sentence']}",
                             actor="person", data={"permission": pid})
        return revoked

    @app.get("/api/actions", dependencies=[api])
    def actions(state: str | None = None) -> list[dict[str, Any]]:
        return [action_view(a) for a in world.actions.all((state,) if state else None)]

    @app.get("/api/actions/{aid}", dependencies=[api])
    def action(aid: str) -> dict[str, Any]:
        return action_view(world.actions.get(aid))

    @app.get("/api/actions/{aid}/shots/{name}", dependencies=[api])
    def action_shot(aid: str, name: str) -> FileResponse:
        a = world.actions.get(aid)
        for p in a.get("shots") or []:
            if Path(p).name == name and Path(p).exists():
                return FileResponse(p, media_type="image/png")
        raise Problem("There is no such screenshot.")

    @app.patch("/api/actions/{aid}", dependencies=[api])
    def edit_action(aid: str, body: ActionEditBody) -> dict[str, Any]:
        a = world.actions.get(aid)
        proc = world.procedures.get(a["procedure"])
        world.actions.edit(aid, body.payload, proc["fields"])
        world.journal.append("changed", f"Changed the text of \"{a['title']}\" before deciding.",
                             actor="person", data={"action": aid})
        # The preview showed the old text: it is made again before the card can be approved.
        world.actions.previewed(aid, preview=None, note=acting.PREVIEW_PENDING, shots=[])
        if live:
            threading.Thread(target=lambda: acting.dry_run(world, aid), daemon=True,
                             name=f"preview-{aid}").start()
        else:
            acting.dry_run(world, aid)
        return action_view(world.actions.get(aid))

    @app.post("/api/actions/{aid}/approve", dependencies=[api])
    def approve_action(aid: str, body: ActionApproveBody) -> dict[str, Any]:
        """The person's yes in the app: the action runs now, in the background, and the card
        shows what happened."""
        approval = "Approved in the app" + (", always" if body.always else "")
        if live:
            # The yes is recorded now (and refused if the preview isn't ready); the run follows.
            acting.approve(world, aid, approval, always=body.always, perform_now=False)
            threading.Thread(target=lambda: acting.perform(world, aid, runner=runner_fn),
                             daemon=True, name=f"act-{aid}").start()
        else:
            acting.approve(world, aid, approval, always=body.always, runner=runner_fn,
                           repair=False)
        return action_view(world.actions.get(aid))

    @app.post("/api/actions/{aid}/decline", dependencies=[api])
    def decline_action(aid: str) -> dict[str, Any]:
        return action_view(acting.decline(world, aid))

    @app.post("/api/notes", dependencies=[api])
    def write_note(body: NoteBody) -> dict[str, Any]:
        note = world.knowledge.write_note(body.scope, body.title, body.body)
        world.journal.append("changed", f"You edited the note {body.title}.", actor="person")
        return note

    @app.post("/api/connections/folder", dependencies=[api])
    def connect_folder(body: FolderBody) -> dict[str, Any]:
        files = Files(world)
        conn = files.watch(body.path)
        return {**conn, "sync": files.sync(conn["target"])}

    @app.post("/api/connections/site", dependencies=[api])
    def connect_site(body: SiteBody) -> dict[str, Any]:
        return Browser(world).start_signin(body.site)

    @app.post("/api/connections/calendar", dependencies=[api])
    def connect_calendar() -> dict[str, Any]:
        return Calendar(world).connect()

    @app.post("/api/connections/{cid}/sync", dependencies=[api])
    def sync_connection(cid: str) -> dict[str, Any]:
        conn = Connections(world.store).get(cid)
        if conn["connector"] == "files":
            return Files(world).sync(conn["target"])
        if conn["connector"] == "calendar":
            return Calendar(world).sync()
        if conn["connector"] == "browser":
            return Browser(world).refresh(conn["target"])
        raise Problem(f"Nothing to sync for {conn['connector']}.")

    # ---- settings: the person's Claude and their data ----

    # ---- settings: models (Settings -> Models, and the composer's + -> Advanced -> Model) ----

    @app.get("/api/models", dependencies=[api])
    def model_rows() -> dict[str, Any]:
        return {"providers": accounts.rows()}

    @app.get("/api/models/{provider}/models", dependencies=[api])
    def provider_models(provider: str) -> dict[str, Any]:
        """{"models": [{"id", "label"}], "selected": id | null}."""
        return accounts.models(provider)

    @app.put("/api/models/{provider}/model", dependencies=[api])
    def select_model(provider: str, body: ModelBody) -> dict[str, Any]:
        return accounts.select_model(provider, body.model)

    @app.post("/api/models/{provider}/star", dependencies=[api])
    def star(provider: str) -> dict[str, Any]:
        return {"providers": accounts.star(provider)}

    @app.put("/api/models/{provider}/key", dependencies=[api])
    def save_key(provider: str, body: KeyBody) -> dict[str, Any]:
        return {"provider": accounts.save_key(provider, body.key)}

    @app.delete("/api/models/{provider}/key", dependencies=[api])
    def remove_key(provider: str) -> dict[str, Any]:
        return {"provider": accounts.remove_key(provider)}

    @app.post("/api/models/{provider}/test", dependencies=[api])
    def test_provider(provider: str) -> dict[str, Any]:
        return {"provider": accounts.test(provider)}

    @app.post("/api/models/{provider}/reconnect", dependencies=[api])
    def reconnect(provider: str) -> dict[str, Any]:
        return {"provider": accounts.reconnect(provider)}

    @app.post("/api/models/{provider}/sign-in", dependencies=[api])
    def sign_in(provider: str) -> dict[str, Any]:
        return {"provider": accounts.sign_in(provider)}

    @app.post("/api/models/{provider}/sign-in/finish", dependencies=[api])
    def finish_sign_in(provider: str, body: CodeBody) -> dict[str, Any]:
        return {"provider": accounts.finish_sign_in(provider, body.code)}

    @app.post("/api/models/{provider}/install", dependencies=[api])
    def install(provider: str) -> dict[str, Any]:
        return {"provider": accounts.install(provider)}

    @app.get("/api/route", dependencies=[api])
    def get_route(thread: str | None = None) -> dict[str, Any]:
        """The model this conversation's next message goes to."""
        return accounts.route(thread)

    @app.put("/api/route", dependencies=[api])
    def set_route(body: RouteBody) -> dict[str, Any]:
        """This conversation's own model; no provider goes back to the default."""
        return accounts.choose(body.thread, body.provider, body.model)
    # ---- P2: settings fields, access modes, stopping a turn ----

    access.enable(world)
    files.enable(world)

    @app.get("/api/settings", dependencies=[api])
    def get_settings() -> list[dict[str, Any]]:
        return settings.all_fields(world.store)

    @app.patch("/api/settings", dependencies=[api])
    def update_settings(body: SettingsBody) -> list[dict[str, Any]]:
        return settings.update(world.store, body.values)

    @app.get("/api/access", dependencies=[api])
    def get_access(thread: str | None = None) -> dict[str, Any]:
        """How much Alpha may do in this conversation before it asks."""
        return {"thread": thread, "mode": settings.access_mode(world.store, thread),
                "default": settings.get(world.store, "access.mode")}

    @app.put("/api/access", dependencies=[api])
    def set_access(body: AccessBody) -> dict[str, Any]:
        """This conversation's own mode; no mode goes back to the default."""
        mode = settings.set_access_mode(world.store, body.thread, body.mode)
        return {"thread": body.thread, "mode": mode,
                "default": settings.get(world.store, "access.mode")}

    @app.post("/api/turns/{key}/cancel", dependencies=[api])
    def cancel_turn(key: str) -> dict[str, Any]:
        """Stop a running turn: its model process ends, and the journal says "You stopped it"."""
        return running.cancel(key)

    @app.get("/api/transcribe", dependencies=[api])
    def can_transcribe() -> dict[str, bool]:
        return {"available": transcription.available()}

    @app.post("/api/transcribe", dependencies=[api])
    def transcribe(body: SpeechBody) -> dict[str, str]:
        try:
            audio = base64.b64decode(body.audio_b64, validate=True)
        except ValueError as e:
            raise Problem("That recording didn't arrive whole.") from e
        return {"text": transcription.transcribe(audio, body.mime, body.provider)}

    @app.get("/api/data", dependencies=[api])
    def data_info() -> dict[str, Any]:
        return backup.describe(world)

    @app.post("/api/data/backup", dependencies=[api])
    def data_backup() -> dict[str, Any]:
        return backup.back_up(world)

    @app.post("/api/data/backups/{name}/restore", dependencies=[api])
    def data_restore(name: str) -> dict[str, Any]:
        return backup.restore(world, name)

    @app.get("/api/connections/{cid}/removal", dependencies=[api])
    def connection_removal(cid: str) -> dict[str, Any]:
        """What removing a connection takes with it, shown before the person confirms."""
        return remove_connection(world, cid, dry_run=True)

    @app.delete("/api/connections/{cid}", dependencies=[api])
    def delete_connection(cid: str) -> dict[str, Any]:
        return remove_connection(world, cid)

    # ---- automations ----

    @app.get("/api/automations", dependencies=[api])
    def automations() -> list[dict[str, Any]]:
        return automation_views(world, scheduler)

    @app.patch("/api/automations/{aid}", dependencies=[api])
    def switch_automation(aid: str, body: SwitchBody) -> dict[str, Any]:
        auto = world.automations.update(aid, enabled=body.enabled)
        world.journal.append("changed", f"You switched {'on' if body.enabled else 'off'}:"
                             f" {auto['title']}.", actor="person", module=auto["module"])
        return auto

    @app.post("/api/automations/{aid}/run", dependencies=[api])
    def run_automation(aid: str) -> dict[str, Any]:
        scheduler.run_now(aid)
        return next(a for a in automation_views(world, scheduler) if a["id"] == aid)

    # ---- Activity, search, the conversation, turns, threads ----

    @app.get("/api/activity", dependencies=[api])
    def activity(limit: int = 100, module: str | None = None, q: str | None = None,
                 kind: str | None = None) -> list[dict[str, Any]]:
        if q:
            return world.journal.search(q, limit)
        module_id = world.modules.get(module)["id"] if module else None
        kinds = [kind] if kind else None
        return list(reversed(world.journal.recent(limit, module=module_id, kinds=kinds)))

    @app.get("/api/search", dependencies=[api])
    def search(q: str) -> dict[str, Any]:
        return {"records": world.collections.search(q, 20), "documents": Files(world).search(q),
                "people": world.entities.find(name=q), "journal": world.journal.search(q, 20)}

    @app.get("/api/conversation", dependencies=[api])
    def conversation(limit: int = 40, module: str | None = None) -> dict[str, Any]:
        module_id = world.modules.get(module)["id"] if module else None
        turns_ = world.journal.recent(limit, stream=True, kinds=["said", "replied", "failed"],
                                      module=module_id)
        return {"turns": turns_, "threads": thread_views(world), "running": running.running(),
                "plans": world.plans.recent(),
                "actions": [action_view(a) for a in world.actions.all(limit=20)],
                "asks": [{"id": a["id"], "text": a["text"], "at": a["at"],
                          "options": a["data"].get("options", []), "thread": a["thread"],
                          "module": a["module"]} for a in world.journal.open_asks()]}

    @app.post("/api/ask", dependencies=[api])
    def ask(body: AskBody) -> dict[str, Any]:
        if not body.text.strip():
            raise Problem("Say something first.")
        return running.start(body)

    @app.get("/api/turns/{key}", dependencies=[api])
    def turn_state(key: str) -> dict[str, Any]:
        return running.get(key)

    @app.get("/api/threads/{tid}", dependencies=[api])
    def thread(tid: str) -> dict[str, Any]:
        return {**world.modules.thread(tid), "journal": world.journal.recent(200, thread=tid)}

    # ---- facts, skills, first steps, project links, row actions (alpha/api/brain.py) ----
    brain.mount(app, world, api, running.runner or Router(accounts))
    # ---- P1: new projects and making them, chats (sessions), what needs the person, bugs ----

    # A turn can't carry on across a restart: a creation that was thinking says so on its page.
    for m in world.modules.all():
        tid = (m["creation"] or {}).get("thread")
        if tid and world.modules.thread(tid)["state"] == "working":
            world.modules.set_creation(m["id"], {"error": turns.RESTARTED})
            world.modules.update_thread(tid, state="open")

    @app.post("/api/modules", dependencies=[api])
    def new_module(body: NewModuleBody) -> dict[str, Any]:
        """New project: a blank one at once ("Untitled project"), with the thread it is made
        in; its page asks the person to describe it."""
        m = world.modules.create((body.name or "").strip() or world.modules.untitled())
        tid = world.modules.open_thread(f"Making {m['name']}", "build", m["id"])["id"]
        return module_card(world, world.modules.set_creation(m["id"], {"stage": "new",
                                                                         "thread": tid}))

    def said_last(tid: str) -> str:
        last = world.journal.recent(1, thread=tid, kinds=["said"])
        if not last:
            raise Problem("There is nothing to try again yet.")
        return str(last[-1]["text"])

    @app.post("/api/modules/{ref}/creation/answer", dependencies=[api])
    def answer_creation(ref: str, body: CreationAnswerBody) -> dict[str, Any]:
        m = world.modules.get(ref)
        creation = m["creation"] or {}
        if not creation.get("thread") or creation.get("stage") == "done":
            raise Problem(f"{m['name']} isn't being made.")
        tid = str(creation["thread"])
        if body.start_over:
            world.modules.update_thread(tid, state="done")
            fresh = world.modules.open_thread(f"Making {m['name']}", "build", m["id"])["id"]
            world.modules.set_creation(m["id"], None)
            return {"module": module_card(world, world.modules.set_creation(
                m["id"], {"stage": "new", "thread": fresh}))}
        asked = {q["id"]: q["question"] for q in creation.get("questions", [])
                 + (creation.get("proposal") or {}).get("questions", [])}
        lines = [f"{asked.get(k, k)} {v}" for k, v in (body.answers or {}).items() if v.strip()]
        if body.retry:
            text = said_last(tid)
        elif body.carry_on:
            text = "Carry on building from where you stopped; check what exists first."
        elif body.build:
            text = "Build it now from the plan."
        elif body.choice:
            options = (creation.get("proposal") or {}).get("options", [])
            option = next((o for o in options if o.get("id") == body.choice), None)
            if option is None:
                raise Problem("That option isn't on the page any more.")
            text = "\n".join([f'Go with "{option["title"]}": {option.get("summary", "")}',
                              *lines])
        elif body.use_defaults:
            text = ("Use your defaults for anything still open; I will revise later. Resolve"
                    " every open question with a stated assumption and ask nothing more.")
        else:
            text = "\n".join([*([body.text.strip()] if body.text and body.text.strip() else []),
                              *lines])
        if not text.strip():
            raise Problem("Pick an answer first.")
        if body.build or body.carry_on:
            # The person's yes to the plan on the page: making lasting things is open from now.
            world.modules.set_creation(m["id"], {"approved_at": now()})
        return {"turn": running.start(AskBody(text=text, module=m["id"], thread=tid))}

    @app.post("/api/threads", dependencies=[api])
    def new_thread(body: ThreadBody) -> dict[str, Any]:
        """A chat the person opens ("+ New chat", then their first message): a topic thread in
        the place it was opened (a project, or global)."""
        module_id = world.modules.get(body.module)["id"] if body.module else None
        title = " ".join((body.title or "").split())[:60] or "Untitled session"
        return world.modules.open_thread(title, "topic", module_id)

    @app.get("/api/threads", dependencies=[api])
    def list_threads(module: str | None = None,
                     include_done: bool = False) -> list[dict[str, Any]]:
        module_id = world.modules.get(module)["id"] if module else None
        return world.modules.sessions(module_id, include_done=include_done)

    @app.patch("/api/threads/{tid}", dependencies=[api])
    def edit_thread(tid: str, body: ThreadPatch) -> dict[str, Any]:
        """Archive a chat (state done) or rename it."""
        return world.modules.update_thread(tid, state=body.state, title=body.title)

    @app.get("/api/attention", dependencies=[api])
    def attention() -> dict[str, Any]:
        """What the Activity bell counts: everything waiting on the person, and automations
        whose last run in the past day failed."""
        since = (datetime.now(UTC) - timedelta(days=1)).isoformat()
        failed = [{"id": a["id"], "title": a["title"], "module": a["module"],
                   "at": a["last_run_at"], "error": a["last_error"]}
                  for a in world.automations.all()
                  if a["last_error"] and (a["last_run_at"] or "") >= since]
        needs = needs_you(world)
        return {"count": len(needs) + len(failed), "needs_you": needs, "failed": failed}

    @app.get("/api/bugs", dependencies=[api])
    def bugs() -> dict[str, Any]:
        """Alpha's own bug log (`<data dir>/bugs.md`)."""
        return {"path": str(bug_log(world).path), "text": bug_log(world).read()}

    return app


PROJECT_SUFFIXES = (".alphaproject", ".json")
PROJECT_MAX_BYTES = 10 * 1024 * 1024


def read_project_file(path: str) -> dict[str, Any]:
    """A project file on this Mac, by its path (what the window's attachments carry)."""
    file = Path(path).expanduser()
    if file.suffix.lower() not in PROJECT_SUFFIXES or not file.is_file():
        raise Problem("That isn't a project file exported from Alpha.")
    if file.stat().st_size > PROJECT_MAX_BYTES:
        raise Problem("That project file is larger than 10 MB.")
    try:
        bundle = json.loads(file.read_text(encoding="utf-8"))
    except (OSError, ValueError) as e:
        raise Problem("That project file couldn't be read.") from e
    if not isinstance(bundle, dict):
        raise Problem("That isn't a project file exported from Alpha.")
    return bundle


READY_PREFIX = "ALPHA_CORE_READY "


@functools.cache
def source_commit() -> str | None:
    """The commit the core's code was loaded from (once: later commits don't change running
    code), so the app can tell when its own build is older or newer (the app runs the core from
    the checkout, which moves on without it)."""
    import subprocess

    repo = Path(__file__).resolve().parents[3]
    try:
        done = subprocess.run(["git", "-C", str(repo), "rev-parse", "HEAD"], capture_output=True,
                              text=True, timeout=5, check=False)
    except (OSError, subprocess.TimeoutExpired):
        return None
    return (done.stdout.strip() or None) if done.returncode == 0 else None


def serve(port: int = 53900) -> None:
    """Listen on 127.0.0.1 (port 0 picks a free one) and say so on one stdout line,
    `ALPHA_CORE_READY {"port": …}`, which the app's host waits for."""
    import json
    import socket
    import sys

    import uvicorn

    logging.basicConfig(level=logging.INFO, stream=sys.stderr)
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    sock.bind(("127.0.0.1", port))
    sock.listen(128)
    world = World()
    ready = {"port": sock.getsockname()[1], "world": str(world.path), "pid": os.getpid(),
             "commit": source_commit()}
    print(READY_PREFIX + json.dumps(ready), flush=True)
    config = uvicorn.Config(create_app(world), log_level="warning")
    uvicorn.Server(config).run(sockets=[sock])
