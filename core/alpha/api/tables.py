"""Routes for modules and their tables: records read and edited in place, saved lists, exports,
documents and files dropped in."""

from __future__ import annotations

import csv
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any

from fastapi import FastAPI, Form, UploadFile

from alpha.api.bodies import (
    AskBody,
    ExportBody,
    ListBody,
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
from alpha.world.store import Problem
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
        card = module_card(world, m)
        card["tables"] = [world.collections.describe(t["name"]) for t in card["tables"]]
        card["activity"] = list(reversed(world.journal.recent(500, module=m["id"])))
        card["note"] = world.knowledge.find_note(f"module:{m['name']}", m["name"])
        card["goals"] = [g for g in world.knowledge.goals() if g["module"] == m["id"]]
        card["automations"] = automation_views(world, scheduler, m["id"])
        card["sources"] = world.sources.all(m["id"])
        return card

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
        return {"table": desc, "records": records, "files": files,
                "lists": world.views.for_table(name),
                "relations": relation_titles(world, desc, records)}

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
