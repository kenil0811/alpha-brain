"""The files connector: folders the person asked Alpha to read.

A watched folder is a connection. Syncing walks it, reads every new or changed document into
the world (text extracted; the file itself is never changed), makes each one a `document`
entity keyed by its path, and journals what it saw. A file that disappears is marked removed.
While the core runs, FSEvents (through watchdog) triggers the same sync for the folder.
"""

from __future__ import annotations

import logging
import sqlite3
import threading
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from alpha.connectors.base import Connections
from alpha.world.store import Problem, new_id, now
from alpha.world.world import World

log = logging.getLogger("alpha.files")

TEXT_SUFFIXES = {".md", ".markdown", ".txt", ".csv", ".tsv", ".json", ".yaml", ".yml", ".html",
                 ".htm", ".rtf", ".log"}
OFFICE_SUFFIXES = {".pdf", ".docx", ".xlsx", ".pptx"}
SKIP_DIRS = {".git", "node_modules", ".venv", "__pycache__", ".Trash", "Library", ".cache"}
MAX_FILE_BYTES = 50 * 1024 * 1024
MAX_TEXT_CHARS = 400_000


def extract(path: Path) -> str:
    """Readable text of a document. Raises Problem with a plain reason when it can't."""
    suffix = path.suffix.lower()
    try:
        if suffix in TEXT_SUFFIXES:
            return path.read_text(errors="replace")[:MAX_TEXT_CHARS]
        if suffix == ".pdf":
            from pypdf import PdfReader

            reader = PdfReader(str(path))
            pages = [(p.extract_text() or "") for p in reader.pages]
            return "\n\n".join(pages)[:MAX_TEXT_CHARS]
        if suffix == ".docx":
            import docx

            d = docx.Document(str(path))
            parts = [p.text for p in d.paragraphs]
            for table in d.tables:
                for row in table.rows:
                    parts.append(" | ".join(c.text for c in row.cells))
            return "\n".join(parts)[:MAX_TEXT_CHARS]
        if suffix == ".xlsx":
            from openpyxl import load_workbook

            wb = load_workbook(str(path), read_only=True, data_only=True)
            lines = []
            for ws in wb.worksheets:
                lines.append(f"# {ws.title}")
                for row in ws.iter_rows(values_only=True):
                    if any(v is not None for v in row):
                        lines.append(" | ".join("" if v is None else str(v) for v in row))
                    if len(lines) > 20_000:
                        break
            return "\n".join(lines)[:MAX_TEXT_CHARS]
        if suffix == ".pptx":
            from pptx import Presentation

            deck = Presentation(str(path))
            slides = []
            for i, slide in enumerate(deck.slides, 1):
                texts = [s.text_frame.text for s in slide.shapes if s.has_text_frame]
                slides.append(f"# Slide {i}\n" + "\n".join(texts))
            return "\n\n".join(slides)[:MAX_TEXT_CHARS]
    except Exception as e:  # a damaged or protected file: say so, keep going
        raise Problem(f"Couldn't read {path.name}: {e}") from e
    raise Problem(f"{path.name} isn't a kind of file Alpha reads yet.")


def readable(path: Path) -> bool:
    return path.suffix.lower() in TEXT_SUFFIXES | OFFICE_SUFFIXES and not path.name.startswith(
        (".", "~$")
    )


def _walk(root: Path) -> list[Path]:
    out = []
    for p in root.rglob("*"):
        folders = p.relative_to(root).parts[:-1]
        if any(part in SKIP_DIRS or part.startswith(".") for part in folders):
            continue
        if p.is_file() and readable(p):
            out.append(p)
    return out


def _mtime(path: Path) -> str:
    return datetime.fromtimestamp(path.stat().st_mtime, UTC).replace(microsecond=0).isoformat()


def document_view(row: sqlite3.Row, *, full: bool = False) -> dict[str, Any]:
    out = {
        "id": row["id"],
        "entity_id": row["entity_id"],
        "path": row["path"],
        "title": row["title"],
        "kind": row["kind"],
        "size": row["size"],
        "modified_at": row["modified_at"],
        "chars": len(row["text"]),
    }
    if full:
        out["text"] = row["text"]
    return out


class Files:
    def __init__(self, world: World) -> None:
        self.world = world
        self.connections = Connections(world.store)

    # ---- connections ----

    def watch(self, folder: str) -> dict[str, Any]:
        path = Path(folder).expanduser().resolve()
        if not path.is_dir():
            raise Problem(f"{folder} isn't a folder on this Mac.")
        if path == Path.home() or str(path) == "/":
            raise Problem("That's a whole drive or home folder; pick the folder that matters.")
        conn = self.connections.upsert("files", str(path))
        self.world.journal.append("made", f"Started reading the folder {path.name} ({path}).",
                                  data={"connection": conn["id"]}, source="connector:files")
        return conn

    def unwatch(self, folder: str) -> None:
        conn = self.connections.find("files", str(Path(folder).expanduser().resolve()))
        if conn is None:
            raise Problem(f"Alpha isn't reading {folder}.")
        self.connections.remove(conn["id"])

    # ---- syncing ----

    def sync(self, folder: str | None = None) -> dict[str, Any]:
        """Read new and changed documents in one watched folder (or all of them)."""
        targets = [c for c in self.connections.all("files") if c["status"] != "off"]
        if folder is not None:
            wanted = str(Path(folder).expanduser().resolve())
            targets = [c for c in targets if c["target"] == wanted]
            if not targets:
                raise Problem(f"Alpha isn't reading {folder}; ask it to watch the folder first.")
        totals = {"added": 0, "changed": 0, "removed": 0, "unreadable": 0, "folders": 0}
        for conn in targets:
            try:
                result = self._sync_one(conn)
            except Exception as e:
                log.exception("sync of %s failed", conn["target"])
                self.connections.synced(conn["id"], error=str(e))
                continue
            self.connections.synced(conn["id"])
            totals["folders"] += 1
            for k in ("added", "changed", "removed", "unreadable"):
                totals[k] += result[k]
        return totals

    def _sync_one(self, conn: dict[str, Any]) -> dict[str, int]:
        root = Path(conn["target"])
        if not root.is_dir():
            raise Problem(f"The folder {root} is gone.")
        store = self.world.store
        known = {
            r["path"]: r
            for r in store.all(
                "SELECT id, path, modified_at, removed_at FROM documents WHERE connection = ?",
                (conn["id"],),
            )
        }
        counts = {"added": 0, "changed": 0, "removed": 0, "unreadable": 0}
        seen: set[str] = set()
        for path in _walk(root):
            key = str(path)
            seen.add(key)
            if path.stat().st_size > MAX_FILE_BYTES:
                continue
            modified = _mtime(path)
            prior = known.get(key)
            if prior and prior["modified_at"] == modified and prior["removed_at"] is None:
                continue
            try:
                text = extract(path)
            except Problem as e:
                counts["unreadable"] += 1
                log.info("%s", e)
                continue
            self._save(conn, path, text, modified, prior)
            counts["changed" if prior else "added"] += 1
        for path_str, prior in known.items():
            if path_str not in seen and prior["removed_at"] is None:
                with store.tx() as db:
                    db.execute("UPDATE documents SET removed_at = ? WHERE id = ?",
                               (now(), prior["id"]))
                self.world.journal.append(
                    "saw", f"{Path(path_str).name} was removed from {root.name}.",
                    data={"document": prior["id"]}, source="connector:files",
                )
                counts["removed"] += 1
        return counts

    def _save(self, conn: dict[str, Any], path: Path, text: str, modified: str,
              prior: sqlite3.Row | None) -> None:
        entity = self.world.entities.resolve("document", path.name, {"path": str(path)})["entity"]
        stamp = now()
        size = path.stat().st_size
        with self.world.store.tx() as db:
            if prior:
                db.execute(
                    "UPDATE documents SET title = ?, text = ?, size = ?, modified_at = ?,"
                    " indexed_at = ?, removed_at = NULL WHERE id = ?",
                    (path.name, text, size, modified, stamp, prior["id"]),
                )
                did = prior["id"]
            else:
                did = new_id("d")
                db.execute(
                    "INSERT INTO documents (id, entity_id, connection, path, title, kind, text,"
                    " size, modified_at, indexed_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (did, entity["id"], conn["id"], str(path), path.name,
                     path.suffix.lower().lstrip("."), text, size, modified, stamp),
                )
        folder = Path(conn["target"]).name
        words = len(text.split())
        self.world.journal.append(
            "saw",
            f"{'Read again' if prior else 'Read'} {path.name} in {folder} ({words:,} words).",
            data={"document": did, "path": str(path)}, entity_ids=[entity["id"]],
            source="connector:files",
        )

    # ---- reading ----

    def search(self, text: str, limit: int = 10) -> list[dict[str, Any]]:
        from alpha.world.store import fts_query

        query = fts_query(text)
        if query is None:
            return []
        rows = self.world.store.all(
            "SELECT d.*, snippet(documents_fts, 1, '[', ']', '…', 14) AS snip FROM documents_fts"
            " JOIN documents d ON d.rowid = documents_fts.rowid WHERE documents_fts MATCH ?"
            " AND d.removed_at IS NULL ORDER BY bm25(documents_fts) LIMIT ?",
            (query, limit),
        )
        return [{**document_view(r), "snippet": r["snip"]} for r in rows]

    def read(self, ref: str, start: int = 0, length: int = 20_000) -> dict[str, Any]:
        row = self.world.store.one(
            "SELECT * FROM documents WHERE (id = ? OR path = ? OR title = ?)"
            " AND removed_at IS NULL",
            (ref, ref, ref),
        )
        if row is None:
            raise Problem(f"Alpha hasn't read a document '{ref}'.")
        view = document_view(row, full=True)
        view["text"] = view["text"][start : start + length]
        view["more"] = start + length < view["chars"]
        return view

    def documents(self, limit: int = 100) -> list[dict[str, Any]]:
        rows = self.world.store.all(
            "SELECT * FROM documents WHERE removed_at IS NULL ORDER BY modified_at DESC LIMIT ?",
            (limit,),
        )
        return [document_view(r) for r in rows]

    # ---- live updates while the core runs ----

    def observe(
        self, on_change: Callable[[dict[str, Any]], None] | None = None
    ) -> Callable[[], None]:
        """Watch every connected folder; a burst of changes syncs that folder once. Returns a
        function that stops watching."""
        from watchdog.events import FileSystemEvent, FileSystemEventHandler
        from watchdog.observers import Observer

        timers: dict[str, threading.Timer] = {}
        lock = threading.Lock()

        def run(folder: str) -> None:
            try:
                result = self.sync(folder)
                if on_change and any(result[k] for k in ("added", "changed", "removed")):
                    on_change({"folder": folder, **result})
            except Exception:
                log.exception("live sync of %s failed", folder)

        class Handler(FileSystemEventHandler):
            def __init__(self, folder: str) -> None:
                self.folder = folder

            def on_any_event(self, event: FileSystemEvent) -> None:
                if event.is_directory:
                    return
                with lock:
                    old = timers.pop(self.folder, None)
                    if old:
                        old.cancel()
                    timer = threading.Timer(2.0, run, args=(self.folder,))
                    timer.daemon = True
                    timers[self.folder] = timer
                    timer.start()

        observer = Observer()
        for conn in self.connections.all("files"):
            if conn["status"] != "off" and Path(conn["target"]).is_dir():
                observer.schedule(Handler(conn["target"]), conn["target"], recursive=True)
        observer.daemon = True
        observer.start()

        def stop() -> None:
            observer.stop()
            with lock:
                for t in timers.values():
                    t.cancel()

        return stop
