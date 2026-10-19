"""What the window shows, shaped from the world: what needs the person, an action's card, the
agents with their live steps, a conversation's line, the threads with their last steps, the
titles behind relation fields, a module's card, an entity's timeline."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from alpha.config import settings
from alpha.runtime import running, staging
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


def asked_by(world: World, a: dict[str, Any]) -> str | None:
    """Who asked: the agent's name when its run asked (Q92); None when Alpha did."""
    if a["actor"] in ("alpha", "person"):
        return None
    row = world.store.one("SELECT name FROM agents WHERE id = ?", (a["actor"],))
    return str(row["name"]) if row else None


# a card that asks a question rather than for a decision on something drafted
ASK_KINDS = ("question", "permission", "pick", "reminder", "check", "routing", "signin")


def card_from(world: World, c: dict[str, Any]) -> dict[str, Any]:
    """Where a card came from (P3 item 2): who drafted it (an agent's name; none for Alpha),
    the run it came from and when that run began, the task it is for, what it rests on."""
    by = None
    if c["drafter"] not in ("alpha", "person"):
        row = world.store.one("SELECT name FROM agents WHERE id = ?", (c["drafter"],))
        by = str(row["name"]) if row else None
    run_at = None
    if c.get("run"):
        r = world.store.one("SELECT started_at FROM runs WHERE id = ?", (c["run"],))
        run_at = r["started_at"] if r else None
    task = None
    if c.get("task"):
        try:
            t = world.tasks.get(str(c["task"]))
            task = {"id": t["id"], "title": t.get("title")}
        except Problem:
            task = None
    return {"by": by, "run_at": run_at, "task": task, "rests_on": c.get("rests_on") or [],
            "twins": c.get("twins") or 0}


def needs_you(world: World) -> list[dict[str, Any]]:
    """Everything waiting on the person: the waiting cards (P3), oldest first. An action's card
    waits while its action does (a dry run that failed can't be decided); a page's while it is
    drafted."""
    items: list[dict[str, Any]] = []
    for c in world.cards.waiting():
        try:
            line = world.journal.read(c["id"])
        except Problem:
            continue  # a line forgotten since: nothing to show
        came = card_from(world, c)
        if c["kind"] in ASK_KINDS:
            d = line["data"]
            items.append({"kind": "ask", "id": c["id"], "text": c["text"], "at": line["at"],
                          "options": d.get("options", []), "module": c["module"],
                          "turn": c["turn"], "derived": bool(d.get("derived")),
                          "choose": d.get("kind") or "one", "hint": d.get("hint"),
                          "by": came["by"], "from": came})
        elif c["kind"] == "action":
            try:
                a = world.actions.get(str(c["ref"]))
            except Problem:
                continue
            if a["state"] == "proposed":
                items.append({"kind": "action", "id": a["id"], "text": a["title"],
                              "why": a["evidence"], "at": a["created_at"], "module": a["module"],
                              "action": action_view(world, a), "by": came["by"], "from": came})
        elif c["kind"] == "workflow":
            try:
                wf = world.workflows.get(str(c["ref"]))
            except Problem:
                continue
            if wf["state"] == "drafted":
                items.append({"kind": "workflow", "id": wf["id"],
                              "text": f"Your workflow: {wf['title']}",
                              "why": wf["body"].get("purpose"), "at": wf["created_at"],
                              "module": wf.get("module"),
                              "workflow": {**wf, "research": research_of(world, wf)},
                              "by": came["by"], "from": came})
        elif c["kind"] == "staged":
            try:
                held = staged_view(world, str(c["ref"]))
            except Problem:
                continue
            if held["state"] == "held":
                items.append({"kind": "staged", "id": c["id"], "text": c["text"],
                              "why": line["data"].get("why"), "at": line["at"],
                              "module": c["module"], "staged": held, "by": came["by"],
                              "from": came})
        else:
            items.append({"kind": "proposal", "id": c["id"], "text": c["text"],
                          "why": line["data"].get("why"), "at": line["at"],
                          "module": c["module"], "by": came["by"], "from": came})
    return items


def staged_view(world: World, sid: str) -> dict[str, Any]:
    """What an agent brought in, for its card (P3 item 5): the rows with the table's fields
    (each ticked unless the person unticks it), or the file with where it would be kept and
    the modules it could go to instead; whether the card offers "Always"."""
    s = world.staged.get(sid)
    out: dict[str, Any] = {k: s[k] for k in ("id", "kind", "target", "rows", "name", "size",
                                             "origin", "state", "module")}
    out["place"] = staging.place_words(world, s)
    if s["kind"] == "rows":
        desc = world.collections.describe(s["target"])
        out["fields"] = [{"name": f["name"], "label": f.get("label") or f["name"],
                          "kind": f["kind"]} for f in desc["fields"]]
    else:
        out["places"] = [{"id": m["id"], "name": m["name"]} for m in world.modules.all()]
    out["offers_always"] = s["state"] == "held" and world.staged.offers_always(sid)
    twin = s.get("duplicate_of")
    row = world.store.one("SELECT title FROM documents WHERE id = ?", (twin,)) if twin else None
    out["duplicate_of"] = {"id": twin, "title": row["title"]} if row else None
    return out


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
            # a send waits for its dry run's screenshot; a draft's card is its payload (Q95)
            "needs_preview": a["effect"] == "send",
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
        ids: set[str] = set()
        for r in records:
            held = r.get(field["name"])
            ids.update(str(v) for v in (held if isinstance(held, list) else [held]) if v)
        if not ids:
            continue
        if target == "any":
            # anyone or a row of any table (a task's About, P1): each in words
            out[field["name"]] = {ref: world.tasks.who_words(ref) or ref for ref in ids}
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

