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

import logging
import os
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
from pydantic import BaseModel

from alpha.connectors.base import Connections, manifests
from alpha.connectors.browser import Browser
from alpha.connectors.calendar import Calendar
from alpha.connectors.files import Files
from alpha.context.summary import module_summary
from alpha.runtime import acting, build, check, claude_account, claude_cli, conversations, noticing
from alpha.runtime import turn as turns
from alpha.runtime.automation import Scheduler
from alpha.world import backup
from alpha.world.purge import remove_connection
from alpha.world.store import Problem, loads
from alpha.world.world import World

log = logging.getLogger("alpha.api")
CALENDAR_EVERY_S = 300


class AskBody(BaseModel):
    text: str
    module: str | None = None
    thread: str | None = None
    # The conversation this belongs to; without one the sentence is routed (the companion).
    conversation: str | None = None


class ConversationBody(BaseModel):
    module: str | None = None
    title: str | None = None


class MoveBody(BaseModel):
    conversation: str


class RecordBody(BaseModel):
    values: dict[str, Any]
    revision: int | None = None


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


class NoteBody(BaseModel):
    scope: str
    title: str
    body: str
    summary: str | None = None


class Turns:
    """Turns run in the background; the window polls for the answer."""

    def __init__(self, world: World, runner: turns.Runner | None = None,
                 after: Callable[[], None] | None = None, checks: bool = True) -> None:
        self.world = world
        self.runner = runner
        self.after = after
        # After a turn in which Alpha wrote values it worked out itself, an independent answer
        # checks them in the background and Alpha corrects itself in the conversation.
        self.checks = checks
        self.state: dict[str, dict[str, Any]] = {}
        self.lock = threading.Lock()

    def start(self, body: AskBody, *, actor: str = "person",
              journal_as: str | None = None) -> dict[str, Any]:
        # Where this turn lives. A build or automation thread stays as given; a person's turn
        # with no conversation goes to the scope's live conversation (the panel on a page) or
        # is routed (the companion), which may come back as a question instead of a turn.
        conversation: str | None = None
        if body.conversation:
            conversation = self.world.modules.thread(body.conversation)["id"]
        elif body.thread:
            kind = self.world.modules.thread(body.thread)["kind"]
            conversation = body.thread if kind == "chat" else None
        elif actor == "person" and body.module:
            conversation = conversations.ensure(self.world, body.text, body.module)["id"]
        elif actor == "person":
            routed = conversations.route(self.world, body.text,
                                         runner=self.runner if self.runner else None)
            if "ask" in routed:
                return {"id": None, "state": "asked", "ask": routed["ask"],
                        "options": routed["options"], "text": body.text}
            conversation = routed["conversation"]
        thread = conversation or body.thread
        key = secrets.token_hex(6)
        with self.lock:
            self.state[key] = {"id": key, "state": "running", "text": body.text,
                               "started_at": datetime.now(UTC).isoformat(),
                               "conversation": conversation_view(self.world, conversation)
                               if conversation else None}

        def work() -> None:
            def said(jid: str) -> None:
                with self.lock:
                    self.state[key]["said"] = jid

            try:
                kwargs: dict[str, Any] = {"module": body.module, "thread": thread,
                                          "on_said": said, "actor": actor,
                                          "journal_as": journal_as,
                                          "conversation": bool(conversation)}
                if conversation:
                    self.world.modules.update_thread(conversation, state="working")
                if self.runner is not None:
                    kwargs["runner"] = self.runner
                out = turns.ask(self.world, body.text, **kwargs)
                result = {"state": "done" if out.ok else "failed", "reply": out.reply,
                          "said": out.said, "replied": out.replied,
                          "duration_ms": out.result.duration_ms}
            except Problem as e:
                result = {"state": "failed", "reply": str(e)}
            except Exception as e:
                log.exception("turn failed")
                result = {"state": "failed", "reply": f"Alpha hit an internal problem: {e}"}
            with self.lock:
                self.state[key].update(result)
            if conversation:
                try:
                    waiting = any(a["thread"] == conversation
                                  for a in self.world.journal.open_asks())
                    self.world.modules.update_thread(conversation,
                                                     state="waiting" if waiting else "open")
                except Exception:
                    log.exception("conversation state")
            if self.after is not None:
                # A plan approved in this turn starts building now, not at the next tick.
                self.after()
            said_id = result.get("said")
            if self.checks and result["state"] == "done" and said_id:
                self.check(str(said_id))
                if actor == "person":
                    self.notice(str(said_id))

        threading.Thread(target=work, daemon=True, name=f"turn-{key}").start()
        return self.state[key]

    def notice(self, said: str) -> None:
        """After a person's turn: what was said worth keeping, beside the verbatim (§3.7)."""
        if not noticing.worth_noticing(self.world, said):
            return

        def work() -> None:
            try:
                kwargs: dict[str, Any] = {}
                if self.runner is not None:
                    kwargs["runner"] = self.runner
                noticing.notice(self.world, said, **kwargs)
            except Exception:
                log.exception("noticing failed")

        threading.Thread(target=work, daemon=True, name=f"notice-{said}").start()

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

    def running(self) -> list[dict[str, Any]]:
        with self.lock:
            return [dict(v) for v in self.state.values() if v["state"] == "running"]

    def stop(self, key: str) -> dict[str, Any]:
        """Stop a turn that is still working; it ends with "You stopped it."."""
        with self.lock:
            if key not in self.state:
                raise Problem(f"There is no turn {key}.")
            said = self.state[key].get("said")
        if said:
            claude_cli.LIVE.stop(said)
        return self.get(key)


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


def conversation_view(world: World, cid: str,
                      thread: dict[str, Any] | None = None) -> dict[str, Any]:
    """A conversation (or work item) for the app: scope name, state, open question, last line."""
    t = thread or world.modules.thread(cid)
    scope = world.modules.get(t["module"])["name"] if t.get("module") else "General"
    question = next((a["text"] for a in world.journal.open_asks() if a["thread"] == cid), None)
    last = world.journal.recent(1, thread=cid, kinds=["said", "replied", "failed"])
    return {"id": cid, "title": t["title"], "kind": t["kind"], "state": t["state"],
            "module": t.get("module"), "scope": scope, "question": question,
            "last": last[0]["text"][:160] if last else None,
            "last_at": last[0]["at"] if last else t["updated_at"],
            "updated_at": t["updated_at"], "live": claude_cli.LIVE.progress_for(cid)}


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


def create_app(world: World | None = None, *, runner: turns.Runner | None = None,
               token: str | None = None, live: bool = True) -> FastAPI:
    world = world or World()
    global _WORLD_FOR_VIEW
    _WORLD_FOR_VIEW = world
    token = token if token is not None else os.environ.get("ALPHA_TOKEN")
    scheduler = Scheduler(world, runner)
    runner_fn = runner or claude_cli.run
    running = Turns(world, runner, after=scheduler.builds if live else None, checks=live)
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
        allow_origins=["http://localhost:1430", "http://127.0.0.1:1430", "tauri://localhost",
                       "http://tauri.localhost"],
        allow_methods=["*"], allow_headers=["*"],
    )

    def guard(request: Request) -> None:
        host = request.client.host if request.client else ""
        if host not in {"127.0.0.1", "::1", "localhost", "testclient"}:
            raise HTTPException(403, "Alpha only answers this Mac.")
        if token and request.headers.get("authorization") != f"Bearer {token}":
            raise HTTPException(401, "This window isn't signed in to Alpha's core.")

    @app.exception_handler(Problem)
    async def problem(_: Request, exc: Problem) -> JSONResponse:
        return JSONResponse({"error": str(exc)}, status_code=400)

    api = Depends(guard)

    @app.get("/api/health", dependencies=[api])
    def health() -> dict[str, Any]:
        return {"ok": True, "world": str(world.path), "running_turns": len(running.running())}

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

    @app.post("/api/asks/{ask_id}/answer", dependencies=[api])
    def answer(ask_id: str, body: AnswerBody) -> dict[str, Any]:
        asked = world.journal.read(ask_id)
        jid = world.journal.append("answered", body.text, actor="person", data={"ask": ask_id},
                                   module=asked["module"], thread=asked["thread"])
        routed = conversations.routed_answer(world, asked, body.text)
        if routed:
            # "Which is this about?": the pick sends the original sentence there.
            started = running.start(AskBody(text=routed["text"],
                                            conversation=routed["conversation"]))
            return {"answered": jid, "turn": started}
        # The answer is also the person's next message: Alpha carries on with it, in the
        # conversation that asked.
        started = running.start(AskBody(text=body.text, module=asked["module"],
                                        thread=asked["thread"]))
        return {"answered": jid, "turn": started}

    @app.post("/api/asks/{ask_id}/dismiss", dependencies=[api])
    def dismiss(ask_id: str) -> dict[str, Any]:
        # Closed without an answer: nothing runs.
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
        return running.stop(key)

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
        card["sources"] = world.sources.all(m["id"])
        return card

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
        return {"table": desc, "records": records, "files": files}

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
                page = world.knowledge.find_note(f"entity:{e['id']}", e["name"])
                out.append({**e, "last_at": last["at"] if last else None,
                            "last_text": last["text"] if last else None,
                            "summary": page.get("summary") if page else None})
        return sorted(out, key=lambda e: e["last_at"] or "", reverse=True)

    @app.get("/api/entities/{eid}", dependencies=[api])
    def entity(eid: str) -> dict[str, Any]:
        e = world.entities.get(eid)
        same_name = [x for x in world.entities.find(name=e["name"], kind=e["kind"])
                     if x["id"] != e["id"] and x["name"].lower() == e["name"].lower()]
        return {**e, "facts": world.knowledge.facts(f"entity:{e['id']}"),
                "timeline": timeline(world, e["id"]), "maybe_same": same_name,
                "page": world.knowledge.find_note(f"entity:{e['id']}", e["name"])}

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
        note = world.knowledge.write_note(body.scope, body.title, body.body, summary=body.summary)
        world.journal.append("changed", f"You edited the page {body.title}.", actor="person")
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

    @app.get("/api/claude", dependencies=[api])
    def claude_status() -> dict[str, Any]:
        return claude_account.status()

    @app.post("/api/claude/install", dependencies=[api])
    def claude_install() -> dict[str, Any]:
        return claude_account.install()

    @app.post("/api/claude/signin", dependencies=[api])
    def claude_sign_in() -> dict[str, Any]:
        return claude_account.sign_in()

    @app.post("/api/claude/signout", dependencies=[api])
    def claude_sign_out() -> dict[str, Any]:
        return claude_account.sign_out()

    @app.get("/api/data", dependencies=[api])
    def data_info() -> dict[str, Any]:
        return backup.describe(world)

    @app.post("/api/data/backup", dependencies=[api])
    def data_backup() -> dict[str, Any]:
        return backup.back_up(world)

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

    @app.get("/api/conversations", dependencies=[api])
    def list_conversations(module: str | None = None) -> list[dict[str, Any]]:
        """Live conversations and work items, newest first, for the strip and for Home."""
        module_id = world.modules.get(module)["id"] if module else None
        return [conversation_view(world, t["id"], t) for t in thread_views(world)
                if module_id is None or t["module"] == module_id]

    @app.post("/api/conversations", dependencies=[api])
    def new_conversation(body: ConversationBody) -> dict[str, Any]:
        chat = conversations.open_conversation(world, body.title or "New conversation",
                                               body.module)
        return conversation_view(world, chat["id"])

    @app.post("/api/conversations/{cid}/close", dependencies=[api])
    def close_conversation(cid: str) -> dict[str, Any]:
        return conversation_view(world, conversations.close(world, cid)["id"])

    @app.post("/api/conversations/{cid}/focus", dependencies=[api])
    def focus_conversation(cid: str) -> dict[str, Any]:
        world.modules.thread(cid)
        conversations.set_focus(world, cid)
        return {"focus": cid}

    @app.get("/api/companion", dependencies=[api])
    def companion() -> dict[str, Any]:
        """What the companion shows: its focus, the live conversations, what needs the person."""
        current = conversations.focus(world)
        return {"focus": conversation_view(world, current) if current else None,
                "conversations": [conversation_view(world, t["id"], t)
                                  for t in thread_views(world)],
                "needs_you": needs_you(world)}

    @app.post("/api/turns/{key}/move", dependencies=[api])
    def move_turn(key: str, body: MoveBody) -> dict[str, Any]:
        """A sentence that went to the wrong conversation: say so, and ask it again in the
        right one."""
        state = running.get(key)
        world.modules.thread(body.conversation)
        world.journal.append("changed", f"Moved \"{state['text'][:80]}\" to another"
                             " conversation.", actor="person",
                             data={"turn": state.get("said"), "to": body.conversation})
        return running.start(AskBody(text=state["text"], conversation=body.conversation))

    @app.get("/api/conversation", dependencies=[api])
    def conversation(limit: int = 40, module: str | None = None,
                     conversation: str | None = None) -> dict[str, Any]:
        """A conversation's turns: the one named, else the scope's live one, else (for
        General) the old stream."""
        module_id = world.modules.get(module)["id"] if module else None
        chat = (world.modules.thread(conversation) if conversation
                else world.modules.live_chat(module_id))
        if chat:
            turns_ = world.journal.recent(limit, thread=chat["id"],
                                          kinds=["said", "replied", "failed"])
        else:
            turns_ = world.journal.recent(limit, stream=True,
                                          kinds=["said", "replied", "failed"], module=module_id)
        return {"turns": turns_, "conversation": conversation_view(world, chat["id"], chat)
                if chat else None,
                "conversations": [conversation_view(world, t["id"], t)
                                  for t in thread_views(world)],
                "threads": thread_views(world), "running": running.running(),
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

    return app


READY_PREFIX = "ALPHA_CORE_READY "


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
    ready = {"port": sock.getsockname()[1], "world": str(world.path), "pid": os.getpid()}
    print(READY_PREFIX + json.dumps(ready), flush=True)
    config = uvicorn.Config(create_app(world), log_level="warning")
    uvicorn.Server(config).run(sockets=[sock])
