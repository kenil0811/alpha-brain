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
    AddFieldBody,
    AskBody,
    CreateModuleBody,
    ExportBody,
    KitExportBody,
    KitInstallBody,
    ListBody,
    MoveModuleBody,
    RecordBody,
    RelabelFieldBody,
    RenameModuleBody,
)
from alpha.api.served import Served
from alpha.api.views import (
    _cell,
    agent_views,
    module_card,
    relation_titles,
)
from alpha.connectors.files import Files, unique_path
from alpha.context.summary import module_summary
from alpha.world.knowledge import RECORD_NOTE
from alpha.world.modtables import is_qualified
from alpha.world.purge import document_removal, removal_plan, remove_document, remove_module
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

    @app.get("/api/modules/removed", dependencies=[api])
    def removed_modules() -> list[dict[str, Any]]:
        """The modules removed with their data kept (Settings › Removed modules): when, and
        what each holds, from the removal's own plan."""
        out = []
        for m in world.modules.removed():
            plan = removal_plan(world, m["id"])
            out.append({"id": m["id"], "name": m["name"], "removed_at": m["removed_at"],
                        "path": [x["name"] for x in world.modules.path(m["id"])],
                        "holds": plan["what"], "tables": plan["tables"], "rows": plan["rows"],
                        "inside": plan["inside"]})
        return out

    @app.get("/api/modules/{ref}", dependencies=[api])
    def module(ref: str) -> dict[str, Any]:
        m = world.modules.get(ref)
        ids = world.modules.subtree(m["id"])
        card = module_card(world, m)
        card["tables"] = [world.modtables.describe(t["name"]) if is_qualified(t["name"])
                          else world.collections.describe(t["name"]) for t in card["tables"]]
        card["inside"] = [module_card(world, c) for c in world.modules.children(m["id"])]
        card["activity"] = list(reversed(world.journal.recent(500, modules=ids)))
        card["note"] = world.knowledge.find_note(f"module:{m['name']}", m["name"])
        card["goals"] = [g for g in world.knowledge.goals() if g["module"] in ids]
        card["agents"] = [a for i in ids for a in agent_views(world, scheduler, i)]
        card["decisions"] = [d for i in ids for d in world.decisions.about("module", i)]
        card["sources"] = [s for i in ids for s in world.sources.all(i)]
        return card

    @app.post("/api/modules", dependencies=[api])
    def create_module(body: CreateModuleBody) -> dict[str, Any]:
        """A module the person makes themselves in the window: a place to hold others (Avilo
        above Advisory and Deal Tracker). Nothing is built; what Alpha makes comes from a
        workflow page the person said yes to (§12)."""
        made = world.modules.create(body.name, body.goal, parent=body.parent or None)
        where = f" inside {world.modules.path_words(made['parent'])}" if made["parent"] else ""
        world.journal.append("changed", f"You made the module {made['name']}{where}.",
                             actor="person", module=made["id"], data={"module": made["id"]})
        return module_card(world, made)

    @app.post("/api/modules/{ref}/kit", dependencies=[api])
    def export_kit(ref: str, body: KitExportBody | None = None) -> dict[str, Any]:
        """The module as a kit (slice 5): its shape, notes, skills and agents, no data."""
        to = Path(body.to).expanduser() if body and body.to else None
        return world.kits.export(ref, to=to, zip_it=bool(body and body.zip))

    @app.post("/api/kits/install", dependencies=[api])
    def install_kit(body: KitInstallBody) -> dict[str, Any]:
        """A kit installed, or a newer version of one installed before (Q53's ownership rule)."""
        return world.kits.install(Path(body.path).expanduser())

    @app.get("/api/kits", dependencies=[api])
    def kits_installed() -> list[dict[str, Any]]:
        return [{k: v for k, v in kit.items() if k != "hashes"} for kit in world.kits.installed()]

    @app.post("/api/modules/{ref}/move", dependencies=[api])
    def move_module(ref: str, body: MoveModuleBody) -> dict[str, Any]:
        """Put a module inside another, or at the top; everything in it moves with it."""
        moved = world.modules.move(ref, body.parent or None)
        where = world.modules.path_words(moved["parent"]) if moved["parent"] else "the top"
        world.journal.append("changed", f"You moved {moved['name']} under {where}.",
                             actor="person", module=moved["id"], data={"module": moved["id"]})
        return module_card(world, moved)

    @app.post("/api/modules/{ref}/rename", dependencies=[api])
    def rename_module(ref: str, body: RenameModuleBody) -> dict[str, Any]:
        """A new name for a module (13 Oct, slice 2 A1): everywhere at once, journaled."""
        before = world.modules.get(ref)["name"]
        renamed = world.modules.rename(ref, body.name)
        if renamed["name"] != before:
            world.journal.append("changed", f"You renamed {before} to {renamed['name']}.",
                                 actor="person", module=renamed["id"],
                                 data={"module": renamed["id"], "before": before})
        return module_card(world, renamed)

    @app.get("/api/modules/{ref}/removal", dependencies=[api])
    def module_removal(ref: str) -> dict[str, Any]:
        """What deleting the module for good would take, before anything goes (A3)."""
        return removal_plan(world, ref)

    @app.post("/api/modules/{ref}/remove", dependencies=[api])
    def remove_keep(ref: str) -> dict[str, Any]:
        """Remove a module with its data kept (A3, A4): out of sight with what it holds, its
        agents stopped, restorable from Settings."""
        gone = world.modules.remove(ref)
        world.journal.append("changed", f"You removed {gone['name']}; its data is kept, and"
                             " Settings › Removed modules can bring it back.", actor="person",
                             module=gone["id"], data={"module": gone["id"], "kept": True})
        return {"id": gone["id"], "name": gone["name"], "removed_at": gone["removed_at"]}

    @app.post("/api/modules/{ref}/restore", dependencies=[api])
    def restore_module(ref: str) -> dict[str, Any]:
        back = world.modules.restore(ref)
        world.journal.append("changed", f"You restored {back['name']}.", actor="person",
                             module=back["id"], data={"module": back["id"]})
        return module_card(world, back)

    @app.delete("/api/modules/{ref}", dependencies=[api])
    def delete_module(ref: str) -> dict[str, Any]:
        """Delete a module for good with everything in it (A3); the journal keeps what it was
        (the removal journals itself)."""
        return remove_module(world, ref)

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
        if is_qualified(name):
            # A program module's own table (Q38): read-only, from its module.duckdb.
            return {"table": world.modtables.describe(name),
                    "records": world.modtables.query(name, limit), "files": {},
                    "lists": world.views.for_table(name), "relations": {}}
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
                                  "size": row["size"], "kind": row["kind"],
                                  "added_at": row["indexed_at"]}
        return {"table": desc, "records": records, "files": files,
                "lists": world.views.for_table(name),
                "relations": relation_titles(world, desc, records)}

    @app.get("/api/tables/{name}/records/{rid}", dependencies=[api])
    def record(name: str, rid: str) -> dict[str, Any]:
        """One record with its table: what the page shows when a relation is followed into
        another table (a client from a financials row), with a way back."""
        if is_qualified(name):
            return {"table": world.modtables.describe(name),
                    "record": world.modtables.get(name, rid), "relations": {}}
        desc = world.collections.describe(name)
        row = world.collections.get(name, rid)
        return {"table": desc, "record": row, "relations": relation_titles(world, desc, [row]),
                "note": world.knowledge.find_note(f"record:{name}/{rid}", RECORD_NOTE)}

    @app.get("/api/tables/{name}/records/{rid}/history", dependencies=[api])
    def record_history(name: str, rid: str, before: int | None = None,
                       count: int = 20) -> dict[str, Any]:
        """A record's changes, newest first, a page at a time (its page's History). A program
        module's own table is read from its database and keeps no versions here."""
        if is_qualified(name):
            return {"changes": [], "more": False, "added": None}
        return world.collections.record_changes(name, rid, before=before, count=count)

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
        or share; the app reveals it. With `records` and `columns`, exactly what the table
        shows (slice 2 G5): those rows in that order, those columns under their names."""

        desc = world.collections.describe(name)
        every = world.collections.query(name, None, None, None)
        rows = every
        if body.records is not None:
            by_id = {r["id"]: r for r in every}
            gone = [r for r in body.records if r not in by_id]
            if gone:
                raise Problem(f"{len(gone)} of those rows aren't in {desc['title']} any more;"
                              " open the table again and download it.")
            rows = [by_id[r] for r in body.records]
        fields = desc["fields"]
        if body.columns is not None:
            by_name = {f["name"]: f for f in desc["fields"]}
            unknown = [c for c in body.columns if c not in by_name]
            if unknown:
                raise Problem(f"{desc['title']} has no column {', '.join(unknown)}.")
            if not body.columns:
                raise Problem("Show at least one column to download.")
            fields = [by_name[c] for c in body.columns]
        cols = [f["name"] for f in fields]
        stamp = datetime.now().strftime("%Y-%m-%d %H.%M")
        folder = alpha_home() / "exports"
        if body.format == "xlsx":
            from openpyxl import Workbook

            wb = Workbook()
            ws = wb.create_sheet(desc["title"][:31] or "Table", 0)
            ws.append([f.get("label") or f["name"] for f in fields])
            for r in rows:
                ws.append([_cell(r.get(c)) for c in cols])
            target = unique_path(folder, f"{desc['title']} {stamp}.xlsx")
            wb.save(str(target))
        else:

            target = unique_path(folder, f"{desc['title']} {stamp}.csv")
            with open(target, "w", newline="", encoding="utf-8") as fh:
                w = csv.writer(fh)
                w.writerow([f.get("label") or f["name"] for f in fields])
                for r in rows:
                    w.writerow([_cell(r.get(c)) for c in cols])
        narrowed = len(rows) != len(every) or len(fields) != len(desc["fields"])
        columns = f"{len(fields)} column{'s' if len(fields) != 1 else ''}"
        what = f"{len(rows)} of {len(every)} rows, {columns}" if narrowed else f"{len(rows)} rows"
        world.journal.append("did", f"Exported {desc['title']} ({what}) to {target.name}.",
                             actor="person",
                             data={"collection": name, "path": str(target)},
                             module=desc["module"])
        return {"path": str(target), "name": target.name, "rows": len(rows)}

    @app.get("/api/modules/{ref}/files", dependencies=[api])
    def module_files(ref: str) -> list[dict[str, Any]]:
        """Every file a module holds (13 Oct, slice 2 B8), newest first, each with the date it
        was added and the records whose file fields hold it."""
        files = Files(world)
        return [{**d, "used_by": files.used_by(d["id"])}
                for d in files.of_module(world.modules.get(ref)["id"])]

    @app.get("/api/entities/{eid}/files", dependencies=[api])
    def entity_files(eid: str) -> list[dict[str, Any]]:
        """The files kept about a person or company (B11)."""
        files = Files(world)
        return [{**d, "used_by": files.used_by(d["id"])}
                for d in files.of_entity(world.entities.get(eid)["id"])]

    @app.get("/api/documents/{did}/removal", dependencies=[api])
    def document_removal_plan(did: str) -> dict[str, Any]:
        """What deleting a file would do, before it does (G4)."""
        return document_removal(world, did)

    @app.delete("/api/documents/{did}", dependencies=[api])
    def delete_document(did: str) -> dict[str, Any]:
        """Delete a file given to Alpha (G4); a connected folder's own file is refused."""
        return remove_document(world, did)

    @app.post("/api/files", dependencies=[api])
    async def add_files(files: list[UploadFile], module: str | None = Form(None),
                        table: str | None = Form(None), record: str | None = Form(None),
                        field: str | None = Form(None),
                        about: str | None = Form(None)) -> dict[str, Any]:
        """Files the person dropped onto a module or a row: kept in Alpha's folder for the
        module, made documents, and read by Alpha into the module's tables in a turn that
        follows. With table/record/field, the first file is put on that row's file field.
        With `about`, they are kept about a person or company, on their page (B11): read and
        searchable, no turn."""

        about_id = world.entities.get(about)["id"] if about else None
        taken = []
        module_id = world.modules.get(module)["id"] if module else None
        if table and not module_id:
            module_id = world.collections.describe(table)["module"]
        for up in files:
            with tempfile.NamedTemporaryFile(delete=False, suffix=Path(up.filename or "").suffix
                                             ) as tmp:
                tmp.write(await up.read())
            doc = Files(world).take(Path(tmp.name), module=module_id, origin="the person",
                                    name=up.filename or "file", move=True, by="person",
                                    about=about_id)
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

    def _own_table(name: str) -> dict[str, Any]:
        if is_qualified(name):
            raise Problem("This table is built by its module's program and read from it; its"
                          " fields change by asking Alpha.")
        return world.collections.describe(name)

    def _follow(desc: dict[str, Any], field: dict[str, Any], why: str) -> None:
        """The module's workflow page follows the person's change (a new version, B1)."""
        if desc.get("module"):
            world.workflows.follow_field(desc["module"], desc["name"], field, why)

    @app.post("/api/tables/{name}/fields", dependencies=[api])
    def add_field(name: str, body: AddFieldBody) -> dict[str, Any]:
        """A field the person adds (13 Oct, slice 2 B1): the person's own edit, journaled; the
        rows already there read as empty in it."""
        _own_table(name)
        desc = world.collections.add_field(name, body.label, body.kind, choices=body.choices,
                                           done_choices=body.done_choices,
                                           relation=body.relation, unit=body.unit)
        field = desc["fields"][-1]
        why = f"You added the field {field['label']} to {desc['title']}."
        world.journal.append("changed", why, actor="person", module=desc["module"],
                             data={"collection": name, "field": field["name"]})
        _follow(desc, field, why)
        return desc

    @app.post("/api/tables/{name}/fields/{field}/rename", dependencies=[api])
    def rename_field(name: str, field: str, body: RelabelFieldBody) -> dict[str, Any]:
        """A field's name for the eye, changed by the person (B2): its id, which the rows,
        lists and colours keep, stays."""
        before = next((f for f in _own_table(name)["fields"] if f["name"] == field), None)
        desc = world.collections.relabel_field(name, field, body.label)
        after = next(f for f in desc["fields"] if f["name"] == field)
        old = (before or {}).get("label") or field.replace("_", " ").capitalize()
        why = f"You renamed the field {old} to {after['label']} in {desc['title']}."
        world.journal.append("changed", why, actor="person", module=desc["module"],
                             data={"collection": name, "field": field, "before": old})
        _follow(desc, after, why)
        return desc

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
        # The person's edit is the source of the fields they changed; the other fields keep
        # theirs (a part's source and date, or its problem).
        prov = dict(before.get("_provenance") or {})
        fields = dict(prov.get("fields") or {})
        for key in body.values:
            fields[key] = {"source": "you", "fetched_at": now()}
        prov.update({"by": "person", "fields": fields})
        rec = world.collections.update(name, rid, body.values, body.revision, prov)
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
