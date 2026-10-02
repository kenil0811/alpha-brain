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

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

import alpha
from alpha.api import brain
from alpha.connectors.base import Connections, manifests
from alpha.connectors.browser import Browser
from alpha.connectors.calendar import Calendar
from alpha.connectors.files import Files
from alpha.context.summary import module_summary
from alpha.models import settings
from alpha.models.accounts import Accounts
from alpha.models.keychain import KeychainError
from alpha.runtime import claude_cli, transcription
from alpha.runtime import turn as turns
from alpha.runtime.attachments import MAX_ATTACHMENTS, AttachmentIn
from alpha.runtime.automation import Scheduler
from alpha.runtime.route import Router
from alpha.world import access, backup, edits
from alpha.world.actions import Actions
from alpha.world.bundle import export_module, import_module
from alpha.world.purge import remove_connection, remove_module
from alpha.world.store import Problem, loads
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


class NoteBody(BaseModel):
    scope: str
    title: str
    body: str


class Turns:
    """Turns run in the background; the window polls for the answer."""

    def __init__(self, world: World, runner: turns.Runner | None = None,
                 accounts: Accounts | None = None) -> None:
        self.world = world
        self.runner = runner
        self.accounts = accounts
        self.state: dict[str, dict[str, Any]] = {}
        self.lock = threading.Lock()

    def start(self, body: AskBody) -> dict[str, Any]:
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
                               "started_at": datetime.now(UTC).isoformat()}

        def work() -> None:
            def said(jid: str) -> None:
                with self.lock:
                    self.state[key]["said"] = jid
                    stopping = self.state[key].get("stopping")
                if stopping:  # stopped before the model started: it never does
                    claude_cli.cancel(jid)

            try:
                kwargs: dict[str, Any] = {"module": body.module, "thread": body.thread,
                                          "on_said": said}
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
                result = {"state": "failed", "reply": f"Alpha hit an internal problem: {e}"}
            with self.lock:
                self.state[key].update(result)

        threading.Thread(target=work, daemon=True, name=f"turn-{key}").start()
        return self.state[key]

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
            claude_cli.cancel(said)
        return self.get(key)

    def running(self) -> list[dict[str, Any]]:
        with self.lock:
            return [dict(v) for v in self.state.values() if v["state"] == "running"]


def _local_midnight_utc() -> str:
    local = datetime.now().astimezone()
    midnight = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight.astimezone(UTC).replace(microsecond=0).isoformat()


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
                          "why": p["data"].get("why"), "at": p["at"], "module": p["module"]})
    for f in world.knowledge.facts("person", states=("suggested",)):
        items.append({"kind": "fact", "id": f["id"], "text": f"{f['predicate']}: {f['value']}",
                      "why": f["why"], "at": f["recorded_at"]})
    return items


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
    token = token if token is not None else os.environ.get("ALPHA_TOKEN")
    if companion_token is None:
        companion_token = os.environ.get("ALPHA_COMPANION_TOKEN")
    accounts = Accounts(world.store)
    # An injected runner (tests) bypasses the model routes and their connection check.
    running = Turns(world, runner or Router(accounts), None if runner else accounts)
    scheduler = Scheduler(world, runner or Router(accounts))
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
            "threads": world.modules.threads(),
            "brief": None,
        }

    actions = Actions(world)

    @app.get("/api/pending", dependencies=[api])
    def pending() -> list[dict[str, Any]]:
        return actions.pending()

    # The one approve path: these two, and an answer to a pending action's question, all end in
    # Actions.approve / reject, which runs the stored payload once.
    @app.post("/api/pending/{aid}/approve", dependencies=[api])
    def approve(aid: str) -> dict[str, Any]:
        return actions.approve(aid, by="person")

    @app.post("/api/pending/{aid}/reject", dependencies=[api])
    def reject(aid: str) -> dict[str, Any]:
        return actions.reject(aid, by="person")

    @app.post("/api/asks/{ask_id}/answer", dependencies=[api])
    def answer(ask_id: str, body: AnswerBody) -> dict[str, Any]:
        action = actions.by_ask(ask_id)
        if action is not None:
            yes = body.text.strip().lower() in {"approve", "yes", "approved"}
            decided = (actions.approve if yes else actions.reject)(action["id"], by="person")
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
        action = actions.by_ask(ask_id)
        if action is not None:
            return {"pending_action": actions.reject(action["id"], by="person")}
        return {"dismissed": world.journal.close_ask(ask_id, "Dismissed.")}

    @app.post("/api/proposals/{pid}/decide", dependencies=[api])
    def decide_proposal(pid: str, body: DecideBody) -> dict[str, Any]:
        proposal = world.journal.read(pid)
        world.journal.append("answered", "Yes" if body.accept else "No", actor="person",
                             data={"proposal": pid, "accept": body.accept},
                             module=proposal["module"])
        started = running.start(AskBody(text=f"Yes, go ahead: {proposal['text']}",
                                        module=proposal["module"])) if body.accept else None
        return {"decided": pid, "turn": started}

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
        return card

    @app.patch("/api/modules/{ref}", dependencies=[api])
    def edit_module(ref: str, body: ModuleBody) -> dict[str, Any]:
        return module_card(world, world.modules.update(ref, name=body.name, icon=body.icon))

    @app.delete("/api/modules/{ref}", dependencies=[api])
    def delete_module(ref: str) -> dict[str, Any]:
        return remove_module(world, ref)

    @app.get("/api/modules/{ref}/export", dependencies=[api])
    def export(ref: str) -> dict[str, Any]:
        return export_module(world, ref)

    @app.post("/api/modules/import", dependencies=[api])
    def import_(bundle: dict[str, Any]) -> dict[str, Any]:
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
        last = edits.last_edit(world, name)
        return {"table": desc, "records": records, "views": world.views.all(name),
                "last_edit": {"text": last["text"], "at": last["at"], "actor": last["actor"]}
                if last else None}

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
            },
        }

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
        return {"turns": turns_, "threads": world.modules.threads(), "running": running.running()}

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

    return app


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
