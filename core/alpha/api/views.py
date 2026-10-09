"""What the window shows, shaped from the world: what needs the person, an action's card, the
automations with their live steps, a conversation's line, the threads with their last steps, the
titles behind relation fields, a module's card, an entity's timeline."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from alpha.runtime import claude_cli
from alpha.runtime.automation import Scheduler
from alpha.world.actions import file_fields
from alpha.world.journal import entry
from alpha.world.store import Problem, loads
from alpha.world.world import World

STEP_KINDS = {"did", "saw", "made", "changed", "failed", "noticed", "asked", "checked"}


def _local_midnight_utc() -> str:
    local = datetime.now().astimezone()
    midnight = local.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight.astimezone(UTC).replace(microsecond=0).isoformat()


def _cell(value: Any) -> Any:
    if isinstance(value, list):
        return ", ".join(str(v) for v in value)
    return value


def plan_view(world: World, plan: dict[str, Any]) -> dict[str, Any]:
    """A plan for the app: a researched plan's pieces carry the titles and pages of the
    findings they cite (Q37), so the card can show where each piece comes from."""
    if not plan.get("research") or not plan.get("pieces"):
        return plan
    findings = {f["id"]: f for f in world.research.findings(str(plan["research"]))}
    pieces = []
    for p in plan["pieces"]:
        sources: list[dict[str, Any]] = []
        for e in p.get("evidence") or []:
            f = findings.get(e)
            if not f:
                continue
            source = {"title": f.get("title"), "url": f.get("url")}
            if source not in sources:
                sources.append(source)
        pieces.append({**p, "sources": sources})
    return {**plan, "pieces": pieces}


def needs_you(world: World) -> list[dict[str, Any]]:
    """Everything waiting on the person: questions, proposals, suggested facts, same-name
    people to confirm."""
    items: list[dict[str, Any]] = []
    for a in world.journal.open_asks():
        items.append({"kind": "ask", "id": a["id"], "text": a["text"], "at": a["at"],
                      "options": a["data"].get("options", []), "module": a["module"],
                      "turn": a["data"].get("turn"), "derived": bool(a["data"].get("derived"))})
    answered = {loads(r["data"], {}).get("proposal")
                for r in world.store.all("SELECT data FROM journal WHERE kind = 'answered'")}
    for p in world.journal.recent(50, kinds=["proposed"]):
        if p["id"] not in answered:
            plan_id = p["data"].get("plan")
            questions: list[dict[str, Any]] = []
            pieces: list[dict[str, Any]] = []
            if plan_id:
                try:
                    plan = plan_view(world, world.plans.get(plan_id))
                    questions, pieces = plan["questions"], plan["pieces"]
                except Problem:
                    questions, pieces = [], []
            items.append({"kind": "proposal", "id": p["id"], "text": p["text"],
                          "why": p["data"].get("why"), "at": p["at"], "module": p["module"],
                          "plan": plan_id, "questions": questions, "pieces": pieces})
    for f in world.knowledge.facts("person", states=("suggested",)):
        items.append({"kind": "fact", "id": f["id"], "text": f"{f['predicate']}: {f['value']}",
                      "why": f["why"], "at": f["recorded_at"]})
    for a in world.actions.all(("proposed",)):
        items.append({"kind": "action", "id": a["id"], "text": a["title"], "why": a["evidence"],
                      "at": a["created_at"], "module": a["module"],
                      "action": action_view(world, a)})
    return [i for i in items if i["kind"] != "proposal" or not _is_action_proposal(world, i)]


def _is_action_proposal(world: World, item: dict[str, Any]) -> bool:
    """An action's own `proposed` journal entry is shown as its card, not as a plain proposal."""
    entry = world.journal.read(item["id"])
    return bool(entry["data"].get("action"))


def action_view(world: World, a: dict[str, Any]) -> dict[str, Any]:
    """An action for the app: the card's contents, with screenshot names instead of paths."""
    shots = {Path(p).stem: Path(p).name for p in a.get("shots") or []}
    files: dict[str, dict[str, Any]] = {}
    try:
        proc = world.procedures.get(a["procedure"])
        for field in file_fields(proc["steps"]):
            did = str(a["payload"].get(field, ""))
            row = world.store.one("SELECT title, size FROM documents WHERE id = ?", (did,))
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
        last = world.runs.last(a["id"])
        out.append({**a, "running": running, "steps": steps[-8:],
                    "last_verdict": last["verdict"] if last else None,
                    "last_why": last["why"] if last else None})
    return out


def conversation_view(world: World, cid: str,
                      thread: dict[str, Any] | None = None) -> dict[str, Any]:
    """A conversation (or work item) for the app: scope name, state, open question, last line."""
    t = thread or world.modules.thread(cid)
    scope = world.modules.path_words(t["module"]) if t.get("module") else "General"
    question = next((a["text"] for a in world.journal.open_asks() if a["thread"] == cid), None)
    last = world.journal.recent(1, thread=cid, kinds=["said", "replied", "failed"])
    return {"id": cid, "title": t["title"], "kind": t["kind"], "state": t["state"],
            "module": t.get("module"), "scope": scope, "question": question,
            "last": last[0]["text"][:160] if last else None,
            "last_at": last[0]["at"] if last else t["updated_at"],
            "updated_at": t["updated_at"], "live": claude_cli.LIVE.progress_for(cid)}


def thread_views(world: World, *, done: bool = False) -> list[dict[str, Any]]:
    """Open threads with what Alpha has done in each lately, so a build is watched, not
    waited for: its last few journal entries, newest last (a prompt line is left out).
    `done=True` adds the finished ones, for the Assistant page's history."""
    out = []
    for t in world.modules.threads(done=done):
        entries = world.journal.recent(40, thread=t["id"])
        steps = [{"at": e["at"], "kind": e["kind"], "text": e["text"]} for e in entries
                 if e["kind"] in STEP_KINDS and not e["text"].startswith(("Build the approved",
                                                                          "Continue the build"))]
        out.append({**t, "steps": steps[-6:], "step_count": len(steps),
                    "last_at": entries[-1]["at"] if entries else t["updated_at"],
                    "live": claude_cli.LIVE.progress_for(t["id"])})
    return out


def relation_titles(world: World, desc: dict[str, Any],
                    records: list[dict[str, Any]]) -> dict[str, dict[str, str]]:
    """For each relation field into another table, the titles of the records the rows point
    at, by id: the page shows the client's name, not its id, and opens it."""
    out: dict[str, dict[str, str]] = {}
    for field in desc["fields"]:
        target = field.get("relation") if field.get("kind") == "relation" else None
        if not target or target in ("person", "organisation"):
            continue
        ids = {str(r[field["name"]]) for r in records if r.get(field["name"])}
        if not ids:
            continue
        try:
            title_field = world.collections.describe(target).get("title_field")
        except Problem:
            continue
        titles: dict[str, str] = {}
        for rid in ids:
            row = world.store.one(
                'SELECT "values" FROM records WHERE collection = ? AND id = ? AND deleted_at'
                " IS NULL", (target, rid))
            if row is not None:
                values = loads(row["values"], {})
                titles[rid] = str(values.get(title_field) or rid) if title_field else rid
        out[field["name"]] = titles
    return out


def module_card(world: World, m: dict[str, Any]) -> dict[str, Any]:
    tables = world.collections.overview(m["id"])
    last = world.store.one(
        "SELECT at, text FROM journal WHERE module = ? AND kind IN ('did','changed','made','saw')"
        " AND deleted_at IS NULL ORDER BY at DESC LIMIT 1", (m["id"],),
    )
    return {**m, "tables": tables, "records": sum(t["records"] for t in tables),
            "last_at": last["at"] if last else None, "last_text": last["text"] if last else None,
            "threads": [t for t in world.modules.threads() if t["module"] == m["id"]],
            "path": [p["name"] for p in world.modules.path(m["id"])],
            "children": [c["id"] for c in world.modules.children(m["id"])]}


TROUBLE_WINDOW_H = 24


def troubles(world: World) -> list[dict[str, Any]]:
    """Runs that went wrong in the last day, for the companion to say so (8 Oct: four days of
    failed runs reached nobody but Activity)."""
    since = (datetime.now(UTC) - timedelta(hours=TROUBLE_WINDOW_H)).isoformat()
    out = []
    for a in world.automations.all():
        if a.get("last_error") and (a.get("last_run_at") or "") >= since:
            out.append({"id": a["id"], "title": a["title"], "at": a["last_run_at"],
                        "words": a["last_error"], "module": a["module"]})
    return sorted(out, key=lambda t: t["at"], reverse=True)


def timeline(world: World, entity_id: str, limit: int = 100) -> list[dict[str, Any]]:
    rows = world.store.all(
        "SELECT j.* FROM journal j, json_each(j.entity_ids) e WHERE e.value = ?"
        " AND j.deleted_at IS NULL ORDER BY j.at DESC LIMIT ?", (entity_id, limit),
    )
    return [entry(r) for r in rows]

