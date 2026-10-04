"""Routes for modules and their tables: a new project and making it on its page, a project's
edits, export and import, records read and edited in place (bulk, history, undo, fields), saved
lists, exports, documents and files dropped in."""

from __future__ import annotations

import csv
import json
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Form, UploadFile

from alpha.api.bodies import (
    AskBody,
    BulkBody,
    CreateModuleBody,
    CreationAnswerBody,
    ExportBody,
    FieldChangeBody,
    FieldsBody,
    ListBody,
    ModuleBody,
    MoveModuleBody,
    RecordBody,
)
from alpha.api.served import Served
from alpha.api.views import (
    _cell,
    automation_views,
    module_card,
    relation_titles,
)
from alpha.connectors.files import Files, unique_path
from alpha.context.summary import module_summary
from alpha.world import edits
from alpha.world.bundle import export_module, import_module
from alpha.world.purge import remove_module
from alpha.world.store import Problem, now
from alpha.world.world import alpha_home


def routes(app: FastAPI, s: Served) -> None:
    world = s.world
    scheduler = s.scheduler
    running = s.running
    live = s.live
    api = s.api

    @app.get("/api/modules", dependencies=[api])
    def modules() -> list[dict[str, Any]]:
        return [module_card(world, m) for m in world.modules.all()]

    @app.get("/api/modules/{ref}", dependencies=[api])
    def module(ref: str) -> dict[str, Any]:
        m = world.modules.get(ref)
        ids = world.modules.subtree(m["id"])
        card = module_card(world, m)
        card["tables"] = [world.collections.describe(t["name"]) for t in card["tables"]]
        card["inside"] = [module_card(world, c) for c in world.modules.children(m["id"])]
        card["activity"] = list(reversed(world.journal.recent(500, modules=ids)))
        card["note"] = world.knowledge.find_note(f"module:{m['name']}", m["name"])
        card["goals"] = [g for g in world.knowledge.goals() if g["module"] in ids]
        card["automations"] = [a for i in ids for a in automation_views(world, scheduler, i)]
        card["sources"] = [s for i in ids for s in world.sources.all(i)]
        card["plan"] = world.knowledge.find_note(f"module:{m['name']}", "Plan")
        card["sessions"] = world.modules.sessions(m["id"])
        # Facts that hold only inside this project (world/knowledge.py).
        card["facts"] = world.knowledge.facts(f"module:{m['id']}")
        # The turn making it, while one runs (the page shows its clock and Stop).
        making = (m["creation"] or {}).get("thread")
        card["running"] = [t for t in running.running() if making and t.get("thread") == making]
        return card

    @app.patch("/api/modules/{ref}", dependencies=[api])
    def edit_module(ref: str, body: ModuleBody) -> dict[str, Any]:
        return module_card(world, world.modules.update(ref, name=body.name, icon=body.icon,
                                                       goal=body.goal))

    @app.delete("/api/modules/{ref}", dependencies=[api])
    def delete_module(ref: str) -> dict[str, Any]:
        return remove_module(world, ref)

    @app.get("/api/modules/{ref}/export", dependencies=[api])
    def export_project(ref: str, rows: bool = False) -> dict[str, Any]:
        return export_module(world, ref, rows=rows)

    @app.post("/api/modules/import", dependencies=[api])
    def import_project(bundle: dict[str, Any]) -> dict[str, Any]:
        if set(bundle) == {"path"}:
            bundle = read_project_file(str(bundle["path"]))
        return module_card(world, import_module(world, bundle))

    @app.post("/api/modules", dependencies=[api])
    def create_module(body: CreateModuleBody) -> dict[str, Any]:
        """A module the person makes themselves in the window: a place to hold others (Avilo
        above Advisory and Deal Tracker). Nothing is built; Alpha's own making stays behind a
        plan. Without a name it is New project: a blank "Untitled project" at once, with the
        thread it is made in; its page asks the person to describe it."""
        if not (body.name or "").strip():
            m = world.modules.create(world.modules.untitled(), parent=body.parent or None)
            tid = world.modules.open_thread(f"Making {m['name']}", "build", m["id"])["id"]
            return module_card(world, world.modules.set_creation(
                m["id"], {"stage": "new", "thread": tid}))
        made = world.modules.create(str(body.name).strip(), body.goal,
                                    parent=body.parent or None)
        where = f" inside {world.modules.path_words(made['parent'])}" if made["parent"] else ""
        world.journal.append("changed", f"You made the project {made['name']}{where}.",
                             actor="person", module=made["id"], data={"module": made["id"]})
        return module_card(world, made)

    @app.post("/api/modules/{ref}/move", dependencies=[api])
    def move_module(ref: str, body: MoveModuleBody) -> dict[str, Any]:
        """Put a module inside another, or at the top; everything in it moves with it."""
        moved = world.modules.move(ref, body.parent or None)
        where = world.modules.path_words(moved["parent"]) if moved["parent"] else "the top"
        world.journal.append("changed", f"You moved {moved['name']} under {where}.",
                             actor="person", module=moved["id"], data={"module": moved["id"]})
        return module_card(world, moved)

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

    @app.get("/api/modules/{ref}/page", dependencies=[api])
    def module_page(ref: str) -> dict[str, Any]:
        """The module's page of the wiki (what it is for, what it holds, what is open), or
        none yet; the person edits it through POST /api/notes with scope module:<name>."""
        name = world.modules.get(ref)["name"]
        return {"name": name, "scope": f"module:{name}",
                "page": world.knowledge.find_note(f"module:{name}", name)}

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
                "lists": world.views.for_table(name),
                "relations": relation_titles(world, desc, records),
                "last_edit": {"text": last["text"], "at": last["at"], "actor": last["actor"]}
                if last else None}

    @app.get("/api/tables/{name}/records/{rid}", dependencies=[api])
    def record(name: str, rid: str) -> dict[str, Any]:
        """One record with its table: what the page shows when a relation is followed into
        another table (a client from a financials row), with a way back."""
        desc = world.collections.describe(name)
        row = world.collections.get(name, rid)
        return {"table": desc, "record": row, "relations": relation_titles(world, desc, [row])}

    @app.get("/api/tables/{name}/lists", dependencies=[api])
    def lists(name: str) -> list[dict[str, Any]]:
        world.collections.describe(name)
        return world.views.for_table(name)

    @app.post("/api/tables/{name}/lists", dependencies=[api])
    def save_list(name: str, body: ListBody) -> dict[str, Any]:
        saved = world.views.save(name, body.title or "", body.config or {},
                                 default=bool(body.default))
        world.journal.append("changed", f"You saved the list \"{saved['title']}\" on"
                             f" {world.collections.describe(name)['title']}.", actor="person",
                             data={"list": saved["id"], "table": name})
        return saved

    @app.patch("/api/lists/{vid}", dependencies=[api])
    def change_list(vid: str, body: ListBody) -> dict[str, Any]:
        changed = world.views.update(vid, title=body.title, config=body.config,
                                     default=body.default)
        what = ("made it the default" if body.default else "renamed it" if body.title
                else "changed it")
        world.journal.append("changed", f"You {what}: the list \"{changed['title']}\".",
                             actor="person", data={"list": vid, "table": changed["collection"]})
        return changed

    @app.delete("/api/lists/{vid}", dependencies=[api])
    def drop_list(vid: str) -> dict[str, Any]:
        gone = world.views.delete(vid)
        world.journal.append("changed", f"You removed the list \"{gone['title']}\".",
                             actor="person", data={"list": vid, "table": gone["collection"]})
        return gone

    @app.post("/api/tables/{name}/export", dependencies=[api])
    def export_table(name: str, body: ExportBody) -> dict[str, Any]:
        """The table as a CSV or Excel file in Alpha's exports folder, for the person to open
        or share; the app reveals it."""

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
