"""What the window shows, shaped from the world: what needs the person, an action's card, the
agents with their live steps, a conversation's line, the threads with their last steps, the
titles behind relation fields, a module's card, an entity's timeline."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from alpha.config import settings
from alpha.runtime import running
from alpha.runtime.agents import WORDS
from alpha.runtime.agents.scheduler import Scheduler
from alpha.world.actions import file_fields
from alpha.world.journal import entry
from alpha.world.store import Problem, loads, local_midnight_utc
from alpha.world.world import World

STEP_KINDS = {"did", "saw", "made", "changed", "failed", "noticed", "asked", "checked"}


def _cell(value: Any) -> Any:
    if isinstance(value, list):
        return ", ".join(str(v) for v in value)
    return value


def fold_failures(entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Consecutive identical failures (a loop that posted the same line again and again, as on
    2 Oct) shown once, the latest, with how many there were (`repeats`); the journal keeps every
    one (the conversation, slice 1)."""
    out: list[dict[str, Any]] = []
    for e in entries:
        last = out[-1] if out else None
        if (last is not None and e["kind"] == "failed" and last["kind"] == "failed"
                and last["text"] == e["text"]):
            out[-1] = {**e, "repeats": int(last.get("repeats", 1)) + 1}
        else:
            out.append(e)
    return out


def needs_you(world: World) -> list[dict[str, Any]]:
    """Everything waiting on the person: questions, proposals, suggested facts, same-name
    people to confirm."""
    items: list[dict[str, Any]] = []
    for a in world.journal.open_asks():
        items.append({"kind": "ask", "id": a["id"], "text": a["text"], "at": a["at"],
                      "options": a["data"].get("options", []), "module": a["module"],
                      "turn": a["data"].get("turn"), "derived": bool(a["data"].get("derived")),
                      "choose": a["data"].get("kind") or "one", "hint": a["data"].get("hint")})
    answered = {loads(r["data"], {}).get("proposal")
                for r in world.store.all("SELECT data FROM journal WHERE kind = 'answered'")}
    for p in world.journal.recent(50, kinds=["proposed"]):
        # a plan's proposal (before 12 Oct 2026, Q40) can't be answered any more: never shown
        if p["data"].get("scout"):
            continue  # Scout's picks live on Home; the sure, costly one is a question card
        if p["id"] not in answered and not p["data"].get("plan"):
            items.append({"kind": "proposal", "id": p["id"], "text": p["text"],
                          "why": p["data"].get("why"), "at": p["at"], "module": p["module"]})
    for wf in world.workflows.all(("drafted",)):
        items.append({"kind": "workflow", "id": wf["id"], "text": f"Your workflow: {wf['title']}",
                      "why": wf["body"].get("purpose"), "at": wf["created_at"],
                      "module": wf.get("module"),
                      "workflow": {**wf, "research": research_of(world, wf)}})
    # Watson's suggested facts are not here (slice 4b, 18 Oct): they are marked suggested on
    # the person's About-you table, where they are confirmed or cleared.
    for a in world.actions.all(("proposed",)):
        items.append({"kind": "action", "id": a["id"], "text": a["title"], "why": a["evidence"],
                      "at": a["created_at"], "module": a["module"],
                      "action": action_view(world, a)})
    return [i for i in items if i["kind"] != "proposal"
            or not (_is_action_proposal(world, i) or _is_workflow_proposal(world, i))]


def research_of(world: World, wf: dict[str, Any]) -> dict[str, Any] | None:
    """Whether Sherlock is looking into this workflow right now (its open run's latest step
    names the page or its conversation), so the card can say so and offer Skip (Q45)."""
    sherlock = next((a for a in world.agents.all() if a["kind"] == "sherlock"), None)
    if sherlock is None:
        return None
    run = world.runs.open(sherlock["id"])
    if run is None or not sherlock.get("thread"):
        return None
    for e in reversed(world.journal.recent(20, thread=sherlock["thread"], kinds=["did"])):
        if e["at"] < run["started_at"]:
            break
        d = e["data"]
        if d.get("workflow") == wf["id"] or (wf.get("conversation")
                                             and d.get("conversation") == wf["conversation"]):
            return {"agent": sherlock["id"], "name": sherlock["name"], "state": "running"}
    return None


def _is_workflow_proposal(world: World, item: dict[str, Any]) -> bool:
    """A workflow's own `proposed` entry is shown as its page, not as a plain proposal."""
    entry = world.journal.read(item["id"])
    return bool(entry["data"].get("workflow"))


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
            "checked": a.get("checked"),
            "preview": Path(a["preview"]).name if a.get("preview") else None, "shots": shots}


def opens_run(e: dict[str, Any]) -> bool:
    """The line that opens a run (its prompt, or a pipeline's first line), not a step of it."""
    data = e.get("data") or {}
    return bool(data.get("opens") or data.get("prompt"))


def agent_views(world: World, scheduler: Scheduler,
                module: str | None = None) -> list[dict[str, Any]]:
    """Agents with whether one is running now and, if so, what it has done so far (the
    entries of its thread since the open run began)."""
    out = []
    for a in world.agents.all(module):
        running = a["id"] in scheduler.running
        steps: list[dict[str, Any]] = []
        open_run = world.runs.open(a["id"]) if running else None
        if open_run and a["thread"]:
            entries = world.journal.recent(80, thread=a["thread"])
            # the agent's own lines since the run began: its item may also hold the turn
            # that made it (harness §7: a watch and its runs are one item)
            steps = [{"at": e["at"], "kind": e["kind"], "text": e["text"]} for e in entries
                     if e["at"] >= open_run["started_at"] and not opens_run(e)
                     and e["actor"] == a["id"]
                     and e["kind"] in {"did", "saw", "made", "changed", "failed", "noticed"}]
        last = world.runs.last(a["id"])
        # a built-in kind says itself when it works (its frame looks at the journal, Q50)
        when = WORDS.get(a["kind"], {}).get("works") or a["when"]
        out.append({**a, "when": when, "running": running, "steps": steps[-8:],
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
            "last": last[0]["text"][:160] if last else None, "last_line": t.get("last_line"),
            "last_at": last[0]["at"] if last else t["updated_at"],
            "updated_at": t["updated_at"], "live": running.LIVE.progress_for(cid)}


def thread_views(world: World, *, done: bool = False) -> list[dict[str, Any]]:
    """Open threads with what Alpha has done in each lately, so a build is watched, not
    waited for: its last few journal entries, newest last (a prompt line is left out).
    `done=True` adds the finished ones, for the Assistant page's history."""
    out = []
    for t in world.modules.threads(done=done):
        owner = world.agents.of_thread(t["id"])
        if owner and owner["kind"] != "custom":
            continue  # a built-in agent's own work lives on its page (harness §10)
        entries = world.journal.recent(40, thread=t["id"])
        steps = [{"at": e["at"], "kind": e["kind"], "text": e["text"]} for e in entries
                 if e["kind"] in STEP_KINDS and not e["text"].startswith(("Build the approved",
                                                                          "Continue the build"))]
        out.append({**t, "steps": steps[-6:], "step_count": len(steps),
                    "last_at": entries[-1]["at"] if entries else t["updated_at"],
                    "live": running.LIVE.progress_for(t["id"])})
    return out


def items_today(world: World) -> list[dict[str, Any]]:
    """The work items Home and the Assistant list show: the ones not over, and the ones done
    or stopped today (the lanes are the window's)."""
    since = local_midnight_utc()
    return [t for t in thread_views(world, done=True)
            if t["state"] not in ("done", "stopped") or t["updated_at"] >= since]


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
    tables = world.collections.overview(m["id"]) + world.modtables.overview(m["id"])
    last = world.store.one(
        "SELECT at, text FROM journal WHERE module = ? AND kind IN ('did','changed','made','saw')"
        " AND deleted_at IS NULL ORDER BY at DESC LIMIT 1", (m["id"],),
    )
    # The person's rows: a module's settings table is Alpha's bookkeeping, not their data
    # (16 Oct: a card said "2 rows" of a table that held none).
    return {**m, "tables": tables,
            "records": sum(t["records"] for t in tables if t.get("name") != "settings"),
            "last_at": last["at"] if last else None, "last_text": last["text"] if last else None,
            "threads": [t for t in world.modules.threads() if t["module"] == m["id"]],
            "path": [p["name"] for p in world.modules.path(m["id"])],
            "children": [c["id"] for c in world.modules.children(m["id"])]}


TROUBLE_WINDOW_H = settings.views.trouble_window_h


def troubles(world: World) -> list[dict[str, Any]]:
    """Runs that went wrong in the last day, for the companion to say so (8 Oct: four days of
    failed runs reached nobody but Activity)."""
    since = (datetime.now(UTC) - timedelta(hours=TROUBLE_WINDOW_H)).isoformat()
    out = []
    for a in world.agents.all():
        if a.get("last_error") and (a.get("last_run_at") or "") >= since:
            out.append({"id": a["id"], "name": a["name"], "at": a["last_run_at"],
                        "words": a["last_error"], "module": a["module"]})
    return sorted(out, key=lambda t: t["at"], reverse=True)


def timeline(world: World, entity_id: str, limit: int = 100) -> list[dict[str, Any]]:
    rows = world.store.all(
        "SELECT j.* FROM journal j, json_each(j.entity_ids) e WHERE e.value = ?"
        " AND j.deleted_at IS NULL ORDER BY j.at DESC LIMIT ?", (entity_id, limit),
    )
    return [entry(r) for r in rows]

